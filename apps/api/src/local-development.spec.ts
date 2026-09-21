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

  it('stops the API development process safely on POSIX and Windows', () => {
    const startupCheck = readFileSync(
      resolve(repositoryRoot, 'apps/api/test/BNP-325.e2e-spec.ts'),
      'utf8',
    );

    expect(startupCheck).toContain("detached: process.platform !== 'win32'");
    expect(startupCheck).toContain("if (process.platform !== 'win32')");
    expect(startupCheck).toContain('process.kill(-pid, signal);');
    expect(startupCheck).toContain('apiProcess.kill(signal);');
    expect(startupCheck).toContain("apiProcess.once('close', () =>");
    expect(startupCheck).toContain("fetch('http://127.0.0.1:3000/api/v1')");
  });

  it('does not modify a developer .env while preparing isolated connections', () => {
    const startupCheck = readFileSync(
      resolve(repositoryRoot, 'apps/api/test/BNP-325.e2e-spec.ts'),
      'utf8',
    );

    expect(startupCheck).toContain("readFileSync(envExamplePath, 'utf8')");
    expect(startupCheck).toContain('runtimeEnvironment = {');
    expect(startupCheck).toContain('env: runtimeEnvironment');
    expect(startupCheck).not.toContain('writeFileSync(envPath');
    expect(startupCheck).not.toContain('unlinkSync(envPath');
  });
});
