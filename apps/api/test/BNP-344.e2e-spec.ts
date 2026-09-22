import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const databaseName = `bnp344_${randomUUID().replaceAll('-', '')}`;
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

describe('BNP-344: orders and payments migration', () => {
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
  });

  afterAll(() => {
    try {
      psql('postgres', `DROP DATABASE IF EXISTS ${databaseName}`);
      docker('stop', postgresContainer);
    } catch {
      // Cleanup must not hide an assertion failure.
    }
  });

  it('applies migrations and creates the required tables, enum types and indexes', () => {
    expect(migrate()).toContain(
      'All migrations have been successfully applied',
    );

    const relations = psql(
      databaseName,
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('orders', 'order_items', 'payments') ORDER BY tablename;",
    );
    expect(relations).toContain('order_items');
    expect(relations).toContain('orders');
    expect(relations).toContain('payments');

    const enums = psql(
      databaseName,
      "SELECT typname FROM pg_type WHERE typname IN ('OrderStatus', 'PaymentMethod') ORDER BY typname;",
    );
    expect(enums).toContain('OrderStatus');
    expect(enums).toContain('PaymentMethod');

    const indexes = psql(
      databaseName,
      "SELECT indexname FROM pg_indexes WHERE tablename = 'orders' AND indexname IN ('idx_orders_tenant_status', 'idx_orders_table_id') ORDER BY indexname;",
    );
    expect(indexes).toContain('idx_orders_tenant_status');
    expect(indexes).toContain('idx_orders_table_id');
  });
});
