import { randomUUID } from 'node:crypto';
import { AuthTestFixture, loginRequest } from './auth-test.fixture';

describe('BNP-381: login rejects invalid credentials and enforces rate limit', () => {
  const fixture = new AuthTestFixture();

  beforeAll(async () => fixture.start(), 120_000);
  afterAll(async () => fixture.stop());

  it('returns 401 without tokens for an incorrect password', async () => {
    const response = await loginRequest(fixture.app.getHttpServer())
      .send({ tenantId: fixture.tenantId, email: fixture.userEmail, password: 'wrong-password' })
      .expect(401);
    expect(response.body).not.toHaveProperty('accessToken');
    expect(response.body).not.toHaveProperty('refreshToken');
  });

  it('returns 429 for the sixth attempt from the same IP within one minute', async () => {
    const keys = await fixture.redis.keys('login_attempts:*');
    if (keys.length) await fixture.redis.del(...keys);
    const ip = '198.51.100.131';
    const email = `missing-${randomUUID()}@auth-test.local`;
    for (let i = 0; i < 5; i++) {
      await loginRequest(fixture.app.getHttpServer(), ip)
        .send({ tenantId: fixture.tenantId, email, password: 'wrong-password' })
        .expect(401);
    }
    await loginRequest(fixture.app.getHttpServer(), ip)
      .send({ tenantId: fixture.tenantId, email, password: 'wrong-password' })
      .expect(429);
  });
});
