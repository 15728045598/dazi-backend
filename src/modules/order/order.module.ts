import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { WechatPayUtil } from '../../common/utils/wechat-pay.util';

@Module({
  imports: [ConfigModule],
  controllers: [OrderController],
  providers: [OrderService, WechatPayUtil],
  exports: [OrderService, WechatPayUtil],
})
export class OrderModule {}
