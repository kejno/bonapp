import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const databaseName = `bnp339_${process.pid}`;
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

describe('BNP-339: seed creates Le Bistro Gourmand and its owner', () => {
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
    databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/${databaseName}`;
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
        env: { ...process.env, DATABASE_URL: databaseUrl },
      },
    );
    execFileSync(
      'npx',
      ['prisma', 'db', 'seed', '--schema', 'prisma/schema.prisma'],
      {
        cwd: `${__dirname}/..`,
        encoding: 'utf8',
        stdio: 'pipe',
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          SEED_OWNER_PASSWORD: 'test-password',
        },
      },
    );
    psql(
      databaseName,
      "CREATE ROLE seed_reader LOGIN PASSWORD 'seed-reader-password' BYPASSRLS; GRANT USAGE ON SCHEMA public TO seed_reader; GRANT SELECT ON tenants, users TO seed_reader;",
    );
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl.replace(
            'postgres:postgres',
            'seed_reader:seed-reader-password',
          ),
        },
      },
    });
    await prisma.$connect();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    try {
      psql('postgres', `DROP DATABASE ${databaseName}`);
      docker('stop', container);
    } catch {
      /* Cleanup must not hide assertion failures. */
    }
  });

  it('creates the required tenant and OWNER account', async () => {
    const tenant = await prisma.tenant.findFirst({
      where: { name: 'Le Bistro Gourmand' },
      select: { id: true, name: true, slug: true },
    });
    const user = tenant
      ? await prisma.user.findFirst({
          where: { tenantId: tenant.id, email: 'admin@lebistro.by' },
          select: {
            email: true,
            role: true,
            passwordHash: true,
            tenantId: true,
          },
        })
      : null;

    expect(tenant).toMatchObject({
      name: 'Le Bistro Gourmand',
      slug: 'le-bistro-gourmand',
    });
    expect(user).toMatchObject({
      email: 'admin@lebistro.by',
      role: 'OWNER',
      tenantId: tenant?.id,
    });
    expect(user?.passwordHash).not.toBe('test-password');
  });
});
