import { Body, Controller, ForbiddenException, Get, Param, Post, Req, Query, Delete, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { HelpService } from './help.service';

@ApiTags('help')
@Controller({ path: 'help', version: '1' })
export class HelpController {
  constructor(private readonly help: HelpService) {}

  @Public()
  @Get()
  list(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.help.list(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 30,
      type,
      status,
    );
  }

  @Public()
  @Get(':id')
  get(@Param('id') id: string) {
    return this.help.get(id);
  }

  @ApiBearerAuth()
  @Get('my/list')
  myList(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.help.getUserHelps(req.user.userId);
  }

  @ApiBearerAuth()
  @Get(':id/responses')
  responses(@Param('id') id: string, @Query('skip') skip?: string, @Query('take') take?: string) {
    return this.help.getResponses(id, skip ? parseInt(skip, 10) : 0, take ? parseInt(take, 10) : 50);
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
      urgency: string;
      location?: string;
      rewardPoints?: number;
    },
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.help.create(req.user.userId, body);
  }

  @ApiBearerAuth()
  @Post(':id/respond')
  respond(
    @Req() req: { user: { userId: string; type: string } },
    @Param('id') id: string,
    @Body() body: { message: string },
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.help.respond(req.user.userId, id, body.message);
  }

  @ApiBearerAuth()
  @Delete(':id')
  delete(@Req() req: { user: { userId: string; type: string } }, @Param('id') id: string) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.help.delete(req.user.userId, id);
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
      urgency?: string;
      location?: string;
      rewardPoints?: number;
    },
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.help.update(req.user.userId, id, body);
  }
}
