import request from 'supertest';
import { AuthTestFixture, loginRequest } from './auth-test.fixture';

describe('BNP-382: refresh rotation and logout revoke old tokens', () => {
  const fixture = new AuthTestFixture();

  beforeAll(async () => fixture.start(), 120_000);
  afterAll(async () => fixture.stop());

  it('rotates a refresh token and rejects its reuse', async () => {
    const login = await loginRequest(fixture.app.getHttpServer())
      .send({ tenantId: fixture.tenantId, email: fixture.userEmail, password: fixture.userPassword })
      .expect(200);
    const oldToken = (login.body as { refreshToken: string }).refreshToken;
    const rotated = await request(fixture.app.getHttpServer())
      .post('/api/v1/auth/refresh').send({ refreshToken: oldToken }).expect(200);
    expect((rotated.body as { refreshToken: string }).refreshToken).not.toBe(oldToken);
    await request(fixture.app.getHttpServer())
      .post('/api/v1/auth/refresh').send({ refreshToken: oldToken }).expect(401);
  });

  it('blacklists a refresh token on logout', async () => {
    const login = await loginRequest(fixture.app.getHttpServer())
      .send({ tenantId: fixture.tenantId, email: fixture.userEmail, password: fixture.userPassword })
      .expect(200);
    const refreshToken = (login.body as { refreshToken: string }).refreshToken;
    await request(fixture.app.getHttpServer())
      .post('/api/v1/auth/logout').send({ refreshToken }).expect(204);
    await request(fixture.app.getHttpServer())
      .post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
  });
});
