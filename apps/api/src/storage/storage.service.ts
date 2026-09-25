import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

const MAX_MENU_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicEndpoint: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = config.getOrThrow<string>('S3_ENDPOINT');
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.publicEndpoint = config.get<string>('S3_PUBLIC_ENDPOINT', endpoint);
    const accessKeyId = config.getOrThrow<string>('S3_ACCESS_KEY');
    const secretAccessKey = config.getOrThrow<string>('S3_SECRET_KEY');

    this.client = new S3Client({
      endpoint,
      region: config.get<string>('S3_REGION', 'us-east-1'),
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return `${this.publicEndpoint}/${this.bucket}/${key}`;
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 600,
  ): Promise<{ uploadUrl: string; uploadFields: Record<string, string>; publicUrl: string }> {
    const presignedPost = await (createPresignedPost as (
      client: S3Client,
      params: Record<string, unknown>,
    ) => Promise<{ url: string; fields: Record<string, string> }>)(this.client, {
      Bucket: this.bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 1, MAX_MENU_IMAGE_SIZE_BYTES],
        { 'Content-Type': contentType },
      ],
      Fields: { 'Content-Type': contentType },
      Expires: expiresIn,
    });
    const uploadUrl: string = presignedPost.url;
    const uploadFields: Record<string, string> = presignedPost.fields;
    const publicUrl = `${this.publicEndpoint}/${this.bucket}/${key}`;
    return { uploadUrl, uploadFields, publicUrl };
  }
}
