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

  async setSocketPresence(userId: string, socketId: string) {
    const key = `presence:${userId}:socket:${socketId}`;

    await this.client.set(key, '1', 'EX', 30);
  }

  async refreshSocketPresence(userId: string, socketId: string) {
    const key = `presence:${userId}:socket:${socketId}`;

    await this.client.expire(key, 30);
  }

  async removeSocketPresence(userId: string, socketId: string) {
    const key = `presence:${userId}:socket:${socketId}`;

    await this.client.del(key);
  }
}
