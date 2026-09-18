import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { ServerOptions } from 'socket.io';

type SocketIoServer = {
  adapter(adapter: ReturnType<typeof createAdapter>): void;
};

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | undefined;
  private publisher: Redis | undefined;
  private subscriber: Redis | undefined;

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    this.publisher = new Redis(this.redisUrl, { lazyConnect: true });
    this.subscriber = this.publisher.duplicate();
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
    this.adapterConstructor = createAdapter(this.publisher, this.subscriber);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(
      port,
      options,
    ) as unknown as SocketIoServer;
    if (!this.adapterConstructor)
      throw new Error('Redis adapter is not connected');
    server.adapter(this.adapterConstructor);
    return server;
  }

  async close(): Promise<void> {
    await Promise.all([this.publisher?.quit(), this.subscriber?.quit()]);
  }
}
