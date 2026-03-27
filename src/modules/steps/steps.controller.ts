import { Controller, Get, Post, Query, Req, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StepsService } from './steps.service';

@ApiTags('steps')
@Controller({ path: 'steps', version: '1' })
export class StepsController {
  constructor(private readonly steps: StepsService) {}

  @ApiBearerAuth()
  @Get('today')
  getTodaySteps(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.steps.getTodaySteps(req.user.userId);
  }

  @ApiBearerAuth()
  @Post('sync')
  syncSteps(
    @Req() req: { user: { userId: string; type: string } },
    @Query('steps') steps: string,
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.steps.updateSteps(req.user.userId, parseInt(steps) || 0);
  }

  @ApiBearerAuth()
  @Post('exchange')
  exchangeSteps(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.steps.exchangeSteps(req.user.userId);
  }

  @ApiBearerAuth()
  @Get('leaderboard')
  getLeaderboard(
    @Req() req: { user: { userId: string; type: string } },
    @Query('type') type: 'daily' | 'monthly' | 'total',
    @Query('limit') limit?: string,
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.steps.getLeaderboard(type || 'daily', limit ? parseInt(limit) : 10);
  }

  @ApiBearerAuth()
  @Get('my-rank')
  getMyRank(
    @Req() req: { user: { userId: string; type: string } },
    @Query('type') type: 'daily' | 'monthly' | 'total',
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.steps.getMyRank(req.user.userId, type || 'daily');
  }
}