import { createCipheriv, randomBytes } from 'node:crypto';
import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-523 iiko authentication renewal (e2e)', () => {
  const fixture = new MenuCacheTestFixture();
  const encryptionKey = randomBytes(32);
  const encryptedPassword = encrypt('iiko-secret', encryptionKey);
  let previousCredentialsKey: string | undefined;
  let authorization = '';
  let loginCount = 0;
  let mockNow = 0;
  const tokenIssuedAt = new Map<string, number>();
  const nomenclatureTokens: string[] = [];

  beforeAll(async () => {
    previousCredentialsKey = process.env.POS_CREDENTIALS_KEY;
    process.env.POS_CREDENTIALS_KEY = encryptionKey.toString('base64');
    await fixture.start({ redisAdapter: false });
    await fixture.prisma.posIntegrationConfig.create({
      data: { tenantId: fixture.tenantId, provider: 'IIKO', config: { login: 'restaurant-login', password_encrypted: encryptedPassword, concept_id: 'concept-523', base_url: 'https://iiko.test' } },
    });
    authorization = `Bearer ${fixture.token()}`;
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/api/0/auth/login')) {
        loginCount += 1;
        const token = `token-${loginCount}`;
        tokenIssuedAt.set(token, mockNow);
        return Promise.resolve(new Response(JSON.stringify({ authToken: token }), { status: 200 }));
      }
      if (url.endsWith('/api/0/nomenclature/concept-523')) {
        const headers = new Headers(init?.headers);
        const authorizationHeader = headers.get('authorization') ?? '';
        nomenclatureTokens.push(authorizationHeader);
        const token = authorizationHeader.replace(/^Bearer /, '');
        const issuedAt = tokenIssuedAt.get(token);
        if (issuedAt === undefined || mockNow - issuedAt >= 15 * 60_000) {
          return Promise.resolve(new Response('Token expired', { status: 401 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ groups: [], products: [] }), { status: 200 }));
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

  it('authenticates again for a later sync and uses the newly issued token', async () => {
    const server = fixture.app.getHttpServer();
    await request(server).post('/api/v1/admin/pos/sync-menu').set('Authorization', authorization).expect(201);
    await waitForStatus(server, authorization, 'SUCCESS');

    mockNow += 15 * 60_000 + 1;
    await request(server).post('/api/v1/admin/pos/sync-menu').set('Authorization', authorization).expect(201);
    await waitForStatus(server, authorization, 'SUCCESS');

    expect(loginCount).toBe(2);
    expect(nomenclatureTokens).toEqual(['Bearer token-1', 'Bearer token-2']);
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
