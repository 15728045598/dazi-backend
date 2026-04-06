import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Experience, LeaderApplicationStatus } from '@prisma/client';
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

  @Get('applications')
  getMyApplications(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.leader.getMyApplications(req.user.userId);
  }

  @Get('participant')
  getParticipant(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.leader.getParticipant(req.user.userId);
  }

  @Post('apply')
  apply(
    @Req() req: { user: { userId: string; type: string } },
    @Body()
    body: {
      realName: string;
      gender?: string;
      age?: number;
      phone: string;
      idCard?: string;
      experience: Experience;
      experienceYears?: string;
      specialties: string[];
      customSpecialties?: string;
      certificates?: string[];
      leadershipStyle: string[];
      customStyle?: string;
      availableTime: string[];
      bio?: string;
      experienceDesc?: string;
      emergencyContact?: string;
      emergencyPhone?: string;
    },
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.leader.apply(req.user.userId, {
      ...body,
      experience: body.experience as Experience,
    });
  }

  // ========== Admin Endpoints ==========

  @Get('admin/applications')
  getAllApplications(
    @Req() req: { user: { userId: string; type: string } },
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: LeaderApplicationStatus,
  ) {
    if (req.user.type !== 'admin') throw new ForbiddenException();
    return this.leader.getAllApplications(page, limit, status);
  }

  @Get('admin/applications/:id')
  getApplicationById(
    @Req() req: { user: { userId: string; type: string } },
    @Param('id') id: string,
  ) {
    if (req.user.type !== 'admin') throw new ForbiddenException();
    return this.leader.getApplicationById(id);
  }

  @Put('admin/applications/:id/review')
  reviewApplication(
    @Req() req: { user: { userId: string; type: string } },
    @Param('id') id: string,
    @Body()
    body: {
      status: LeaderApplicationStatus;
      rejectReason?: string;
      adminNote?: string;
    },
  ) {
    if (req.user.type !== 'admin') throw new ForbiddenException();
    return this.leader.reviewApplication(id, req.user.userId, body);
  }

  // ========== Backward Compatibility Endpoints (for admin panel) ==========

  @Get('admin/applications-list')
  getAllApplicationsLegacy(
    @Req() req: { user: { userId: string; type: string } },
  ) {
    if (req.user.type !== 'admin') throw new ForbiddenException();
    return this.leader.getAllApplications(1, 100);
  }

  @Post('admin/applications/:id/approve')
  approveApplicationLegacy(
    @Req() req: { user: { userId: string; type: string } },
    @Param('id') id: string,
  ) {
    if (req.user.type !== 'admin') throw new ForbiddenException();
    return this.leader.reviewApplication(id, req.user.userId, {
      status: LeaderApplicationStatus.APPROVED,
    });
  }

  @Post('admin/applications/:id/reject')
  rejectApplicationLegacy(
    @Req() req: { user: { userId: string; type: string } },
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    if (req.user.type !== 'admin') throw new ForbiddenException();
    return this.leader.reviewApplication(id, req.user.userId, {
      status: LeaderApplicationStatus.REJECTED,
      rejectReason: body.reason || '不符合要求',
    });
  }
}