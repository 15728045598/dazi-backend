import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { WechatLoginDto, WechatPhoneLoginDto } from './dto/auth.dto';

interface AuthUser {
  userId: string;
  type: string;
}

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('admin/login')
  adminLogin(@Body() body: { username: string; password: string }) {
    return this.auth.adminLogin(body.username, body.password);
  }

  @Public()
  @Post('wechat')
  wechatLogin(@Body() body: WechatLoginDto) {
    return this.auth.wechatLogin(body?.code);
  }

  @Public()
  @Post('dev-app-login')
  devAppLogin(@Body() body: { username: string; password: string }) {
    return this.auth.devAppLogin(body.username, body.password);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@Req() req: { user: { userId: string; type: string } }) {
    return this.auth.getProfile(req.user.userId, req.user.type);
  }

  @Public()
  @Post('wechat-phone')
  wechatPhoneLogin(@Body() body: WechatPhoneLoginDto) {
    return this.auth.wechatPhoneLogin(body.code, body.encryptedData, body.iv);
  }

  @ApiBearerAuth()
  @Post('bind-phone')
  bindPhone(
    @Req() req: { user: AuthUser },
    @Body() body: { code: string },
  ) {
    return this.auth.bindPhone(req.user.userId, body.code);
  }
}
