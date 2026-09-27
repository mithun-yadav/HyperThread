import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        message: 'Invalid or missing authorization header',
        errorCode: 'AUTH_INVALID_ACCESS_TOKEN',
      });
    }

    const token = authorization.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException({
        message: 'Invalid or missing access token',
        errorCode: 'AUTH_INVALID_ACCESS_TOKEN',
      });
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      request.user = payload;

      return true;
    } catch (error) {
      throw new UnauthorizedException({
        message: 'Invalid or expired access token',
        errorCode: 'AUTH_INVALID_ACCESS_TOKEN',
      });
    }
  }
}
