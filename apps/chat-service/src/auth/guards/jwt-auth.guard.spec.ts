import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const secret = 'test-access-secret';
  let jwtService: { verify: jest.Mock };
  let configService: { getOrThrow: jest.Mock };
  let guard: JwtAuthGuard;

  function createContext(authorization?: string): ExecutionContext {
    const request = {
      headers: authorization ? { authorization } : {},
      user: undefined,
    };

    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    configService = { getOrThrow: jest.fn().mockReturnValue(secret) };
    guard = new JwtAuthGuard(
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  it('accepts a valid payload and attaches it to the request', () => {
    const payload = { sub: 'user-1' };
    jwtService.verify.mockReturnValue(payload);
    const context = createContext('Bearer valid-token');

    expect(guard.canActivate(context)).toBe(true);
    expect(jwtService.verify).toHaveBeenCalledWith('valid-token', {
      secret,
      algorithms: ['HS256'],
    });
    expect(
      (context.switchToHttp().getRequest() as { user: unknown }).user,
    ).toEqual(payload);
  });

  it('rejects a payload without sub', () => {
    jwtService.verify.mockReturnValue({ username: 'user-1' });

    expect(() =>
      guard.canActivate(createContext('Bearer valid-token')),
    ).toThrow(UnauthorizedException);
  });

  it('rejects an empty sub', () => {
    jwtService.verify.mockReturnValue({ sub: '  ' });

    expect(() =>
      guard.canActivate(createContext('Bearer valid-token')),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a token when verification fails', () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    expect(() =>
      guard.canActivate(createContext('Bearer invalid-token')),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a missing authorization header', () => {
    expect(() => guard.canActivate(createContext())).toThrow(
      UnauthorizedException,
    );
  });
});
