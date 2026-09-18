import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Res,
  Body,
} from '@nestjs/common';
import type { Response } from 'express';
import { BullMqPdfJobQueue } from './bullmq-pdf-job.queue';
import { TableTentPdfService } from './table-tent-pdf.service';

interface GenerateTableTentPdfDto {
  tableIds?: string[];
}

@Controller('api/v1/admin/tables')
export class TableTentsController {
  constructor(
    private readonly pdfService: TableTentPdfService,
    private readonly jobs: BullMqPdfJobQueue,
  ) {}

  @Post('generate-qr-pdf')
  async generate(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Body() body: GenerateTableTentPdfDto,
    @Res() response: Response,
  ): Promise<void> {
    const resolvedTenantId = this.requireTenantId(tenantId);
    const result = await this.pdfService.request(
      resolvedTenantId,
      body?.tableIds,
    );
    if (result.jobId) {
      response.status(HttpStatus.ACCEPTED).json({
        jobId: result.jobId,
        statusUrl: `/api/v1/admin/tables/generate-qr-pdf/jobs/${result.jobId}`,
      });
      return;
    }

    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="tables-qr.pdf"',
    });
    response.status(HttpStatus.OK).send(result.pdf!);
  }

  @Get('generate-qr-pdf/jobs/:jobId')
  async status(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Param('jobId') jobId: string,
  ): Promise<{
    status: 'pending' | 'ready' | 'failed';
    downloadUrl?: string;
    error?: string;
  }> {
    const job = await this.findTenantJob(this.requireTenantId(tenantId), jobId);
    const state = await job.getState();
    if (state === 'completed') {
      return {
        status: 'ready',
        downloadUrl: `/api/v1/admin/tables/generate-qr-pdf/jobs/${jobId}/file`,
      };
    }
    if (state === 'failed') {
      return {
        status: 'failed',
        error: job.failedReason ?? 'PDF generation failed',
      };
    }
    return { status: 'pending' };
  }

  @Get('generate-qr-pdf/jobs/:jobId/file')
  async download(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Param('jobId') jobId: string,
    @Res() response: Response,
  ): Promise<void> {
    const job = await this.findTenantJob(this.requireTenantId(tenantId), jobId);
    if ((await job.getState()) !== 'completed') {
      throw new NotFoundException('Generated PDF is not ready');
    }
    const pdf = await this.pdfService.generate(
      job.data.tenantId,
      job.data.tableIds,
    );
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="tables-qr.pdf"',
    });
    response.status(HttpStatus.OK).send(pdf);
  }

  private requireTenantId(tenantId: string | undefined): string {
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }
    return tenantId;
  }

  private async findTenantJob(tenantId: string, jobId: string) {
    const job = await this.jobs.getJob(jobId);
    if (!job || job.data.tenantId !== tenantId) {
      throw new NotFoundException('PDF generation job was not found');
    }
    return job;
  }
}
