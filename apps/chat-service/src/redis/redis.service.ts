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

    await this.client.expire(key, 30);

    await this.client.zadd(socketsKey, expiresAt, socketId);
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

    await this.client.zremrangebyscore(socketsKey, '-inf', now);

    const activeSockets = await this.client.zcard(socketsKey);
    return activeSockets > 0;
  }
}
