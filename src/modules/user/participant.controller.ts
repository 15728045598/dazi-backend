import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ParticipantService } from './participant.service';

@ApiTags('participants')
@ApiBearerAuth()
@Controller({ path: 'users/participants', version: '1' })
export class ParticipantController {
  constructor(private readonly participantService: ParticipantService) {}

  @Get()
  async list(@Req() req: { user: { userId: string } }) {
    return this.participantService.getParticipants(req.user.userId);
  }

  @Post()
  async create(
    @Req() req: { user: { userId: string } },
    @Body() body: {
      name: string;
      phone: string;
      idCard?: string;
      gender?: string;
      emergencyContact?: string;
      emergencyPhone?: string;
    },
  ) {
    return this.participantService.createParticipant(req.user.userId, body);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: {
      name?: string;
      phone?: string;
      idCard?: string;
      gender?: string;
      emergencyContact?: string;
      emergencyPhone?: string;
    },
  ) {
    return this.participantService.updateParticipant(id, body);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.participantService.deleteParticipant(id);
  }
}
