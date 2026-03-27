import { Controller, ForbiddenException, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MessageService } from './message.service';

@ApiTags('messages')
@ApiBearerAuth()
@Controller({ path: 'messages', version: '1' })
export class MessageController {
  constructor(private readonly messages: MessageService) {}

  @Get()
  list(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.messages.list(req.user.userId);
  }

  @Patch(':id/read')
  read(@Req() req: { user: { userId: string; type: string } }, @Param('id') id: string) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.messages.markRead(req.user.userId, id);
  }

  @Post('read-all')
  readAll(@Req() req: { user: { userId: string; type: string } }) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.messages.markAllRead(req.user.userId);
  }
}
