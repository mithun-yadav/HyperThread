import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { RedisIOAdapter } from './realtime/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.use(helmet());
  const configService = app.get(ConfigService);
  const adapter = new RedisIOAdapter(
    app,
    configService.getOrThrow<string>('REDIS_URL'),
  );
  try {
    await adapter.connectToRedis();
    app.useWebSocketAdapter(adapter);
    const corsOrigins = configService
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    app.enableCors({
      origin: corsOrigins,
      credentials: true,
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: () =>
          new BadRequestException({
            errorCode: 'VALIDATION_ERROR',
            message: 'Invalid request payload',
          }),
      }),
    );

    app.useGlobalFilters(new HttpExceptionFilter());
    app.useLogger(app.get(Logger));

    await app.listen(configService.get<number>('PORT') ?? 4001);
  } catch (error) {
    await adapter.disconnectFromRedis();
    await app.close().catch(() => undefined);
    throw error;
  }
}
void bootstrap();
