import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const migrationSchema = 'apps/api/prisma/schema.prisma';
const migrationName = '20260916000000_init';
const legacyMigrationName = '20260917000000_add_tenant_logo_url';
const databaseName = `bnp333_${process.pid}`;
let databaseUrl: string;
let postgresContainer: string;

function docker(...args: string[]) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120_000,
  });
}

function psql(database: string, sql: string) {
  return execFileSync(
    'docker',
    [
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
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 60_000,
    },
  );
}

function prisma(...args: string[]) {
  return execFileSync('npx', ['prisma', ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 60_000,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

describe('BNP-333: migration rebaselining documentation', () => {
  it('documents the safe rebaselining procedure for an existing database', () => {
    const readme = readFileSync(resolve(repositoryRoot, 'README.md'), 'utf8');

    expect(readme).toContain('20260916000000_init');
    expect(readme).toContain('prisma migrate resolve --applied 20260916000000_init');
    expect(readme).toMatch(/Tenant[\s\S]*User[\s\S]*20260917000000_add_tenant_logo_url/);
  });
});

describe('BNP-333: Prisma migration history rebaselining', () => {
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
    const port = docker('port', postgresContainer, '5432/tcp').trim().split(':').at(-1);
    databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/${databaseName}`;
    for (let attempts = 0; attempts < 30; attempts += 1) {
      try {
        psql('postgres', 'SELECT 1');
        break;
      } catch {
        if (attempts === 29) throw new Error('PostgreSQL did not become ready');
        execFileSync('sleep', ['1']);
      }
    }
    psql('postgres', `DROP DATABASE IF EXISTS ${databaseName}`);
    psql('postgres', `CREATE DATABASE ${databaseName}`);
  });

  afterAll(() => {
    try {
      psql('postgres', `DROP DATABASE IF EXISTS ${databaseName}`);
      docker('stop', postgresContainer);
    } catch {
      // Cleanup must not hide the assertion result.
    }
  });

  it('requires resolving the retroactive migration before deploying to a legacy database', () => {
    psql(
      databaseName,
      'CREATE TABLE "Tenant" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "logoUrl" TEXT); CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"), "email" TEXT NOT NULL UNIQUE, "role" TEXT NOT NULL); CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");',
    );
    prisma('migrate', 'resolve', '--applied', legacyMigrationName, '--schema', migrationSchema);

    expect(() => prisma('migrate', 'deploy', '--schema', migrationSchema)).toThrow(
      /already exists/i,
    );

    prisma('migrate', 'resolve', '--applied', migrationName, '--schema', migrationSchema);
    expect(prisma('migrate', 'deploy', '--schema', migrationSchema)).not.toMatch(/error/i);

    const appliedMigrations = psql(
      databaseName,
      'SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name;',
    );
    expect(appliedMigrations).toContain(migrationName);
    expect(appliedMigrations).toContain(legacyMigrationName);
  });
});
