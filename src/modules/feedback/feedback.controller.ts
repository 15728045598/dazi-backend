import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { FeedbackService } from './feedback.service';
import { FeedbackType } from '@prisma/client';

@ApiTags('feedback')
@Controller({ path: 'feedback', version: '1' })
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Public()
  @Post('submit')
  submit(
    @Req() req: { user?: { userId: string; type: string } },
    @Body() body: { type: FeedbackType; content: string; contact?: string },
  ) {
    const userId = req.user?.userId ?? null;
    return this.feedback.submit(userId, body);
  }

  @ApiBearerAuth()
  @Get('my/list')
  myList(@Req() req: { user: { userId: string } }, @Query('skip') skip?: string, @Query('take') take?: string) {
    return this.feedback.getUserFeedbacks(
      req.user.userId,
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 20,
    );
  }
}