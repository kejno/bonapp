import { Module } from '@nestjs/common';
import { BullMqPdfJobQueue } from './bullmq-pdf-job.queue';
import { PrismaTableTentRepository } from './prisma-table-tent.repository';
import { PuppeteerTableTentPdfRenderer } from './puppeteer-table-tent-pdf.renderer';
import { RedisPdfCacheService } from './redis-pdf-cache.service';
import { TableTentsController } from './table-tents.controller';
import { TableTentPdfWorker } from './table-tent-pdf.worker';
import {
  TableTentPdfService,
  PDF_CACHE,
  PDF_JOB_QUEUE,
  TABLE_TENT_PDF_RENDERER,
  TABLE_TENT_REPOSITORY,
} from './table-tent-pdf.service';

@Module({
  controllers: [TableTentsController],
  providers: [
    TableTentPdfService,
    TableTentPdfWorker,
    PrismaTableTentRepository,
    PuppeteerTableTentPdfRenderer,
    RedisPdfCacheService,
    BullMqPdfJobQueue,
    { provide: TABLE_TENT_REPOSITORY, useExisting: PrismaTableTentRepository },
    {
      provide: TABLE_TENT_PDF_RENDERER,
      useExisting: PuppeteerTableTentPdfRenderer,
    },
    { provide: PDF_CACHE, useExisting: RedisPdfCacheService },
    { provide: PDF_JOB_QUEUE, useExisting: BullMqPdfJobQueue },
  ],
})
export class TableTentsModule {}
