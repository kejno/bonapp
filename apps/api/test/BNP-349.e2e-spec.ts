import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenant/tenant-context.service';

const apiDirectory = resolve(__dirname, '..');

describe('BNP-349: Prisma Client и PrismaService', () => {
  let container: string;
  let service: PrismaService;
  let previousDatabaseUrl: string | undefined;

  function docker(...args: string[]): string {
    return execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe' });
  }

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
    const port = docker('port', container, '5432/tcp').trim().split(':').at(-1)!;
    const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        docker('exec', container, 'pg_isready', '-U', 'postgres');
        break;
      } catch {
        if (attempt === 29) throw new Error('PostgreSQL did not become ready');
        execFileSync('sleep', ['1']);
      }
    }

    execFileSync('npx', ['prisma', 'generate', '--schema', 'prisma/schema.prisma'], {
      cwd: apiDirectory,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: apiDirectory,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });

    previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = databaseUrl;
    service = new PrismaService(new TenantContextService());
    await service.onModuleInit();
  }, 120_000);

  afterAll(async () => {
    await service?.onModuleDestroy();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (container) docker('stop', container);
  });

  it('подключается к БД и предоставляет сгенерированные Prisma enum-типы', async () => {
    await expect(service.forTenant('automation-tenant').tenant.count()).resolves.toBe(0);
    expect(UserRole.SUPER_ADMIN).toBe('SUPER_ADMIN');
    expect(UserRole.CASHIER).toBe('CASHIER');
  });
});
