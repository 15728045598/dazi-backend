import { Body, Controller, ForbiddenException, Get, Param, Post, Req, Query, Delete, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { TravelService } from './travel.service';

@ApiTags('travel')
@Controller({ path: 'travel', version: '1' })
export class TravelController {
  constructor(private readonly travel: TravelService) {}

  @Public()
  @Get()
  list(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.travel.list(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 20,
    );
  }

  @Public()
  @Get(':id')
  get(@Param('id') id: string) {
    return this.travel.get(id);
  }

  @ApiBearerAuth()
  @Get('my/list')
  myList(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.travel.getUserTravels(req.user.userId);
  }

  @ApiBearerAuth()
  @Post()
  create(
    @Req() req: { user: { userId: string; type: string } },
    @Body()
    body: { title: string; content: string; coverImage?: string; activityId?: string; imageUrls?: string[] },
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.travel.create(req.user.userId, body);
  }

  @ApiBearerAuth()
  @Post(':id/like')
  like(@Req() req: { user: { userId: string; type: string } }, @Param('id') id: string) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.travel.like(req.user.userId, id);
  }

  @ApiBearerAuth()
  @Get(':id/comments')
  comments(@Param('id') id: string, @Query('skip') skip?: string, @Query('take') take?: string) {
    return this.travel.getComments(id, skip ? parseInt(skip, 10) : 0, take ? parseInt(take, 10) : 50);
  }

  @ApiBearerAuth()
  @Post(':id/comments')
  comment(
    @Req() req: { user: { userId: string; type: string } },
    @Param('id') id: string,
    @Body() body: { content: string; parentId?: string },
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.travel.addComment(req.user.userId, id, body.content, body.parentId);
  }

  @ApiBearerAuth()
  @Delete(':id/comments/:commentId')
  deleteComment(
    @Req() req: { user: { userId: string; type: string } },
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    return this.travel.deleteComment(req.user.userId, id, commentId);
  }

  @ApiBearerAuth()
  @Delete(':id')
  delete(@Req() req: { user: { userId: string; type: string } }, @Param('id') id: string) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.travel.delete(req.user.userId, id);
  }
}
