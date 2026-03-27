import { Body, Controller, ForbiddenException, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { HelpService } from './help.service';

@ApiTags('help')
@Controller({ path: 'help', version: '1' })
export class HelpController {
  constructor(private readonly help: HelpService) {}

  @Public()
  @Get()
  list() {
    return this.help.list();
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
}
