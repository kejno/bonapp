import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-368: presigned menu item image upload', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => fixture.start(), 120_000);
  afterAll(async () => fixture.stop());

  it('returns an upload target and persists its public image URL on an item', async () => {
    const authorization = { Authorization: `Bearer ${fixture.token()}` };
    const presign = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/media/presign')
      .set(authorization)
      .send({ contentType: 'image/jpeg' })
      .expect(201);

    expect(presign.body.uploadUrl).toMatch(/^https?:\/\//);
    expect(presign.body.uploadFields).toEqual(expect.any(Object));
    expect(presign.body.imageUrl).toContain(`/tenants/${fixture.tenantId}/menu/`);

    const item = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/menu/items')
      .set(authorization)
      .send({ name: 'Uploaded image item', categoryId: fixture.categoryId, price: 500, imageUrl: presign.body.imageUrl })
      .expect(201);
    expect(item.body.imageUrl).toBe(presign.body.imageUrl);
  });
});
