import { Session } from './../../dist/generated/prisma/browser.d';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { Prisma } from '../generated/prisma/client';
import { LoginDto } from './dto/login.dto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const username = registerDto.username.toLowerCase();
    const email = registerDto.email.toLowerCase();

    const existingIdentity = await this.prisma.identity.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existingIdentity) {
      throw new ConflictException({
        message: 'Email is already in use',
        errorCode: 'AUTH_EMAIL_ALREADY_EXISTS',
      });
    }

    const passwordHash = await argon2.hash(registerDto.password, {
      type: argon2.argon2id,
    });
    try {
      const user = await this.prisma.user.create({
        data: {
          username,
          identities: {
            create: {
              provider: 'local',
              email,
              passwordHash,
            },
          },
        },
        select: {
          id: true,
          username: true,
        },
      });

      return {
        id: user.id,
        username: user.username,
        email,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = error.meta?.target as string[] | undefined;

        if (target?.includes('username')) {
          throw new ConflictException({
            message: 'Username is already in use',
            errorCode: 'AUTH_USERNAME_ALREADY_EXISTS',
          });
        }

        if (target?.includes('email')) {
          throw new ConflictException({
            message: 'Email is already in use',
            errorCode: 'AUTH_EMAIL_ALREADY_EXISTS',
          });
        }

        throw new ConflictException({
          message: 'Username or email is already in use',
          errorCode: 'AUTH_IDENTITY_ALREADY_EXISTS',
        });
      }
      throw error;
    }
  }

  async login(loginDto: LoginDto) {
    const identifier = loginDto.identifier.toLowerCase();
    const password = loginDto.password;

    const identity = await this.prisma.identity.findFirst({
      where: {
        OR: [
          {
            email: identifier,
          },
          {
            user: {
              username: identifier,
            },
          },
        ],
      },
      include: {
        user: true,
      },
    });
    if (!identity) {
      throw new UnauthorizedException({
        message: 'Invalid Credentials',
        errorCode: 'AUTH_INVALID_CREDENTIALS',
      });
    }
    const isPasswordValid = await argon2.verify(
      identity.passwordHash,
      password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        message: 'Invalid credentials',
        errorCode: 'AUTH_INVALID_CREDENTIALS',
      });
    }

    const accessToken = this.jwtService.sign(
      {
        sub: identity.userId,
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const session = await this.prisma.session.create({
      data: {
        userId: identity.userId,
        refreshTokenHash: '',
        expiresAt,
      },
    });

    const refreshToken = this.jwtService.sign(
      {
        sub: identity.userId,
        sessionId: session.id,
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      },
    );

    const refreshTokenHash = await argon2.hash(refreshToken, {
      type: argon2.argon2id,
    });

    await this.prisma.session.update({
      where: {
        id: session.id,
      },
      data: {
        refreshTokenHash,
      },
    });

    return {
      userId: identity.userId,
      username: identity.user.username,
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshToken: string) {
    let payload: {
      sub: string;
      sessionId: string;
    };

    try {
      payload = this.jwtService.verify<{
        sub: string;
        sessionId: string;
      }>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({
        message: 'Invalid or expired refresh token',
        errorCode: 'AUTH_INVALID_REFRESH_TOKEN',
      });
    }
    const session = await this.prisma.session.findUnique({
      where: {
        id: payload.sessionId,
      },
    });
    if (!session) {
      throw new UnauthorizedException({
        message: 'Invalid refresh session',
        errorCode: 'AUTH_INVALID_REFRESH_TOKEN',
      });
    }
    if (session.revokedAt) {
      throw new UnauthorizedException({
        message: 'Refresh session has been revoked',
        errorCode: 'AUTH_SESSION_REVOKED',
      });
    }
    if (session.expiresAt <= new Date()) {
      throw new UnauthorizedException({
        message: 'Refresh has expired',
        errorCode: 'AUTH_SESSION_EXPIRED',
      });
    }
    const tokenValid = await argon2.verify(
      session.refreshTokenHash,
      refreshToken,
    );
    if (!tokenValid) {
      await this.prisma.session.update({
        where: {
          id: session.id,
        },
        data: {
          revokedAt: new Date(),
        },
      });
      throw new UnauthorizedException({
        message: 'invalid refresh token',
        errorCode: 'AUTH_REFRESH_TOKEN_REUSE',
      });
    }

    const accessToken = this.jwtService.sign(
      {
        sub: payload.sub,
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m'
      },
    );
    const newRefreshToken = this.jwtService.sign(
      {
        sub: payload.sub,
        sessionId: payload.sessionId,
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      },
    );

    const newRefreshTokenHash = await argon2.hash(newRefreshToken, {
      type: argon2.argon2id,
    });

    await this.prisma.session.update({
      where: {
        id: session.id,
      },
      data: {
        refreshTokenHash: newRefreshTokenHash,
      },
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string) {
    let payload: {
      sub: string;
      sessionId: string;
    };

    try {
      payload = this.jwtService.verify<{
        sub: string;
        sessionId: string;
      }>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({
        message: 'Invalid or expired refresh token',
        errorCode: 'AUTH_INVALID_REFRESH_TOKEN',
      });
    }

    const session = await this.prisma.session.findUnique({
      where: {
        id: payload.sessionId,
      },
    });

    if (!session) {
      throw new UnauthorizedException({
        message: 'Invalid refresh session',
        errorCode: 'AUTH_INVALID_REFRESH_TOKEN',
      });
    }

    await this.prisma.session.update({
      where: {
        id: session.id,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      message: 'Logged out successfully',
    };
  }
}
