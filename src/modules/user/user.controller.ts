import { Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get('me')
  me(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') {
      return { id: 'admin', role: 'ADMIN' };
    }
    return this.users.getMe(req.user.userId);
  }

  @Patch('me')
  updateMe(
    @Req() req: { user: { userId: string; type: string } },
    @Body() body: { nickname?: string; avatar?: string; city?: string; bio?: string; gender?: string },
  ) {
    if (req.user.type === 'admin') {
      return { ok: true };
    }
    return this.users.updateProfile(req.user.userId, body);
  }

  /**
   * 同步微信运动步数
   * 前端通过wx.login获取code，通过wx.getWeRunData获取加密数据，传递到后端解密
   */
  @Post('steps/sync')
  syncSteps(
    @Req() req: { user: { userId: string; type: string } },
    @Body() body: { code: string; encryptedData: string; iv: string },
  ) {
    if (req.user.type === 'admin') {
      return { ok: false, message: '管理员不支持步数同步' };
    }
    return this.users.syncWechatSteps(req.user.userId, body.code, body.encryptedData, body.iv);
  }
}
