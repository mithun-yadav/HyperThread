import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {ValidationPipe} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {Logger} from 'nestjs-pino';
import {HttpExceptionFilter} from './common/filters/http-exception.filter';
import helmet from 'helmet';

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
  app.use(helmet());

  const configService = app.get(ConfigService);
   app.enableCors({
    origin: configService.get<string>('FRONTEND_URL'),
    credentials: true
  });
  await app.listen(configService.get<number>('PORT') ?? 3000)
}
bootstrap();
