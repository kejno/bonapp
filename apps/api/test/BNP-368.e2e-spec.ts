import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

let mockUploadUrl = '';
let mockPublicEndpoint = '';

jest.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: jest.fn(
    (_client: unknown, params: Record<string, unknown>) => {
      const fields = params.Fields as Record<string, string>;
      const key = params.Key as string;
      return Promise.resolve({
        url: mockUploadUrl,
        fields: { ...fields, key },
      });
    },
  ),
}));

describe('BNP-368: presigned menu item image upload', () => {
  const fixture = new MenuCacheTestFixture();
  let storageServer: Server;
  let uploadedImage: Buffer | undefined;
  let uploadedContentType = '';
  const previousPublicEndpoint = process.env.S3_PUBLIC_ENDPOINT;

  beforeAll(async () => {
    storageServer = createServer((incoming, outgoing) => {
      if (incoming.method === 'POST' && incoming.url === '/upload') {
        const chunks: Uint8Array[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('end', () => {
          const body = Buffer.concat(chunks);
          const boundary =
            incoming.headers['content-type']?.match(/boundary=(.+)$/)?.[1];
          if (!boundary) {
            outgoing.writeHead(400).end();
            return;
          }

          const filePart = body.indexOf(Buffer.from('name="file"'));
          const contentStart =
            body.indexOf(Buffer.from('\r\n\r\n'), filePart) + 4;
          const contentEnd = body.indexOf(
            Buffer.from(`\r\n--${boundary}`),
            contentStart,
          );
          if (filePart < 0 || contentStart < 4 || contentEnd < 0) {
            outgoing.writeHead(400).end();
            return;
          }
          uploadedImage = Buffer.from(body.subarray(contentStart, contentEnd));
          uploadedContentType = 'image/png';
          outgoing.writeHead(204).end();
        });
        return;
      }

      if (incoming.method === 'GET') {
        if (!uploadedImage) {
          outgoing.writeHead(404).end();
          return;
        }
        outgoing.writeHead(200, { 'Content-Type': uploadedContentType });
        outgoing.end(uploadedImage);
        return;
      }

      outgoing.writeHead(404).end();
    });
    await new Promise<void>((resolve, reject) => {
      storageServer.once('error', reject);
      storageServer.listen(0, '127.0.0.1', resolve);
    });
    const address = storageServer.address() as AddressInfo;
    mockUploadUrl = `http://127.0.0.1:${address.port}/upload`;
    mockPublicEndpoint = `http://127.0.0.1:${address.port}`;
    process.env.S3_PUBLIC_ENDPOINT = mockPublicEndpoint;
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
    await new Promise<void>((resolve) => storageServer?.close(() => resolve()));
    if (previousPublicEndpoint === undefined)
      delete process.env.S3_PUBLIC_ENDPOINT;
    else process.env.S3_PUBLIC_ENDPOINT = previousPublicEndpoint;
  });

  it('uploads the test file through the presigned form and serves its exact content publicly', async () => {
    const authorization = { Authorization: `Bearer ${fixture.token()}` };
    const presign = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/media/presign')
      .set(authorization)
      .send({ contentType: 'image/png' })
      .expect(201);
    const presignBody = presign.body as {
      uploadUrl: string;
      uploadFields: Record<string, string>;
      imageUrl: string;
    };

    expect(presignBody.uploadUrl).toBe(mockUploadUrl);
    expect(presignBody.uploadFields).toEqual(
      expect.objectContaining({ 'Content-Type': 'image/png' }),
    );
    expect(presignBody.imageUrl).toContain(
      `/tenants/${fixture.tenantId}/menu/`,
    );

    const image = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/zmcAAAAASUVORK5CYII=',
      'base64',
    );
    const form = new FormData();
    for (const [name, value] of Object.entries(presignBody.uploadFields)) {
      form.append(name, value);
    }
    form.append('file', new Blob([image], { type: 'image/png' }), 'menu.png');
    const upload = await fetch(presignBody.uploadUrl, {
      method: 'POST',
      body: form,
    });
    expect(upload.status).toBe(204);
    expect(uploadedImage).toEqual(image);

    const download = await fetch(presignBody.imageUrl);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toMatch(/^image\/png/);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(image);

    const item = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/menu/items')
      .set(authorization)
      .send({
        name: 'Uploaded image item',
        categoryId: fixture.categoryId,
        price: 500,
        imageUrl: presignBody.imageUrl,
      })
      .expect(201);
    const itemBody = item.body as { imageUrl: string };
    expect(itemBody.imageUrl).toBe(presignBody.imageUrl);
  });
});
