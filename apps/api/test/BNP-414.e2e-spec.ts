import request from 'supertest';
import { UserRole } from '@prisma/client';
import { signToken } from '../src/staff-auth/staff-jwt.util';
import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-414: авторизация административного API', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('отклоняет запросы к API сотрудников и смен без токена', async () => {
    await request(fixture.app.getHttpServer()).get('/api/v1/admin/staff').expect(401);
    await request(fixture.app.getHttpServer())
      .get('/api/v1/admin/staff')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
    const expiredToken = signToken(
      {
        sub: fixture.userId,
        userId: fixture.userId,
        tenantId: fixture.tenantId,
        role: UserRole.OWNER,
        type: 'access',
        jti: 'expired-test-token',
        sessionVersion: 0,
        exp: Math.floor(Date.now() / 1000) - 1,
      },
      'auth-e2e-test-secret',
    );
    await request(fixture.app.getHttpServer())
      .get('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
    await request(fixture.app.getHttpServer()).post('/api/v1/admin/staff').send({}).expect(401);
    await request(fixture.app.getHttpServer()).post('/api/v1/admin/shifts/open').send({}).expect(401);
  });
});
