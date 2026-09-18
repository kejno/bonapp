import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { TableTentPdfService } from './table-tent-pdf.service';

@Injectable()
export class TableTentPdfWorker implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<{ tenantId: string; tableIds?: string[] }>;

  constructor(
    private readonly config: ConfigService,
    private readonly pdfService: TableTentPdfService,
  ) {}

  onModuleInit(): void {
    const redisUrl = new URL(
      this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
    );
    this.worker = new Worker(
      'table-tent-pdf',
      async (job) => {
        await this.pdfService.generate(job.data.tenantId, job.data.tableIds);
      },
      {
        connection: {
          host: redisUrl.hostname,
          port: Number(redisUrl.port || 6379),
          username: redisUrl.username || undefined,
          password: redisUrl.password || undefined,
        },
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
