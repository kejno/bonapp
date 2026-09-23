import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { StorageService } from './storage.service';

jest.mock('@aws-sdk/client-s3');

const mockSend = jest.fn().mockResolvedValue({});
(S3Client as jest.Mock).mockImplementation(() => ({ send: mockSend }));

function makeConfigService(values: Record<string, string>) {
  return {
    get: (key: string, fallback?: string) => values[key] ?? fallback,
    getOrThrow: (key: string) => {
      const val = values[key];
      if (val === undefined) throw new Error(`Config key "${key}" is required`);
      return val;
    },
  };
}

describe('BNP-322: S3 storage configuration via environment variables', () => {
  beforeEach(() => {
    (S3Client as jest.Mock).mockClear();
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
  });

  describe('S3Client constructor parameters', () => {
    it('initialises S3Client with endpoint from S3_ENDPOINT', async () => {
      await Test.createTestingModule({
        providers: [
          StorageService,
          {
            provide: ConfigService,
            useValue: makeConfigService({
              S3_ENDPOINT: 'http://minio.local:9000',
              S3_BUCKET: 'bonapp',
              S3_ACCESS_KEY: 'minioadmin',
              S3_SECRET_KEY: 'minioadmin',
            }),
          },
        ],
      }).compile();

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'http://minio.local:9000' }),
      );
    });

    it('sets forcePathStyle: true for MinIO-compatible path-style access', async () => {
      await Test.createTestingModule({
        providers: [
          StorageService,
          {
            provide: ConfigService,
            useValue: makeConfigService({
              S3_ENDPOINT: 'http://localhost:9000',
              S3_BUCKET: 'bonapp',
              S3_ACCESS_KEY: 'key',
              S3_SECRET_KEY: 'secret',
            }),
          },
        ],
      }).compile();

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({ forcePathStyle: true }),
      );
    });

    it('passes access key and secret key from S3_ACCESS_KEY / S3_SECRET_KEY', async () => {
      await Test.createTestingModule({
        providers: [
          StorageService,
          {
            provide: ConfigService,
            useValue: makeConfigService({
              S3_ENDPOINT: 'http://localhost:9000',
              S3_BUCKET: 'bonapp',
              S3_ACCESS_KEY: 'my-access-key',
              S3_SECRET_KEY: 'my-secret-key',
            }),
          },
        ],
      }).compile();

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          credentials: {
            accessKeyId: 'my-access-key',
            secretAccessKey: 'my-secret-key',
          },
        }),
      );
    });

    it('defaults region to us-east-1 when S3_REGION is not set', async () => {
      await Test.createTestingModule({
        providers: [
          StorageService,
          {
            provide: ConfigService,
            useValue: makeConfigService({
              S3_ENDPOINT: 'http://localhost:9000',
              S3_BUCKET: 'bonapp',
              S3_ACCESS_KEY: 'key',
              S3_SECRET_KEY: 'secret',
            }),
          },
        ],
      }).compile();

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'us-east-1' }),
      );
    });

    it('uses S3_REGION when provided', async () => {
      await Test.createTestingModule({
        providers: [
          StorageService,
          {
            provide: ConfigService,
            useValue: makeConfigService({
              S3_ENDPOINT: 'http://localhost:9000',
              S3_BUCKET: 'bonapp',
              S3_ACCESS_KEY: 'key',
              S3_SECRET_KEY: 'secret',
              S3_REGION: 'eu-west-1',
            }),
          },
        ],
      }).compile();

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'eu-west-1' }),
      );
    });
  });

  describe('public URL construction', () => {
    it('defaults S3_PUBLIC_ENDPOINT to S3_ENDPOINT when not set', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StorageService,
          {
            provide: ConfigService,
            useValue: makeConfigService({
              S3_ENDPOINT: 'http://localhost:9000',
              S3_BUCKET: 'test-bucket',
              S3_ACCESS_KEY: 'key',
              S3_SECRET_KEY: 'secret',
            }),
          },
        ],
      }).compile();

      const service = module.get<StorageService>(StorageService);
      const url = await service.upload('tenants/t1/logo.png', Buffer.from('x'), 'image/png');

      expect(url).toBe('http://localhost:9000/test-bucket/tenants/t1/logo.png');
    });

    it('uses S3_PUBLIC_ENDPOINT for the returned URL when configured', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StorageService,
          {
            provide: ConfigService,
            useValue: makeConfigService({
              S3_ENDPOINT: 'http://minio-internal:9000',
              S3_PUBLIC_ENDPOINT: 'https://cdn.example.com',
              S3_BUCKET: 'test-bucket',
              S3_ACCESS_KEY: 'key',
              S3_SECRET_KEY: 'secret',
            }),
          },
        ],
      }).compile();

      const service = module.get<StorageService>(StorageService);
      const url = await service.upload('tenants/t1/logo.png', Buffer.from('x'), 'image/png');

      expect(url).toBe('https://cdn.example.com/test-bucket/tenants/t1/logo.png');
    });
  });

  describe('required configuration — fail-fast on missing vars', () => {
    it.each(['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'])(
      'throws when %s is missing',
      async (missingKey) => {
        const config: Record<string, string> = {
          S3_ENDPOINT: 'http://localhost:9000',
          S3_BUCKET: 'bonapp',
          S3_ACCESS_KEY: 'key',
          S3_SECRET_KEY: 'secret',
        };
        delete config[missingKey];

        await expect(
          Test.createTestingModule({
            providers: [
              StorageService,
              { provide: ConfigService, useValue: makeConfigService(config) },
            ],
          }).compile(),
        ).rejects.toThrow(`Config key "${missingKey}" is required`);
      },
    );
  });
});
