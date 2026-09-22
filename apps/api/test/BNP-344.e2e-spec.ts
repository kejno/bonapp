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
  }, 120_000);

  afterAll(() => {
    try {
      psql('postgres', `DROP DATABASE IF EXISTS ${databaseName}`);
      docker('stop', postgresContainer);
    } catch {
      // Cleanup must not hide an assertion failure.
    }
  });

  it('applies migrations and creates the required tables, enum values, columns and indexes', () => {
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

    const orderStatuses = psql(
      databaseName,
      "SELECT array_agg(enumlabel ORDER BY enumsortorder)::text FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid WHERE typname = 'OrderStatus';",
    );
    expect(orderStatuses).toContain('{NEW,COOKING,READY,SERVED,PAID,CANCELLED}');

    const paymentMethods = psql(
      databaseName,
      "SELECT array_agg(enumlabel ORDER BY enumsortorder)::text FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid WHERE typname = 'PaymentMethod';",
    );
    expect(paymentMethods).toContain(
      '{OPLATI_QR,ERIP_EPOS,BANK_CARD,CASH_TO_WAITER}',
    );

    const expectedColumns: Record<string, string> = {
      orders:
        '{id,tenant_id,table_id,daily_order_number,status,guest_session_id,assigned_waiter_id,total_amount_byn,tips_amount_byn,payment_method,is_paid,paid_at,pos_order_id,comment,created_at,updated_at}',
      order_items:
        '{id,order_id,item_id,quantity,unit_price_byn,selected_modifiers,item_comment,status,kitchen_department}',
      payments:
        '{id,tenant_id,order_id,amount_byn,tips_amount_byn,provider,provider_transaction_id,erip_order_number,status,fiscal_receipt_number,payload,created_at}',
    };
    for (const [tableName, expectedColumnsList] of Object.entries(
      expectedColumns,
    )) {
      const columns = psql(
        databaseName,
        `SELECT array_agg(column_name ORDER BY ordinal_position)::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName}';`,
      );
      expect(columns).toContain(expectedColumnsList);
    }

    const jsonColumns = psql(
      databaseName,
      "SELECT table_name || '.' || column_name || ':' || udt_name FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'order_items' AND column_name = 'selected_modifiers') OR (table_name = 'payments' AND column_name = 'payload')) ORDER BY table_name, column_name;",
    );
    expect(jsonColumns).toContain('order_items.selected_modifiers:jsonb');
    expect(jsonColumns).toContain('payments.payload:jsonb');

    const indexes = psql(
      databaseName,
      "SELECT indexname FROM pg_indexes WHERE tablename = 'orders' AND indexname IN ('idx_orders_tenant_status', 'idx_orders_table_id') ORDER BY indexname;",
    );
    expect(indexes).toContain('idx_orders_tenant_status');
    expect(indexes).toContain('idx_orders_table_id');
  }, 120_000);
});
