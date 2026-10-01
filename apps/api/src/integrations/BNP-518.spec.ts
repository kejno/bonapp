import { OnboardingService } from '../onboarding/onboarding.service';
import * as posNetwork from '../onboarding/pos-network';

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
    const tenantUpdate = jest.fn<void, [unknown]>();
    const prisma = {
      forTenant: () => ({
        tenant: { findUnique: jest.fn().mockResolvedValue({
          posType: 'r_keeper', posUrl: 'https://keeper.example', posApiKey: 'secret',
          posImportState: { imported: 0 },
        }), update: tenantUpdate },
        menuCategory,
        menuItem,
      }),
      transactionForTenant: (_tenantId: string, operation: (tx: unknown) => Promise<unknown>) => operation({ menuCategory, menuItem }),
    };
    const service = Object.create(OnboardingService.prototype) as OnboardingService;
    Object.defineProperties(service, {
      prisma: { value: prisma },
      allowedPosHosts: { value: 'keeper.example' },
    });
    (posNetwork.requestPosMenu as jest.Mock).mockResolvedValue([
      { id: 'rk-1', name: 'Обновлённое блюдо', price: 12.5, categoryId: 'rk-cat-1', categoryName: 'Супы' },
      { id: 'rk-2', name: 'Новое блюдо', price: 8, categoryId: 'rk-cat-1', categoryName: 'Супы' },
    ]);
    const job = { data: { tenantId: 'tenant-518' }, updateProgress: jest.fn() };

    await (service as unknown as {
      processImport: (job: { data: { tenantId: string }; updateProgress: jest.Mock }) => Promise<void>;
    }).processImport(job);

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
