import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { REDIS_CLIENT } from '../src/cache/cache.constants';

const repositoryRoot = resolve(__dirname, '../../..');

export class MenuCacheTestFixture {
  readonly tenantId = `menu-cache-${randomUUID()}`;
  readonly categoryId = `category-${randomUUID()}`;
  readonly itemId = `item-${randomUUID()}`;
  readonly cacheKey = `menu:tenant:${this.tenantId}`;

  app!: INestApplication<App>;
  prisma!: PrismaClient;
  redis!: Redis;
  private postgresContainer = '';
  private redisContainer = '';
  private databaseUrl = '';
  private previousEnvironment: Record<string, string | undefined> = {};

  async start(): Promise<void> {
    this.postgresContainer = this.docker(
      'run',
      '--detach',
      '--rm',
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_PASSWORD=postgres',
      'postgres:15',
    ).trim();
    this.redisContainer = this.docker(
      'run',
      '--detach',
      '--rm',
      '--publish',
      '127.0.0.1::6379',
      'redis:7',
    ).trim();
    const postgresPort = this.port(this.postgresContainer, '5432/tcp');
    const redisPort = this.port(this.redisContainer, '6379/tcp');
    const databaseName = `menu_cache_${randomUUID().replaceAll('-', '')}`;
    this.databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${postgresPort}/${databaseName}`;

    this.waitFor(() =>
      this.docker(
        'exec',
        this.postgresContainer,
        'pg_isready',
        '-U',
        'postgres',
      ),
    );
    this.waitFor(() =>
      this.docker('exec', this.redisContainer, 'redis-cli', 'ping'),
    );
    this.docker(
      'exec',
      this.postgresContainer,
      'psql',
      '-U',
      'postgres',
      '-c',
      `CREATE DATABASE ${databaseName}`,
    );
    this.migrate();
    this.setEnvironment({
      DATABASE_URL: this.databaseUrl,
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: redisPort,
      JWT_SECRET: 'menu-cache-e2e-secret',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_BUCKET: 'bonapp',
      S3_ACCESS_KEY: 'test-key',
      S3_SECRET_KEY: 'test-secret',
    });

    this.prisma = new PrismaClient({
      datasources: { db: { url: this.databaseUrl } },
    });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    this.app = module.createNestApplication();
    await this.app.init();
    this.redis = this.app.get<Redis>(REDIS_CLIENT);
    await this.prisma.tenant.create({
      data: { id: this.tenantId, slug: this.tenantId, name: 'Menu cache E2E' },
    });
    await this.prisma.menuCategory.create({
      data: { id: this.categoryId, tenantId: this.tenantId, name: 'Coffee' },
    });
    await this.prisma.menuItem.create({
      data: {
        id: this.itemId,
        tenantId: this.tenantId,
        categoryId: this.categoryId,
        name: 'Espresso',
        price: '3.50',
      },
    });
  }

  async stop(): Promise<void> {
    await this.app?.close();
    await this.prisma?.$disconnect();
    this.restoreEnvironment();
    this.stopContainer(this.redisContainer);
    this.stopContainer(this.postgresContainer);
  }

  token(): string {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        tenantId: this.tenantId,
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
    ).toString('base64url');
    const signature = createHmac('sha256', 'menu-cache-e2e-secret')
      .update(`${header}.${payload}`)
      .digest('base64url');
    return `${header}.${payload}.${signature}`;
  }

  private docker(...args: string[]): string {
    return execFileSync('docker', args, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 120_000,
    });
  }

  private port(container: string, containerPort: string): string {
    return this.docker('port', container, containerPort)
      .trim()
      .split(':')
      .at(-1)!;
  }

  private waitFor(action: () => string): void {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        action();
        return;
      } catch {
        if (attempt === 29)
          throw new Error('Test container did not become ready');
        execFileSync('sleep', ['1']);
      }
    }
  }

  private migrate(): void {
    execFileSync(
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
        env: { ...process.env, DATABASE_URL: this.databaseUrl },
      },
    );
  }

  private setEnvironment(values: Record<string, string>): void {
    for (const [key, value] of Object.entries(values)) {
      this.previousEnvironment[key] = process.env[key];
      process.env[key] = value;
    }
  }

  private restoreEnvironment(): void {
    for (const [key, value] of Object.entries(this.previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  private stopContainer(container: string): void {
    if (!container) return;
    try {
      this.docker('stop', container);
    } catch {
      /* Cleanup must not hide an assertion failure. */
    }
  }
}
