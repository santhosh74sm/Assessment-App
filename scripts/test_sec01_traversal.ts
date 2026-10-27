import path from 'path';
import fs from 'fs';
import { s3Service } from '../backend/services/s3Service.ts';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failedCount++;
  }
}

async function runSec01Tests() {
  console.log('=== Starting SEC-01 Path Traversal Automated Test Suite ===\n');

  // Setup: create a test image in permitted directory
  const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads', 'questions');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const testImageName = 'sec_test_valid_image.png';
  const testImageFilePath = path.join(uploadsDir, testImageName);
  const testImageContent = Buffer.from('fake-valid-png-content');
  fs.writeFileSync(testImageFilePath, testImageContent);

  // Setup: create a sensitive dummy file OUTSIDE uploads in project root
  const dummySensitiveFile = path.resolve(process.cwd(), 'dummy_secret_outside.txt');
  fs.writeFileSync(dummySensitiveFile, 'SENSITIVE_DATA_SHOULD_NEVER_BE_READ');

  try {
    // -------------------------------------------------------------
    // Test 1: Normal Valid Image Access
    // -------------------------------------------------------------
    console.log('--- Test Suite 1: Normal Valid Image Access ---');
    const validKey = `questions/${testImageName}`;
    assert(s3Service.isSafeKey(validKey), 'isSafeKey accepts legitimate key: questions/sec_test_valid_image.png');

    const validStream = await s3Service.getObjectStream(validKey);
    assert(validStream !== null && validStream.stream !== null, 'getObjectStream returns stream for valid image');
    assert(validStream?.contentType === 'image/png', 'MIME type is detected correctly');
    assert(validStream?.contentLength === testImageContent.length, 'Content length matches expected file size');

    // Fully consume stream to close handle cleanly
    if (validStream?.stream) {
      await new Promise<void>((resolve) => {
        validStream.stream.on('data', () => {});
        validStream.stream.on('end', () => resolve());
        validStream.stream.on('error', () => resolve());
      });
    }

    // -------------------------------------------------------------
    // Test 2: Direct '../' Path Traversal Attempts
    // -------------------------------------------------------------
    console.log('\n--- Test Suite 2: Direct ../ Path Traversal Attempts ---');
    const traversalKeys = [
      '../../dummy_secret_outside.txt',
      'questions/../../dummy_secret_outside.txt',
      '../../../package.json',
      '../../.env',
      'questions/../../../server.ts',
      '..\\..\\dummy_secret_outside.txt',
      'questions\\..\\..\\dummy_secret_outside.txt',
    ];

    for (const key of traversalKeys) {
      assert(!s3Service.isSafeKey(key), `isSafeKey rejects traversal: "${key}"`);
      const stream = await s3Service.getObjectStream(key);
      assert(stream === null, `getObjectStream returns null for: "${key}"`);
    }

    // -------------------------------------------------------------
    // Test 3: URL-Encoded & Double-Encoded Traversal Attempts
    // -------------------------------------------------------------
    console.log('\n--- Test Suite 3: URL-Encoded & Double-Encoded Traversal Attempts ---');
    const encodedKeys = [
      '%2e%2e%2fdummy_secret_outside.txt',
      '%2e%2e%2f%2e%2e%2fdummy_secret_outside.txt',
      'questions%2f%2e%2e%2f%2e%2e%2fdummy_secret_outside.txt',
      '..%2f..%2fdummy_secret_outside.txt',
      '..%5c..%5cdummy_secret_outside.txt',
      '%252e%252e%252fdummy_secret_outside.txt', // Double-encoded ../
      '%252e%252e%252f%252e%252e%252fdummy_secret_outside.txt',
    ];

    for (const key of encodedKeys) {
      assert(!s3Service.isSafeKey(key), `isSafeKey rejects encoded traversal: "${key}"`);
      const stream = await s3Service.getObjectStream(key);
      assert(stream === null, `getObjectStream returns null for encoded traversal: "${key}"`);
    }

    // -------------------------------------------------------------
    // Test 4: Absolute Paths & UNC Paths
    // -------------------------------------------------------------
    console.log('\n--- Test Suite 4: Absolute Paths & UNC Paths ---');
    const absoluteKeys = [
      '/etc/passwd',
      '/var/log/syslog',
      'C:\\Windows\\win.ini',
      'c:/windows/system32/drivers/etc/hosts',
      '\\\\attacker-share\\loot\\img.png',
      '//attacker-share/loot/img.png',
    ];

    for (const key of absoluteKeys) {
      assert(!s3Service.isSafeKey(key), `isSafeKey rejects absolute/UNC path: "${key}"`);
      const stream = await s3Service.getObjectStream(key);
      assert(stream === null, `getObjectStream returns null for absolute/UNC path: "${key}"`);
    }

    // -------------------------------------------------------------
    // Test 5: Null Byte & Directory Traversal Attempts
    // -------------------------------------------------------------
    console.log('\n--- Test Suite 5: Null Byte Injections & Directory Attacks ---');
    const nullByteKeys = [
      'questions/valid.png\0../../package.json',
      'questions/valid.png\x00../../package.json',
    ];

    for (const key of nullByteKeys) {
      assert(!s3Service.isSafeKey(key), `isSafeKey rejects null-byte path: "${key.replace(/\0|\x00/g, '\\0')}"`);
      const stream = await s3Service.getObjectStream(key);
      assert(stream === null, 'getObjectStream returns null for null-byte path');
    }

    // Directory read attempt (cannot stream a directory)
    assert(!s3Service.isSafeKey('.'), 'isSafeKey rejects "."');
    const dirStream = await s3Service.getObjectStream('questions');
    assert(dirStream === null, 'getObjectStream returns null when pointing to directory "questions"');

    // -------------------------------------------------------------
    // Test 6: Unauthorized File Deletion Attempts
    // -------------------------------------------------------------
    console.log('\n--- Test Suite 6: Unauthorized File Deletion Attempts ---');
    // Ensure sensitive file exists before test
    assert(fs.existsSync(dummySensitiveFile), 'Sensitive file exists before deletion attempt');

    // Attempt to delete file outside permitted directory
    const deleteAttempt1 = await s3Service.deleteImage('../../dummy_secret_outside.txt');
    assert(deleteAttempt1 === false, 'deleteImage returns false for traversal attempt ../../dummy_secret_outside.txt');
    assert(fs.existsSync(dummySensitiveFile), 'Sensitive file remains intact after traversal delete attempt');

    const deleteAttempt2 = await s3Service.deleteImage('%2e%2e%2f%2e%2e%2fdummy_secret_outside.txt');
    assert(deleteAttempt2 === false, 'deleteImage returns false for encoded traversal delete attempt');
    assert(fs.existsSync(dummySensitiveFile), 'Sensitive file remains intact after encoded traversal delete attempt');

    // Legitimate file deletion within uploads directory must succeed
    const legitimateDelete = await s3Service.deleteImage(`questions/${testImageName}`);
    assert(legitimateDelete === true, 'deleteImage returns true for valid file in uploads directory');
    assert(!fs.existsSync(testImageFilePath), 'Valid test image was successfully unlinked');

    // -------------------------------------------------------------
    // Test 7: S3 Behavior & Presigned URL Validation
    // -------------------------------------------------------------
    console.log('\n--- Test Suite 7: S3 Behavior & Presigned URL Validation ---');
    let presignedErrorCaught = false;
    try {
      await s3Service.getPresignedUrl('../../secret.txt');
    } catch (err: any) {
      presignedErrorCaught = true;
    }
    assert(presignedErrorCaught, 'getPresignedUrl throws error for traversal key');

    // Legitimate presigned URL for safe key
    const safePresigned = await s3Service.getPresignedUrl('questions/legit_image.png');
    assert(Boolean(safePresigned) && safePresigned.includes('legit_image.png'), 'getPresignedUrl returns valid URL for safe key');

    // Legitimate uploadImage workflow
    const uploadResult = await s3Service.uploadImage(
      Buffer.from('png-upload-test-bytes'),
      'my_avatar.png',
      'image/png',
      'questions'
    );
    assert(Boolean(uploadResult.s3Key) && s3Service.isSafeKey(uploadResult.s3Key), 'uploadImage generates valid safe key');
    assert(uploadResult.url.includes('/uploads/questions/'), 'uploadImage produces valid URL');

    // Clean up uploaded test artifact
    await s3Service.deleteImage(uploadResult.s3Key);

  } finally {
    // Cleanup temporary files
    if (fs.existsSync(testImageFilePath)) {
      try { fs.unlinkSync(testImageFilePath); } catch (_) {}
    }
    if (fs.existsSync(dummySensitiveFile)) {
      try { fs.unlinkSync(dummySensitiveFile); } catch (_) {}
    }
  }

  console.log(`\n=== SEC-01 Test Suite Complete: ${passedCount} PASS, ${failedCount} FAIL ===`);
  if (failedCount > 0) {
    process.exit(1);
  }
}

runSec01Tests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
