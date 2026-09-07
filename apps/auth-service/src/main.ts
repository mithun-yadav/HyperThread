import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {ValidationPipe} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {Logger} from 'nestjs-pino';
import {HttpExceptionFilter} from './common/filters/http-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform:true
    })
  );

  app.useGlobalFilters(new HttpExceptionFilter())
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  await app.listen(configService.get<number>('PORT') ?? 3000)
}
bootstrap();
