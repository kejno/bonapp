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

class AuthTestFixture {
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

describe('BNP-130: JWT staff authentication', () => {
  const fixture = new AuthTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  describe('POST /api/v1/auth/login', () => {
    it('returns 200 with accessToken and refreshToken on valid credentials', async () => {
      const res = await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantId: fixture.tenantId,
          email: fixture.userEmail,
          password: fixture.userPassword,
        })
        .expect(200);

      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toBeTruthy();
      expect(typeof res.body.mustChangePassword).toBe('boolean');
    });

    it('returns 401 on wrong password', async () => {
      await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantId: fixture.tenantId,
          email: fixture.userEmail,
          password: 'wrong-password',
        })
        .expect(401);
    });

    it('returns 429 on the 6th failed attempt within a minute', async () => {
      // Clear any prior login_attempts counters so this test is isolated
      const keys = await fixture.redis.keys('login_attempts:*');
      if (keys.length > 0) await fixture.redis.del(...keys);

      const rateEmail = `rate-limit-${randomUUID()}@auth-test.local`;

      for (let i = 0; i < 5; i++) {
        await request(fixture.app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({
            tenantId: fixture.tenantId,
            email: rateEmail,
            password: 'wrong-password',
          })
          .expect(401);
      }

      await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantId: fixture.tenantId,
          email: rateEmail,
          password: 'any-password',
        })
        .expect(429);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('returns a new token pair when given a valid refresh token', async () => {
      const loginRes = await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantId: fixture.tenantId,
          email: fixture.userEmail,
          password: fixture.userPassword,
        })
        .expect(200);

      const { refreshToken } = loginRes.body as { refreshToken: string };

      const refreshRes = await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(refreshRes.body.accessToken).toBeTruthy();
      expect(refreshRes.body.refreshToken).toBeTruthy();
      expect(refreshRes.body.refreshToken).not.toBe(refreshToken);
    });

    it('returns 401 when the same refresh token is reused after rotation', async () => {
      const loginRes = await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantId: fixture.tenantId,
          email: fixture.userEmail,
          password: fixture.userPassword,
        })
        .expect(200);

      const { refreshToken } = loginRes.body as { refreshToken: string };

      await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('returns 204 and invalidates the refresh token', async () => {
      const loginRes = await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantId: fixture.tenantId,
          email: fixture.userEmail,
          password: fixture.userPassword,
        })
        .expect(200);

      const { refreshToken } = loginRes.body as { refreshToken: string };

      await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken })
        .expect(204);

      await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    it('returns 204 and allows login with the new password', async () => {
      const loginRes = await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantId: fixture.tenantId,
          email: fixture.userEmail,
          password: fixture.userPassword,
        })
        .expect(200);

      const { accessToken } = loginRes.body as { accessToken: string };

      await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: fixture.userPassword,
          newPassword: 'NewPassword456',
        })
        .expect(204);

      await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantId: fixture.tenantId,
          email: fixture.userEmail,
          password: 'NewPassword456',
        })
        .expect(200);

      // Restore password for subsequent tests
      const restoreLoginRes = await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantId: fixture.tenantId,
          email: fixture.userEmail,
          password: 'NewPassword456',
        })
        .expect(200);

      const { accessToken: restoreToken } = restoreLoginRes.body as { accessToken: string };
      await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${restoreToken}`)
        .send({
          currentPassword: 'NewPassword456',
          newPassword: fixture.userPassword,
        })
        .expect(204);
    });

    it('returns 401 when wrong current password is provided', async () => {
      const loginRes = await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantId: fixture.tenantId,
          email: fixture.userEmail,
          password: fixture.userPassword,
        })
        .expect(200);

      const { accessToken } = loginRes.body as { accessToken: string };

      await request(fixture.app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'wrong-current-pass',
          newPassword: 'NewPassword456',
        })
        .expect(401);
    });
  });
});
