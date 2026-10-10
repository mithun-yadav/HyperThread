import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    this.client = new Redis(this.configService.getOrThrow<string>('REDIS_URL'));
  }

  async onModuleInit() {
    await this.client.ping();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  private getUserSocketsKey(userId: string) {
    return `presence:${userId}:sockets`;
  }

  async setSocketPresence(userId: string, socketId: string) {
    const key = `presence:${userId}:socket:${socketId}`;
    const socketsKey = this.getUserSocketsKey(userId);
    const expiresAt = Math.floor(Date.now() / 1000) + 30;

    await this.client.set(key, '1', 'EX', 30);

    await this.client.zadd(socketsKey, expiresAt, socketId);
  }

  async refreshSocketPresence(userId: string, socketId: string) {
    const key = `presence:${userId}:socket:${socketId}`;
    const socketsKey = this.getUserSocketsKey(userId);
    const expiresAt = Math.floor(Date.now() / 1000) + 30;

    await this.client.eval(
      `
      if redis.call('EXISTS', KEYS[1]) == 0 then
        return 0
      end

      redis.call('EXPIRE', KEYS[1], ARGV[1])
      redis.call('ZADD', KEYS[2], ARGV[2], ARGV[3])

      return 1
    `,
      2,
      key,
      socketsKey,
      30,
      expiresAt,
      socketId,
    );
  }

  async removeSocketPresence(userId: string, socketId: string) {
    const key = `presence:${userId}:socket:${socketId}`;
    const socketsKey = this.getUserSocketsKey(userId);

    await this.client.del(key);

    await this.client.zrem(socketsKey, socketId);
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const socketsKey = this.getUserSocketsKey(userId);
    const now = Math.floor(Date.now() / 1000);

    // Remove expired socket registrations.
    await this.client.zremrangebyscore(socketsKey, '-inf', now);

    const socketIds = await this.client.zrange(socketsKey, '0', '-1');

    if (socketIds.length === 0) {
      return false;
    }

    // A socket is active only if its presence key still exists.
    const pipeline = this.client.pipeline();

    for (const socketId of socketIds) {
      pipeline.exists(`presence:${userId}:socket:${socketId}`);
    }

    const results = await pipeline.exec();

    let hasActiveSocket = false;

    for (let i = 0; i < socketIds.length; i++) {
      const exists = results?.[i]?.[1] === 1;

      if (exists) {
        hasActiveSocket = true;
      } else {
        // Remove stale registrations whose presence key has expired.
        await this.client.zrem(socketsKey, socketIds[i]);
      }
    }

    return hasActiveSocket;
  }
}
