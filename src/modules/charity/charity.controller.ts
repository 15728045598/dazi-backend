import { Body, Controller, ForbiddenException, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CharityService } from './charity.service';

@ApiTags('charity')
@Controller({ path: 'charity', version: '1' })
export class CharityController {
  constructor(private readonly charity: CharityService) {}

  @Public()
  @Get('projects')
  projects() {
    return this.charity.listProjects();
  }

  @Public()
  @Get('projects/:id')
  project(@Param('id') id: string) {
    return this.charity.getProject(id);
  }

  @ApiBearerAuth()
  @Post('projects/:id/donate')
  donate(
    @Req() req: { user: { userId: string; type: string } },
    @Param('id') id: string,
    @Body() body: { amount: number; type?: string },
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.charity.donate(req.user.userId, id, body);
  }
}
