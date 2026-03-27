import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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
    const openid = `wx_mock_${code || 'default'}`;
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
      },
    };
  }
}
