import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { ParticipantController } from './participant.controller';
import { ParticipantService } from './participant.service';

@Module({
  controllers: [UserController, ParticipantController],
  providers: [UserService, ParticipantService],
  exports: [UserService, ParticipantService],
})
export class UserModule {}
