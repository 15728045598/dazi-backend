import { Body, Controller, ForbiddenException, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Experience } from '@prisma/client';
import { LeaderService } from './leader.service';

@ApiTags('leader')
@ApiBearerAuth()
@Controller({ path: 'leader', version: '1' })
export class LeaderController {
  constructor(private readonly leader: LeaderService) {}

  @Get('status')
  status(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.leader.getStatus(req.user.userId);
  }

  @Post('apply')
  apply(
    @Req() req: { user: { userId: string; type: string } },
    @Body()
    body: {
      realName: string;
      idCard: string;
      bio: string;
      experience: string;
      specialties: string[];
      certificates: string[];
      experienceDesc: string;
      emergencyContact: string;
      emergencyPhone: string;
    },
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.leader.apply(req.user.userId, {
      ...body,
      experience: body.experience as Experience,
    });
  }
}
