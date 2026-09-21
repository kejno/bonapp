import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('order tenant integrity (e2e)', () => {
  beforeAll(async () => {
    await prisma.$executeRaw`DELETE FROM "payments" WHERE "id" LIKE 'tenant-integrity-%'`;
    await prisma.$executeRaw`DELETE FROM "orders" WHERE "id" LIKE 'tenant-integrity-%'`;
    await prisma.$executeRaw`DELETE FROM "tables" WHERE "id" LIKE 'tenant-integrity-%'`;
    await prisma.$executeRaw`DELETE FROM "dining_areas" WHERE "id" LIKE 'tenant-integrity-%'`;
    await prisma.$executeRaw`DELETE FROM "users" WHERE "id" LIKE 'tenant-integrity-%'`;
    await prisma.$executeRaw`DELETE FROM "tenants" WHERE "id" LIKE 'tenant-integrity-%'`;

    await prisma.$executeRaw`INSERT INTO "tenants" ("id", "slug", "name", "updated_at") VALUES ('tenant-integrity-a', 'tenant-integrity-a', 'Tenant A', CURRENT_TIMESTAMP), ('tenant-integrity-b', 'tenant-integrity-b', 'Tenant B', CURRENT_TIMESTAMP)`;
    await prisma.$executeRaw`INSERT INTO "dining_areas" ("id", "tenant_id", "name", "updated_at") VALUES ('tenant-integrity-area-a', 'tenant-integrity-a', 'Area A', CURRENT_TIMESTAMP), ('tenant-integrity-area-b', 'tenant-integrity-b', 'Area B', CURRENT_TIMESTAMP)`;
    await prisma.$executeRaw`INSERT INTO "tables" ("id", "tenant_id", "area_id", "table_number", "qr_token") VALUES ('tenant-integrity-table-a', 'tenant-integrity-a', 'tenant-integrity-area-a', 1, 'tenant-integrity-qr-a'), ('tenant-integrity-table-b', 'tenant-integrity-b', 'tenant-integrity-area-b', 1, 'tenant-integrity-qr-b')`;
    await prisma.$executeRaw`INSERT INTO "users" ("id", "tenant_id", "email", "password_hash", "full_name", "role") VALUES ('tenant-integrity-waiter-a', 'tenant-integrity-a', 'tenant-integrity-a@example.test', 'hash', 'Waiter A', 'WAITER'), ('tenant-integrity-waiter-b', 'tenant-integrity-b', 'tenant-integrity-b@example.test', 'hash', 'Waiter B', 'WAITER')`;
    await prisma.$executeRaw`INSERT INTO "orders" ("id", "tenant_id", "table_id", "daily_order_number", "updated_at") VALUES ('tenant-integrity-order-a', 'tenant-integrity-a', 'tenant-integrity-table-a', 1, CURRENT_TIMESTAMP), ('tenant-integrity-order-b', 'tenant-integrity-b', 'tenant-integrity-table-b', 1, CURRENT_TIMESTAMP)`;
  });

  it('rejects payments and waiter assignments from another tenant', async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO "payments" ("id", "tenant_id", "order_id", "amount_byn", "provider") VALUES ('tenant-integrity-payment-cross', 'tenant-integrity-a', 'tenant-integrity-order-b', 1, 'test')`,
    ).rejects.toThrow();

    await expect(
      prisma.$executeRaw`INSERT INTO "orders" ("id", "tenant_id", "table_id", "daily_order_number", "assigned_waiter_id", "updated_at") VALUES ('tenant-integrity-order-cross-waiter', 'tenant-integrity-a', 'tenant-integrity-table-a', 2, 'tenant-integrity-waiter-b', CURRENT_TIMESTAMP)`,
    ).rejects.toThrow();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
