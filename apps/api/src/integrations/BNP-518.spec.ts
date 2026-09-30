import { OnboardingService } from '../onboarding/onboarding.service';
import { OnboardingController } from '../onboarding/onboarding.controller';
import * as posNetwork from '../onboarding/pos-network';

let mockWorkerProcessor: ((job: { data: { tenantId: string; items?: unknown[] }; updateProgress: jest.Mock }) => Promise<void>) | undefined;

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(async (_name: string, data: { tenantId: string; items?: unknown[] }) => {
      await mockWorkerProcessor?.({ data, updateProgress: jest.fn() });
    }),
    close: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation((_name: string, processor: typeof mockWorkerProcessor) => {
    mockWorkerProcessor = processor;
    return { on: jest.fn(), close: jest.fn(), waitUntilReady: jest.fn() };
  }),
}));

jest.mock('../onboarding/pos-network', () => ({
  requestPosMenu: jest.fn(),
  requestIikoAccessToken: jest.fn(),
}));

describe('BNP-518: r_keeper menu import', () => {
  it('imports POS identifiers, updates existing menu items, and stores category mappings', async () => {
    const existingItem = { id: 'menu-existing', tenantId: 'tenant-518', posItemId: 'rk-1' };
    const categories = new Map<string, { id: string; posCategoryId: string }>();
    const items = new Map<string, Record<string, unknown>>([['rk-1', existingItem]]);
    const menuCategory = {
      findFirst: jest.fn(({ where }: { where: { posCategoryId: string } }) => categories.get(where.posCategoryId) ?? null),
      create: jest.fn(({ data }: { data: { posCategoryId: string; name: string } }) => {
        const category = { id: `category-${data.posCategoryId}`, ...data };
        categories.set(data.posCategoryId, category);
        return category;
      }),
    };
    const menuItem = {
      findFirst: jest.fn(({ where }: { where: { posItemId: string } }) => items.get(where.posItemId) ?? null),
      update: jest.fn(({ where, data }: { where: { tenantId_id: { id: string } }; data: Record<string, unknown> }) => {
        const found = [...items.values()].find((item) => item.id === where.tenantId_id.id)!;
        Object.assign(found, data);
        return found;
      }),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const created = { id: 'menu-new', ...data };
        items.set(data.posItemId as string, created);
        return created;
      }),
      findMany: jest.fn(() => [...items.values()].map(({ id, posItemId }) => ({ id, posItemId }))),
      updateMany: jest.fn(),
    };
    const tenantUpdate = jest.fn<Promise<void>, [unknown]>().mockImplementation(() => Promise.resolve());
    let state: Record<string, unknown> = { status: 'idle', imported: 0 };
    const tenantRecord = {
      posType: 'r_keeper', posUrl: 'https://keeper.example', posApiKey: 'secret',
      posImportState: state,
    };
    const tenantDb = {
      findUnique: jest.fn(() => Promise.resolve({ ...tenantRecord, posImportState: state })),
      update: tenantUpdate,
      updateMany: jest.fn(({ data }: { data: { posImportState: Record<string, unknown> } }) => {
        state = data.posImportState;
        return { count: 1 };
      }),
    };
    tenantUpdate.mockImplementation((args: unknown) => {
      state = (args as { data: { posImportState: Record<string, unknown> } }).data.posImportState;
      return Promise.resolve();
    });
    const prisma = {
      db: { tenant: tenantDb },
      forTenant: () => ({
        tenant: tenantDb,
        menuCategory,
        menuItem,
      }),
      transactionForTenant: (_tenantId: string, operation: (tx: unknown) => Promise<unknown>) => operation({ menuCategory, menuItem }),
    };
    const service = new OnboardingService(prisma as never, { getTenantId: () => 'tenant-518' } as never,
      { get: (key: string, fallback: string) => key === 'POS_ALLOWED_HOSTS' ? 'keeper.example' : fallback } as never);
    const controller = new OnboardingController(service);
    (posNetwork.requestPosMenu as jest.Mock).mockResolvedValue([
      { id: 'rk-1', name: 'Обновлённое блюдо', price: 12.5, categoryId: 'rk-cat-1', categoryName: 'Супы' },
      { id: 'rk-2', name: 'Новое блюдо', price: 8, categoryId: 'rk-cat-1', categoryName: 'Супы' },
    ]);
    const accepted = await controller.importMenu();
    expect(accepted.jobId).toMatch(/^menu-import-tenant-518-/);
    expect(await controller.importStatus()).toMatchObject({ status: 'completed', imported: 2 });

    expect(posNetwork.requestPosMenu).toHaveBeenCalledWith(new URL('https://keeper.example'), 'secret', 'keeper.example', 15000);
    expect(menuCategory.create).toHaveBeenCalledTimes(1);
    expect(items.get('rk-1')).toMatchObject({
      name: 'Обновлённое блюдо', priceByn: 12.5, categoryId: 'category-rk-cat-1', isActive: true,
    });
    expect([...items.values()]).toHaveLength(2);
    expect(items.get('rk-2')).toMatchObject({ posItemId: 'rk-2', categoryId: 'category-rk-cat-1' });
    const lastTenantUpdate: unknown = tenantUpdate.mock.calls.at(-1)?.[0];
    expect(lastTenantUpdate).toMatchObject({ data: { posImportState: { status: 'completed', imported: 2 } } });
  });
});
