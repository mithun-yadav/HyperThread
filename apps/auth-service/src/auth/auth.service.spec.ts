import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService refresh token security', () => {
  it('rejects refresh tokens signed with an unsupported algorithm', async () => {
    const refreshSecret = 'test-refresh-secret';
    const token = new JwtService({
      secret: refreshSecret,
      signOptions: { algorithm: 'HS384' },
    }).sign({ sub: 'user-1', sessionId: 'session-1' });

    const prisma = {
      session: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as PrismaService;

    const jwtService = new JwtService();
    const configService = {
      getOrThrow: jest.fn().mockReturnValue(refreshSecret),
    } as unknown as ConfigService;

    const service = new AuthService(prisma, jwtService, configService);

    await expect(service.refresh(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });
});
