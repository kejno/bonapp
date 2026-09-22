import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const apiDirectory = resolve(__dirname, '..');

describe('BNP-349: Prisma Client и PrismaService', () => {
  let container: string;
  let app: INestApplication;
  let service: PrismaService;
  let previousDatabaseUrl: string | undefined;
  let appClosed = false;

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
    const port = docker('port', container, '5432/tcp')
      .trim()
      .split(':')
      .at(-1)!;
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

    execFileSync(
      'npx',
      ['prisma', 'generate', '--schema', 'prisma/schema.prisma'],
      {
        cwd: apiDirectory,
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: databaseUrl },
      },
    );
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: apiDirectory,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });

    previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = databaseUrl;

    process.env.S3_ENDPOINT ??= 'http://localhost:9000';
    process.env.S3_BUCKET ??= 'bonapp';
    process.env.S3_ACCESS_KEY ??= 'test-key';
    process.env.S3_SECRET_KEY ??= 'test-secret';
    process.env.JWT_SECRET ??= 'test-jwt-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    service = app.get(PrismaService);
  }, 120_000);

  afterAll(async () => {
    if (!appClosed) await app?.close();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (container) docker('stop', container);
  });

  it('запускает Nest-приложение с PrismaService, подключается к БД и штатно останавливается', async () => {
    const client = service.forTenant('automation-tenant');

    await expect(client.tenant.count()).resolves.toBe(0);
    await expect(client.user.count()).resolves.toBe(0);
    await expect(client.diningArea.count()).resolves.toBe(0);
    await expect(client.table.count()).resolves.toBe(0);
    expect(Object.values(UserRole)).toEqual([
      'SUPER_ADMIN',
      'OWNER',
      'MANAGER',
      'WAITER',
      'CHEF',
      'CASHIER',
    ]);

    await expect(app.close()).resolves.toBeUndefined();
    appClosed = true;
  });
});
