import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActivityCategory, ActivityStatus, Difficulty } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { ActivityService } from './activity.service';

@ApiTags('activities')
@Controller({ path: 'activities', version: '1' })
export class ActivityController {
  constructor(private readonly activities: ActivityService) {}

  @Public()
  @Get()
  list(
    @Query('category') category?: ActivityCategory,
    @Query('status') status?: ActivityStatus,
    @Query('isCharity') isCharity?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.activities.list({
      category,
      status,
      isCharity: isCharity === 'true' ? true : isCharity === 'false' ? false : undefined,
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 20,
    });
  }

  // 注意：:id/participants 必须在 :id 之前，否则会被 :id 匹配
  @Public()
  @Get(':id/participants')
  getParticipants(@Param('id') id: string) {
    return this.activities.getParticipants(id);
  }

  @Public()
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.activities.getById(id);
  }

  @ApiBearerAuth()
  @Post()
  create(
    @Req() req: { user: { userId: string; type: string } },
    @Body()
    body: {
      title: string;
      description: string;
      coverImage: string;
      category: ActivityCategory;
      difficulty: string;
      startTime: string;
      endTime: string;
      registerDeadline: string;
      location: string;
      price: number;
      minParticipants?: number;
      maxParticipants?: number;
    },
  ) {
    if (req.user.type === 'admin') {
      throw new BadRequestException('请使用小程序用户账号发布');
    }
    return this.activities.create(req.user.userId, {
      ...body,
      difficulty: body.difficulty as Difficulty,
    });
  }
}
