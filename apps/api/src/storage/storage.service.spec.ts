import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { StorageService } from './storage.service';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: jest.fn(),
}));

const mockSend = jest.fn();
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

describe('StorageService', () => {
  let service: StorageService;

  const configValues: Record<string, string> = {
    S3_ENDPOINT: 'http://localhost:9000',
    S3_BUCKET: 'test-bucket',
    S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: 'key',
    S3_SECRET_KEY: 'secret',
  };

  beforeEach(async () => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
    (S3Client as jest.Mock).mockClear();
    (PutObjectCommand as unknown as jest.Mock).mockClear();
    (createPresignedPost as jest.Mock).mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: makeConfigService(configValues),
        },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  describe('presigned menu uploads', () => {
    it('uses a POST policy that rejects files larger than 5 MB', async () => {
      (createPresignedPost as jest.Mock).mockResolvedValue({
        url: 'http://localhost:9000/test-bucket',
        fields: { key: 'tenants/abc/menu/image.png' },
      });

      await service.getPresignedUploadUrl('tenants/abc/menu/image.png', 'image/png');

      expect(createPresignedPost).toHaveBeenCalledWith(
        expect.anything(),
        {
          Bucket: 'test-bucket',
          Key: 'tenants/abc/menu/image.png',
          Conditions: [
            ['content-length-range', 1, 5 * 1024 * 1024],
            { 'Content-Type': 'image/png' },
          ],
          Fields: { 'Content-Type': 'image/png' },
          Expires: 600,
        },
      );
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upload', () => {
    it('should send PutObjectCommand with correct parameters', async () => {
      const key = 'tenants/abc/logo.png';
      const body = Buffer.from('fake-image');
      const contentType = 'image/png';

      await service.upload(key, body, contentType);

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: key,
        Body: body,
        ContentType: contentType,
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return public URL composed from publicEndpoint, bucket and key', async () => {
      const key = 'tenants/abc/logo.png';

      const url = await service.upload(key, Buffer.from('x'), 'image/png');

      expect(url).toBe('http://localhost:9000/test-bucket/tenants/abc/logo.png');
    });

    it('should propagate S3 errors', async () => {
      mockSend.mockRejectedValue(new Error('S3 unavailable'));

      await expect(
        service.upload('key', Buffer.from('x'), 'image/png'),
      ).rejects.toThrow('S3 unavailable');
    });
  });

  describe('configuration fail-fast', () => {
    it('should throw at construction when S3_ACCESS_KEY is missing', async () => {
      const incompleteConfig = { ...configValues };
      delete incompleteConfig.S3_ACCESS_KEY;

      await expect(
        Test.createTestingModule({
          providers: [
            StorageService,
            {
              provide: ConfigService,
              useValue: makeConfigService(incompleteConfig),
            },
          ],
        }).compile(),
      ).rejects.toThrow('Config key "S3_ACCESS_KEY" is required');
    });

    it('should throw at construction when S3_SECRET_KEY is missing', async () => {
      const incompleteConfig = { ...configValues };
      delete incompleteConfig.S3_SECRET_KEY;

      await expect(
        Test.createTestingModule({
          providers: [
            StorageService,
            {
              provide: ConfigService,
              useValue: makeConfigService(incompleteConfig),
            },
          ],
        }).compile(),
      ).rejects.toThrow('Config key "S3_SECRET_KEY" is required');
    });

    it('should throw at construction when S3_ENDPOINT is missing', async () => {
      const incompleteConfig = { ...configValues };
      delete incompleteConfig.S3_ENDPOINT;

      await expect(
        Test.createTestingModule({
          providers: [
            StorageService,
            {
              provide: ConfigService,
              useValue: makeConfigService(incompleteConfig),
            },
          ],
        }).compile(),
      ).rejects.toThrow('Config key "S3_ENDPOINT" is required');
    });
  });
});
