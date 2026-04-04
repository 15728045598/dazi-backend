import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
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
}
