import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const databaseName = `bnp338_${process.pid}`;
let container: string;
let databaseUrl: string;
let prisma: PrismaClient;

function docker(...args: string[]) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe' });
}

function psql(database: string, sql: string) {
  return docker(
    'exec',
    container,
    'psql',
    '-U',
    'postgres',
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  );
}

describe('BNP-338: PostgreSQL RLS hides another tenant rows', () => {
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
    const superuserUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/${databaseName}`;
    execFileSync(
      'npx',
      [
        'prisma',
        'migrate',
        'deploy',
        '--schema',
        'apps/api/prisma/schema.prisma',
      ],
      {
        cwd: `${__dirname}/../../..`,
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: superuserUrl },
      },
    );
    psql(
      databaseName,
      "CREATE ROLE app_user LOGIN PASSWORD 'app-password'; GRANT USAGE ON SCHEMA public TO app_user; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;",
    );
    psql(
      databaseName,
      "INSERT INTO tenants (id, slug, name, updated_at) VALUES ('bnp338-tenant-a', 'bnp338-a', 'Tenant A', CURRENT_TIMESTAMP), ('bnp338-tenant-b', 'bnp338-b', 'Tenant B', CURRENT_TIMESTAMP);",
    );
    databaseUrl = `postgresql://app_user:app-password@127.0.0.1:${port}/${databaseName}`;
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    try {
      psql('postgres', `DROP DATABASE ${databaseName}`);
      docker('stop', container);
    } catch {
      // Cleanup must not hide assertion failures.
    }
  });

  it('returns only rows owned by tenant A when its context is set', async () => {
    const tenantIds = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT set_config('app.current_tenant_id', 'bnp338-tenant-a', true)",
      );
      return tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT id FROM tenants ORDER BY id',
      );
    });
    const withoutContext = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id FROM tenants ORDER BY id',
    );

    expect(tenantIds).toEqual([{ id: 'bnp338-tenant-a' }]);
    expect(withoutContext).toEqual([]);
  });
});
