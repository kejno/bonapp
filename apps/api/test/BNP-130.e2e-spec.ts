import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AuthTestFixture, loginRequest } from './auth-test.fixture';

describe('BNP-130: JWT staff authentication', () => {
  const fixture = new AuthTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('requires a password change by default for a newly created staff account', async () => {
    const user = await fixture.prisma.user.create({
      data: {
        tenantId: fixture.tenantId,
        email: `temporary-${randomUUID()}@auth-test.local`,
        passwordHash: await bcrypt.hash('TemporaryPass123', 4),
        fullName: 'Temporary Staff',
        role: 'WAITER',
      },
      select: { mustChangePassword: true },
    });

    expect(user.mustChangePassword).toBe(true);
  });

  describe('POST /api/v1/auth/login', () => {
    it('returns 200 with accessToken and refreshToken on valid credentials', async () => {
      const res = await loginRequest(fixture.app.getHttpServer())
        .send({
          tenantId: fixture.tenantId,
          email: fixture.userEmail,
          password: fixture.userPassword,
        })
        .expect(200);

      const loginBody = res.body as {
        accessToken: string;
        refreshToken: string;
        mustChangePassword: boolean;
      };
      expect(loginBody.accessToken).toBeTruthy();
      expect(loginBody.refreshToken).toBeTruthy();
      expect(typeof loginBody.mustChangePassword).toBe('boolean');
    });

    it('blocks legacy login tokens until the staff password is changed', async () => {
      await fixture.prisma.user.update({
        where: { id: fixture.userId },
        data: { mustChangePassword: true },
      });

      try {
        const legacyLogin = await request(fixture.app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ login: fixture.userEmail, password: fixture.userPassword })
          .expect(200);
        const legacyBody = legacyLogin.body as { accessToken: string };

        await request(fixture.app.getHttpServer())
          .post('/api/v1/admin/tenant/logo')
          .set('Authorization', `Bearer ${legacyBody.accessToken}`)
          .field('tenantId', fixture.tenantId)
          .expect(403);

        const staffLogin = await loginRequest(fixture.app.getHttpServer())
          .send({
            tenantId: fixture.tenantId,
            email: fixture.userEmail,
            password: fixture.userPassword,
          })
          .expect(200);
        const staffBody = staffLogin.body as { accessToken: string };

        await request(fixture.app.getHttpServer())
          .post('/api/v1/auth/change-password')
          .set('Authorization', `Bearer ${staffBody.accessToken}`)
          .send({ currentPassword: fixture.userPassword, newPassword: 'ChangedPass456' })
          .expect(204);

        await request(fixture.app.getHttpServer())
          .post('/api/v1/admin/tenant/logo')
          .set('Authorization', `Bearer ${legacyBody.accessToken}`)
          .field('tenantId', fixture.tenantId)
          .expect(400);
      } finally {
        await fixture.prisma.user.update({
          where: { id: fixture.userId },
          data: {
            passwordHash: await bcrypt.hash(fixture.userPassword, 4),
            mustChangePassword: false,
          },
        });
      }
    });

    it('returns 401 on wrong password', async () => {
      await loginRequest(fixture.app.getHttpServer())
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
        await loginRequest(fixture.app.getHttpServer(), '198.51.100.130')
          .send({
            tenantId: fixture.tenantId,
            email: rateEmail,
            password: 'wrong-password',
          })
          .expect(401);
      }

      await loginRequest(fixture.app.getHttpServer(), '198.51.100.130')
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
      const loginRes = await loginRequest(fixture.app.getHttpServer())
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

      const refreshBody = refreshRes.body as {
        accessToken: string;
        refreshToken: string;
      };
      expect(refreshBody.accessToken).toBeTruthy();
      expect(refreshBody.refreshToken).toBeTruthy();
      expect(refreshBody.refreshToken).not.toBe(refreshToken);
    });

    it('returns 401 when the same refresh token is reused after rotation', async () => {
      const loginRes = await loginRequest(fixture.app.getHttpServer())
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
      const loginRes = await loginRequest(fixture.app.getHttpServer())
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
      const loginRes = await loginRequest(fixture.app.getHttpServer())
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

      await loginRequest(fixture.app.getHttpServer())
        .send({
          tenantId: fixture.tenantId,
          email: fixture.userEmail,
          password: 'NewPassword456',
        })
        .expect(200);

      // Restore password for subsequent tests
      const restoreLoginRes = await loginRequest(fixture.app.getHttpServer())
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
      const loginRes = await loginRequest(fixture.app.getHttpServer())
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
