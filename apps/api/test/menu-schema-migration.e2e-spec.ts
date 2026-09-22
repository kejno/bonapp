import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const migration = resolve(
  __dirname,
  '../prisma/migrations/20260921000000_add_menu_catalog/migration.sql',
);
const renameMigration = resolve(
  __dirname,
  '../prisma/migrations/20260921140000_rename_menu_tables_to_snake_case/migration.sql',
);
const renameColumnsMigration = resolve(
  __dirname,
  '../prisma/migrations/20260921150000_rename_menu_columns_to_snake_case/migration.sql',
);
const menuConstraintsMigration = resolve(
  __dirname,
  '../prisma/migrations/20260922040000_harden_menu_catalog_constraints/migration.sql',
);

const describeWithDocker = process.env.SKIP_DOCKER_TESTS
  ? describe.skip
  : describe;

describe('menu catalog migration', () => {
  it('creates every menu table and its tenant-scoped foreign keys', () => {
    expect(existsSync(migration)).toBe(true);

    const sql = readFileSync(migration, 'utf8');
    const renamedTablesSql = readFileSync(renameMigration, 'utf8');
    const renamedColumnsSql = readFileSync(renameColumnsMigration, 'utf8');
    for (const table of [
      'menu_categories',
      'menu_items',
      'modifier_groups',
      'modifiers',
      'menu_item_modifier_groups',
      'stop_list_items',
    ]) {
      expect(renamedTablesSql).toContain(`RENAME TO "${table}"`);
    }
    expect(sql).toContain('MenuItem_categoryId_tenantId_fkey');
    expect(sql).toContain('StopListItem_menuItemId_tenantId_fkey');
    expect(renamedColumnsSql).toContain(
      'RENAME COLUMN "tenantId" TO "tenant_id"',
    );
    expect(renamedColumnsSql).toContain(
      'RENAME COLUMN "sortOrder" TO "sort_order"',
    );
  });

  it('enforces non-negative prices and gives menu database objects snake_case names', () => {
    const sql = readFileSync(menuConstraintsMigration, 'utf8');

    expect(sql).toContain(
      'ADD CONSTRAINT "menu_items_price_check" CHECK ("price" >= 0)',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT "modifiers_price_check" CHECK ("price" >= 0)',
    );
    expect(sql).toContain(
      'RENAME CONSTRAINT "menu_categories_tenantId_fkey" TO "menu_categories_tenant_id_fkey"',
    );
    expect(sql).toContain(
      'RENAME TO "menu_items_tenant_id_category_id_sort_order_idx"',
    );
  });
});

describeWithDocker('menu catalog migration deployment', () => {
  let container: string;
  let port: string;

  function docker(...args: string[]): string {
    return execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe' });
  }

  function prisma(databaseUrl: string, ...args: string[]): string {
    return execFileSync('npx', ['prisma', ...args], {
      cwd: resolve(__dirname, '..'),
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
  }

  function sql(database: string, statement: string): string {
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
      statement,
    );
  }

  beforeAll(() => {
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
    port = docker('port', container, '5432/tcp').trim().split(':').at(-1)!;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        sql('postgres', 'SELECT 1');
        return;
      } catch {
        if (attempt === 29) throw new Error('PostgreSQL did not become ready');
        execFileSync('sleep', ['1']);
      }
    }
  }, 120_000);

  afterAll(() => {
    docker('stop', container);
  });

  it('deploys to both an empty and an existing baseline database', () => {
    const emptyUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
    expect(() => prisma(emptyUrl, 'migrate', 'deploy')).not.toThrow();
    expect(sql('postgres', 'SELECT 1 FROM "stop_list_items" LIMIT 1;')).toContain(
      '0 rows',
    );

    const legacyDb = `menu_legacy_${process.pid}`;
    sql('postgres', `CREATE DATABASE ${legacyDb}`);
    sql(
      legacyDb,
      'CREATE TABLE "Tenant" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "logoUrl" TEXT); CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"), "email" TEXT NOT NULL UNIQUE, "role" TEXT NOT NULL); CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");',
    );
    const legacyUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/${legacyDb}`;
    prisma(legacyUrl, 'migrate', 'resolve', '--applied', '20260916000000_init');
    prisma(
      legacyUrl,
      'migrate',
      'resolve',
      '--applied',
      '20260917000000_add_tenant_logo_url',
    );

    expect(() => prisma(legacyUrl, 'migrate', 'deploy')).not.toThrow();
    expect(sql(legacyDb, 'SELECT 1 FROM "menu_items" LIMIT 1;')).toContain('0 rows');
  }, 120_000);
});
