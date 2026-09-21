import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';
import { TenantContextService } from '../src/tenant/tenant-context.service';
import { PrismaClient } from '@prisma/client';

/**
 * Integration test: verifies that the Prisma tenant-scoped client (.db getter)
 * enforces data isolation — a query executed in tenant A's context never
 * returns rows that belong to tenant B, and vice-versa.
 *
 * Requires a running PostgreSQL instance (DATABASE_URL env var).
 */
describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  const unscopedClient = new PrismaClient();

  let tenantAId: string;
  let tenantBId: string;
  const orderAId = '10000000-0000-4000-a000-000000000011';
  const orderBId = '20000000-0000-4000-a000-000000000012';
  const orderItemAId = '10000000-0000-4000-a000-000000000021';
  const orderItemBId = '20000000-0000-4000-a000-000000000022';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    tenantContext =
      moduleFixture.get<TenantContextService>(TenantContextService);

    tenantAId = '10000000-0000-4000-a000-000000000001';
    tenantBId = '20000000-0000-4000-a000-000000000002';

    await tenantContext.run(tenantAId, async () => {
      await prisma.db.tenant.create({
        data: {
          id: tenantAId,
          slug: '__test-tenant-a__',
          name: '__test_tenant_A__',
        },
      });
      await prisma.db.user.create({
        data: {
          tenantId: tenantAId,
          email: '__user@tenant-a.test__',
          passwordHash: 'test-password-hash',
          fullName: 'Tenant A Test User',
          role: 'WAITER',
        },
      });
      await prisma.db.diningArea.create({
        data: {
          id: '10000000-0000-4000-a000-000000000031',
          tenantId: tenantAId,
          name: 'Area A',
        },
      });
      await prisma.db.table.create({
        data: {
          id: '10000000-0000-4000-a000-000000000041',
          tenantId: tenantAId,
          areaId: '10000000-0000-4000-a000-000000000031',
          tableNumber: 1,
          qrToken: '__tenant-a-table__',
        },
      });
      await prisma.db.order.create({
        data: {
          id: orderAId,
          tenantId: tenantAId,
          tableId: '10000000-0000-4000-a000-000000000041',
          dailyOrderNumber: 1,
        },
      });
      await prisma.db.orderItem.create({
        data: {
          id: orderItemAId,
          orderId: orderAId,
          itemId: 'item-a',
          quantity: 1,
          unitPriceByn: 1,
          selectedModifiers: [],
          status: 'NEW',
          kitchenDepartment: 'kitchen',
        },
      });
    });

    await tenantContext.run(tenantBId, async () => {
      await prisma.db.tenant.create({
        data: {
          id: tenantBId,
          slug: '__test-tenant-b__',
          name: '__test_tenant_B__',
        },
      });
      await prisma.db.user.create({
        data: {
          tenantId: tenantBId,
          email: '__user@tenant-b.test__',
          passwordHash: 'test-password-hash',
          fullName: 'Tenant B Test User',
          role: 'WAITER',
        },
      });
      await prisma.db.diningArea.create({
        data: {
          id: '20000000-0000-4000-a000-000000000032',
          tenantId: tenantBId,
          name: 'Area B',
        },
      });
      await prisma.db.table.create({
        data: {
          id: '20000000-0000-4000-a000-000000000042',
          tenantId: tenantBId,
          areaId: '20000000-0000-4000-a000-000000000032',
          tableNumber: 1,
          qrToken: '__tenant-b-table__',
        },
      });
      await prisma.db.order.create({
        data: {
          id: orderBId,
          tenantId: tenantBId,
          tableId: '20000000-0000-4000-a000-000000000042',
          dailyOrderNumber: 1,
        },
      });
      await prisma.db.orderItem.create({
        data: {
          id: orderItemBId,
          orderId: orderBId,
          itemId: 'item-b',
          quantity: 1,
          unitPriceByn: 1,
          selectedModifiers: [],
          status: 'NEW',
          kitchenDepartment: 'kitchen',
        },
      });
    });
  });

  afterAll(async () => {
    if (!app || !prisma || !tenantContext) return;

    await tenantContext.run(tenantAId, () =>
      prisma.db.order.deleteMany({ where: { id: orderAId } }),
    );
    await tenantContext.run(tenantBId, () =>
      prisma.db.order.deleteMany({ where: { id: orderBId } }),
    );
    await tenantContext.run(tenantAId, () =>
      prisma.db.table.deleteMany({ where: { id: '10000000-0000-4000-a000-000000000041' } }),
    );
    await tenantContext.run(tenantBId, () =>
      prisma.db.table.deleteMany({ where: { id: '20000000-0000-4000-a000-000000000042' } }),
    );
    await tenantContext.run(tenantAId, () =>
      prisma.db.diningArea.deleteMany({ where: { id: '10000000-0000-4000-a000-000000000031' } }),
    );
    await tenantContext.run(tenantBId, () =>
      prisma.db.diningArea.deleteMany({ where: { id: '20000000-0000-4000-a000-000000000032' } }),
    );
    await tenantContext.run(tenantAId, () =>
      prisma.db.user.deleteMany({ where: { email: '__user@tenant-a.test__' } }),
    );
    await tenantContext.run(tenantBId, () =>
      prisma.db.user.deleteMany({ where: { email: '__user@tenant-b.test__' } }),
    );
    await tenantContext.run(tenantAId, () =>
      prisma.db.tenant.delete({ where: { id: tenantAId } }),
    );
    await tenantContext.run(tenantBId, () =>
      prisma.db.tenant.delete({ where: { id: tenantBId } }),
    );
    await unscopedClient.$disconnect();
    await app.close();
  });

  it('tenant A context returns only tenant A users', async () => {
    const users = await tenantContext.run(tenantAId, () =>
      prisma.db.user.findMany(),
    );
    expect(users.every((u) => u.tenantId === tenantAId)).toBe(true);
    expect(users.some((u) => u.email === '__user@tenant-a.test__')).toBe(true);
    expect(users.some((u) => u.email === '__user@tenant-b.test__')).toBe(false);
  });

  it('does not return tenant rows through an application connection without a GUC', async () => {
    const users = await unscopedClient.user.findMany({
      where: {
        email: { in: ['__user@tenant-a.test__', '__user@tenant-b.test__'] },
      },
    });

    expect(users).toEqual([]);
  });

  it('tenant B context returns only tenant B users', async () => {
    const users = await tenantContext.run(tenantBId, () =>
      prisma.db.user.findMany(),
    );
    expect(users.every((u) => u.tenantId === tenantBId)).toBe(true);
    expect(users.some((u) => u.email === '__user@tenant-b.test__')).toBe(true);
    expect(users.some((u) => u.email === '__user@tenant-a.test__')).toBe(false);
  });

  it('switching context between calls returns data for the respective tenant', async () => {
    const usersA = await tenantContext.run(tenantAId, () =>
      prisma.db.user.findMany({ select: { email: true } }),
    );
    const usersB = await tenantContext.run(tenantBId, () =>
      prisma.db.user.findMany({ select: { email: true } }),
    );

    const emailsA = usersA.map((u) => u.email);
    const emailsB = usersB.map((u) => u.email);

    expect(emailsA).not.toEqual(expect.arrayContaining(emailsB));
    expect(emailsB).not.toEqual(expect.arrayContaining(emailsA));
  });

  it('tenant A context returns only tenant A record from Tenant table', async () => {
    const tenants = await tenantContext.run(tenantAId, () =>
      prisma.db.tenant.findMany(),
    );
    expect(tenants.every((t) => t.id === tenantAId)).toBe(true);
    expect(tenants.some((t) => t.id === tenantBId)).toBe(false);
  });

  it('does not expose or modify tenant B order items from tenant A or without a GUC', async () => {
    const unscopedItems = await unscopedClient.orderItem.findMany({
      where: { id: { in: [orderItemAId, orderItemBId] } },
    });
    expect(unscopedItems).toEqual([]);

    const tenantAItems = await tenantContext.run(tenantAId, () =>
      prisma.db.orderItem.findMany(),
    );
    expect(tenantAItems.map((item) => item.id)).toContain(orderItemAId);
    expect(tenantAItems.map((item) => item.id)).not.toContain(orderItemBId);

    const updated = await tenantContext.run(tenantAId, () =>
      prisma.db.orderItem.updateMany({
        where: { id: orderItemBId },
        data: { status: 'CANCELLED' },
      }),
    );
    expect(updated.count).toBe(0);

    const tenantBItem = await tenantContext.run(tenantBId, () =>
      prisma.db.orderItem.findUnique({ where: { id: orderItemBId } }),
    );
    expect(tenantBItem?.status).toBe('NEW');
  });
});
