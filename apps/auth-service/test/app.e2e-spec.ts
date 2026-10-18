import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  const accessSecret = 'test-access-secret-at-least-32-characters';
  const refreshSecret = 'test-refresh-secret-at-least-32-characters';

  const user = {
    id: 'user-test-1',
    username: 'testuser',
    email: 'test@example.com',
  };

  const session = {
    id: 'session-test-1',
    userId: user.id,
    refreshTokenHash: '',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
  };

  const prismaMock = {
    identity: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    user: {
      create: jest.fn(),
    },
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
    jwtService = app.get(JwtService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a user and normalizes username and email', async () => {
    prismaMock.identity.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: user.id,
      username: 'testuser',
    });

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: 'TestUser',
        email: 'TEST@example.com',
        password: 'Password123',
      })
      .expect(201)
      .expect({
        id: user.id,
        username: 'testuser',
        email: 'test@example.com',
      });

    expect(prismaMock.user.create).toHaveBeenCalled();
  });

  it('rejects invalid registration input', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: 'x',
        email: 'not-an-email',
        password: 'weak',
      })
      .expect(400);

    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('logs in and returns access and refresh tokens', async () => {
    const argon2 = await import('argon2');
    const passwordHash = await argon2.hash('Password123');

    prismaMock.identity.findFirst.mockResolvedValue({
      userId: user.id,
      passwordHash,
      user: { id: user.id, username: user.username },
    });
    prismaMock.session.create.mockResolvedValue(session);
    prismaMock.session.update.mockImplementation(async ({ data }) => ({
      ...session,
      refreshTokenHash: data.refreshTokenHash,
    }));

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        identifier: user.email,
        password: 'Password123',
      })
      .expect(200);

    expect(response.body.userId).toBe(user.id);
    expect(response.body.username).toBe(user.username);
    expect(typeof response.body.accessToken).toBe('string');
    expect(typeof response.body.refreshToken).toBe('string');

    expect(
      jwtService.verify(response.body.accessToken, {
        secret: accessSecret,
        algorithms: ['HS256'],
      }).sub,
    ).toBe(user.id);
  });

  it('rejects invalid login credentials', async () => {
    prismaMock.identity.findFirst.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        identifier: user.email,
        password: 'WrongPassword123',
      })
      .expect(401);
  });

  it('returns the authenticated user from /auth/me', async () => {
    const accessToken = jwtService.sign(
      { sub: user.id },
      {
        secret: accessSecret,
        expiresIn: '15m',
        algorithm: 'HS256',
      },
    );

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.sub).toBe(user.id);
      });
  });

  it('rejects unauthenticated requests to /auth/me', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('rotates refresh tokens and rejects reuse of the old token', async () => {
    const argon2 = await import('argon2');
    const oldRefreshToken = jwtService.sign(
      { sub: user.id, sessionId: session.id },
      {
        secret: refreshSecret,
        expiresIn: '7d',
        algorithm: 'HS256',
      },
    );
    const oldHash = await argon2.hash(oldRefreshToken);

    let currentRefreshTokenHash = oldHash;

    prismaMock.session.findUnique.mockImplementation(async () => ({
      ...session,
      refreshTokenHash: currentRefreshTokenHash,
    }));

    prismaMock.session.update.mockImplementation(async ({ data }) => {
      if (data.refreshTokenHash) {
        currentRefreshTokenHash = data.refreshTokenHash;
      }

      return {
        ...session,
        ...data,
        refreshTokenHash: currentRefreshTokenHash,
      };
    });

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(200);

    expect(typeof response.body.accessToken).toBe('string');
    expect(typeof response.body.refreshToken).toBe('string');
    expect(response.body.refreshToken).not.toBe(oldRefreshToken);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(401);
  });

  it('rejects malformed refresh-token requests', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: '' })
      .expect(400);
  });
});
