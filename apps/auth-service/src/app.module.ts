import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {envValidationSchema} from './config/env.validation';
import {LoggerModule} from "nestjs-pino";
import {randomUUID} from 'node:crypto';
import {Request, Response} from "express"

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
              } : undefined,
              genReqId:(req:Request, res:Response)=> {
                const incomingId = req.headers['x-request-id'];

                const requestId = typeof incomingId === 'string' && incomingId.length > 0 ? incomingId : randomUUID();

                res.setHeader('x-request-id', requestId);

                return requestId;
              }
          }
        }
      }
    })
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
