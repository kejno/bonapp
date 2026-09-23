import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient, UserRole } from '@prisma/client';

const apiDirectory = resolve(__dirname, '..');

describe('BNP-348: сохранение базовых сущностей через Prisma', () => {
  let container: string;
  let prisma: PrismaClient;

  function docker(...args: string[]): string {
    return execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe' });
  }

  beforeAll(async () => {
    container = docker(
      'run',
      '--detach',
      '--rm',
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_PASSWORD=postgres',
      'postgres:15',
    ).trim();
    const port = docker('port', container, '5432/tcp')
      .trim()
      .split(':')
      .at(-1)!;
    const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        docker('exec', container, 'pg_isready', '-U', 'postgres');
        break;
      } catch {
        if (attempt === 29) throw new Error('PostgreSQL did not become ready');
        execFileSync('sleep', ['1']);
      }
    }

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: apiDirectory,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (container) docker('stop', container);
  });

  it('сохраняет Tenant, User, DiningArea и Table и применяет ключевые ограничения', async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: 'automation-tenant', name: 'Automation tenant' },
    });
    const area = await prisma.diningArea.create({
      data: { tenantId: tenant.id, name: 'Main hall' },
    });
    const table = await prisma.table.create({
      data: {
        tenantId: tenant.id,
        areaId: area.id,
        tableNumber: 1,
        seatsCount: 4,
        qrToken: 'automation-qr-token-1',
      },
    });
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'owner@automation.test',
        passwordHash: 'hash',
        fullName: 'Automation Owner',
        role: UserRole.OWNER,
      },
    });

    const persistedTenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenant.id },
      include: { users: true, diningAreas: { include: { tables: true } } },
    });

    expect(persistedTenant).toMatchObject({
      id: tenant.id,
      slug: 'automation-tenant',
      users: [
        { id: user.id, email: 'owner@automation.test', role: UserRole.OWNER },
      ],
      diningAreas: [
        {
          id: area.id,
          tables: [{ id: table.id, tableNumber: 1, seatsCount: 4 }],
        },
      ],
    });
    await expect(
      prisma.tenant.create({
        data: { slug: 'automation-tenant', name: 'Duplicate tenant' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: 'owner@automation.test',
          passwordHash: 'hash',
          fullName: 'Duplicate owner',
          role: UserRole.OWNER,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.user.create({
        data: {
          tenantId: 'missing-tenant',
          email: 'missing-tenant@automation.test',
          passwordHash: 'hash',
          fullName: 'Invalid tenant',
          role: UserRole.OWNER,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.table.create({
        data: {
          tenantId: tenant.id,
          areaId: area.id,
          tableNumber: 1,
          qrToken: 'automation-qr-token-2',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.table.create({
        data: {
          tenantId: tenant.id,
          areaId: area.id,
          tableNumber: 2,
          qrToken: 'automation-qr-token-1',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.diningArea.create({
        data: { tenantId: 'missing-tenant', name: 'Invalid area' },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.table.create({
        data: {
          tenantId: 'missing-tenant',
          areaId: area.id,
          tableNumber: 3,
          qrToken: 'missing-tenant-table',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.table.create({
        data: {
          tenantId: tenant.id,
          areaId: 'missing-area',
          tableNumber: 3,
          qrToken: 'missing-area-table',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: 'invalid-role@automation.test',
          passwordHash: 'hash',
          fullName: 'Invalid role',
          role: 'INVALID_ROLE' as UserRole,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } }),
    ).resolves.toMatchObject({
      slug: 'automation-tenant',
      name: 'Automation tenant',
    });
    await expect(
      prisma.user.count({ where: { tenantId: tenant.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.table.count({ where: { tenantId: tenant.id } }),
    ).resolves.toBe(1);
  }, 120_000);
});
