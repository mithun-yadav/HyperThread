import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {ValidationPipe} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {Logger} from 'nestjs-pino';
import {HttpExceptionFilter} from './common/filters/http-exception.filter';
import helmet from 'helmet';
import {DocumentBuilder, SwaggerModule} from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
    const configService = app.get(ConfigService);

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

  if(configService.get<string>('NODE_ENV') === 'development'){
    const config = new DocumentBuilder().setTitle('HyperThread Auth service').setDescription('API documentation for the HyperThread Auth service')
    .setVersion('1.0')
    .build();

    const document = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup('docs', app, document)
  }
   app.enableCors({
    origin: configService.get<string>('FRONTEND_URL'),
    credentials: true
  });
  await app.listen(configService.get<number>('PORT') ?? 3000)
}
bootstrap();
