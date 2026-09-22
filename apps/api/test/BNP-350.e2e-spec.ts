import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const databaseName = `bnp350_${randomUUID().replaceAll('-', '')}`;
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

describe('BNP-350: menu_schema migration', () => {
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

  it('applies migrations and creates tables menu_categories, menu_items, modifier_groups, modifier_options', () => {
    expect(migrate()).toContain('All migrations have been successfully applied');

    const tables = psql(
      databaseName,
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('menu_categories','menu_items','modifier_groups','modifier_options') ORDER BY tablename;",
    );
    expect(tables).toContain('menu_categories');
    expect(tables).toContain('menu_items');
    expect(tables).toContain('modifier_groups');
    expect(tables).toContain('modifier_options');
  }, 120_000);
});
