import { createCipheriv, randomBytes } from 'node:crypto';
import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-522 iiko menu synchronization (e2e)', () => {
  const fixture = new MenuCacheTestFixture();
  const encryptionKey = randomBytes(32);
  const encryptedPassword = encrypt('iiko-secret', encryptionKey);
  let previousCredentialsKey: string | undefined;
  let nomenclature = {
    groups: [{ id: 'iiko-drinks', name: 'Напитки iiko' }],
    products: [{ id: 'iiko-coffee-522', name: 'Капучино', price: 7.5, categoryId: 'iiko-drinks', image: 'https://example.test/coffee.png' }],
  };
  let authorization = '';

  beforeAll(async () => {
    previousCredentialsKey = process.env.POS_CREDENTIALS_KEY;
    process.env.POS_CREDENTIALS_KEY = encryptionKey.toString('base64');
    await fixture.start({ redisAdapter: false });
    await fixture.prisma.posIntegrationConfig.create({
      data: {
        tenantId: fixture.tenantId,
        provider: 'IIKO',
        config: { login: 'restaurant-login', password_encrypted: encryptedPassword, concept_id: 'concept-522', base_url: 'https://iiko.test' },
      },
    });
    authorization = `Bearer ${fixture.token()}`;
    jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/api/0/auth/login')) return Promise.resolve(new Response(JSON.stringify({ authToken: 'token-522' }), { status: 200 }));
      if (url.endsWith('/api/0/nomenclature/concept-522')) return Promise.resolve(new Response(JSON.stringify(nomenclature), { status: 200 }));
      return Promise.resolve(new Response('Unexpected iiko request', { status: 404 }));
    });
  }, 120_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await fixture.stop();
    if (previousCredentialsKey === undefined) delete process.env.POS_CREDENTIALS_KEY;
    else process.env.POS_CREDENTIALS_KEY = previousCredentialsKey;
  });

  it('imports and updates product and category without creating duplicates', async () => {
    const server = fixture.app.getHttpServer();
    await request(server).post('/api/v1/admin/pos/sync-menu').set('Authorization', authorization).expect(201);
    await waitForStatus(server, authorization, 'SUCCESS');

    const firstImport = await fixture.prisma.menuItem.findMany({ where: { tenantId: fixture.tenantId, posItemId: 'iiko-coffee-522' } });
    expect(firstImport).toHaveLength(1);
    expect(firstImport[0]).toMatchObject({ name: 'Капучино', imageUrl: 'https://example.test/coffee.png' });
    expect(firstImport[0]?.priceByn.toString()).toBe('7.5');
    const categories = await fixture.prisma.menuCategory.findMany({ where: { tenantId: fixture.tenantId, posCategoryId: 'iiko-drinks' } });
    expect(categories).toHaveLength(1);
    expect(categories[0]?.name).toBe('Напитки iiko');

    nomenclature = {
      groups: [{ id: 'iiko-drinks', name: 'Напитки iiko' }],
      products: [{ id: 'iiko-coffee-522', name: 'Большой капучино', price: 9, categoryId: 'iiko-drinks', image: 'https://example.test/large-coffee.png' }],
    };
    await request(server).post('/api/v1/admin/pos/sync-menu').set('Authorization', authorization).expect(201);
    await waitForStatus(server, authorization, 'SUCCESS');

    const updatedItems = await fixture.prisma.menuItem.findMany({ where: { tenantId: fixture.tenantId, posItemId: 'iiko-coffee-522' } });
    expect(updatedItems).toHaveLength(1);
    expect(updatedItems[0]).toMatchObject({ name: 'Большой капучино', imageUrl: 'https://example.test/large-coffee.png' });
    expect(updatedItems[0]?.priceByn.toString()).toBe('9');
  }, 30_000);
});

function encrypt(value: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64')).join(':');
}

async function waitForStatus(server: ReturnType<MenuCacheTestFixture['app']['getHttpServer']>, authorization: string, expected: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await request(server).get('/api/v1/admin/pos/sync-status').set('Authorization', authorization).expect(200);
    const status = (response.body as { status?: string }).status;
    if (status === expected) return;
    if (status === 'FAILED' || status === 'UNAVAILABLE') throw new Error(`Синхронизация iiko завершилась со статусом ${status}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Синхронизация iiko не достигла статуса ${expected}`);
}
