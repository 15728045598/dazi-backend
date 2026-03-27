import { Module } from '@nestjs/common';
import { WishController } from './wish.controller';
import { WishService } from './wish.service';

@Module({
  controllers: [WishController],
  providers: [WishService],
  exports: [WishService],
})
export class WishModule {}
