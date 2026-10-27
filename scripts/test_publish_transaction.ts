import 'dotenv/config';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import routes from '../backend/routes.ts';
import { generateToken } from '../backend/middleware/auth.ts';
import {
  UserModel,
  SchoolModel,
  QuestionGroupModel,
  QuestionModel,
  PublishedTestModel,
  StudentTestAssignmentModel,
  PublishHistoryModel,
} from '../database/models.ts';
import { resolveMongoUri, buildTargetUri } from '../backend/database.ts';

process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

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
    serverSelectionTimeoutMS: 8000,
    autoIndex: true,
  });

  if (mongoose.connection.name !== EXPECTED_TEST_DB) {
    await mongoose.disconnect();
    throw new Error(`Connected to ${mongoose.connection.name}, expected ${EXPECTED_TEST_DB}`);
  }

  return mongoose.connection;
}

function makeRequest(
  serverUrl: string,
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const postData = body ? JSON.stringify(body) : '';

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (postData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData).toString();
    }

    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let parsed: any = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode || 0, headers: res.headers, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTestSuite() {
  console.log('=== Task 10: Publishing Transaction & Rollback Automated Test Suite ===\n');

  console.log('Connecting to test database...');
  await connectTestDatabase();
  console.log(`Connected to: ${mongoose.connection.name}`);

  // Clean any previous test artifacts
  await PublishedTestModel.deleteMany({ idempotencyKey: { $regex: /^tx-/ } });
  await StudentTestAssignmentModel.deleteMany({ publishName: { $regex: /^TX / } });
  await PublishHistoryModel.deleteMany({ publishName: { $regex: /^TX / } });
  await SchoolModel.deleteMany({ code: { $in: ['TX_SCH_01', 'TX_SCH_02'] } });
  await UserModel.deleteMany({ username: { $in: ['tx_superadmin', 'tx_schooladmin', 'tx_stu_01', 'tx_stu_02', 'tx_stu_03'] } });
  await QuestionGroupModel.deleteMany({ name: 'TX Test Group' });
  await QuestionModel.deleteMany({ 'metadata.testSuite': 'Task10_Tx' });

  // 1. Seed Synthetic Test Data
  console.log('Seeding synthetic fixtures in test database...');
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync('TxTest123!', salt);

  const schoolA = await SchoolModel.create({
    name: 'TX Academy A',
    code: 'TX_SCH_01',
    address: '100 Test St',
  });
  const schoolAId = schoolA._id.toString();

  const schoolB = await SchoolModel.create({
    name: 'TX Academy B',
    code: 'TX_SCH_02',
    address: '200 Test St',
  });
  const schoolBId = schoolB._id.toString();

  // Synthetic Super Admin
  const superAdmin = await UserModel.create({
    username: 'tx_superadmin',
    role: 'super_admin',
    passwordHash: hash,
    mustChangePassword: false,
  });

  // Synthetic School Admin for School B
  const schoolAdminB = await UserModel.create({
    username: 'tx_schooladmin',
    role: 'school_admin',
    schoolId: schoolBId,
    schoolName: 'TX Academy B',
    passwordHash: hash,
    mustChangePassword: false,
  });

  // Synthetic Students for School A
  const student1 = await UserModel.create({
    username: 'tx_stu_01',
    role: 'student',
    studentName: 'Alice Walker',
    uniqueStudentId: 'TX_STU_01',
    schoolAdmissionNumber: 'ADM-TX-01',
    schoolId: schoolAId,
    schoolName: 'TX Academy A',
    className: 'Class 5',
    section: 'A',
    passwordHash: hash,
    mustChangePassword: false,
  });

  const student2 = await UserModel.create({
    username: 'tx_stu_02',
    role: 'student',
    studentName: 'Bob Builder',
    uniqueStudentId: 'TX_STU_02',
    schoolAdmissionNumber: 'ADM-TX-02',
    schoolId: schoolAId,
    schoolName: 'TX Academy A',
    className: 'Class 5',
    section: 'A',
    passwordHash: hash,
    mustChangePassword: false,
  });

  // Synthetic Student for School B (for tenant isolation test)
  const studentB = await UserModel.create({
    username: 'tx_stu_03',
    role: 'student',
    studentName: 'Charlie Root',
    uniqueStudentId: 'TX_STU_03',
    schoolAdmissionNumber: 'ADM-TX-03',
    schoolId: schoolBId,
    schoolName: 'TX Academy B',
    className: 'Class 5',
    section: 'B',
    passwordHash: hash,
    mustChangePassword: false,
  });

  // Synthetic Question Group
  const qGroup = await QuestionGroupModel.create({
    name: 'TX Test Group',
    schoolId: schoolAId,
    createdBy: 'tx_superadmin',
  });

  // Synthetic Questions
  const q1 = await QuestionModel.create({
    groupId: qGroup._id.toString(),
    groupName: 'TX Test Group',
    difficulty: 'Easy',
    points: 10,
    timeSeconds: 60,
    content: 'TX Question 1 Content',
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    answerType: 'single',
    correctAnswer: 'Option A',
    metadata: { testSuite: 'Task10_Tx' },
  });

  const q2 = await QuestionModel.create({
    groupId: qGroup._id.toString(),
    groupName: 'TX Test Group',
    difficulty: 'Medium',
    points: 20,
    timeSeconds: 90,
    content: 'TX Question 2 Content',
    options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
    answerType: 'single',
    correctAnswer: 'Option 2',
    metadata: { testSuite: 'Task10_Tx' },
  });

  const questionIds = [q1._id.toString(), q2._id.toString()];

  // Auth tokens
  const superAdminToken = generateToken({
    userId: superAdmin._id.toString(),
    username: superAdmin.username,
    role: 'super_admin',
  });

  const schoolAdminToken = generateToken({
    userId: schoolAdminB._id.toString(),
    username: schoolAdminB.username,
    role: 'school_admin',
    schoolId: schoolBId,
    schoolName: 'TX Academy B',
  });

  // 2. Setup Test Express Server
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use('/api', routes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test Express server running at: ${baseUrl}\n`);

  const basePublishPayload = {
    publishName: 'TX Assessment Alpha',
    publishMode: 'Selected Questions',
    startDate: '2026-11-01',
    startTime: '10:00 AM',
    endDate: '2026-11-02',
    endTime: '05:00 PM',
    targets: [
      {
        schoolIds: [schoolAId],
        classes: ['Class 5'],
        sections: ['A'],
      },
    ],
    selectedQuestionIds: questionIds,
    shuffle: true,
  };

  // --------------------------------------------------------------------------
  // Scenario 1: Successful publishing creates consistent records
  // --------------------------------------------------------------------------
  console.log('--- Scenario 1: Successful Publishing & Record Consistency ---');
  {
    const key1 = 'tx-scen1-' + Date.now();
    const res = await makeRequest(baseUrl, 'POST', '/api/publish', basePublishPayload, {
      Authorization: `Bearer ${superAdminToken}`,
      'Idempotency-Key': key1,
    });

    assert(res.status === 201, 'Publishing returns 201 Created', res.body);
    assert(Boolean(res.body?.publishedTest?.id), 'Response includes publishedTest.id');
    assert(res.body?.assignedStudentCount === 2, 'Assigned student count is 2');
    assert(Boolean(res.body?.historyRecordId), 'Response includes historyRecordId');

    const publishedTestId = res.body?.publishedTest?.id;
    const pubDoc = await PublishedTestModel.findById(publishedTestId);
    assert(Boolean(pubDoc), 'PublishedTest document exists in database');
    assert(pubDoc?.publishState === 'COMPLETE', 'PublishedTest has publishState: COMPLETE');
    assert(pubDoc?.status === 'ACTIVE', 'PublishedTest has status: ACTIVE');

    const assignments = await StudentTestAssignmentModel.find({ publishedTestId });
    assert(assignments.length === 2, 'Exactly 2 StudentTestAssignment records created');
    assert(
      assignments.every((a) => a.status === 'NOT_STARTED'),
      'All assignments have status: NOT_STARTED'
    );
    assert(
      assignments.every((a) => a.publishedTestId === publishedTestId),
      'All assignments link to publishedTestId'
    );
    assert(
      assignments.some((a) => a.studentId === 'TX_STU_01') && assignments.some((a) => a.studentId === 'TX_STU_02'),
      'Assignments created for both Alice (TX_STU_01) and Bob (TX_STU_02)'
    );

    const history = await PublishHistoryModel.findOne({ publishId: publishedTestId });
    assert(Boolean(history), 'PublishHistory document exists in database');
    assert(history?.totalRecipients === 2, 'PublishHistory totalRecipients is 2');
    assert(history?.publishMode === 'Selected Questions', 'PublishHistory publishMode preserved');
  }

  // --------------------------------------------------------------------------
  // Scenario 2: Failure during assignment creation leaves no inconsistent partial records
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 2: Failure During Assignment Creation ---');
  {
    // 2A: Multi-Document Transaction Path
    const key2A = 'tx-scen2a-' + Date.now();
    const res2A = await makeRequest(baseUrl, 'POST', '/api/publish', {
      ...basePublishPayload,
      publishName: 'TX Fail Assignments (Tx Mode)',
    }, {
      Authorization: `Bearer ${superAdminToken}`,
      'Idempotency-Key': key2A,
      'X-Test-Fail-At': 'assignments',
    });

    assert(res2A.status === 500, 'Assignment failure returns 500 error');
    const pub2A = await PublishedTestModel.findOne({ idempotencyKey: key2A });
    assert(pub2A === null, 'Transaction rollback: PublishedTest document was rolled back (null)');
    const assignments2A = await StudentTestAssignmentModel.find({ publishName: 'TX Fail Assignments (Tx Mode)' });
    assert(assignments2A.length === 0, 'Transaction rollback: Zero assignments created');
    const history2A = await PublishHistoryModel.findOne({ publishName: 'TX Fail Assignments (Tx Mode)' });
    assert(history2A === null, 'Transaction rollback: PublishHistory is null');

    // 2B: Non-Transactional Compensatory Cleanup Path
    const key2B = 'tx-scen2b-' + Date.now();
    const res2B = await makeRequest(baseUrl, 'POST', '/api/publish', {
      ...basePublishPayload,
      publishName: 'TX Fail Assignments (NonTx Mode)',
    }, {
      Authorization: `Bearer ${superAdminToken}`,
      'Idempotency-Key': key2B,
      'X-Test-Disable-Transactions': 'true',
      'X-Test-Fail-At': 'assignments',
    });

    assert(res2B.status === 500, 'Non-transactional assignment failure returns 500 error');
    const assignments2B = await StudentTestAssignmentModel.find({ publishName: 'TX Fail Assignments (NonTx Mode)' });
    assert(assignments2B.length === 0, 'Compensatory cleanup: Zero partial assignments remain');
    const history2B = await PublishHistoryModel.findOne({ publishName: 'TX Fail Assignments (NonTx Mode)' });
    assert(history2B === null, 'Compensatory cleanup: PublishHistory is null');
  }

  // --------------------------------------------------------------------------
  // Scenario 3: Failure during PublishHistory creation is handled safely
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 3: Failure During PublishHistory Creation ---');
  {
    // 3A: Transaction Path
    const key3A = 'tx-scen3a-' + Date.now();
    const res3A = await makeRequest(baseUrl, 'POST', '/api/publish', {
      ...basePublishPayload,
      publishName: 'TX Fail History (Tx Mode)',
    }, {
      Authorization: `Bearer ${superAdminToken}`,
      'Idempotency-Key': key3A,
      'X-Test-Fail-At': 'history',
    });

    assert(res3A.status === 500, 'History failure returns 500 error');
    const pub3A = await PublishedTestModel.findOne({ idempotencyKey: key3A });
    assert(pub3A === null, 'Transaction rollback: PublishedTest rolled back (null)');
    const assignments3A = await StudentTestAssignmentModel.find({ publishName: 'TX Fail History (Tx Mode)' });
    assert(assignments3A.length === 0, 'Transaction rollback: Zero assignments remain in DB');
    const history3A = await PublishHistoryModel.findOne({ publishName: 'TX Fail History (Tx Mode)' });
    assert(history3A === null, 'Transaction rollback: PublishHistory is null');

    // 3B: Non-Transactional Compensatory Path
    const key3B = 'tx-scen3b-' + Date.now();
    const res3B = await makeRequest(baseUrl, 'POST', '/api/publish', {
      ...basePublishPayload,
      publishName: 'TX Fail History (NonTx Mode)',
    }, {
      Authorization: `Bearer ${superAdminToken}`,
      'Idempotency-Key': key3B,
      'X-Test-Disable-Transactions': 'true',
      'X-Test-Fail-At': 'history',
    });

    assert(res3B.status === 500, 'Non-transactional history failure returns 500 error');
    const assignments3B = await StudentTestAssignmentModel.find({ publishName: 'TX Fail History (NonTx Mode)' });
    assert(assignments3B.length === 0, 'Compensatory cleanup: Assignments removed');
    const history3B = await PublishHistoryModel.findOne({ publishName: 'TX Fail History (NonTx Mode)' });
    assert(history3B === null, 'Compensatory cleanup: History is null');
  }

  // --------------------------------------------------------------------------
  // Scenario 4: Transaction abort or rollback failures are logged and recoverable
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 4: Rollback Failures Logged and Recoverable ---');
  {
    // 4A: Transaction abort failure injection (verifies error logging without unhandled crash)
    const key4A = 'tx-scen4a-' + Date.now();
    const res4A = await makeRequest(baseUrl, 'POST', '/api/publish', {
      ...basePublishPayload,
      publishName: 'TX Abort Error Test',
    }, {
      Authorization: `Bearer ${superAdminToken}`,
      'Idempotency-Key': key4A,
      'X-Test-Fail-At': 'abort',
    });
    assert(res4A.status === 500, 'Abort failure injection returns clean 500 without crashing');

    // 4B: Non-transactional cleanup failure leaves FAILED state with metadata for recovery
    const key4B = 'tx-scen4b-' + Date.now();
    const res4B = await makeRequest(baseUrl, 'POST', '/api/publish', {
      ...basePublishPayload,
      publishName: 'TX Cleanup Incomplete Recovery Test',
    }, {
      Authorization: `Bearer ${superAdminToken}`,
      'Idempotency-Key': key4B,
      'X-Test-Disable-Transactions': 'true',
      'X-Test-Fail-At': 'cleanup_assignments',
    });

    assert(res4B.status === 500, 'Incomplete cleanup attempt returns 500');
    const failedPub = await PublishedTestModel.findOne({ idempotencyKey: key4B });
    assert(Boolean(failedPub), 'PublishedTest document preserved when cleanup cannot delete child records');
    assert(failedPub?.publishState === 'FAILED', 'PublishedTest marked with publishState: FAILED');
    assert(Boolean(failedPub?.failureReason), 'failureReason recorded on PublishedTest document');
    assert(Boolean(failedPub?.failedAt), 'failedAt timestamp recorded on PublishedTest document');

    // 4C: Verify RECOVERY on retry with the same Idempotency-Key
    console.log('  Testing recovery on retry with same Idempotency-Key...');
    const retryRes = await makeRequest(baseUrl, 'POST', '/api/publish', {
      ...basePublishPayload,
      publishName: 'TX Cleanup Incomplete Recovery Test',
    }, {
      Authorization: `Bearer ${superAdminToken}`,
      'Idempotency-Key': key4B,
    });

    assert(retryRes.status === 201, 'Retry after FAILED state repaired prior records and succeeded with 201');
    const repairedPub = await PublishedTestModel.findOne({ idempotencyKey: key4B });
    assert(repairedPub?.publishState === 'COMPLETE', 'Repaired PublishedTest is now COMPLETE');
    const repairedAssignments = await StudentTestAssignmentModel.find({ publishedTestId: String(repairedPub?._id) });
    assert(repairedAssignments.length === 2, 'Exactly 2 assignments exist after repair retry (no duplicates)');
  }

  // --------------------------------------------------------------------------
  // Scenario 5: Duplicate or concurrent publish requests do not create duplicate records
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 5: Duplicate & Concurrent Publish Requests ---');
  {
    // 5A: Idempotent replay of previously completed publish
    const key5A = 'tx-scen5a-' + Date.now();
    const initialRes = await makeRequest(baseUrl, 'POST', '/api/publish', {
      ...basePublishPayload,
      publishName: 'TX Idempotency Replay Test',
    }, {
      Authorization: `Bearer ${superAdminToken}`,
      'Idempotency-Key': key5A,
    });
    assert(initialRes.status === 201, 'Initial publish returns 201 Created');

    const replayRes = await makeRequest(baseUrl, 'POST', '/api/publish', {
      ...basePublishPayload,
      publishName: 'TX Idempotency Replay Test',
    }, {
      Authorization: `Bearer ${superAdminToken}`,
      'Idempotency-Key': key5A,
    });

    assert(replayRes.status === 200, 'Replay with same key returns 200 OK');
    assert(replayRes.body?.idempotentReplay === true, 'Response specifies idempotentReplay: true');
    assert(replayRes.body?.publishedTest?.id === initialRes.body?.publishedTest?.id, 'Replay returns identical publishedTest.id');

    // Verify DB count has not doubled
    const totalPubDocs = await PublishedTestModel.countDocuments({ idempotencyKey: key5A });
    assert(totalPubDocs === 1, 'Exactly 1 PublishedTest exists in database for this key');
    const totalAssignDocs = await StudentTestAssignmentModel.countDocuments({ publishedTestId: initialRes.body?.publishedTest?.id });
    assert(totalAssignDocs === 2, 'Exactly 2 assignments exist (not duplicated)');

    // 5B: Same Idempotency-Key with different payload rejected with 409
    const conflictRes = await makeRequest(baseUrl, 'POST', '/api/publish', {
      ...basePublishPayload,
      publishName: 'TX Completely Different Name',
    }, {
      Authorization: `Bearer ${superAdminToken}`,
      'Idempotency-Key': key5A,
    });
    assert(conflictRes.status === 409, 'Reusing key with different request payload rejected with 409 Conflict');
    assert(conflictRes.body?.error?.includes('already used for a different publication request'), 'Conflict error message matches specification');

    // 5C: Concurrent simultaneous publish requests with the same Idempotency-Key
    console.log('  Testing simultaneous concurrent publish requests...');
    const concurrentKey = 'tx-concurrent-' + Date.now();
    const concurrentPayload = {
      ...basePublishPayload,
      publishName: 'TX Concurrent Test',
    };

    const results = await Promise.all([
      makeRequest(baseUrl, 'POST', '/api/publish', concurrentPayload, {
        Authorization: `Bearer ${superAdminToken}`,
        'Idempotency-Key': concurrentKey,
      }),
      makeRequest(baseUrl, 'POST', '/api/publish', concurrentPayload, {
        Authorization: `Bearer ${superAdminToken}`,
        'Idempotency-Key': concurrentKey,
      }),
      makeRequest(baseUrl, 'POST', '/api/publish', concurrentPayload, {
        Authorization: `Bearer ${superAdminToken}`,
        'Idempotency-Key': concurrentKey,
      }),
    ]);

    const statuses = results.map((r) => r.status);
    console.log('  Concurrent request statuses:', statuses);
    // At least one must be 201, other concurrent requests are either 200 (idempotent replay) or 409 (in progress)
    assert(statuses.includes(201), 'At least one concurrent request succeeded with 201 Created');
    assert(
      statuses.every((s) => s === 201 || s === 200 || s === 409),
      'All concurrent requests safely resolved to 201, 200, or 409 (no 500 write conflicts)'
    );

    const concurrentPubs = await PublishedTestModel.find({ idempotencyKey: concurrentKey });
    assert(concurrentPubs.length === 1, 'Database contains exactly 1 PublishedTest document despite 3 concurrent requests');
    const concurrentAssignments = await StudentTestAssignmentModel.find({ publishedTestId: String(concurrentPubs[0]._id) });
    assert(concurrentAssignments.length === 2, 'Database contains exactly 2 assignments (1 per student, zero duplicates)');
    const concurrentHistories = await PublishHistoryModel.find({ publishId: String(concurrentPubs[0]._id) });
    assert(concurrentHistories.length === 1, 'Database contains exactly 1 PublishHistory record');
  }

  // --------------------------------------------------------------------------
  // Scenario 6: Retry behavior does not duplicate assignments or history entries
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 6: Retry Does Not Duplicate Assignments or History ---');
  {
    const retryKey = 'tx-scen6-' + Date.now();
    // Attempt 1: Injected failure
    const att1 = await makeRequest(baseUrl, 'POST', '/api/publish', {
      ...basePublishPayload,
      publishName: 'TX Retry Assessment',
    }, {
      Authorization: `Bearer ${superAdminToken}`,
      'Idempotency-Key': retryKey,
      'X-Test-Fail-At': 'assignments',
    });
    assert(att1.status === 500, 'Initial attempt failed as expected');

    // Attempt 2: Clean retry with same key
    const att2 = await makeRequest(baseUrl, 'POST', '/api/publish', {
      ...basePublishPayload,
      publishName: 'TX Retry Assessment',
    }, {
      Authorization: `Bearer ${superAdminToken}`,
      'Idempotency-Key': retryKey,
    });
    assert(att2.status === 201, 'Retry attempt succeeded with 201 Created');

    const pubId = att2.body?.publishedTest?.id;
    const assignments = await StudentTestAssignmentModel.find({ publishedTestId: pubId });
    assert(assignments.length === 2, 'Exactly 2 assignments exist (no duplicates from failed attempt)');
    const histories = await PublishHistoryModel.find({ publishId: pubId });
    assert(histories.length === 1, 'Exactly 1 history record exists');
  }

  // --------------------------------------------------------------------------
  // Scenario 7: Previously successful publish remains intact when later request fails
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 7: Previously Successful Publish Remains Intact ---');
  {
    // Step 1: Successful Publish A
    const key7A = 'tx-scen7a-' + Date.now();
    const res7A = await makeRequest(baseUrl, 'POST', '/api/publish', {
      ...basePublishPayload,
      publishName: 'TX First Successful Assessment',
    }, {
      Authorization: `Bearer ${superAdminToken}`,
      'Idempotency-Key': key7A,
    });
    assert(res7A.status === 201, 'Publish A succeeded with 201');
    const pubAId = res7A.body?.publishedTest?.id;

    // Verify initial state of Publish A
    const pubADocBefore = await PublishedTestModel.findById(pubAId);
    const assignACountBefore = await StudentTestAssignmentModel.countDocuments({ publishedTestId: pubAId });
    const histABefore = await PublishHistoryModel.findOne({ publishId: pubAId });
    assert(pubADocBefore?.publishState === 'COMPLETE', 'Publish A is COMPLETE');
    assert(assignACountBefore === 2, 'Publish A has 2 assignments');
    assert(Boolean(histABefore), 'Publish A has history record');

    // Step 2: Failed Publish B
    const key7B = 'tx-scen7b-' + Date.now();
    const res7B = await makeRequest(baseUrl, 'POST', '/api/publish', {
      ...basePublishPayload,
      publishName: 'TX Later Failed Assessment',
    }, {
      Authorization: `Bearer ${superAdminToken}`,
      'Idempotency-Key': key7B,
      'X-Test-Fail-At': 'assignments',
    });
    assert(res7B.status === 500, 'Publish B failed with 500');

    // Step 3: Verify Publish A is 100% UNTOUCHED
    const pubADocAfter = await PublishedTestModel.findById(pubAId);
    const assignACountAfter = await StudentTestAssignmentModel.countDocuments({ publishedTestId: pubAId });
    const histAAfter = await PublishHistoryModel.findOne({ publishId: pubAId });

    assert(Boolean(pubADocAfter), 'Publish A still exists');
    assert(pubADocAfter?.publishState === 'COMPLETE', 'Publish A still has publishState: COMPLETE');
    assert(pubADocAfter?.publishName === 'TX First Successful Assessment', 'Publish A name unchanged');
    assert(assignACountAfter === 2, 'Publish A assignments count unchanged (still 2)');
    assert(Boolean(histAAfter), 'Publish A history record still intact');
  }

  // --------------------------------------------------------------------------
  // Scenario 8: Tenant isolation & existing publish behavior remain unchanged
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 8: Tenant Isolation & Existing Publish Behavior ---');
  {
    // 8A: Role Authorization: School Admin is forbidden from calling /api/publish
    const key8A = 'tx-scen8a-' + Date.now();
    const res8A = await makeRequest(baseUrl, 'POST', '/api/publish', basePublishPayload, {
      Authorization: `Bearer ${schoolAdminToken}`,
      'Idempotency-Key': key8A,
    });
    assert(res8A.status === 403, 'School Admin forbidden from publishing (403)');

    // 8B: Tenant Targeting Isolation: Targeting School A does not touch School B students
    const key8B = 'tx-scen8b-' + Date.now();
    const res8B = await makeRequest(baseUrl, 'POST', '/api/publish', {
      ...basePublishPayload,
      publishName: 'TX Tenant Targeted Assessment',
    }, {
      Authorization: `Bearer ${superAdminToken}`,
      'Idempotency-Key': key8B,
    });
    assert(res8B.status === 201, 'Targeted publish succeeds with 201');
    const pub8BId = res8B.body?.publishedTest?.id;

    // Check School B student Charlie Root (TX_STU_03)
    const charlieAssignment = await StudentTestAssignmentModel.findOne({
      publishedTestId: pub8BId,
      studentId: 'TX_STU_03',
    });
    assert(charlieAssignment === null, 'Tenant Isolation: School B student received zero assignments');

    // 8C: Random Questions Mode behavior preserved
    const key8C = 'tx-scen8c-' + Date.now();
    const res8C = await makeRequest(baseUrl, 'POST', '/api/publish', {
      publishName: 'TX Random Mode Assessment',
      publishMode: 'Random Questions',
      randomCount: 1,
      startDate: '2026-11-01',
      startTime: '10:00 AM',
      endDate: '2026-11-02',
      endTime: '05:00 PM',
      targets: [
        {
          schoolIds: [schoolAId],
          classes: ['Class 5'],
          sections: ['A'],
        },
      ],
      selectedQuestionIds: questionIds,
    }, {
      Authorization: `Bearer ${superAdminToken}`,
      'Idempotency-Key': key8C,
    });

    assert(res8C.status === 201, 'Random Questions mode publish succeeds with 201');
    const randomPub = await PublishedTestModel.findById(res8C.body?.publishedTest?.id);
    assert(randomPub?.publishMode === 'Random Questions', 'PublishedTest has publishMode: Random Questions');
    assert(randomPub?.randomCount === 1, 'PublishedTest randomCount preserved as 1');
    assert(randomPub?.questionsSnapshot?.length === 2, 'Snapshot contains 2 eligible questions');

    const randomAssignments = await StudentTestAssignmentModel.find({ publishedTestId: res8C.body?.publishedTest?.id });
    assert(randomAssignments.length === 2, 'Both students received random assignments');
    assert(
      randomAssignments.every((a) => a.questions.length === 1),
      'Each student received exactly 1 question per randomCount configuration'
    );
  }

  // --------------------------------------------------------------------------
  // Cleanup Test Data
  // --------------------------------------------------------------------------
  console.log('\nCleaning up synthetic fixtures...');
  await PublishedTestModel.deleteMany({ idempotencyKey: { $regex: /^tx-/ } });
  await StudentTestAssignmentModel.deleteMany({ publishName: { $regex: /^TX / } });
  await PublishHistoryModel.deleteMany({ publishName: { $regex: /^TX / } });
  await SchoolModel.deleteMany({ code: { $in: ['TX_SCH_01', 'TX_SCH_02'] } });
  await UserModel.deleteMany({ username: { $in: ['tx_superadmin', 'tx_schooladmin', 'tx_stu_01', 'tx_stu_02', 'tx_stu_03'] } });
  await QuestionGroupModel.deleteMany({ name: 'TX Test Group' });
  await QuestionModel.deleteMany({ 'metadata.testSuite': 'Task10_Tx' });

  server.close();
  await mongoose.disconnect();

  console.log('\n==================================================');
  console.log(`Final Test Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('==================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite runner crashed:', err);
  process.exit(1);
});
