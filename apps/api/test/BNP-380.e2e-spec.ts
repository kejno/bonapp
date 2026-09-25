import { UserRole } from '@prisma/client';
import { verifyToken } from '../src/staff-auth/staff-jwt.util';
import { AuthTestFixture, loginRequest } from './auth-test.fixture';

describe('BNP-380: staff login issues scoped JWTs', () => {
  const fixture = new AuthTestFixture();

  beforeAll(async () => fixture.start(), 120_000);
  afterAll(async () => fixture.stop());

  it('returns access and refresh JWTs with staff claims and expected lifetimes', async () => {
    const before = Math.floor(Date.now() / 1000);
    const response = await loginRequest(fixture.app.getHttpServer())
      .send({ tenantId: fixture.tenantId, email: fixture.userEmail, password: fixture.userPassword })
      .expect(200);
    const body = response.body as { accessToken: string; refreshToken: string };
    const secret = 'auth-e2e-test-secret';
    const access = verifyToken(body.accessToken, secret);
    const refresh = verifyToken(body.refreshToken, secret);

    expect(access).toMatchObject({ tenantId: fixture.tenantId, userId: fixture.userId, role: UserRole.WAITER, type: 'access' });
    expect(access.exp).toBeGreaterThanOrEqual(before + 15 * 60 - 1);
    expect(access.exp).toBeLessThanOrEqual(before + 15 * 60 + 2);
    expect(refresh).toMatchObject({ tenantId: fixture.tenantId, userId: fixture.userId, role: UserRole.WAITER, type: 'refresh' });
    expect(refresh.exp).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 - 1);
    expect(refresh.exp).toBeLessThanOrEqual(before + 7 * 24 * 60 * 60 + 2);
  });
});
