import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

export interface S3UploadResult {
  url: string;
  s3Key: string;
  bucket: string;
  originalName: string;
  mimeType: string;
  size: number;
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

class S3Service {
  private s3Client: S3Client | null = null;
  private bucketName: string = '';
  private publicBaseUrl: string = '';
  private isConfigured: boolean = false;

  constructor() {
    this.init();
  }

  private init() {
    const region = process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim() || '';
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim() || '';
    const bucket = process.env.AWS_S3_BUCKET?.trim() || '';
    const endpoint = process.env.AWS_S3_ENDPOINT?.trim();
    const forcePathStyle = process.env.AWS_S3_FORCE_PATH_STYLE === 'true';
    this.publicBaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL?.trim() || '';

    this.bucketName = bucket;

    if (accessKeyId && secretAccessKey && bucket) {
      try {
        this.s3Client = new S3Client({
          region,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
          ...(endpoint ? { endpoint, forcePathStyle } : {}),
        });
        this.isConfigured = true;
        console.log(`[S3Service] AWS S3 initialized for bucket: ${this.bucketName} in region: ${region}`);
      } catch (err: any) {
        console.warn(`[S3Service] Failed to initialize AWS S3 client: ${err.message}. Falling back to local media store.`);
        this.s3Client = null;
        this.isConfigured = false;
      }
    } else {
      console.log(`[S3Service] AWS S3 credentials not fully configured in environment. Local media store active for offline/preview resilience.`);
      this.isConfigured = false;
    }
  }

  public getStatus() {
    return {
      isConfigured: this.isConfigured,
      bucket: this.bucketName || 'local-fallback',
      region: process.env.AWS_REGION || 'us-east-1',
    };
  }

  /**
   * Validate uploaded image buffer and MIME type.
   */
  public validateImage(buffer: Buffer, mimeType: string, originalName?: string): void {
    if (!buffer || buffer.length === 0) {
      throw new Error('Image file is empty.');
    }
    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      throw new Error(`Image file size (${(buffer.length / (1024 * 1024)).toFixed(1)}MB) exceeds maximum allowed limit of 5MB.`);
    }
    const cleanMime = (mimeType || '').toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(cleanMime)) {
      throw new Error(`Unsupported image type '${cleanMime}'. Allowed formats: JPEG, PNG, WebP, GIF, SVG.`);
    }
  }

  /**
   * Upload image to AWS S3 (or fallback to persistent local uploads if AWS credentials not set).
   */
  public async uploadImage(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folderPrefix: string = 'questions'
  ): Promise<S3UploadResult> {
    this.validateImage(buffer, mimeType, originalName);

    // Sanitize extension and filename
    const ext = path.extname(originalName).toLowerCase() || '.png';
    const randomUuid = crypto.randomUUID();
    const s3Key = `${folderPrefix}/${randomUuid}${ext}`;

    if (this.isConfigured && this.s3Client) {
      try {
        const command = new PutObjectCommand({
          Bucket: this.bucketName,
          Key: s3Key,
          Body: buffer,
          ContentType: mimeType,
          Metadata: {
            originalName: encodeURIComponent(originalName),
            uploadedAt: new Date().toISOString(),
          },
        });

        await this.s3Client.send(command);

        // Generate URL: If public base URL is defined, use it; otherwise generate signed URL or proxy URL
        let url = '';
        if (this.publicBaseUrl) {
          url = `${this.publicBaseUrl.replace(/\/$/, '')}/${s3Key}`;
        } else {
          // Default to secure proxy endpoint which streams from S3 via server
          url = `/api/media/image/${encodeURIComponent(s3Key)}`;
        }

        return {
          url,
          s3Key,
          bucket: this.bucketName,
          originalName,
          mimeType,
          size: buffer.length,
        };
      } catch (err: any) {
        console.error(`[S3Service] Upload to S3 failed: ${err.message}. Falling back to local store.`);
      }
    }

    // Local filesystem storage fallback (resilient when S3 bucket is not yet provisioned in dev/test)
    const localDir = path.resolve(process.cwd(), 'public', 'uploads', folderPrefix);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    const filename = `${randomUuid}${ext}`;
    const localFilePath = path.join(localDir, filename);
    fs.writeFileSync(localFilePath, buffer);

    const localUrl = `/uploads/${folderPrefix}/${filename}`;

    return {
      url: localUrl,
      s3Key,
      bucket: 'local-store',
      originalName,
      mimeType,
      size: buffer.length,
    };
  }

  /**
   * Generates a time-limited presigned GET URL for an S3 object.
   */
  public async getPresignedUrl(s3Key: string, expiresInSeconds: number = 3600): Promise<string> {
    if (!this.isConfigured || !this.s3Client) {
      // Local fallback URL
      if (s3Key.startsWith('questions/')) {
        const parts = s3Key.split('/');
        return `/uploads/questions/${parts[parts.length - 1]}`;
      }
      return `/api/media/image/${encodeURIComponent(s3Key)}`;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Stream S3 object to an Express response or return buffer.
   */
  public async getObjectStream(s3Key: string) {
    if (!this.isConfigured || !this.s3Client) {
      // Check local uploads
      const localFilePath = path.resolve(process.cwd(), 'public', 'uploads', s3Key);
      if (fs.existsSync(localFilePath)) {
        return {
          stream: fs.createReadStream(localFilePath),
          contentType: this.guessMimeType(localFilePath),
          contentLength: fs.statSync(localFilePath).size,
        };
      }
      return null;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      const response = await this.s3Client.send(command);
      return {
        stream: response.Body as any,
        contentType: response.ContentType || 'image/png',
        contentLength: response.ContentLength,
      };
    } catch (err: any) {
      console.warn(`[S3Service] Could not retrieve S3 object '${s3Key}':`, err.message);
      return null;
    }
  }

  /**
   * Delete an image from AWS S3 or local fallback.
   */
  public async deleteImage(s3Key: string): Promise<boolean> {
    if (!s3Key) return false;

    if (this.isConfigured && this.s3Client) {
      try {
        const command = new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: s3Key,
        });
        await this.s3Client.send(command);
        return true;
      } catch (err: any) {
        console.warn(`[S3Service] Failed to delete S3 object '${s3Key}':`, err.message);
      }
    }

    // Try deleting from local fallback
    try {
      const localFilePath = path.resolve(process.cwd(), 'public', 'uploads', s3Key);
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
        return true;
      }
    } catch (_) {}

    return true;
  }

  private guessMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      case '.svg':
        return 'image/svg+xml';
      default:
        return 'application/octet-stream';
    }
  }
}

export const s3Service = new S3Service();
