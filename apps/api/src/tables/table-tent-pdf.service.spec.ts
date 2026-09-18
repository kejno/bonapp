import { TableTentPdfService } from './table-tent-pdf.service';

describe('TableTentPdfService', () => {
  const tenantId = 'tenant-1';
  const tables = [
    { id: 'table-1', number: '1', qrToken: 'token-1' },
    { id: 'table-2', number: '2', qrToken: 'token-2' },
    { id: 'table-3', number: '3', qrToken: 'token-3' },
  ];

  const createService = () => {
    const repository = {
      findTenant: jest
        .fn()
        .mockResolvedValue({ name: 'Bonapp Cafe', logoUrl: null }),
      findTables: jest.fn().mockResolvedValue(tables),
    };
    const renderer = {
      render: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7')),
    };
    const cache = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn(),
    };
    const queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    return {
      service: new TableTentPdfService(repository, renderer, cache, queue),
      repository,
      renderer,
      cache,
      queue,
    };
  };

  it('renders a PDF for selected tenant tables and caches it for one hour', async () => {
    const { service, repository, renderer, cache } = createService();

    const pdf = await service.generate(tenantId, ['table-1', 'table-3']);

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(repository.findTables).toHaveBeenCalledWith(tenantId, [
      'table-1',
      'table-3',
    ]);
    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantName: 'Bonapp Cafe',
        tables: [
          expect.objectContaining({
            number: '1',
            qrUrl: 'https://bonapp.by/t/token-1',
          }),
          expect.objectContaining({
            number: '3',
            qrUrl: 'https://bonapp.by/t/token-3',
          }),
        ],
      }),
    );
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), pdf, 3600);
  });

  it('returns a cached PDF without rendering it again', async () => {
    const { service, renderer, cache } = createService();
    const cachedPdf = Buffer.from('%PDF cached');
    cache.get.mockResolvedValue(cachedPdf);

    await expect(service.generate(tenantId, ['table-1'])).resolves.toBe(
      cachedPdf,
    );
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('queues sets with more than twenty tables', async () => {
    const { service, queue, repository } = createService();
    const tableIds = Array.from({ length: 21 }, (_, index) => `table-${index}`);
    repository.findTables.mockResolvedValue(
      tableIds.map((id, index) => ({
        id,
        number: String(index + 1),
        qrToken: `token-${index}`,
      })),
    );

    await expect(service.request(tenantId, tableIds)).resolves.toEqual({
      jobId: 'job-1',
    });
    expect(queue.add).toHaveBeenCalledWith('generate', { tenantId, tableIds });
  });
});
