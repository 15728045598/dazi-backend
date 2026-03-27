import { Body, Controller, ForbiddenException, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { WishService } from './wish.service';

@ApiTags('wish')
@Controller({ path: 'wish', version: '1' })
export class WishController {
  constructor(private readonly wish: WishService) {}

  @Public()
  @Get()
  list() {
    return this.wish.list();
  }

  @ApiBearerAuth()
  @Post()
  create(
    @Req() req: { user: { userId: string; type: string } },
    @Body()
    body: {
      type: string;
      title: string;
      description: string;
      images?: string[];
      expectTime: string;
      expectPeople: string;
      tags?: string[];
    },
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.wish.create(req.user.userId, {
      ...body,
      type: body.type as never,
      expectTime: body.expectTime as never,
      expectPeople: body.expectPeople as never,
    });
  }

  @ApiBearerAuth()
  @Post(':id/support')
  support(@Req() req: { user: { userId: string; type: string } }, @Param('id') id: string) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.wish.support(req.user.userId, id);
  }
}
