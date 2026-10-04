import { ValidationPipe } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

export class WsValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: () =>
        new WsException({
          errorCode: 'VALIDATION_ERROR',
          message: 'Invalid message payload',
        }),
    });
  }
}
