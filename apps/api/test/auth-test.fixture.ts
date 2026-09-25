import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { REDIS_CLIENT } from '../src/cache/cache.constants';

const repositoryRoot = resolve(__dirname, '../../..');
let loginIpSequence = 0;

export function loginRequest(server: App, ip = `198.51.100.${++loginIpSequence}`) {
  return request(server)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', ip);
}

export class AuthTestFixture {
  readonly tenantId = `auth-e2e-${randomUUID()}`;
  readonly userEmail = `staff-${randomUUID()}@auth-test.local`;
  readonly userPassword = 'SecurePass123';
  userId = '';

  app!: INestApplication<App>;
  prisma!: PrismaClient;
  redis!: Redis;

  private postgresContainer = '';
  private redisContainer = '';
  private databaseUrl = '';
  private previousEnvironment: Record<string, string | undefined> = {};

  async start(): Promise<void> {
    this.postgresContainer = this.docker(
      'run', '--detach', '--rm',
      '--publish', '127.0.0.1::5432',
      '--env', 'POSTGRES_PASSWORD=postgres',
      'postgres:15',
    ).trim();
    this.redisContainer = this.docker(
      'run', '--detach', '--rm',
      '--publish', '127.0.0.1::6379',
      'redis:7',
    ).trim();

    const postgresPort = this.port(this.postgresContainer, '5432/tcp');
    const redisPort = this.port(this.redisContainer, '6379/tcp');
    const dbName = `auth_e2e_${randomUUID().replaceAll('-', '')}`;
    this.databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${postgresPort}/${dbName}`;

    this.waitFor(() =>
      this.docker('exec', this.postgresContainer, 'pg_isready', '-U', 'postgres'),
    );
    this.waitFor(() =>
      this.docker('exec', this.redisContainer, 'redis-cli', 'ping'),
    );
    this.docker(
      'exec', this.postgresContainer,
      'psql', '-U', 'postgres', '-c', `CREATE DATABASE ${dbName}`,
    );
    this.migrate();

    this.setEnvironment({
      DATABASE_URL: this.databaseUrl,
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: redisPort,
      JWT_SECRET: 'auth-e2e-test-secret',
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
    const expressApp = this.app.getHttpAdapter().getInstance() as {
      set: (setting: string, value: number) => void;
    };
    expressApp.set('trust proxy', 1);
    this.app.setGlobalPrefix('api/v1');
    await this.app.init();

    this.redis = this.app.get<Redis>(REDIS_CLIENT);
    await this.redis.connect();

    await this.prisma.tenant.create({
      data: { id: this.tenantId, slug: this.tenantId, name: 'Auth E2E Tenant' },
    });
    const hash = await bcrypt.hash(this.userPassword, 4);
    const user = await this.prisma.user.create({
      data: {
        tenantId: this.tenantId,
        email: this.userEmail,
        passwordHash: hash,
        fullName: 'Auth E2E Staff',
        role: 'WAITER',
        mustChangePassword: false,
      },
    });
    this.userId = user.id;
  }

  async stop(): Promise<void> {
    await this.app?.close();
    await this.prisma?.$disconnect();
    this.restoreEnvironment();
    this.stopContainer(this.redisContainer);
    this.stopContainer(this.postgresContainer);
  }

  private docker(...args: string[]): string {
    return execFileSync('docker', args, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 120_000,
    });
  }

  private port(container: string, containerPort: string): string {
    return this.docker('port', container, containerPort).trim().split(':').at(-1)!;
  }

  private waitFor(action: () => string): void {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        action();
        return;
      } catch {
        if (attempt === 29) throw new Error('Container did not become ready');
        execFileSync('sleep', ['1']);
      }
    }
  }

  private migrate(): void {
    execFileSync(
      'npx',
      ['prisma', 'migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma'],
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
      /* cleanup must not hide an assertion failure */
    }
  }
}

