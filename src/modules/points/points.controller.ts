import { Body, Controller, ForbiddenException, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PointsService } from './points.service';

@ApiTags('points')
@ApiBearerAuth()
@Controller({ path: 'points', version: '1' })
export class PointsController {
  constructor(private readonly points: PointsService) {}

  @Get('account')
  account(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.points.getAccount(req.user.userId);
  }

  @Get('transactions')
  transactions(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.points.listTransactions(req.user.userId);
  }

  @Post('sign-in')
  signIn(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.points.signIn(req.user.userId);
  }

  @Post('steps')
  steps(@Req() req: { user: { userId: string; type: string } }, @Body() body: { steps: number }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.points.addSteps(req.user.userId, body.steps ?? 0);
  }
}
