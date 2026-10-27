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

  public reconfigure(): void {
    this.init();
  }

  private init() {
    const isProduction = process.env.NODE_ENV === 'production';
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
        this.s3Client = null;
        this.isConfigured = false;
        if (isProduction) {
          console.error(`[S3Service] CRITICAL: Failed to initialize AWS S3 client in production: ${err.message}. Image uploads will be rejected.`);
        } else {
          console.warn(`[S3Service] Failed to initialize AWS S3 client: ${err.message}. Falling back to local media store.`);
        }
      }
    } else {
      this.s3Client = null;
      this.isConfigured = false;
      if (isProduction) {
        const missing: string[] = [];
        if (!accessKeyId) missing.push('AWS_ACCESS_KEY_ID');
        if (!secretAccessKey) missing.push('AWS_SECRET_ACCESS_KEY');
        if (!bucket) missing.push('AWS_S3_BUCKET');
        console.warn(`[S3Service] WARNING: Persistent S3 storage is not configured in production (missing: ${missing.join(', ')}). Image uploads will be rejected until S3 configuration is provided.`);
      } else {
        console.log(`[S3Service] AWS S3 credentials not fully configured in environment. Local media store active for offline/preview resilience.`);
      }
    }
  }

  public getStatus() {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
      isConfigured: this.isConfigured,
      storageDriver: this.isConfigured ? 's3' : (isProduction ? 'disabled' : 'local-filesystem'),
      bucket: this.bucketName || (isProduction ? 'unconfigured' : 'local-fallback'),
      region: process.env.AWS_REGION || 'us-east-1',
      mode: isProduction ? 'production' : 'development',
    };
  }

  /**
   * Validates storage readiness before accepting uploads.
   * In production, persistent S3 storage must be configured and active.
   * Throws an actionable error if production storage requirements are not met.
   */
  public validateStorageReadiness(): void {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && (!this.isConfigured || !this.s3Client)) {
      const missing: string[] = [];
      if (!process.env.AWS_ACCESS_KEY_ID?.trim()) missing.push('AWS_ACCESS_KEY_ID');
      if (!process.env.AWS_SECRET_ACCESS_KEY?.trim()) missing.push('AWS_SECRET_ACCESS_KEY');
      if (!process.env.AWS_S3_BUCKET?.trim()) missing.push('AWS_S3_BUCKET');

      const details = missing.length > 0 ? ` Missing required configuration: ${missing.join(', ')}.` : '';
      throw new Error(
        `Persistent image storage (AWS S3) is not available or properly configured in production.${details} Local filesystem storage fallback is disabled in production.`
      );
    }
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
   * Upload image to AWS S3.
   * In production: Requires persistent S3 storage; rejects upload if S3 fails or is not configured.
   * In development: Falls back to local filesystem storage if S3 is not configured.
   */
  public async uploadImage(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folderPrefix: string = 'questions'
  ): Promise<S3UploadResult> {
    this.validateImage(buffer, mimeType, originalName);
    this.validateStorageReadiness();

    // Sanitize extension and filename
    const ext = path.extname(originalName).toLowerCase() || '.png';
    const randomUuid = crypto.randomUUID();
    const s3Key = `${folderPrefix}/${randomUuid}${ext}`;

    const isProduction = process.env.NODE_ENV === 'production';

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
        if (isProduction) {
          console.error(`[S3Service] Upload to S3 failed in production: ${err.message}`);
          throw new Error(`Failed to upload image to persistent storage (AWS S3): ${err.message || 'Unknown S3 error'}`);
        }
        console.warn(`[S3Service] Upload to S3 failed in development: ${err.message}. Falling back to local store.`);
      }
    }

    // Local filesystem storage fallback (ALLOWED ONLY IN DEVELOPMENT/TESTING)
    if (isProduction) {
      throw new Error(
        'Persistent image storage (AWS S3) is not available. Local filesystem storage fallback is strictly disabled in production.'
      );
    }

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
   * Safely resolves and validates a key against the permitted local uploads directory.
   * Returns the canonical absolute path if valid, or null if the key attempts path traversal
   * or points outside the permitted uploads directory.
   */
  public getSafeLocalPath(key: string): string | null {
    if (!key || typeof key !== 'string') {
      return null;
    }

    // Repeatedly decode URL-encoded components to neutralize double/nested encoding
    let decodedKey = key;
    try {
      let previous = '';
      let iterations = 0;
      while (decodedKey !== previous && iterations < 5) {
        previous = decodedKey;
        if (decodedKey.includes('%')) {
          decodedKey = decodeURIComponent(decodedKey);
        }
        iterations++;
      }
    } catch {
      // Malformed URI encoding
      return null;
    }

    // Disallow null bytes
    if (decodedKey.includes('\0') || decodedKey.includes('\x00')) {
      return null;
    }

    // Normalize slashes
    const sanitizedKey = decodedKey.replace(/\\/g, '/').trim();

    // Disallow absolute paths (POSIX / or Windows C: or \\)
    if (
      path.isAbsolute(sanitizedKey) ||
      path.isAbsolute(decodedKey) ||
      /^[a-zA-Z]:/.test(sanitizedKey) ||
      sanitizedKey.startsWith('/') ||
      sanitizedKey.startsWith('\\')
    ) {
      return null;
    }

    // Disallow referencing the root directory itself or trailing directory slashes
    if (sanitizedKey === '' || sanitizedKey === '.' || sanitizedKey.endsWith('/')) {
      return null;
    }

    const permittedBase = path.resolve(process.cwd(), 'public', 'uploads');
    const targetPath = path.resolve(permittedBase, sanitizedKey);

    // 1. Path relative check: Target must reside strictly within permittedBase and not be base itself
    const relative = path.relative(permittedBase, targetPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return null;
    }

    // 2. Strict prefix check with path.sep (case-insensitive for Windows filesystem)
    const normalizedBase = path.normalize(permittedBase).toLowerCase() + path.sep;
    const normalizedTarget = path.normalize(targetPath).toLowerCase();

    if (!normalizedTarget.startsWith(normalizedBase)) {
      return null;
    }

    // 3. Symlink canonical validation and directory check if file exists
    if (fs.existsSync(targetPath)) {
      try {
        if (fs.statSync(targetPath).isDirectory()) {
          return null;
        }

        const realTargetPath = fs.realpathSync(targetPath);
        const realBaseDir = fs.existsSync(permittedBase) ? fs.realpathSync(permittedBase) : permittedBase;
        const realBaseNormalized = path.normalize(realBaseDir).toLowerCase() + path.sep;
        const realTargetNormalized = path.normalize(realTargetPath).toLowerCase();

        if (!realTargetNormalized.startsWith(realBaseNormalized)) {
          return null;
        }
      } catch {
        return null;
      }
    }

    return targetPath;
  }

  /**
   * Validates whether an image key is safe and stays strictly within the permitted uploads hierarchy.
   */
  public isSafeKey(key: string): boolean {
    if (!key || typeof key !== 'string') {
      return false;
    }
    return this.getSafeLocalPath(key) !== null;
  }

  /**
   * Generates a time-limited presigned GET URL for an S3 object.
   */
  public async getPresignedUrl(s3Key: string, expiresInSeconds: number = 3600): Promise<string> {
    if (!this.isSafeKey(s3Key)) {
      throw new Error('Invalid or unsafe image key.');
    }

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
    if (!this.isSafeKey(s3Key)) {
      return null;
    }

    if (this.isConfigured && this.s3Client) {
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
      }
    }

    // Check local uploads (preserves legacy/existing image compatibility)
    const localFilePath = this.getSafeLocalPath(s3Key);
    if (localFilePath && fs.existsSync(localFilePath) && !fs.statSync(localFilePath).isDirectory()) {
      return {
        stream: fs.createReadStream(localFilePath),
        contentType: this.guessMimeType(localFilePath),
        contentLength: fs.statSync(localFilePath).size,
      };
    }
    return null;
  }

  /**
   * Delete an image from AWS S3 or local fallback.
   */
  public async deleteImage(s3Key: string): Promise<boolean> {
    if (!s3Key || !this.isSafeKey(s3Key)) return false;

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
      const localFilePath = this.getSafeLocalPath(s3Key);
      if (localFilePath && fs.existsSync(localFilePath) && !fs.statSync(localFilePath).isDirectory()) {
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
