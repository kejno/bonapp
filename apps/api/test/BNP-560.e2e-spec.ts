import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const databaseName = `bnp560_${process.pid}`;
let container: string;
let databaseUrl: string;
let prisma: PrismaClient;

function docker(...args: string[]) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe' });
}

function psql(database: string, sql: string) {
  return docker('exec', container, 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-c', sql);
}

describe('BNP-560: seed is idempotent', () => {
  beforeAll(async () => {
    container = docker('run', '--detach', '--rm', '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_PASSWORD=postgres', 'postgres:15').trim();
    const port = docker('port', container, '5432/tcp').trim().split(':').at(-1);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        psql('postgres', 'SELECT 1');
        break;
      } catch {
        if (attempt === 29) throw new Error('PostgreSQL did not become ready');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    psql('postgres', `CREATE DATABASE ${databaseName}`);
    databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/${databaseName}`;
    execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma'], {
      cwd: `${__dirname}/../../..`, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    seed();
    seed();
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
  }, 120_000);

  function seed() {
    execFileSync('npx', ['prisma', 'db', 'seed', '--schema', 'prisma/schema.prisma'], {
      cwd: `${__dirname}/..`, encoding: 'utf8', stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: databaseUrl, SEED_OWNER_PASSWORD: 'test-password' },
    });
  }

  afterAll(async () => {
    await prisma?.$disconnect();
    try {
      psql('postgres', `DROP DATABASE ${databaseName}`);
      docker('stop', container);
    } catch {
      /* Cleanup must not hide assertion failures. */
    }
  });

  it('keeps exactly one seeded set of tenant, owner, tables, categories, items and modifiers', async () => {
    const [tenantCount, ownerCount, tableCount, categoryCount, itemCount, modifierGroupCount, modifierCount] = await Promise.all([
      prisma.tenant.count({ where: { slug: 'le-bistro-gourmand' } }),
      prisma.user.count({ where: { email: 'admin@lebistro.by', role: 'OWNER' } }),
      prisma.table.count({ where: { qrToken: { in: ['dev-table-1', 'dev-table-2', 'dev-table-3'] } } }),
      prisma.menuCategory.count({ where: { tenantId: 'e1a7f3b0-0001-4000-a000-000000000001' } }),
      prisma.menuItem.count({ where: { tenantId: 'e1a7f3b0-0001-4000-a000-000000000001' } }),
      prisma.modifierGroup.count({ where: { tenantId: 'e1a7f3b0-0001-4000-a000-000000000001' } }),
      prisma.modifier.count({ where: { tenantId: 'e1a7f3b0-0001-4000-a000-000000000001' } }),
    ]);

    expect({ tenantCount, ownerCount, tableCount, categoryCount, itemCount, modifierGroupCount, modifierCount }).toEqual({
      tenantCount: 1, ownerCount: 1, tableCount: 3, categoryCount: 3, itemCount: 4, modifierGroupCount: 1, modifierCount: 2,
    });
  });
});
