import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import * as crypto from 'crypto-js';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async adminLogin(username: string, password: string) {
    const u = this.config.get<string>('admin.username') || 'admin';
    const p = this.config.get<string>('admin.password') || 'admin123';
    if (username !== u || password !== p) {
      throw new UnauthorizedException('账号或密码错误');
    }
    const accessToken = await this.jwt.signAsync({
      sub: 'admin',
      role: 'ADMIN',
      type: 'admin',
    });
    return {
      accessToken,
      tokenType: 'Bearer',
      user: { id: 'admin', username: '管理员', role: 'ADMIN' },
    };
  }

  async wechatLogin(code?: string) {
    if (!code) {
      throw new BadRequestException('微信登录 code 不能为空');
    }

    // 打印所有配置来调试
    console.log('[DEBUG] All config keys:', Object.keys(this.config));
    const appid = this.config.get<string>('wechat.appid');
    const secret = this.config.get<string>('wechat.secret');
    const wechatConfig = this.config.get('wechat');

    console.log('[WeChat Login] wechat config:', wechatConfig);
    console.log('[WeChat Login] AppID:', appid ? `已配置: ${appid.substring(0, 5)}...` : '未配置');
    console.log('[WeChat Login] Secret:', secret ? '已配置' : '未配置');

    // 如果没有配置 AppID 和 Secret，使用模拟模式
    if (!appid || !secret) {
      // 模拟模式：使用 mock openid
      console.warn('[WeChat Login] 未配置 AppID，使用模拟模式');
      const openid = `wx_mock_${code}`;
      return this.findOrCreateUser(openid, `wx_mock_${code}`);
    }

    console.log('[WeChat Login] 尝试调用微信 API，code:', code);

    // 调用微信 code2Session API 获取 openid
    const wechatApiUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
    console.log('[WeChat Login] API URL:', wechatApiUrl.replace(secret, '***'));

    try {
      console.log('[WeChat Login] 开始请求微信API...');
      const response = await axios.get<{
        openid?: string;
        session_key?: string;
        errcode?: number;
        errmsg?: string;
      }>(wechatApiUrl, {
        timeout: 10000, // 10秒超时
      }).catch((err) => {
        console.error('[WeChat Login] axios请求失败:', err.message);
        throw err;
      });

      console.log('[WeChat Login] API Response:', response.data);

      if (response.data.errcode) {
        console.error('[WeChat Login] 错误:', response.data);
        throw new BadRequestException(`微信登录失败: ${response.data.errmsg} (errcode: ${response.data.errcode})`);
      }

      const openid = response.data.openid;
      if (!openid) {
        throw new BadRequestException('微信登录失败: 未获取到 openid');
      }

      return this.findOrCreateUser(openid, response.data.session_key);
    } catch (error) {
      // 打印完整错误对象以便调试
      console.error('[WeChat Login] 捕获的错误:', JSON.stringify(error, null, 2));
      
      // 区分 axios 错误和其他错误
      if (error.response) {
        // WeChat API 返回了错误响应
        console.error('[WeChat Login] API 错误响应 status:', error.response.status);
        console.error('[WeChat Login] API 错误响应 data:', JSON.stringify(error.response.data));
        const errMsg = error.response.data?.errmsg || error.message || '未知错误'
        const errCode = error.response.data?.errcode
        throw new BadRequestException(`微信登录失败: ${errMsg}${errCode !== undefined ? ` (errcode: ${errCode})` : ''}`);
      } else if (error.request) {
        // 请求发出但没有收到响应 - 网络问题
        console.error('[WeChat Login] 网络错误 - 无响应:', error.message);
        throw new BadRequestException('微信服务器连接失败，请检查网络后重试');
      } else {
        // 请求配置错误
        console.error('[WeChat Login] 请求配置错误:', error.message);
        throw new BadRequestException('微信登录失败，请稍后重试');
      }
    }
  }

  /** 查找或创建用户（统一方法） */
  private async findOrCreateUser(openid: string, sessionKey?: string) {
    let user = await this.prisma.user.findUnique({ where: { openid } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          openid,
          nickname: `搭子用户${Math.floor(Math.random() * 9000 + 1000)}`,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(openid)}`,
        },
      });
      await this.prisma.pointsAccount.create({ data: { userId: user.id } });
    } else {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      type: 'user',
    });

    // 获取用户 profile
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: user.id },
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        openid: user.openid,
        nickname: user.nickname,
        avatar: user.avatar,
        role: user.role,
        points: user.points,
        profile: profile || {},
      },
    };
  }

  /** 开发环境：用后台管理员账号换取小程序 JWT（openid=wx_dev_app），便于联调 */
  async devAppLogin(username: string, password: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('生产环境不可用');
    }
    const u = this.config.get<string>('admin.username') || 'admin';
    const p = this.config.get<string>('admin.password') || 'admin123';
    if (username !== u || password !== p) {
      throw new UnauthorizedException('账号或密码错误');
    }
    const user = await this.prisma.user.findUnique({ where: { openid: 'wx_dev_app' } });
    if (!user) {
      throw new BadRequestException('请先执行: npx prisma db seed（需包含 wx_dev_app 用户）');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      type: 'user',
    });
    return {
      accessToken,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        openid: user.openid,
        nickname: user.nickname,
        avatar: user.avatar,
        role: user.role,
        points: user.points,
      },
    };
  }

  async getProfile(userId: string, type: string) {
    if (type === 'admin') {
      return {
        id: 'admin',
        username: '管理员',
        role: 'ADMIN',
      };
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, leader: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  /** 微信手机号快捷登录 */
  async wechatPhoneLogin(code: string, encryptedData?: string, iv?: string) {
    // 解析 code 获取 session_key（需要微信服务器 API）
    // 这里使用 mock 方式：直接从 encryptedData 解析手机号（实际需要微信解密）
    // 生产环境需要调用微信 JSCODE2SESSION 接口获取 session_key 然后解密
    
    let phoneNumber = '';
    
    if (encryptedData) {
      // TODO: 实际项目中需要：
      // 1. 调用微信 code2Session API 获取 session_key
      // 2. 使用 session_key 解密 encryptedData 获取手机号
      // 这里暂时使用模拟数据
      phoneNumber = `138${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`;
    } else {
      // 如果没有 encryptedData，使用 code 生成临时用户
      phoneNumber = `phone_${code}`;
    }

    // 查找或创建用户（通过手机号）
    let user = await this.prisma.user.findFirst({
      where: { phone: phoneNumber },
    });

    if (!user) {
      // 创建新用户
      user = await this.prisma.user.create({
        data: {
          openid: `wx_phone_${phoneNumber}`,
          phone: phoneNumber,
          nickname: `搭子用户${Math.floor(Math.random() * 9000 + 1000)}`,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${phoneNumber}`,
        },
      });
      await this.prisma.pointsAccount.create({ data: { userId: user.id } });
    } else {
      // 更新登录时间
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      type: 'user',
    });

    // 获取用户 profile
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: user.id },
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        openid: user.openid,
        nickname: user.nickname,
        avatar: user.avatar,
        role: user.role,
        points: user.points,
        phone: user.phone,
        profile: profile || {},
      },
    };
  }

  /** 通过 code 获取微信手机号（新版 API） */
  private async getPhoneNumberByCode(code: string): Promise<string> {
    const appid = this.config.get<string>('wechat.appid');
    const secret = this.config.get<string>('wechat.secret');

    if (!appid || !secret) {
      throw new BadRequestException('微信配置未完成');
    }

    // 调用微信手机号获取 API
    const wechatApiUrl = `https://api.weixin.qq.com/wxa/business/getphoneNumber?access_token=`;

    // 先获取 access_token
    const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`;
    const tokenRes = await axios.get<{
      access_token?: string;
      errcode?: number;
      errmsg?: string;
    }>(tokenUrl);

    if (tokenRes.data.errcode) {
      throw new BadRequestException(`获取 access_token 失败: ${tokenRes.data.errmsg}`);
    }

    const accessToken = tokenRes.data.access_token;
    if (!accessToken) {
      throw new BadRequestException('获取 access_token 失败');
    }

    // 调用获取手机号 API
    const phoneRes = await axios.post<{
      errcode?: number;
      errmsg?: string;
      phone_info?: {
        phoneNumber: string;
        purePhoneNumber: string;
      };
    }>(`https://api.weixin.qq.com/wxa/business/getphoneNumber?access_token=${accessToken}`, {
      code,
    });

    if (phoneRes.data.errcode) {
      throw new BadRequestException(`获取手机号失败: ${phoneRes.data.errmsg} (errcode: ${phoneRes.data.errcode})`);
    }

    if (phoneRes.data.phone_info?.phoneNumber) {
      return phoneRes.data.phone_info.phoneNumber;
    }

    throw new BadRequestException('获取手机号失败');
  }

  /** 绑定手机号（已登录用户） */
  async bindPhone(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    if (!code) {
      throw new BadRequestException('缺少 code');
    }

    let phoneNumber: string;

    try {
      phoneNumber = await this.getPhoneNumberByCode(code);
    } catch (error) {
      // 开发环境使用模拟手机号
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[BindPhone] 获取手机号失败，使用模拟手机号:', error);
        phoneNumber = `138${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`;
      } else {
        throw error;
      }
    }

    // 检查手机号是否已被其他用户绑定
    const existingUser = await this.prisma.user.findFirst({
      where: { phone: phoneNumber, NOT: { id: userId } },
    });

    if (existingUser) {
      throw new BadRequestException('该手机号已被其他账号绑定');
    }

    // 更新用户手机号
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { phone: phoneNumber },
    });

    return {
      phone: updatedUser.phone,
    };
  }
}
