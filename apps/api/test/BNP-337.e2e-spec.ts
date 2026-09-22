import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/storage/storage.service';

const databaseName = `bnp337_${process.pid}`;
const tenantA = 'bnp337-tenant-a';
const tenantB = 'bnp337-tenant-b';
const orderB = 'bnp337-order-b';
const jwtSecret = 'bnp337-test-secret';
let container: string;
let app: INestApplication;

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

function jwt(tenantId: string) {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ tenantId, exp: Math.floor(Date.now() / 1000) + 60 }),
  ).toString('base64url');
  const signature = createHmac('sha256', jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

describe('BNP-337: a JWT from tenant A cannot open a tenant B order', () => {
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
    const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/${databaseName}`;
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
    psql(
      databaseName,
      "INSERT INTO tenants (id, slug, name, updated_at) VALUES ('bnp337-tenant-a', 'bnp337-a', 'Tenant A', CURRENT_TIMESTAMP), ('bnp337-tenant-b', 'bnp337-b', 'Tenant B', CURRENT_TIMESTAMP); INSERT INTO dining_areas (id, tenant_id, name, updated_at) VALUES ('bnp337-area-b', 'bnp337-tenant-b', 'Area B', CURRENT_TIMESTAMP); INSERT INTO tables (id, tenant_id, area_id, table_number, qr_token) VALUES ('bnp337-table-b', 'bnp337-tenant-b', 'bnp337-area-b', 1, 'bnp337-qr-b'); INSERT INTO orders (id, tenant_id, table_id, daily_order_number, updated_at) VALUES ('bnp337-order-b', 'bnp337-tenant-b', 'bnp337-table-b', 1, CURRENT_TIMESTAMP);",
    );
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = jwtSecret;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    try {
      psql('postgres', `DROP DATABASE ${databaseName}`);
      docker('stop', container);
    } catch {
      // Cleanup must not hide assertion failures.
    }
  });

  it('returns 403 without disclosing the tenant B order', async () => {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/orders/${orderB}`)
      .set('Authorization', `Bearer ${jwt(tenantA)}`);

    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).not.toContain(orderB);
    expect(JSON.stringify(response.body)).not.toContain(tenantB);
  });
});
