import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, ServerOptions } from 'socket.io';

export class RedisIOAdapter extends IoAdapter {
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    if (this.pubClient || this.subClient) {
      throw new Error('RedisIOAdapter is already initialized');
    }

    const pubClient = new Redis(this.redisUrl);
    const subClient = pubClient.duplicate();

    try {
      await Promise.all([pubClient.ping(), subClient.ping()]);

      this.pubClient = pubClient;
      this.subClient = subClient;
    } catch (error) {
      this.pubClient = pubClient;
      this.subClient = subClient;
      await this.disconnectFromRedis();
      throw error;
    }
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    if (!this.pubClient || !this.subClient) {
      throw new Error('RedisIOAdapter has not been initialized');
    }

    const server = super.createIOServer(port, options) as Server;

    server.adapter(createAdapter(this.pubClient, this.subClient));

    return server;
  }

  async disconnectFromRedis(): Promise<void> {
    const clients = [this.pubClient, this.subClient].filter(
      (client): client is Redis => client !== null,
    );
    this.pubClient = null;
    this.subClient = null;

    await Promise.allSettled(
      clients.map(async (client) => {
        if (client.status === 'end') {
          return;
        }
        await client.quit();
      }),
    );
  }

  async close(server: Server): Promise<void> {
    try {
      await super.close(server);
    } finally {
      await this.disconnectFromRedis();
    }
  }
}
