import { TableQrPdfService } from './table-qr-pdf.service';

describe('BNP-393: asynchronous PDF for more than 20 tables', () => {
  it('queues generation and returns a job status URL', async () => {
    const tables = Array.from({ length: 21 }, (_, index) => ({
      id: `table-${index + 1}`,
      tableNumber: index + 1,
      qrToken: `token-${index + 1}`,
    }));
    const cache = { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      forTenant: () => ({
        tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'Cafe', logoUrl: null, updatedAt: new Date() }) },
        table: { findMany: jest.fn().mockResolvedValue(tables) },
      }),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = Object.create(TableQrPdfService.prototype) as TableQrPdfService;
    Object.assign(service, { cache, prisma, queue });

    const result = await service.generate('tenant-1');

    expect(Buffer.isBuffer(result)).toBe(false);
    const jobResult = result as { jobId: string; statusUrl: string };
    expect(jobResult.statusUrl).toMatch(/^\/api\/v1\/admin\/tables\/generate-qr-pdf\/jobs\//);
    expect(queue.add).toHaveBeenCalledTimes(1);
    const queueCalls = queue.add.mock.calls as unknown as Array<unknown[]>;
    const queuedJob = queueCalls[0][1] as {
      tenantId: string;
      tables: typeof tables;
    };
    expect(queuedJob.tenantId).toBe('tenant-1');
    expect(queuedJob.tables).toEqual(tables);
    expect(cache.setJson).toHaveBeenCalledWith(expect.stringMatching(/^tables:qr-pdf:job:/), expect.objectContaining({ status: 'pending' }), 86400);
  });
});
