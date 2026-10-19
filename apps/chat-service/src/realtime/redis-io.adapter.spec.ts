const mockRedisInstances: Array<{
  status: string;
  ping: jest.Mock;
  quit: jest.Mock;
  duplicate: jest.Mock;
}> = [];

let mockPingFailure: Error | null = null;

jest.mock('ioredis', () => {
  class MockRedis {
    status = 'ready';
    ping = jest.fn().mockImplementation(async () => {
      if (mockPingFailure) throw mockPingFailure;
      return 'PONG';
    });
    quit = jest.fn().mockResolvedValue('OK');
    duplicate = jest.fn(() => new MockRedis());

    constructor() {
      mockRedisInstances.push(this);
    }
  }

  return { __esModule: true, default: MockRedis };
});

import { INestApplicationContext } from '@nestjs/common';
import { RedisIOAdapter } from './redis-io.adapter';

describe('RedisIOAdapter', () => {
  let adapter: RedisIOAdapter;

  beforeEach(() => {
    mockRedisInstances.length = 0;
    mockPingFailure = null;

    adapter = new RedisIOAdapter(
      {} as INestApplicationContext,
      'redis://localhost:6379',
    );
  });

  afterEach(async () => {
    await adapter.disconnectFromRedis();
    jest.clearAllMocks();
  });

  it('connects both Redis clients successfully', async () => {
    await adapter.connectToRedis();

    expect(mockRedisInstances).toHaveLength(2);
    expect(mockRedisInstances[0].ping).toHaveBeenCalled();
    expect(mockRedisInstances[1].ping).toHaveBeenCalled();
  });

  it('cleans up both clients and rethrows when connection fails', async () => {
    const error = new Error('Redis connection failed');
    mockPingFailure = error;

    await expect(adapter.connectToRedis()).rejects.toThrow(error);

    expect(mockRedisInstances).toHaveLength(2);
    expect(mockRedisInstances[0].quit).toHaveBeenCalledTimes(1);
    expect(mockRedisInstances[1].quit).toHaveBeenCalledTimes(1);
  });

  it('rejects repeated initialization', async () => {
    await adapter.connectToRedis();

    await expect(adapter.connectToRedis()).rejects.toThrow(
      'RedisIOAdapter is already initialized',
    );
  });

  it('rejects server creation before initialization', () => {
    expect(() => adapter.createIOServer(4001)).toThrow(
      'RedisIOAdapter has not been initialized',
    );
  });

  it('closes both Redis clients during cleanup', async () => {
    await adapter.connectToRedis();

    await adapter.disconnectFromRedis();

    expect(mockRedisInstances[0].quit).toHaveBeenCalledTimes(1);
    expect(mockRedisInstances[1].quit).toHaveBeenCalledTimes(1);
  });

  it('does not quit a Redis client that has already ended', async () => {
    await adapter.connectToRedis();
    mockRedisInstances[0].status = 'end';

    await adapter.disconnectFromRedis();

    expect(mockRedisInstances[0].quit).not.toHaveBeenCalled();
    expect(mockRedisInstances[1].quit).toHaveBeenCalledTimes(1);
  });
});
