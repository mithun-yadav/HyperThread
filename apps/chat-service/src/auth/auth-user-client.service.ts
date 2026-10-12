import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface AuthUser {
  id: string;
  username: string;
}

@Injectable()
export class AuthUserClientService {
  constructor(private readonly configService: ConfigService) {}

  async validateUser(userId: string): Promise<AuthUser> {
    const authServiceUrl =
      this.configService.getOrThrow<string>('AUTH_SERVICE_URL');

    const internalApiKey =
      this.configService.getOrThrow<string>('INTERNAL_API_KEY');

    let response: Response;

    try {
      response = await fetch(
        `${authServiceUrl}/internal/users/${encodeURIComponent(userId)}`,
        {
          headers: {
            'x-internal-api-key': internalApiKey,
          },
          signal: AbortSignal.timeout(3000),
        },
      );
    } catch {
      throw new ServiceUnavailableException({
        message: 'Auth service is unavailable',
        errorCode: 'AUTH_SERVICE_UNAVAILABLE',
      });
    }

    if (response.status === 404) {
      throw new NotFoundException({
        message: 'User not found',
        errorCode: 'USER_NOT_FOUND',
      });
    }

    if (!response.ok) {
      throw new ServiceUnavailableException({
        message: 'Auth service request failed',
        errorCode: 'AUTH_SERVICE_REQUEST_FAILED',
      });
    }

    const user: unknown = await response.json();

    if (
      typeof user !== 'object' ||
      user === null ||
      !('id' in user) ||
      !('username' in user) ||
      typeof user.id !== 'string' ||
      typeof user.username !== 'string' ||
      user.id !== userId
    ) {
      throw new InternalServerErrorException({
        message: 'Auth service returned an invalid user response',
        errorCode: 'AUTH_USER_RESPONSE_INVALID',
      });
    }

    return {
      id: user.id,
      username: user.username,
    };
  }
}
