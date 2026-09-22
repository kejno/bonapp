import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const databaseName = `bnp346_${randomUUID().replaceAll('-', '')}`;
let postgresContainer: string;
let databaseUrl: string;

function docker(...args: string[]) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120_000,
  });
}

function psql(database: string, sql: string) {
  return docker(
    'exec',
    postgresContainer,
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

function migrate() {
  return execFileSync(
    'npx',
    [
      'prisma',
      'migrate',
      'deploy',
      '--schema',
      'apps/api/prisma/schema.prisma',
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 120_000,
      env: { ...process.env, DATABASE_URL: databaseUrl },
    },
  );
}

describe('BNP-346: OrderStatus database enum', () => {
  beforeAll(() => {
    postgresContainer = docker(
      'run',
      '--detach',
      '--rm',
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_DB=postgres',
      '--env',
      'POSTGRES_USER=postgres',
      '--env',
      'POSTGRES_PASSWORD=postgres',
      'postgres:15',
    ).trim();
    const port = docker('port', postgresContainer, '5432/tcp')
      .trim()
      .split(':')
      .at(-1);
    databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/${databaseName}`;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        psql('postgres', 'SELECT 1');
        break;
      } catch {
        if (attempt === 29) throw new Error('PostgreSQL did not become ready');
        execFileSync('sleep', ['1']);
      }
    }
    psql('postgres', `CREATE DATABASE ${databaseName}`);
    migrate();
    psql(
      databaseName,
      "INSERT INTO tenants (id, slug, name, updated_at) VALUES ('bnp346-tenant', 'bnp346-tenant', 'BNP-346 tenant', CURRENT_TIMESTAMP); INSERT INTO dining_areas (id, tenant_id, name, updated_at) VALUES ('bnp346-area', 'bnp346-tenant', 'Main hall', CURRENT_TIMESTAMP); INSERT INTO tables (id, tenant_id, area_id, table_number, qr_token) VALUES ('bnp346-table', 'bnp346-tenant', 'bnp346-area', 1, 'bnp346-qr'); INSERT INTO orders (id, tenant_id, table_id, daily_order_number, status, updated_at) VALUES ('bnp346-existing-order', 'bnp346-tenant', 'bnp346-table', 1, 'NEW', CURRENT_TIMESTAMP);",
    );
  }, 120_000);

  afterAll(() => {
    try {
      psql('postgres', `DROP DATABASE IF EXISTS ${databaseName}`);
      docker('stop', postgresContainer);
    } catch {
      // Cleanup must not hide an assertion failure.
    }
  });

  it('rejects an invalid status without changing existing orders', () => {
    expect(() =>
      psql(
        databaseName,
        'INSERT INTO "orders" ("id", "tenant_id", "table_id", "daily_order_number", "status", "updated_at") VALUES (\'bnp346-invalid-order\', \'bnp346-tenant\', \'bnp346-table\', 2, \'INVALID_STATUS\', CURRENT_TIMESTAMP);',
      ),
    ).toThrow(/invalid input value for enum "OrderStatus"/i);

    const orders = psql(
      databaseName,
      "SELECT id || ':' || status FROM orders ORDER BY id;",
    );
    expect(orders).toContain('bnp346-existing-order:NEW');
    expect(orders).not.toContain('bnp346-invalid-order');
    expect(orders).not.toContain('INVALID_STATUS');
  }, 120_000);
});
