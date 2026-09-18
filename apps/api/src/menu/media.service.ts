import { BadRequestException, Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_FILE_SIZE = 5 * 1024 * 1024;

@Injectable()
export class MediaService {
  constructor(private readonly config: ConfigService) {}
  async createPresign(tenantId: string, mimeType: unknown, size: unknown) {
    if (typeof mimeType !== 'string' || !MIME_EXTENSIONS[mimeType])
      throw new BadRequestException(
        'Only JPEG, PNG and WebP images are supported',
      );
    if (
      typeof size !== 'number' ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > MAX_FILE_SIZE
    )
      throw new BadRequestException(
        'Image size must be between 1 byte and 5 MB',
      );
    const key = `menu/${tenantId}/${randomUUID()}.${MIME_EXTENSIONS[mimeType]}`;
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const bucket = this.config.get<string>('S3_BUCKET') ?? 'bonapp-media';
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');
    const client = new S3Client({
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      endpoint,
      forcePathStyle: Boolean(endpoint),
      ...(accessKeyId &&
        secretAccessKey && {
          credentials: { accessKeyId, secretAccessKey },
        }),
    });
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: mimeType,
        ContentLength: size,
      }),
      { expiresIn: 900 },
    );
    const publicBaseUrl = this.config
      .get<string>('S3_PUBLIC_URL')
      ?.replace(/\/$/, '');
    return {
      upload_url: uploadUrl,
      image_url: publicBaseUrl
        ? `${publicBaseUrl}/${key}`
        : uploadUrl.split('?')[0],
      key,
      expires_in: 900,
      required_headers: {
        'content-type': mimeType,
        'content-length': String(size),
      },
    };
  }
}
