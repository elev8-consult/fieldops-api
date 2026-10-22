import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Short-lived links so the private Railway bucket can show pictures in the dashboard. */
@Injectable()
export class ShelfPhotoStorage {
  private client: S3Client | null = null;
  private bucket: string | null = null;
  private ready: boolean | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    if (this.ready != null) return this.ready;
    this.ready = this.connect() != null;
    return this.ready;
  }

  async put(
    objectKey: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    const client = this.connect();
    if (!client || !this.bucket) {
      throw new Error('Photo storage is not configured.');
    }
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async remove(objectKey: string): Promise<void> {
    const client = this.connect();
    if (!client || !this.bucket) return;
    await client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }

  async presign(objectKey: string): Promise<string | null> {
    const client = this.connect();
    if (!client || !this.bucket) return null;
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn: 60 * 15 },
    );
  }

  private connect(): S3Client | null {
    if (this.client) return this.client;
    const endpoint = this.config.get<string>('AWS_ENDPOINT_URL');
    const bucket = this.config.get<string>('AWS_S3_BUCKET_NAME');
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');
    const region = this.config.get<string>('AWS_DEFAULT_REGION') || 'auto';
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
    this.bucket = bucket;
    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: false,
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.client;
  }
}
