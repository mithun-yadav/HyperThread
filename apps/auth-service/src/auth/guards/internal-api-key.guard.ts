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
  constructor(private readonly ConfigService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provideKey = request.header('x-internal-api-key');
    const expectedKey =
      this.ConfigService.getOrThrow<string>('INTERNAL_API_KEY');

    if (!provideKey || provideKey !== expectedKey) {
      throw new UnauthorizedException({
        message: 'Invalid or missing internal API key',
        errorCode: 'INTERNAL_INVALID_API_KEY',
      });
    }

    return true;
  }
}
