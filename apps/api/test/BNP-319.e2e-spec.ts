import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createHmac } from 'crypto';

// NestJS v11 FileTypeValidator loads the ESM-only `file-type` package through
// `load-esm`, which Jest's synchronous VM cannot import without this shim.
jest.mock('load-esm', () => ({
  loadEsm: () => ({
    fileTypeFromBuffer: (buffer: Buffer) => {
      if (
        buffer.length >= 4 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      ) {
        return { mime: 'image/png', ext: 'png' };
      }
      return null;
    },
  }),
}));

const S3_ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const S3_BUCKET = process.env.S3_BUCKET ?? 'bonapp-e2e-bnp-319';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY ?? 'minioadmin';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY ?? 'minioadmin';

process.env.S3_ENDPOINT = S3_ENDPOINT;
process.env.S3_PUBLIC_ENDPOINT ??= S3_ENDPOINT;
process.env.S3_BUCKET = S3_BUCKET;
process.env.S3_ACCESS_KEY = S3_ACCESS_KEY;
process.env.S3_SECRET_KEY = S3_SECRET_KEY;

const TENANT_ID = 'tenant-uuid-319';
const JWT_SECRET = 'bnp-319-test-secret';
const PNG_CONTENT = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

describe('BNP-319: POST /api/v1/admin/tenant/logo — file is saved and public URL is returned', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    const s3 = new S3Client({
      endpoint: S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
      forcePathStyle: true,
    });

    try {
      await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
    }

    await s3.send(
      new PutBucketPolicyCommand({
        Bucket: S3_BUCKET,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: '*',
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${S3_BUCKET}/*`],
            },
          ],
        }),
      }),
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        db: {
          tenant: {
            findUnique: jest
              .fn()
              .mockResolvedValue({ id: TENANT_ID, name: 'Test Tenant' }),
            update: jest.fn().mockResolvedValue({ id: TENANT_ID }),
          },
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('saves a PNG uploaded in file and serves its exact content by the returned url', async () => {
    const uploadResponse = await request(app.getHttpServer())
      .post('/api/v1/admin/tenant/logo')
      .set('Authorization', `Bearer ${createJwt(TENANT_ID)}`)
      .field('tenantId', TENANT_ID)
      .attach('logo', PNG_CONTENT, {
        filename: 'logo.png',
        contentType: 'image/png',
      });

    expect([200, 201]).toContain(uploadResponse.status);
    const body = uploadResponse.body as { logoUrl: string };
    expect(body.logoUrl).toEqual(expect.stringMatching(/^http/));

    const downloadResponse = await fetch(body.logoUrl);

    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get('content-type')).toMatch(/^image\/png/);
    expect(Buffer.from(await downloadResponse.arrayBuffer())).toEqual(PNG_CONTENT);
  });
});

function createJwt(tenantId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url',
  );
  const payload = Buffer.from(
    JSON.stringify({ tenantId, exp: Math.floor(Date.now() / 1000) + 60 }),
  ).toString('base64url');
  const signature = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}
