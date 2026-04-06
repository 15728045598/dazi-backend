import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

// 配置
import { AppConfig } from './config/app.config';
import { DatabaseConfig } from './config/database.config';
import { RedisConfig } from './config/redis.config';
import { WechatConfig } from './config/wechat.config';

// 模块
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ActivityModule } from './modules/activity/activity.module';
import { OrderModule } from './modules/order/order.module';
import { LeaderModule } from './modules/leader/leader.module';
import { PointsModule } from './modules/points/points.module';
import { CouponModule } from './modules/coupon/coupon.module';
import { InviteModule } from './modules/invite/invite.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { StepsModule } from './modules/steps/steps.module';
import { TravelModule } from './modules/travel/travel.module';
import { WishModule } from './modules/wish/wish.module';
import { HelpModule } from './modules/help/help.module';
import { CharityModule } from './modules/charity/charity.module';
import { MessageModule } from './modules/message/message.module';
import { UploadModule } from './modules/upload/upload.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './modules/health/health.module';
import { AdminModule } from './modules/admin/admin.module';
import { BannerModule } from './modules/banner/banner.module';
import { SearchModule } from './modules/search/search.module';
import { PartnerModule } from './modules/partner/partner.module';
import { FeedbackModule } from './modules/feedback/feedback.module';

@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      load: [AppConfig, DatabaseConfig, RedisConfig, WechatConfig],
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
    }),

    // 限流模块
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),

    // 日志模块
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
      },
    }),

    // 公共模块
    CommonModule,
    HealthModule,
    BannerModule,

    // 业务模块
    AuthModule,
    AdminModule,
    UserModule,
    ActivityModule,
    OrderModule,
    LeaderModule,
    PointsModule,
    CouponModule,
    InviteModule,
    WalletModule,
    StepsModule,
    TravelModule,
    WishModule,
    HelpModule,
    CharityModule,
    MessageModule,
    UploadModule,
    SearchModule,
    PartnerModule,
    FeedbackModule,
  ],
})
export class AppModule {}
