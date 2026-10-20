import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import argon2 from 'argon2';

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

  it('revokes the session when logout receives a valid refresh token', async () => {
    const refreshSecret = 'test-refresh-secret';
    const refreshToken = new JwtService({
      secret: refreshSecret,
      signOptions: { algorithm: 'HS256' },
    }).sign({
      sub: 'user-1',
      sessionId: 'session-1',
    });

    const session = {
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: await argon2.hash(refreshToken),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    };

    const prisma = {
      session: {
        findUnique: jest.fn().mockResolvedValue(session),
        update: jest.fn().mockResolvedValue({
          ...session,
          revokedAt: new Date(),
        }),
      },
    } as unknown as PrismaService;

    const jwtService = new JwtService();
    const configService = {
      getOrThrow: jest.fn().mockReturnValue(refreshSecret),
    } as unknown as ConfigService;

    const service = new AuthService(prisma, jwtService, configService);

    await expect(service.logout(refreshToken)).resolves.toEqual({
      message: 'Logged out successfully',
    });

    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rejects refresh after logout revokes the session', async () => {
    const refreshSecret = 'test-refresh-secret';
    const refreshToken = new JwtService({
      secret: refreshSecret,
      signOptions: { algorithm: 'HS256' },
    }).sign({
      sub: 'user-1',
      sessionId: 'session-1',
    });

    const session = {
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: await argon2.hash(refreshToken),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null as Date | null,
    };

    const prisma = {
      session: {
        findUnique: jest.fn().mockImplementation(async () => session),
        update: jest.fn().mockImplementation(async ({ data }) => {
          Object.assign(session, data);
          return session;
        }),
      },
    } as unknown as PrismaService;

    const jwtService = new JwtService();
    const configService = {
      getOrThrow: jest.fn().mockReturnValue(refreshSecret),
    } as unknown as ConfigService;

    const service = new AuthService(prisma, jwtService, configService);

    await service.logout(refreshToken);

    await expect(service.refresh(refreshToken)).rejects.toMatchObject({
      response: {
        errorCode: 'AUTH_SESSION_REVOKED',
      },
    });
  });

  it('rejects logout when the refresh token hash does not match', async () => {
    const refreshSecret = 'test-refresh-secret';

    const refreshToken = new JwtService({
      secret: refreshSecret,
      signOptions: { algorithm: 'HS256' },
    }).sign({
      sub: 'user-1',
      sessionId: 'session-1',
    });

    const session = {
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: await argon2.hash('different-refresh-token'),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    };

    const prisma = {
      session: {
        findUnique: jest.fn().mockResolvedValue(session),
        update: jest.fn(),
      },
    } as unknown as PrismaService;

    const jwtService = new JwtService();

    const configService = {
      getOrThrow: jest.fn().mockReturnValue(refreshSecret),
    } as unknown as ConfigService;

    const service = new AuthService(prisma, jwtService, configService);

    await expect(service.logout(refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(prisma.session.update).not.toHaveBeenCalled();
  });
});
