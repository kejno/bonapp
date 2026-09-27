import request from 'supertest';
import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-414: авторизация административного API', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('отклоняет запросы к API сотрудников и смен без токена', async () => {
    await request(fixture.app.getHttpServer()).get('/api/v1/admin/staff').expect(401);
    await request(fixture.app.getHttpServer()).post('/api/v1/admin/staff').send({}).expect(401);
    await request(fixture.app.getHttpServer()).post('/api/v1/admin/shifts/open').send({}).expect(401);
  });
});
