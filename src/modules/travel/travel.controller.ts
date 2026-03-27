import { Body, Controller, ForbiddenException, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { TravelService } from './travel.service';

@ApiTags('travel')
@Controller({ path: 'travel', version: '1' })
export class TravelController {
  constructor(private readonly travel: TravelService) {}

  @Public()
  @Get()
  list() {
    return this.travel.list();
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
}
