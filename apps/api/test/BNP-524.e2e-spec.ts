import { createCipheriv, randomBytes } from 'node:crypto';
import { Queue } from 'bullmq';
import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-524 unavailable iiko API (e2e)', () => {
  const fixture = new MenuCacheTestFixture();
  const encryptionKey = randomBytes(32);
  const encryptedPassword = encrypt('iiko-secret', encryptionKey);
  let previousCredentialsKey: string | undefined;
  let authorization = '';
  let loginCount = 0;

  beforeAll(async () => {
    previousCredentialsKey = process.env.POS_CREDENTIALS_KEY;
    process.env.POS_CREDENTIALS_KEY = encryptionKey.toString('base64');
    await fixture.start({ redisAdapter: false });
    await fixture.prisma.posIntegrationConfig.create({
      data: { tenantId: fixture.tenantId, provider: 'IIKO', config: { login: 'restaurant-login', password_encrypted: encryptedPassword, concept_id: 'concept-524', base_url: 'https://iiko.test' } },
    });
    authorization = `Bearer ${fixture.token()}`;
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      loginCount += 1;
      return Promise.resolve(new Response('iiko unavailable', { status: 503 }));
    });
  }, 120_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await fixture.stop();
    if (previousCredentialsKey === undefined) delete process.env.POS_CREDENTIALS_KEY;
    else process.env.POS_CREDENTIALS_KEY = previousCredentialsKey;
  });

  it('retries the failed iiko request three times and records UNAVAILABLE', async () => {
    const server = fixture.app.getHttpServer();
    const beforeCategories = await fixture.prisma.menuCategory.findMany({ where: { tenantId: fixture.tenantId }, orderBy: { id: 'asc' } });
    const beforeItems = await fixture.prisma.menuItem.findMany({ where: { tenantId: fixture.tenantId }, orderBy: { id: 'asc' } });
    const enqueueResponse = await request(server).post('/api/v1/admin/pos/sync-menu').set('Authorization', authorization).expect(201);
    const { jobId } = enqueueResponse.body as { jobId: string };
    await waitForStatus(server, authorization, 'UNAVAILABLE');

    expect(loginCount).toBe(3);
    const syncQueue = new Queue('iiko-sync-menu', {
      connection: { host: process.env.REDIS_HOST ?? 'localhost', port: Number(process.env.REDIS_PORT ?? '6379') },
    });
    try {
      const job = await syncQueue.getJob(jobId);
      expect(job).toBeDefined();
      expect(await job?.getState()).toBe('failed');
      expect(job?.attemptsMade).toBe(3);
      expect(job?.failedReason).toContain('503');
    } finally {
      await syncQueue.close();
    }

    const statusResponse = await request(server).get('/api/v1/admin/pos/sync-status').set('Authorization', authorization).expect(200);
    expect(statusResponse.body).toMatchObject({
      status: 'UNAVAILABLE',
      error: 'iiko Cloud API недоступен после трёх попыток',
    });
    expect((statusResponse.body as { completedAt?: string }).completedAt).toBeTruthy();
    const tenant = await fixture.prisma.tenant.findUnique({ where: { id: fixture.tenantId }, select: { posImportState: true } });
    expect(tenant?.posImportState).toMatchObject({ status: 'UNAVAILABLE', error: 'iiko Cloud API недоступен после трёх попыток' });
    await expect(fixture.prisma.menuCategory.findMany({ where: { tenantId: fixture.tenantId }, orderBy: { id: 'asc' } })).resolves.toEqual(beforeCategories);
    await expect(fixture.prisma.menuItem.findMany({ where: { tenantId: fixture.tenantId }, orderBy: { id: 'asc' } })).resolves.toEqual(beforeItems);
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
    if (status === 'FAILED') throw new Error(`Синхронизация iiko завершилась со статусом ${status}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Синхронизация iiko не достигла статуса ${expected}`);
}
