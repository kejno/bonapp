import { createCipheriv, randomBytes } from 'node:crypto';
import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-168 iiko menu synchronization (e2e)', () => {
  const fixture = new MenuCacheTestFixture();
  const encryptionKey = randomBytes(32);
  const encryptedPassword = encrypt('iiko-secret', encryptionKey);
  let previousCredentialsKey: string | undefined;
  let nomenclature = {
    groups: [{ id: 'drinks', name: 'Напитки' }],
    products: [{ id: 'iiko-coffee-1', name: 'Капучино', price: 7.5, categoryId: 'drinks', image: 'https://example.test/coffee.png' }],
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
        config: {
          login: 'restaurant-login',
          password_encrypted: encryptedPassword,
          concept_id: 'concept-1',
          base_url: 'https://iiko.test',
        },
      },
    });
    authorization = `Bearer ${fixture.token()}`;
    jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/api/0/auth/login')) {
        return Promise.resolve(new Response(JSON.stringify({ authToken: 'test-auth-token' }), { status: 200 }));
      }
      if (url.endsWith('/api/0/nomenclature/concept-1')) {
        return Promise.resolve(new Response(JSON.stringify(nomenclature), { status: 200 }));
      }
      return Promise.resolve(new Response('Unexpected iiko request', { status: 404 }));
    });
  }, 120_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await fixture.stop();
    if (previousCredentialsKey === undefined) delete process.env.POS_CREDENTIALS_KEY;
    else process.env.POS_CREDENTIALS_KEY = previousCredentialsKey;
  });

  it('updates an imported menu item on the second sync without creating a duplicate', async () => {
    const server = fixture.app.getHttpServer();
    await request(server).post('/api/v1/admin/pos/sync-menu').set('Authorization', authorization).expect(201);
    await waitForStatus(server, authorization, 'SUCCESS');

    const firstImport = await fixture.prisma.menuItem.findMany({
      where: { tenantId: fixture.tenantId, posItemId: 'iiko-coffee-1' },
    });
    expect(firstImport).toHaveLength(1);
    expect(firstImport[0]).toMatchObject({ name: 'Капучино', imageUrl: 'https://example.test/coffee.png' });
    expect(firstImport[0]?.priceByn.toString()).toBe('7.5');

    nomenclature = {
      groups: [{ id: 'drinks', name: 'Напитки' }],
      products: [{ id: 'iiko-coffee-1', name: 'Большой капучино', price: 9, categoryId: 'drinks', image: 'https://example.test/large-coffee.png' }],
    };
    await request(server).post('/api/v1/admin/pos/sync-menu').set('Authorization', authorization).expect(201);
    await waitForStatus(server, authorization, 'SUCCESS');

    const secondImport = await fixture.prisma.menuItem.findMany({
      where: { tenantId: fixture.tenantId, posItemId: 'iiko-coffee-1' },
    });
    expect(secondImport).toHaveLength(1);
    expect(secondImport[0]).toMatchObject({ name: 'Большой капучино', imageUrl: 'https://example.test/large-coffee.png' });
    expect(secondImport[0]?.priceByn.toString()).toBe('9');
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
    if ((response.body as { status?: string }).status === expected) return;
    if ((response.body as { status?: string }).status === 'FAILED' || (response.body as { status?: string }).status === 'UNAVAILABLE') {
      throw new Error(`iiko sync ended with status ${(response.body as { status: string }).status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`iiko sync did not reach ${expected}`);
}
