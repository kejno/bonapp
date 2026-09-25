import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/storage/storage.service';

const databaseName = `bnp131_${process.pid}`;
const tenantId = 'bnp131-tenant-a';
const areaId = 'bnp131-area-a';
const tableId = 'bnp131-table-a';
const validQrToken = 'bnp131-valid-qr-token';
const orderId = 'bnp131-order-a';
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

describe('BNP-131: Guest session resolves by QR token', () => {
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
      `INSERT INTO tenants (id, slug, name, logo_url, brand_color, currency, updated_at) VALUES ('${tenantId}', 'bnp131-slug', 'Test Restaurant', 'https://example.com/logo.png', '#e0533c', 'BYN', CURRENT_TIMESTAMP);` +
      ` INSERT INTO dining_areas (id, tenant_id, name, updated_at) VALUES ('${areaId}', '${tenantId}', 'Main Hall', CURRENT_TIMESTAMP);` +
      ` INSERT INTO tables (id, tenant_id, area_id, table_number, qr_token) VALUES ('${tableId}', '${tenantId}', '${areaId}', 5, '${validQrToken}');` +
      ` INSERT INTO orders (id, tenant_id, table_id, daily_order_number, status, updated_at) VALUES ('${orderId}', '${tenantId}', '${tableId}', 1, 'NEW', CURRENT_TIMESTAMP);`,
    );
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'bnp131-test-secret';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
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

  it('GET /api/v1/guest/session/:valid_token returns 200 with tenant, table, and activeOrder', async () => {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    ).get(`/api/v1/guest/session/${validQrToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      tenant: {
        id: tenantId,
        name: 'Test Restaurant',
        slug: 'bnp131-slug',
        logoUrl: 'https://example.com/logo.png',
        brandColor: '#e0533c',
        currency: 'BYN',
      },
      table: {
        id: tableId,
        tableNumber: 5,
        areaName: 'Main Hall',
      },
      activeOrder: {
        id: orderId,
        status: 'NEW',
      },
    });
    const body = response.body as { activeOrder: { createdAt: unknown } };
    expect(body.activeOrder.createdAt).toBeDefined();
  });

  it('GET /api/v1/guest/session/invalid returns 404 for non-existent QR token', async () => {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    ).get('/api/v1/guest/session/non-existent-token');

    expect(response.status).toBe(404);
  });

  it('GET /api/v1/guest/session/:valid_token returns null activeOrder when table has no active order', async () => {
    const noOrderTableId = 'bnp131-table-no-order';
    const noOrderQrToken = 'bnp131-qr-no-order';
    psql(
      databaseName,
      `INSERT INTO tables (id, tenant_id, area_id, table_number, qr_token) VALUES ('${noOrderTableId}', '${tenantId}', '${areaId}', 9, '${noOrderQrToken}');`,
    );

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    ).get(`/api/v1/guest/session/${noOrderQrToken}`);

    expect(response.status).toBe(200);
    const noOrderBody = response.body as { activeOrder: unknown };
    expect(noOrderBody.activeOrder).toBeNull();
  });
});
