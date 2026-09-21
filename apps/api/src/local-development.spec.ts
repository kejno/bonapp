import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');

describe('local development infrastructure', () => {
  it('defines PostgreSQL 15 and Redis 7 with health checks and persistent volumes', () => {
    const compose = readFileSync(
      resolve(repositoryRoot, 'docker-compose.yml'),
      'utf8',
    );

    expect(compose).toMatch(/postgres:\s*\n\s*image: postgres:15/);
    expect(compose).toMatch(/redis:\s*\n\s*image: redis:7/);
    expect(compose).toMatch(/healthcheck:/);
    expect(compose).toContain('bonapp_pg_data');
    expect(compose).toContain('bonapp_redis_data');
  });

  it('provides API connection, JWT, and payment placeholders', () => {
    const environment = readFileSync(
      resolve(repositoryRoot, 'apps/api/.env.example'),
      'utf8',
    );

    expect(environment).toContain('DATABASE_URL=');
    expect(environment).toContain('REDIS_URL=');
    expect(environment).toContain('JWT_SECRET=');
    expect(environment).toContain('JWT_REFRESH_SECRET=');
    expect(environment).toContain('PAYMENT_PUBLIC_KEY=');
    expect(environment).toContain('PAYMENT_SECRET_KEY=');
  });

  it('keeps the initial migration safe when a legacy database already has its tables', () => {
    const migration = readFileSync(
      resolve(
        repositoryRoot,
        'apps/api/prisma/migrations/20260916000000_init/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "Tenant"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "User"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key"',
    );
    expect(migration).toContain(
      'CREATE INDEX IF NOT EXISTS "User_tenantId_idx"',
    );
  });

  it('stops the complete API development process group after the startup check', () => {
    const startupCheck = readFileSync(
      resolve(repositoryRoot, 'apps/api/test/BNP-325.e2e-spec.ts'),
      'utf8',
    );

    expect(startupCheck).toContain('detached: true');
    expect(startupCheck).toContain("process.kill(-pid, 'SIGTERM')");
    expect(startupCheck).toContain("apiProcess.once('close', () =>");
  });
});
