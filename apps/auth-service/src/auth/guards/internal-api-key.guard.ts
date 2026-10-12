import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.header('x-internal-api-key');
    const expectedKey =
      this.configService.getOrThrow<string>('INTERNAL_API_KEY');

    if (!providedKey || providedKey !== expectedKey) {
      throw new UnauthorizedException({
        message: 'Invalid or missing internal API key',
        errorCode: 'INTERNAL_INVALID_API_KEY',
      });
    }

    return true;
  }
}
