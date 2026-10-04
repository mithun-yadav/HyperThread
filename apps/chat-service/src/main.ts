import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { WsException } from '@nestjs/websockets';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const configService = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: () =>
        new WsException({
          errorCode: 'VALIDATION_ERROR',
          message: 'Invalid request payload',
        }),
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useLogger(app.get(Logger));

  await app.listen(configService.get<number>('PORT') ?? 4000);
}
void bootstrap();
