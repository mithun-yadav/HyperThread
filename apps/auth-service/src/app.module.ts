import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {envValidationSchema} from './config/env.validation';
import {LoggerModule} from "nestjs-pino";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>{
        const nodeEnv = configService.get<string>('NODE_ENV');
        return {
          pinoHttp: {
            redact: {
              paths: [
                'req.headers.cookie',
                'req.headers.authorization'
              ],
              censor: '[REDACTED]'
            },
            transport : nodeEnv === 'development' ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                },
              } : undefined
          }
        }
      }
    })
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
