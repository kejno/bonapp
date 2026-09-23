import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const databaseName = `bnp353_${randomUUID().replaceAll('-', '')}`;
let postgresContainer: string;
let databaseUrl: string;

function docker(...args: string[]) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120_000,
  });
}

function psql(database: string, statement: string) {
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
    statement,
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

describe('BNP-353: частичный индекс idx_menu_items_tenant_cat', () => {
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
      // cleanup must not hide test failures
    }
  });

  it('индекс idx_menu_items_tenant_cat существует как частичный индекс WHERE is_active = true', () => {
    migrate();

    const indexRow = psql(
      databaseName,
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'menu_items' AND indexname = 'idx_menu_items_tenant_cat';",
    );
    expect(indexRow).toContain('WHERE (is_active = true)');
  }, 120_000);

  it('планировщик использует idx_menu_items_tenant_cat для запроса по tenant_id, category_id и is_active = TRUE', () => {
    const tenantId = randomUUID();
    const categoryId = randomUUID();
    const activeItemId = randomUUID();
    const inactiveItemId = randomUUID();

    psql(
      databaseName,
      `INSERT INTO tenants (id, slug, name, updated_at) VALUES ('${tenantId}', 'bnp353-tenant', 'BNP-353 Tenant', NOW())`,
    );
    psql(
      databaseName,
      `INSERT INTO menu_categories (id, tenant_id, name, sort_order, updated_at) VALUES ('${categoryId}', '${tenantId}', 'Test Category', 1, NOW())`,
    );
    psql(
      databaseName,
      `INSERT INTO menu_items (id, tenant_id, category_id, name, price_byn, is_active, updated_at) VALUES ('${activeItemId}', '${tenantId}', '${categoryId}', 'Active Item', 10.00, TRUE, NOW())`,
    );
    psql(
      databaseName,
      `INSERT INTO menu_items (id, tenant_id, category_id, name, price_byn, is_active, updated_at) VALUES ('${inactiveItemId}', '${tenantId}', '${categoryId}', 'Inactive Item', 10.00, FALSE, NOW())`,
    );

    const explainOutput = psql(
      databaseName,
      `SET enable_seqscan = off; EXPLAIN (FORMAT TEXT) SELECT id FROM menu_items WHERE tenant_id = '${tenantId}' AND category_id = '${categoryId}' AND is_active = TRUE`,
    );
    expect(explainOutput).toContain('Index Scan using idx_menu_items_tenant_cat');
  }, 120_000);
});
