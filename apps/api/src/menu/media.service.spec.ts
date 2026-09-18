import { BadRequestException } from '@nestjs/common';
import { MediaService } from './media.service';

describe('MediaService', () => {
  const config = { get: jest.fn() };
  const service = new MediaService(config as never);

  beforeEach(() => {
    config.get.mockImplementation(
      (key: string) =>
        ({
          S3_ENDPOINT: 'http://localhost:9000',
          S3_BUCKET: 'bonapp-media',
          S3_ACCESS_KEY_ID: 'test-access-key',
          S3_SECRET_ACCESS_KEY: 'test-secret-key',
          S3_PUBLIC_URL: 'http://localhost:9000/bonapp-media',
        })[key],
    );
  });

  it('creates a signed upload target for a 5 MB WebP image', async () => {
    const result = await service.createPresign(
      'tenant-1',
      'image/webp',
      5 * 1024 * 1024,
    );
    expect(result.key).toMatch(/^menu\/tenant-1\/.+\.webp$/);
    expect(result.upload_url).toContain('X-Amz-Signature=');
    expect(result.image_url).toMatch(
      /^http:\/\/localhost:9000\/bonapp-media\/menu\/tenant-1\//,
    );
    expect(result.required_headers).toEqual({
      'content-type': 'image/webp',
      'content-length': '5242880',
    });
    expect(result.expires_in).toBe(900);
  });

  it.each([
    ['image/gif', 100],
    ['image/jpeg', 5 * 1024 * 1024 + 1],
  ])('rejects unsupported media constraints', async (mimeType, size) => {
    await expect(
      service.createPresign('tenant-1', mimeType, size),
    ).rejects.toThrow(BadRequestException);
  });
});
