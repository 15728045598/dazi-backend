import { Module } from '@nestjs/common';
import { BannerController } from './banner.controller';

@Module({
  controllers: [BannerController],
})
export class BannerModule {}
