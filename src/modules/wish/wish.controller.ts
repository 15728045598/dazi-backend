import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Req, Delete, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { WishService } from './wish.service';

@ApiTags('wish')
@Controller({ path: 'wish', version: '1' })
export class WishController {
  constructor(private readonly wish: WishService) {}

  @Public()
  @Get()
  list(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('type') type?: string,
  ) {
    return this.wish.list(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 30,
      type,
    );
  }

  @Public()
  @Get(':id')
  get(@Param('id') id: string) {
    return this.wish.get(id);
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
  @Get('my/list')
  myList(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.wish.getUserWishes(req.user.userId);
  }

  @ApiBearerAuth()
  @Post(':id/support')
  support(@Req() req: { user: { userId: string; type: string } }, @Param('id') id: string) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.wish.support(req.user.userId, id);
  }

  @ApiBearerAuth()
  @Delete(':id')
  delete(@Req() req: { user: { userId: string; type: string } }, @Param('id') id: string) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.wish.delete(req.user.userId, id);
  }

  @ApiBearerAuth()
  @Patch(':id')
  update(
    @Req() req: { user: { userId: string; type: string } },
    @Param('id') id: string,
    @Body() body: {
      title?: string;
      description?: string;
      images?: string[];
      expectTime?: string;
      expectPeople?: string;
      tags?: string[];
    },
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.wish.update(req.user.userId, id, {
      ...body,
      expectTime: body.expectTime as never,
      expectPeople: body.expectPeople as never,
    });
  }
}
