import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue('OK'),
  })),
}));
describe('RedisService presence', () => {
  let service: RedisService;

  let redis: {
    zremrangebyscore: jest.Mock;
    zrange: jest.Mock;
    pipeline: jest.Mock;
    zrem: jest.Mock;
    set: jest.Mock;
    zadd: jest.Mock;
    eval: jest.Mock;
    del: jest.Mock;
  };

  let pipeline: {
    exists: jest.Mock;
    exec: jest.Mock;
  };

  beforeEach(() => {
    pipeline = {
      exists: jest.fn(),
      exec: jest.fn(),
    };

    redis = {
      zremrangebyscore: jest.fn().mockResolvedValue(0),
      zrange: jest.fn(),
      pipeline: jest.fn().mockReturnValue(pipeline),
      zrem: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
      zadd: jest.fn().mockResolvedValue(1),
      eval: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
    };

    const configService = {
      getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379'),
    };

    service = new RedisService(configService as unknown as ConfigService);

    // Replace the private client with our mock.
    (service as unknown as { client: typeof redis }).client = redis;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns true when at least one socket presence key exists', async () => {
    redis.zrange.mockResolvedValue(['socket-1', 'socket-2']);
    pipeline.exec.mockResolvedValue([
      [null, 1],
      [null, 0],
    ]);

    await expect(service.isUserOnline('user-1')).resolves.toBe(true);

    expect(pipeline.exists).toHaveBeenCalledWith(
      'presence:user-1:socket:socket-1',
    );
    expect(pipeline.exists).toHaveBeenCalledWith(
      'presence:user-1:socket:socket-2',
    );
    expect(redis.zrem).toHaveBeenCalledWith(
      'presence:user-1:sockets',
      'socket-2',
    );
  });

  it('returns false when no socket registrations remain', async () => {
    redis.zrange.mockResolvedValue([]);

    await expect(service.isUserOnline('user-1')).resolves.toBe(false);

    expect(redis.pipeline).not.toHaveBeenCalled();
  });

  it('removes a stale socket registration and returns false', async () => {
    redis.zrange.mockResolvedValue(['socket-stale']);
    pipeline.exec.mockResolvedValue([[null, 0]]);

    await expect(service.isUserOnline('user-1')).resolves.toBe(false);

    expect(redis.zrem).toHaveBeenCalledWith(
      'presence:user-1:sockets',
      'socket-stale',
    );
  });

  it('registers a socket with a 30-second TTL', async () => {
    redis.set = jest.fn().mockResolvedValue('OK');
    redis.zadd = jest.fn().mockResolvedValue(1);

    await service.setSocketPresence('user-1', 'socket-1');

    expect(redis.set).toHaveBeenCalledWith(
      'presence:user-1:socket:socket-1',
      '1',
      'EX',
      30,
    );

    expect(redis.zadd).toHaveBeenCalledWith(
      'presence:user-1:sockets',
      expect.any(Number),
      'socket-1',
    );
  });

  it('refreshes an existing socket atomically', async () => {
    redis.eval = jest.fn().mockResolvedValue(1);

    await service.refreshSocketPresence('user-1', 'socket-1');

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('EXISTS', KEYS[1])"),
      2,
      'presence:user-1:socket:socket-1',
      'presence:user-1:sockets',
      30,
      expect.any(Number),
      'socket-1',
    );
  });

  it('removes a socket key and its registry entry', async () => {
    redis.del = jest.fn().mockResolvedValue(1);
    redis.zrem = jest.fn().mockResolvedValue(1);

    await service.removeSocketPresence('user-1', 'socket-1');

    expect(redis.del).toHaveBeenCalledWith('presence:user-1:socket:socket-1');

    expect(redis.zrem).toHaveBeenCalledWith(
      'presence:user-1:sockets',
      'socket-1',
    );
  });
});
