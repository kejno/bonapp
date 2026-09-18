import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { PdfJobQueue } from './table-tent-pdf.service';

@Injectable()
export class BullMqPdfJobQueue implements PdfJobQueue, OnModuleDestroy {
  private readonly queue: Queue<{ tenantId: string; tableIds?: string[] }>;

  constructor(config: ConfigService) {
    const redisUrl = new URL(
      config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
    );
    this.queue = new Queue('table-tent-pdf', {
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port || 6379),
        username: redisUrl.username || undefined,
        password: redisUrl.password || undefined,
      },
    });
  }

  add(name: string, data: { tenantId: string; tableIds?: string[] }) {
    return this.queue.add(name, data, {
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 24 * 60 * 60 },
    });
  }

  getJob(
    jobId: string,
  ): Promise<Job<{ tenantId: string; tableIds?: string[] }> | undefined> {
    return this.queue.getJob(jobId);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
