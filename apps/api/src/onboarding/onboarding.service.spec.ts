import { BadRequestException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService', () => {
  const tenant = { id: 'tenant-1', posType: null, posApiKey: null, posUrl: null };

  function createService() {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(tenant),
        update: jest.fn().mockResolvedValue(tenant),
      },
      menuImport: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    };
    const posClient = { checkConnection: jest.fn() };
    const importQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    return { service: new OnboardingService(prisma as never, posClient, importQueue), prisma, posClient, importQueue };
  }

  it('сохраняет выбор «Без POS» без реквизитов', async () => {
    const { service, prisma } = createService();

    await expect(service.savePosSettings('tenant-1', { posType: 'none' })).resolves.toEqual({ posType: 'none' });
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { posType: 'none', posApiKey: null, posUrl: null },
    });
  });

  it('проверяет iiko и сохраняет реквизиты перед импортом', async () => {
    const { service, posClient, prisma } = createService();
    posClient.checkConnection.mockResolvedValue({ pingMs: 42, itemsCount: 120 });

    await expect(service.checkPos('tenant-1', { posType: 'iiko_cloud', apiKey: 'secret' })).resolves.toEqual({ pingMs: 42, itemsCount: 120 });
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { posType: 'iiko_cloud', posApiKey: 'secret', posUrl: null },
    });
  });

  it('не ставит повторный импорт после успешного запуска', async () => {
    const { service, prisma, importQueue } = createService();
    prisma.tenant.findUnique.mockResolvedValue({ ...tenant, posType: 'iiko_cloud', posApiKey: 'secret' });
    prisma.menuImport.findFirst.mockResolvedValue({ id: 'import-1', status: 'completed' });

    await expect(service.startImport('tenant-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(importQueue.add).not.toHaveBeenCalled();
  });

  it('ставит импорт в очередь и возвращает исходный прогресс', async () => {
    const { service, prisma, importQueue } = createService();
    prisma.tenant.findUnique.mockResolvedValue({ ...tenant, posType: 'iiko_cloud', posApiKey: 'secret' });
    prisma.menuImport.create.mockResolvedValue({ id: 'import-1', status: 'queued', importedItems: 0, totalItems: 0, failedItems: 0, errors: [] });

    await expect(service.startImport('tenant-1')).resolves.toMatchObject({ id: 'import-1', status: 'queued', importedItems: 0 });
    expect(importQueue.add).toHaveBeenCalledWith('menu-import', { tenantId: 'tenant-1', importId: 'import-1', retryFailed: false }, { jobId: 'import-1' });
  });
});
