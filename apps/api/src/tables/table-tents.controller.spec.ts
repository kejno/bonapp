import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { BullMqPdfJobQueue } from './bullmq-pdf-job.queue';
import { TableTentsController } from './table-tents.controller';
import { TableTentPdfService } from './table-tent-pdf.service';

describe('TableTentsController', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [TableTentsController],
      providers: [
        {
          provide: TableTentPdfService,
          useValue: {
            request: jest
              .fn()
              .mockResolvedValue({ pdf: Buffer.from('%PDF-1.7') }),
          },
        },
        { provide: BullMqPdfJobQueue, useValue: { getJob: jest.fn() } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => app.close());

  it('returns a PDF for a request with three tables', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/tables/generate-qr-pdf')
      .set('x-tenant-id', 'tenant-1')
      .send({ tableIds: ['table-1', 'table-2', 'table-3'] })
      .expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.body.subarray(0, 4).toString()).toBe('%PDF');
  });
});
