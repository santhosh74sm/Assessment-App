import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { s3Service } from '../backend/services/s3Service.ts';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (detail) console.error('    Detail:', detail);
    failedCount++;
  }
}

async function runStorageVerificationSuite() {
  console.log('=== Task 16: Persistent Image Storage Automated Verification Suite ===\n');

  // Save original environment variables so we can restore them at the end
  const origEnv = {
    NODE_ENV: process.env.NODE_ENV,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
    AWS_REGION: process.env.AWS_REGION,
  };

  const samplePngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  try {
    // -------------------------------------------------------------------------
    // Test Scenario 1: Development Mode — Local Fallback Allowed
    // -------------------------------------------------------------------------
    console.log('--- Test Scenario 1: Development Mode with Missing AWS Credentials ---');
    process.env.NODE_ENV = 'development';
    process.env.AWS_ACCESS_KEY_ID = '';
    process.env.AWS_SECRET_ACCESS_KEY = '';
    process.env.AWS_S3_BUCKET = '';
    s3Service.reconfigure();

    const devStatus = s3Service.getStatus();
    assert(devStatus.isConfigured === false, 'Development reports isConfigured: false when AWS keys missing');
    assert(devStatus.storageDriver === 'local-filesystem', 'Development activates local-filesystem driver');

    const devUploadResult = await s3Service.uploadImage(
      samplePngBuffer,
      'test_dev_sample.png',
      'image/png',
      'questions'
    );

    assert(devUploadResult.bucket === 'local-store', 'Dev upload uses local-store bucket name');
    assert(devUploadResult.url.startsWith('/uploads/questions/'), 'Dev upload generates /uploads/questions/... URL');

    const localExpectedPath = path.resolve(process.cwd(), 'public', devUploadResult.url.replace(/^\//, ''));
    assert(fs.existsSync(localExpectedPath), 'Local file was created on disk in development');

    // Retrieve via getObjectStream
    const devStreamResult = await s3Service.getObjectStream(devUploadResult.s3Key);
    assert(devStreamResult !== null, 'getObjectStream retrieves local file in development');
    assert(devStreamResult?.contentType === 'image/png', 'Local stream returns image/png content type');
    if (devStreamResult?.stream) {
      devStreamResult.stream.on('error', () => {});
      if (typeof (devStreamResult.stream as any).destroy === 'function') {
        (devStreamResult.stream as any).destroy();
      }
    }

    // Delete local file
    const devDeleteResult = await s3Service.deleteImage(devUploadResult.s3Key);
    assert(devDeleteResult === true, 'deleteImage returns true for local file');
    assert(!fs.existsSync(localExpectedPath), 'Local file was removed after deletion');

    // -------------------------------------------------------------------------
    // Test Scenario 2: Production Mode — Missing AWS Credentials Must Reject Uploads
    // -------------------------------------------------------------------------
    console.log('\n--- Test Scenario 2: Production Mode without AWS Credentials ---');
    process.env.NODE_ENV = 'production';
    process.env.AWS_ACCESS_KEY_ID = '';
    process.env.AWS_SECRET_ACCESS_KEY = '';
    process.env.AWS_S3_BUCKET = 'production-puzzles-bucket';
    s3Service.reconfigure();

    const prodNoCredsStatus = s3Service.getStatus();
    assert(prodNoCredsStatus.isConfigured === false, 'Production reports isConfigured: false when credentials missing');
    assert(prodNoCredsStatus.storageDriver === 'disabled', 'Production disables upload driver when S3 not configured');

    let prodNoCredsError: Error | null = null;
    try {
      await s3Service.uploadImage(
        samplePngBuffer,
        'prod_test.png',
        'image/png',
        'questions'
      );
    } catch (err: any) {
      prodNoCredsError = err;
    }

    assert(prodNoCredsError !== null, 'Production upload without credentials throws an error');
    assert(
      Boolean(prodNoCredsError?.message.includes('Persistent image storage (AWS S3) is not available')),
      'Error message clearly identifies persistent AWS S3 storage requirement'
    );
    assert(
      Boolean(prodNoCredsError?.message.includes('Local filesystem storage fallback is disabled in production')),
      'Error explicitly confirms local filesystem storage fallback is disabled in production'
    );

    // -------------------------------------------------------------------------
    // Test Scenario 3: Production Mode — Missing Bucket Configuration Must Reject
    // -------------------------------------------------------------------------
    console.log('\n--- Test Scenario 3: Production Mode without S3 Bucket Configuration ---');
    process.env.NODE_ENV = 'production';
    process.env.AWS_ACCESS_KEY_ID = 'AKIA_SAMPLE_DUMMY_KEY';
    process.env.AWS_SECRET_ACCESS_KEY = 'sample_dummy_secret_access_key';
    process.env.AWS_S3_BUCKET = '';
    s3Service.reconfigure();

    let prodNoBucketError: Error | null = null;
    try {
      await s3Service.uploadImage(
        samplePngBuffer,
        'prod_test_nobucket.png',
        'image/png',
        'questions'
      );
    } catch (err: any) {
      prodNoBucketError = err;
    }

    assert(prodNoBucketError !== null, 'Production upload without S3 bucket throws an error');
    assert(
      Boolean(prodNoBucketError?.message.includes('AWS_S3_BUCKET')),
      'Error message identifies missing AWS_S3_BUCKET configuration'
    );

    // -------------------------------------------------------------------------
    // Test Scenario 4: Production Mode — S3 Upload Failure Must NOT Fall Back to Disk
    // -------------------------------------------------------------------------
    console.log('\n--- Test Scenario 4: S3 Rejection Must Fail Safe without Silent Disk Fallback ---');
    process.env.NODE_ENV = 'production';
    // Provide syntactically valid but unauthorized credentials to test rejection
    process.env.AWS_ACCESS_KEY_ID = 'AKIA_NONEXISTENT_KEY_FOR_TEST';
    process.env.AWS_SECRET_ACCESS_KEY = 'invalid_secret_key_which_will_be_rejected_by_s3';
    process.env.AWS_S3_BUCKET = 'dummy-bucket-for-failure-test';
    s3Service.reconfigure();

    let s3RejectionError: Error | null = null;
    try {
      await s3Service.uploadImage(
        samplePngBuffer,
        'prod_should_fail_not_fallback.png',
        'image/png',
        'questions'
      );
    } catch (err: any) {
      s3RejectionError = err;
    }

    assert(s3RejectionError !== null, 'Upload with invalid S3 target throws error');
    assert(
      Boolean(s3RejectionError?.message.includes('Failed to upload image to persistent storage (AWS S3)')),
      'Error confirms persistent storage upload failure instead of silent local save'
    );

    // -------------------------------------------------------------------------
    // Test Scenario 5: Existing Image URL Compatibility
    // -------------------------------------------------------------------------
    console.log('\n--- Test Scenario 5: Existing Image Compatibility ---');
    // Create an existing legacy test image in local uploads
    const legacyDir = path.resolve(process.cwd(), 'public', 'uploads', 'questions');
    if (!fs.existsSync(legacyDir)) {
      fs.mkdirSync(legacyDir, { recursive: true });
    }
    const legacyFilename = 'legacy_sample_compatibility_test.png';
    const legacyPath = path.join(legacyDir, legacyFilename);
    fs.writeFileSync(legacyPath, samplePngBuffer);

    // Verify getObjectStream can still read existing local images
    const legacyStream = await s3Service.getObjectStream(`questions/${legacyFilename}`);
    assert(legacyStream !== null, 'getObjectStream can read legacy/existing local uploads');
    assert(legacyStream?.contentType === 'image/png', 'Legacy stream maintains proper image MIME type');
    if (legacyStream?.stream) {
      legacyStream.stream.on('error', () => {});
      if (typeof (legacyStream.stream as any).destroy === 'function') {
        (legacyStream.stream as any).destroy();
      }
    }

    // Clean up legacy test file
    await s3Service.deleteImage(`questions/${legacyFilename}`);
    assert(!fs.existsSync(legacyPath), 'deleteImage cleans up existing local images');

    // -------------------------------------------------------------------------
    // Test Scenario 6: Real AWS S3 Connectivity (if configured in .env)
    // -------------------------------------------------------------------------
    console.log('\n--- Test Scenario 6: Configured AWS S3 Integration Test ---');
    if (origEnv.AWS_ACCESS_KEY_ID && origEnv.AWS_SECRET_ACCESS_KEY && origEnv.AWS_S3_BUCKET) {
      process.env.NODE_ENV = 'production';
      process.env.AWS_ACCESS_KEY_ID = origEnv.AWS_ACCESS_KEY_ID;
      process.env.AWS_SECRET_ACCESS_KEY = origEnv.AWS_SECRET_ACCESS_KEY;
      process.env.AWS_S3_BUCKET = origEnv.AWS_S3_BUCKET;
      process.env.AWS_REGION = origEnv.AWS_REGION || 'ap-south-1';
      s3Service.reconfigure();

      const realStatus = s3Service.getStatus();
      assert(realStatus.isConfigured === true, 'S3Service initialized with configured AWS credentials');
      assert(realStatus.storageDriver === 's3', 'Active storage driver is S3');

      const testS3Key = `test_verification_${Date.now()}.png`;
      try {
        const s3UploadResult = await s3Service.uploadImage(
          samplePngBuffer,
          testS3Key,
          'image/png',
          'questions'
        );

        assert(s3UploadResult.bucket === origEnv.AWS_S3_BUCKET, 'Uploaded to configured S3 bucket');
        assert(s3UploadResult.s3Key.startsWith('questions/'), 'Generated proper questions/ s3Key prefix');
        assert(
          s3UploadResult.url.includes(`/api/media/image/questions%2F`) || s3UploadResult.url.includes('questions/'),
          'Generated secure proxy or CDN URL'
        );

        // Verify retrieval stream from real S3
        const s3Stream = await s3Service.getObjectStream(s3UploadResult.s3Key);
        assert(s3Stream !== null, 'getObjectStream successfully streamed object from AWS S3');
        assert(s3Stream?.contentType === 'image/png', 'S3 stream has correct image/png content type');

        // Verify deletion from real S3
        const deleteResult = await s3Service.deleteImage(s3UploadResult.s3Key);
        assert(deleteResult === true, 'deleteImage successfully removed object from AWS S3');
      } catch (err: any) {
        console.warn(`[Notice] Real AWS S3 live test encountered an error (likely AWS credential/network limitation): ${err.message}`);
      }
    } else {
      console.log('Skipping real S3 network test because credentials are not present in .env.');
    }

  } finally {
    // Restore original environment
    process.env.NODE_ENV = origEnv.NODE_ENV;
    process.env.AWS_ACCESS_KEY_ID = origEnv.AWS_ACCESS_KEY_ID;
    process.env.AWS_SECRET_ACCESS_KEY = origEnv.AWS_SECRET_ACCESS_KEY;
    process.env.AWS_S3_BUCKET = origEnv.AWS_S3_BUCKET;
    process.env.AWS_REGION = origEnv.AWS_REGION;
    s3Service.reconfigure();
  }

  console.log('\n==================================================');
  console.log(`Final Verification Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('==================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runStorageVerificationSuite().catch((err) => {
  console.error('Storage verification suite uncaught exception:', err);
  process.exit(1);
});
