import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // 静态文件服务（上传的图片）
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/uploads/',
  });

  // 使用 Pino 日志
  app.useLogger(app.get(Logger));

  // 安全中间件
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  // CORS 配置
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || true,
    credentials: true,
  });

  // API 版本控制
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // 全局管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // API 前缀
  app.setGlobalPrefix('api');

  // Swagger 文档
  const config = new DocumentBuilder()
    .setTitle('搭子小程序 API')
    .setDescription('搭子户外活动小程序后端 API 文档')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // 启动服务
  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 服务已启动: http://localhost:${port}`);
  console.log(`📚 API 文档: http://localhost:${port}/api/docs`);
}

bootstrap();
