import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { StorageService } from './storage.service';

jest.mock('@aws-sdk/client-s3');

const mockSend = jest.fn();
(S3Client as jest.Mock).mockImplementation(() => ({ send: mockSend }));

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
    (PutObjectCommand as jest.Mock).mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: string) =>
              configValues[key] ?? fallback,
          },
        },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
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
});
