import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenant/tenant-context.service';

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

  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    tenantContext =
      moduleFixture.get<TenantContextService>(TenantContextService);

    tenantAId = '10000000-0000-4000-a000-000000000001';
    tenantBId = '20000000-0000-4000-a000-000000000002';

    await prisma.adminDb.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT set_config('app.current_tenant_id', $1, true)",
        tenantAId,
      );
      await tx.tenant.create({
        data: { id: tenantAId, name: '__test_tenant_A__' },
      });
      await tx.user.create({
        data: {
          tenantId: tenantAId,
          email: '__user@tenant-a.test__',
          role: 'STAFF',
        },
      });
    });

    await prisma.adminDb.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT set_config('app.current_tenant_id', $1, true)",
        tenantBId,
      );
      await tx.tenant.create({
        data: { id: tenantBId, name: '__test_tenant_B__' },
      });
      await tx.user.create({
        data: {
          tenantId: tenantBId,
          email: '__user@tenant-b.test__',
          role: 'STAFF',
        },
      });
    });
  });

  afterAll(async () => {
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
});
