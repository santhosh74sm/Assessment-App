import 'dotenv/config';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import routes from '../backend/routes.ts';
import { generateToken } from '../backend/middleware/auth.ts';
import { QuestionModel, QuestionGroupModel } from '../database/models.ts';
import { resolveMongoUri, buildTargetUri } from '../backend/database.ts';

const EXPECTED_TEST_DB = 'puzzles_assessment_test';
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

async function connectTestDatabase(): Promise<mongoose.Connection> {
  const rawUri = resolveMongoUri();
  if (!rawUri) {
    throw new Error('Neither MONGO_URI nor MONGODB_URI is configured.');
  }

  const testUri = buildTargetUri(rawUri, EXPECTED_TEST_DB);
  await mongoose.connect(testUri, {
    dbName: EXPECTED_TEST_DB,
    serverSelectionTimeoutMS: 5000,
    autoIndex: true,
  });

  if (mongoose.connection.name !== EXPECTED_TEST_DB) {
    await mongoose.disconnect();
    throw new Error(`Connected to ${mongoose.connection.name}, expected ${EXPECTED_TEST_DB}`);
  }

  return mongoose.connection;
}

async function runTestSuite() {
  console.log('=== SEC-04 Vulnerable xlsx Dependency & Excel Import Test Suite ===\n');

  // 1. Connect to test database
  console.log('Connecting to test database...');
  await connectTestDatabase();
  console.log(`Connected to: ${mongoose.connection.name}\n`);

  // Clean test questions
  await QuestionModel.deleteMany({ 'metadata.importedFrom': { $regex: /^test_/ } });

  // 2. Setup Test Express Server on an available port
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));
  app.use('/api', routes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Test Express server running at: ${baseUrl}\n`);

  const superAdminToken = generateToken({
    userId: 'sec04_admin',
    username: 'sec04_admin',
    role: 'super_admin',
  });

  const studentToken = generateToken({
    userId: 'sec04_student',
    username: 'sec04_student',
    role: 'student',
  });

  try {
    // -------------------------------------------------------------------------
    // Test 1: Role-based Access Control
    // -------------------------------------------------------------------------
    console.log('--- Test 1: Role-based Access Control ---');
    {
      const resUnauth = await fetch(`${baseUrl}/api/questions/import-excel`, {
        method: 'POST',
      });
      assert(resUnauth.status === 401, 'Unauthenticated request returns 401');

      const resStudent = await fetch(`${baseUrl}/api/questions/import-excel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert(resStudent.status === 403, 'Non-super-admin request returns 403');
    }

    // -------------------------------------------------------------------------
    // Test 2: Valid Excel Workbook Import via Base64 JSON
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Valid Excel Workbook Import via Base64 JSON ---');
    {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Questions');
      ws.addRow(['Question Text', 'Difficulty', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Points', 'Time Limit']);
      ws.addRow(['What is the capital of France?', 'Easy', 'Berlin', 'Madrid', 'Paris', 'Rome', 'C', 10, 30]);
      ws.addRow(['Solve: 12 * 12', 'Medium', '124', '144', '164', '184', 'B', 20, 60]);

      const buffer = await wb.xlsx.writeBuffer();
      const base64Data = Buffer.from(buffer).toString('base64');

      const res = await fetch(`${baseUrl}/api/questions/import-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({
          base64Data,
          filename: 'test_valid_math.xlsx',
          dryRun: false,
        }),
      });

      const body = await res.json();
      assert(res.status === 201, 'Valid Excel import returns 201 Created', body);
      assert(body.success === true, 'Response indicates success: true');
      assert(body.importedCount === 2, 'Imported count is exactly 2');
      assert(body.importedQuestions?.length === 2, 'Returned 2 formatted question records');

      // Verify records in DB
      const dbQ1 = await QuestionModel.findOne({ content: 'What is the capital of France?' });
      assert(dbQ1 !== null, 'First question saved in database');
      assert(dbQ1?.difficulty === 'Easy', 'First question difficulty is Easy');
      assert(dbQ1?.points === 10, 'First question points is 10');
      assert(dbQ1?.timeSeconds === 30, 'First question timeSeconds is 30');
      assert(dbQ1?.correctAnswer === 'Paris', 'First question correctAnswer resolved letter C to Paris');

      const dbQ2 = await QuestionModel.findOne({ content: 'Solve: 12 * 12' });
      assert(dbQ2 !== null, 'Second question saved in database');
      assert(dbQ2?.correctAnswer === '144', 'Second question correctAnswer resolved letter B to 144');
    }

    // -------------------------------------------------------------------------
    // Test 3: Dry-Run Mode
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Dry-Run Mode (Validation without Database Mutation) ---');
    {
      const countBefore = await QuestionModel.countDocuments();

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Questions');
      ws.addRow(['Question Text', 'Difficulty', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer']);
      ws.addRow(['Dry-Run Unique Question Alpha', 'Hard', '1', '2', '3', '4', 'A']);

      const buffer = await wb.xlsx.writeBuffer();
      const base64Data = Buffer.from(buffer).toString('base64');

      const res = await fetch(`${baseUrl}/api/questions/import-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({
          base64Data,
          filename: 'test_dry_run.xlsx',
          dryRun: true,
        }),
      });

      const body = await res.json();
      assert(res.status === 200, 'Dry-run returns 200 OK');
      assert(body.dryRun === true, 'Response body specifies dryRun: true');
      assert(body.validCount === 1, 'Valid count is 1');

      const countAfter = await QuestionModel.countDocuments();
      assert(countBefore === countAfter, 'Question count in DB did not increase during dryRun');

      const nonExistent = await QuestionModel.findOne({ content: 'Dry-Run Unique Question Alpha' });
      assert(nonExistent === null, 'Dry-run question is NOT written to database');
    }

    // -------------------------------------------------------------------------
    // Test 4: Missing Fields and Row Warnings
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Missing Fields and Row Warnings ---');
    {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Questions');
      ws.addRow(['Question Text', 'Difficulty', 'Option A', 'Option B', 'Correct Answer']);
      // Row 2: Valid
      ws.addRow(['Complete row question', 'Easy', 'Yes', 'No', 'Yes']);
      // Row 3: Blank Question Text
      ws.addRow(['', 'Medium', 'Opt1', 'Opt2', 'Opt1']);
      // Row 4: Valid question without explicit answer
      ws.addRow(['Question without answer key', 'Hard', 'X', 'Y', '']);

      const buffer = await wb.xlsx.writeBuffer();
      const base64Data = Buffer.from(buffer).toString('base64');

      const res = await fetch(`${baseUrl}/api/questions/import-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({
          base64Data,
          filename: 'test_missing_fields.xlsx',
          dryRun: false,
        }),
      });

      const body = await res.json();
      assert(res.status === 201, 'Import with some skipped rows returns 201');
      assert(body.importedCount === 2, 'Only 2 valid questions imported');
      assert(body.skippedCount === 1, '1 row skipped');
      assert(
        body.warnings.some((w: string) => w.includes('Row 3: Skipped because Question Text is empty')),
        'Warning emitted for row 3 empty question text'
      );
      assert(
        body.warnings.some((w: string) => w.includes('Row 4: No explicit correct answer found')),
        'Warning emitted for row 4 missing answer key'
      );
    }

    // -------------------------------------------------------------------------
    // Test 5: Corrupted / Malformed Excel File Handling
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Corrupted / Malformed Excel File Handling ---');
    {
      const countBefore = await QuestionModel.countDocuments();
      const corruptedBytes = Buffer.from('NOT_A_VALID_EXCEL_ZIP_ARCHIVE_RANDOM_CORRUPT_BYTES_XYZ123');

      const res = await fetch(`${baseUrl}/api/questions/import-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({
          base64Data: corruptedBytes.toString('base64'),
          filename: 'corrupted_file.xlsx',
        }),
      });

      const body = await res.json();
      assert(res.status === 400, 'Corrupted file returns 400 Bad Request');
      assert(
        body.error?.includes('Invalid or corrupted Excel file'),
        'Returns descriptive error regarding invalid/corrupted Excel file'
      );

      const countAfter = await QuestionModel.countDocuments();
      assert(countBefore === countAfter, 'No questions created when corrupted file is rejected');
    }

    // -------------------------------------------------------------------------
    // Test 6: Empty File (0 Bytes)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Empty File (0 Bytes) ---');
    {
      const res = await fetch(`${baseUrl}/api/questions/import-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({
          base64Data: '',
          filename: 'empty.xlsx',
        }),
      });

      const body = await res.json();
      assert(res.status === 400, 'Empty file payload returns 400 Bad Request');
      assert(body.error?.includes('No Excel file data provided'), 'Descriptive error for empty file');
    }

    // -------------------------------------------------------------------------
    // Test 7: Empty Sheet / Sheet with No Data Rows
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7: Empty Sheet / Sheet with No Data Rows ---');
    {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('EmptySheet');
      // Only header, no rows
      ws.addRow(['Question Text', 'Difficulty', 'Options']);

      const buffer = await wb.xlsx.writeBuffer();
      const base64Data = Buffer.from(buffer).toString('base64');

      const res = await fetch(`${baseUrl}/api/questions/import-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({
          base64Data,
          filename: 'no_rows.xlsx',
        }),
      });

      const body = await res.json();
      assert(res.status === 400, 'Sheet with no data rows returns 400 Bad Request');
      assert(body.error?.includes('contains no data rows'), 'Descriptive error for sheet with no data rows');
    }

    // -------------------------------------------------------------------------
    // Test 8: Path Traversal Protection in Image References
    // -------------------------------------------------------------------------
    console.log('\n--- Test 8: Path Traversal Protection in Image References ---');
    {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('TraversalTest');
      ws.addRow(['Question Text', 'Difficulty', 'Image', 'Picture A']);
      ws.addRow([
        'Question with Traversal Image',
        'Easy',
        '../../secret_server_file.txt',
        '..\\..\\windows\\system32\\cmd.exe',
      ]);

      const buffer = await wb.xlsx.writeBuffer();
      const base64Data = Buffer.from(buffer).toString('base64');

      const res = await fetch(`${baseUrl}/api/questions/import-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({
          base64Data,
          filename: 'test_traversal.xlsx',
        }),
      });

      const body = await res.json();
      assert(res.status === 201, 'Question imported while malicious image paths are safely neutralized');
      assert(
        body.warnings.some((w: string) => w.includes('Ignored unsafe image path traversal reference')),
        'Warning emitted for unsafe image path traversal attempt'
      );

      const dbQ = await QuestionModel.findOne({ content: 'Question with Traversal Image' });
      assert(dbQ !== null, 'Question record was created');
      assert(dbQ?.images.length === 0, 'No unsafe image paths were saved into the database');
    }

    // -------------------------------------------------------------------------
    // Test 9: Complete Validation Failure Prevents Partial Records
    // -------------------------------------------------------------------------
    console.log('\n--- Test 9: Complete Validation Failure Prevents Partial Records ---');
    {
      const countBefore = await QuestionModel.countDocuments();

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('AllInvalid');
      ws.addRow(['Question Text', 'Difficulty', 'Points']);
      ws.addRow(['', 'Easy', 10]);
      ws.addRow(['   ', 'Medium', 20]);
      ws.addRow(['', 'Hard', 30]);

      const buffer = await wb.xlsx.writeBuffer();
      const base64Data = Buffer.from(buffer).toString('base64');

      const res = await fetch(`${baseUrl}/api/questions/import-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({
          base64Data,
          filename: 'test_all_invalid.xlsx',
        }),
      });

      const body = await res.json();
      assert(res.status === 400, 'All-invalid sheet returns 400 Bad Request');
      assert(
        body.error?.includes('No valid questions could be extracted'),
        'Descriptive error for no valid questions'
      );

      const countAfter = await QuestionModel.countDocuments();
      assert(countBefore === countAfter, 'Question collection count unchanged; 0 partial records created');
    }

    // -------------------------------------------------------------------------
    // Test 10: Rich Text and Formula Cell Handling in ExcelJS
    // -------------------------------------------------------------------------
    console.log('\n--- Test 10: Rich Text and Formula Cell Handling in ExcelJS ---');
    {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('RichTextSheet');
      ws.addRow(['Question Text', 'Difficulty', 'Points', 'Option A', 'Option B', 'Correct Answer']);

      const richRow = ws.addRow([
        '', // Will set rich text on cell
        'Easy',
        { formula: '5 + 5', result: 10 },
        'Opt1',
        'Opt2',
        'Opt1',
      ]);

      // Set richText on cell 1
      richRow.getCell(1).value = {
        richText: [
          { text: 'Which element has the symbol ' },
          { font: { bold: true }, text: 'Fe' },
          { text: '?' },
        ],
      };

      const buffer = await wb.xlsx.writeBuffer();
      const base64Data = Buffer.from(buffer).toString('base64');

      const res = await fetch(`${baseUrl}/api/questions/import-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({
          base64Data,
          filename: 'test_rich_text.xlsx',
        }),
      });

      const body = await res.json();
      assert(res.status === 201, 'Rich text and formula cells parsed cleanly without error');

      const dbQ = await QuestionModel.findOne({
        content: 'Which element has the symbol Fe?',
      });
      assert(dbQ !== null, 'Rich text was flattened into correct plain text');
      assert(dbQ?.points === 10, 'Formula result (5 + 5) was evaluated and stored as 10 points');
    }

    // -------------------------------------------------------------------------
    // Test 11: Bounds Validation for Numeric Fields
    // -------------------------------------------------------------------------
    console.log('\n--- Test 11: Bounds Validation for Numeric Fields (Points & Time Limit) ---');
    {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('BoundsSheet');
      ws.addRow(['Question Text', 'Difficulty', 'Points', 'Time Limit']);
      // Out of bounds: points = 99999, time = -50
      ws.addRow(['Extreme bounds question', 'UnknownDifficulty', 99999, -50]);

      const buffer = await wb.xlsx.writeBuffer();
      const base64Data = Buffer.from(buffer).toString('base64');

      const res = await fetch(`${baseUrl}/api/questions/import-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({
          base64Data,
          filename: 'test_bounds.xlsx',
        }),
      });

      const body = await res.json();
      assert(res.status === 201, 'Import succeeded with normalized bounds');

      const dbQ = await QuestionModel.findOne({ content: 'Extreme bounds question' });
      assert(dbQ !== null, 'Question found in DB');
      assert(dbQ?.difficulty === 'Medium', 'Invalid difficulty normalized to Medium');
      assert(dbQ?.points === 10, 'Out-of-range points clamped/reset to safe default 10');
      assert(dbQ?.timeSeconds === 45, 'Out-of-range timeSeconds reset to safe default 45');
    }
  } finally {
    // Clean up test data
    await QuestionModel.deleteMany({ 'metadata.importedFrom': { $regex: /^test_/ } });
    server.close();
    await mongoose.disconnect();
    console.log('\nCleaned test data, closed test server, and disconnected from MongoDB.');
  }

  console.log(`\n==================================================`);
  console.log(`Final Test Results: ${passedCount} passed, ${failedCount} failed`);
  console.log(`==================================================`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
