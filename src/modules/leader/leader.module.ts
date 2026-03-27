import { Module } from '@nestjs/common';
import { LeaderController } from './leader.controller';
import { LeaderService } from './leader.service';

@Module({
  controllers: [LeaderController],
  providers: [LeaderService],
  exports: [LeaderService],
})
export class LeaderModule {}
