import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const apiDirectory = resolve(__dirname, '..');
let container: string;
let prisma: PrismaClient;

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe' });
}

describe('BNP-351: создание MenuItem через Prisma Client', () => {
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

  it('сохраняет поля price_byn (Decimal) и allergens (TEXT[]) корректно', async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: 'bnp351-tenant', name: 'BNP-351 Tenant' },
    });
    const category = await prisma.menuCategory.create({
      data: { tenantId: tenant.id, name: 'Hot dishes', sortOrder: 1 },
    });
    const item = await prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: category.id,
        name: 'Beef steak',
        priceByn: '9.99',
        allergens: ['gluten', 'dairy'],
      },
    });

    const persisted = await prisma.menuItem.findUniqueOrThrow({
      where: { id: item.id },
    });

    expect(persisted.priceByn.toString()).toBe('9.99');
    expect(persisted.allergens).toEqual(['gluten', 'dairy']);
    expect(persisted.tenantId).toBe(tenant.id);
    expect(persisted.categoryId).toBe(category.id);
    expect(persisted.isActive).toBe(true);
    expect(persisted.isInStopList).toBe(false);
  }, 120_000);
});
