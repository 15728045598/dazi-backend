import { Body, Controller, ForbiddenException, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InviteService } from './invite.service';

@ApiTags('invite')
@Controller({ path: 'invite', version: '1' })
export class InviteController {
  constructor(private readonly invite: InviteService) {}

  @ApiBearerAuth()
  @Get()
  mine(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.invite.getMine(req.user.userId);
  }

  @ApiBearerAuth()
  @Post('bind')
  bind(
    @Req() req: { user: { userId: string; type: string } },
    @Body() body: { inviterCode: string },
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.invite.bindInvitee(body.inviterCode, req.user.userId);
  }

  @ApiBearerAuth()
  @Get('leaderboard')
  getLeaderboard(
    @Req() req: { user: { userId: string; type: string } },
    @Query('limit') limit?: string,
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.invite.getLeaderboard(limit ? parseInt(limit) : 10);
  }

  @ApiBearerAuth()
  @Get('my-rank')
  getMyRank(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.invite.getMyRank(req.user.userId);
  }

  @ApiBearerAuth()
  @Get('promoter/earnings')
  getPromoterEarnings(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.invite.getPromoterEarnings(req.user.userId);
  }

  @ApiBearerAuth()
  @Post('promoter/withdraw')
  withdraw(
    @Req() req: { user: { userId: string; type: string } },
    @Body() body: { amount: number },
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.invite.withdrawPromoterEarnings(req.user.userId, body.amount);
  }
}
