import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-526: integration status response', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start({ redisAdapter: false });
    await fixture.prisma.tenant.update({
      where: { id: fixture.tenantId },
      data: {
        integrationSettings: {
          iiko: { apiUrl: 'invalid-url', apiKey: 'iiko-api-token-526', clientSecret: 'iiko-client-secret-526' },
          r_keeper: {},
          oplati: { merchantId: 'merchant-1', apiKey: 'oplati-api-token-526' },
          erip: { serviceId: 'service-1' },
          bePaid: { shopId: 'shop-1', mode: 'Test', secretKey: 'bepaid-secret-token-526' },
          skno: { serialNumber: 'serial-1' },
        },
      },
    });
  }, 120_000);

  afterAll(async () => fixture.stop());

  it('returns public integration settings without credentials over HTTP', async () => {
    const response = await request(fixture.app.getHttpServer())
      .get('/api/v1/admin/integrations/status')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);

    const body = response.body as { integrations: Record<string, unknown> };
    expect(body.integrations).toMatchObject({
      iiko: { settings: { apiUrl: 'invalid-url', apiKey: '', clientSecret: '' } },
      oplati: { settings: { merchantId: 'merchant-1', apiKey: '' } },
      erip: { settings: { serviceId: 'service-1' } },
      bePaid: { settings: { shopId: 'shop-1', mode: 'Test', secretKey: '' } },
      skno: { settings: { serialNumber: 'serial-1' } },
    });
    const responseBody = JSON.stringify(body);
    expect(responseBody).not.toContain('iiko-api-token-526');
    expect(responseBody).not.toContain('iiko-client-secret-526');
    expect(responseBody).not.toContain('oplati-api-token-526');
    expect(responseBody).not.toContain('bepaid-secret-token-526');
  });
});
