import 'dotenv/config';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import routes from '../backend/routes.ts';
import {
  AUTH_COOKIE_NAMES,
  getJwtSecret,
  generateAccessToken,
  generateRefreshToken,
  generateCsrfToken,
  parseCookies,
} from '../backend/middleware/auth.ts';
import { sharedStore } from '../backend/services/sharedStore.ts';
import {
  UserModel,
  SchoolModel,
  QuestionGroupModel,
  QuestionModel,
  PublishedTestModel,
  StudentTestAssignmentModel,
} from '../database/models.ts';
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

function getCookieFromHeaders(res: Response, cookieName: string): { value: string; raw: string } | null {
  const rawHeaders = (res.headers as any).getSetCookie
    ? (res.headers as any).getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);

  for (const h of rawHeaders) {
    if (h.startsWith(`${cookieName}=`)) {
      const parts = h.split(';');
      const value = parts[0].substring(`${cookieName}=`.length);
      return { value, raw: h };
    }
  }
  return null;
}

async function runTestSuite() {
  console.log('=== AUD-HIGH-01 & AUD-HIGH-02 Targeted Verification Suite ===\n');

  console.log('Connecting to test database...');
  await connectTestDatabase();
  console.log(`Connected to: ${mongoose.connection.name}\n`);

  // Clean test-specific data
  await UserModel.deleteMany({ username: { $regex: /^aud_test_/ } });
  await SchoolModel.deleteMany({ code: { $regex: /^AUD_TEST_/ } });
  await QuestionGroupModel.deleteMany({ name: { $regex: /^AUD_TEST_/ } });
  await QuestionModel.deleteMany({ content: { $regex: /^AUD_TEST_/ } });
  await PublishedTestModel.deleteMany({ publishName: { $regex: /^AUD_TEST_/ } });
  await StudentTestAssignmentModel.deleteMany({ publishName: { $regex: /^AUD_TEST_/ } });

  // 1. Create Test School
  const testSchool = await SchoolModel.create({
    name: 'AUD Test Academy',
    code: 'AUD_TEST_SCH',
  });

  const passwordHash = bcrypt.hashSync('InitialSecret123!', 10);

  // 2. Create Users
  const superAdmin = await UserModel.create({
    username: 'aud_test_superadmin',
    role: 'super_admin',
    passwordHash,
    mustChangePassword: false,
    tokenVersion: 0,
  });

  const schoolAdmin = await UserModel.create({
    username: 'aud_test_schooladmin',
    role: 'school_admin',
    schoolId: testSchool._id.toString(),
    schoolName: testSchool.name,
    passwordHash,
    mustChangePassword: false,
    tokenVersion: 0,
  });

  const studentUser = await UserModel.create({
    username: 'aud_test_student',
    role: 'student',
    studentName: 'Test Student',
    schoolId: testSchool._id.toString(),
    schoolName: testSchool.name,
    className: 'Class 5',
    section: 'A',
    uniqueStudentId: 'AUD-STU-001',
    passwordHash,
    mustChangePassword: false,
    tokenVersion: 0,
  });

  const studentUser2 = await UserModel.create({
    username: 'aud_test_student2',
    role: 'student',
    studentName: 'Test Student Two',
    schoolId: testSchool._id.toString(),
    schoolName: testSchool.name,
    className: 'Class 5',
    section: 'A',
    uniqueStudentId: 'AUD-STU-002',
    passwordHash,
    mustChangePassword: false,
    tokenVersion: 0,
  });

  // 3. Create Question Group and Questions with sensitive answer keys
  const testGroup = await QuestionGroupModel.create({
    name: 'AUD_TEST_Logic_Puzzles',
    description: 'Confidential Logic Puzzles',
  });

  const testQuestion = await QuestionModel.create({
    content: 'AUD_TEST_Secret_Question_1: What is the confidential code?',
    groupId: testGroup._id.toString(),
    groupName: testGroup.name,
    difficulty: 'Easy',
    questionType: 'Single Selection',
    options: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
    correctAnswer: 'Bravo',
    scoringCriteria: 'Award 5 marks for Bravo only',
    explanation: 'Secret explanation: Bravo is correct',
  });

  // 4. Create an Assignment for Student
  const testPubTest = await PublishedTestModel.create({
    publishName: 'AUD_TEST_Exam',
    publishMode: 'Selected Questions',
    target: {
      schoolId: testSchool._id.toString(),
      schoolIds: [testSchool._id.toString()],
      schoolName: testSchool.name,
      schoolNames: [testSchool.name],
      classes: ['All Classes'],
      sections: [],
    },
    startDate: 'Today',
    startTime: '12:00 AM',
    endDate: 'Open',
    endTime: '11:59 PM',
    shuffle: false,
    questionIds: [testQuestion._id.toString()],
    questionsSnapshot: [
      {
        questionId: testQuestion._id.toString(),
        content: testQuestion.content,
        groupName: testGroup.name,
        difficulty: testQuestion.difficulty,
        options: testQuestion.options,
        correctAnswer: 'Bravo',
        scoringCriteria: 'Award 5 marks for Bravo only',
      },
    ],
  });

  const testAssignment = await StudentTestAssignmentModel.create({
    publishedTestId: testPubTest._id.toString(),
    publishName: testPubTest.publishName,
    studentId: studentUser.uniqueStudentId || studentUser.username,
    studentName: studentUser.studentName,
    schoolId: testSchool._id.toString(),
    schoolName: testSchool.name,
    className: 'Class 5',
    section: 'A',
    status: 'NOT_STARTED',
    scoreOutOf100: 0,
    totalPointsEarned: 0,
    totalQuestions: 1,
    correctCount: 0,
    wrongCount: 0,
    totalTimeTakenSeconds: 0,
    questions: [
      {
        questionId: testQuestion._id.toString(),
        content: testQuestion.content,
        groupName: testGroup.name,
        difficulty: testQuestion.difficulty,
        options: testQuestion.options,
        correctAnswer: 'Bravo',
        scoringCriteria: 'Award 5 marks for Bravo only',
      },
    ],
  });

  // Setup Express App
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    if (!req.cookies) {
      req.cookies = parseCookies(req.headers.cookie);
    }
    next();
  });

  app.use('/api', routes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Test Express server running at: ${baseUrl}\n`);

  try {
    // =========================================================================
    // AUD-HIGH-01 TEST SUITE
    // =========================================================================
    console.log('--- [AUD-HIGH-01] Question Bank & Question Groups Authorization ---');

    // 1. Unauthenticated request -> 401
    {
      const res = await fetch(`${baseUrl}/api/question-groups`);
      assert(res.status === 401, 'Unauthenticated request to GET /api/question-groups returns 401 Unauthorized');
      const body = await res.json().catch(() => ({}));
      assert(!JSON.stringify(body).includes('AUD_TEST_Secret_Question_1'), '401 response contains NO question data');
    }

    // Generate tokens for each role
    const superAdminToken = generateAccessToken({
      userId: superAdmin._id.toString(),
      username: superAdmin.username,
      role: superAdmin.role,
      tokenVersion: 0,
    }).token;

    const schoolAdminToken = generateAccessToken({
      userId: schoolAdmin._id.toString(),
      username: schoolAdmin.username,
      role: schoolAdmin.role,
      schoolId: testSchool._id.toString(),
      tokenVersion: 0,
    }).token;

    const studentToken = generateAccessToken({
      userId: studentUser._id.toString(),
      username: studentUser.username,
      role: studentUser.role,
      schoolId: testSchool._id.toString(),
      studentId: studentUser.uniqueStudentId,
      tokenVersion: 0,
    }).token;

    // 2. Student request -> 403 Forbidden
    {
      const res = await fetch(`${baseUrl}/api/question-groups`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert(res.status === 403, 'Student request to GET /api/question-groups returns 403 Forbidden');
      const body = await res.json().catch(() => ({}));
      assert(!JSON.stringify(body).includes('AUD_TEST_Secret_Question_1'), 'Student 403 response contains NO Question Bank data');
      assert(!JSON.stringify(body).includes('Bravo'), 'Student 403 response contains NO answer keys');
    }

    // 3. School Admin request -> 403 Forbidden
    {
      const res = await fetch(`${baseUrl}/api/question-groups`, {
        headers: { Authorization: `Bearer ${schoolAdminToken}` },
      });
      assert(res.status === 403, 'School Admin request to GET /api/question-groups returns 403 Forbidden');
      const body = await res.json().catch(() => ({}));
      assert(!JSON.stringify(body).includes('AUD_TEST_Secret_Question_1'), 'School Admin 403 response contains NO Question Bank data');
      assert(!JSON.stringify(body).includes('Bravo'), 'School Admin 403 response contains NO answer keys');
    }

    // 4. Any other non-Super-Admin role -> 403 Forbidden
    {
      const fakeRoleToken = jwt.sign(
        { userId: 'fake_user_1', username: 'fake_user', role: 'guest', tokenVersion: 0 },
        getJwtSecret(),
        { expiresIn: '15m' }
      );
      const res = await fetch(`${baseUrl}/api/question-groups`, {
        headers: { Authorization: `Bearer ${fakeRoleToken}` },
      });
      assert(res.status === 403, 'Non-Super-Admin role returns 403 Forbidden');
      const body = await res.json().catch(() => ({}));
      assert(!JSON.stringify(body).includes('AUD_TEST_Secret_Question_1'), 'Non-Super-Admin response contains NO Question Bank data');
    }

    // 5. Super Admin request -> 200 OK with Question Groups
    {
      const res = await fetch(`${baseUrl}/api/question-groups`, {
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });
      assert(res.status === 200, 'Super Admin request to GET /api/question-groups returns 200 OK');
      const body = await res.json();
      assert(Array.isArray(body), 'Super Admin response is an array of question groups');
      const foundGroup = body.find((g: any) => g.name === 'AUD_TEST_Logic_Puzzles');
      assert(!!foundGroup, 'Super Admin response contains the expected Question Group');
      assert(foundGroup?.questionCount >= 1, 'Question Group reflects question count for Super Admin');
    }

    // 6. Student Authorized Assessment Start/Resume Workflow is Preserved
    {
      // Student cannot access pre-test assessment questions through /question-groups
      const preTestRes = await fetch(`${baseUrl}/api/question-groups`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert(preTestRes.status === 403, 'Student cannot obtain questions before starting assessment');

      // Student starts assessment through authorized endpoint: POST /api/student/tests/:assignmentId/start
      const startRes = await fetch(`${baseUrl}/api/student/tests/${testAssignment._id}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
      });
      const startBody = await startRes.json();
      assert(startRes.status === 200, 'Student successfully starts assessment via POST /api/student/tests/:assignmentId/start', { status: startRes.status, body: startBody });
      assert(startBody && startBody.assignmentId, 'Start response contains authorized session assignmentId');
      assert(startBody && Array.isArray(startBody.questions), 'Start response contains sanitized test questions');
      if (!startBody.questions) {
        throw new Error(`Start failed with ${startRes.status}: ${JSON.stringify(startBody)}`);
      }
      
      // Verify correct answers and scoring criteria are sanitized for student
      const q = startBody.questions[0];
      assert(q && q.content.includes('AUD_TEST_Secret_Question_1'), 'Sanitized test question has content');
      assert(q.correctAnswer === undefined, 'Sanitized test question omits correctAnswer');
      assert(q.scoringCriteria === undefined, 'Sanitized test question omits scoringCriteria');
    }

    // =========================================================================
    // AUD-HIGH-02 TEST SUITE
    // =========================================================================
    console.log('\n--- [AUD-HIGH-02] Session Invalidation on Password Change & Reset ---');

    // -------------------------------------------------------------------------
    // Test Part A: User Password Change Flow
    // -------------------------------------------------------------------------
    console.log('\n[AUD-HIGH-02 Part A] Password Change Session Invalidation:');

    // 1. Initial login for studentUser
    let studentLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'aud_test_student',
        password: 'InitialSecret123!',
      }),
    });
    assert(studentLoginRes.status === 200, 'Student initial login succeeds (200 OK)');
    const studentLoginData = await studentLoginRes.json();
    const oldAccessToken = studentLoginData.token;
    const oldRefreshCookie = getCookieFromHeaders(studentLoginRes, AUTH_COOKIE_NAMES.REFRESH_TOKEN);
    assert(!!oldAccessToken, 'Initial access token generated');
    assert(!!oldRefreshCookie, 'Initial refresh token cookie set');

    // Verify initial access token works on /api/auth/me
    let meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${oldAccessToken}` },
    });
    assert(meRes.status === 200, 'Initial access token works on /api/auth/me (200 OK)');

    // 2. Invalid password change attempt (< 4 chars)
    let invalidChangeRes = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oldAccessToken}`,
      },
      body: JSON.stringify({ newPassword: 'ab' }),
    });
    assert(invalidChangeRes.status === 400, 'Invalid password change (< 4 chars) rejected with 400');
    let userAfterInvalid = await UserModel.findById(studentUser._id);
    assert(userAfterInvalid?.tokenVersion === 0, 'Invalid password change does NOT increment tokenVersion');

    // 3. Invalid password change attempt (identical to username)
    let sameUserChangeRes = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oldAccessToken}`,
      },
      body: JSON.stringify({ newPassword: 'aud_test_student' }),
    });
    assert(sameUserChangeRes.status === 400, 'Password identical to username rejected with 400');
    let userAfterSame = await UserModel.findById(studentUser._id);
    assert(userAfterSame?.tokenVersion === 0, 'Same-username password change does NOT increment tokenVersion');

    // 4. Successful password change
    const newPassword = 'NewSecretPassword456!';
    let validChangeRes = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oldAccessToken}`,
      },
      body: JSON.stringify({ newPassword }),
    });
    assert(validChangeRes.status === 200, 'Valid password change succeeds (200 OK)');
    const changeData = await validChangeRes.json();
    assert(changeData.success === true, 'Change response has success: true');
    assert(!!changeData.token, 'Change response returns updated session token');

    // Verify tokenVersion incremented in database
    const userAfterChange = await UserModel.findById(studentUser._id);
    assert(userAfterChange?.tokenVersion === 1, 'tokenVersion successfully incremented in DB (0 -> 1)');

    // 5. Verify OLD access token is REJECTED by protected endpoints
    let oldTokenMeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${oldAccessToken}` },
    });
    assert(oldTokenMeRes.status === 401, 'Previously issued access token is REJECTED with 401 Unauthorized');
    const oldTokenError = await oldTokenMeRes.json().catch(() => ({}));
    assert(
      JSON.stringify(oldTokenError).includes('Session has been invalidated'),
      '401 response explicitly informs session invalidated'
    );

    // 6. Verify OLD refresh token CANNOT create new access token
    let oldRefreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `${AUTH_COOKIE_NAMES.REFRESH_TOKEN}=${oldRefreshCookie!.value}` },
    });
    assert(oldRefreshRes.status === 401, 'Previously issued refresh token is REJECTED with 401 Unauthorized');
    const refreshError = await oldRefreshRes.json().catch(() => ({}));
    assert(
      JSON.stringify(refreshError).includes('Session invalidated due to password change or reset'),
      'Refresh error explicitly informs session invalidated due to password change'
    );

    // 7. Verify login with OLD password FAILS
    let oldLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'aud_test_student',
        password: 'InitialSecret123!',
      }),
    });
    assert(oldLoginRes.status === 401, 'Login with old password fails (401)');

    // 8. Verify login with NEW password SUCCEEDS
    let newLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'aud_test_student',
        password: newPassword,
      }),
    });
    assert(newLoginRes.status === 200, 'Login with new password succeeds (200 OK)');
    const newLoginData = await newLoginRes.json();
    const newAccessToken = newLoginData.token;

    // Verify new token works on /api/auth/me
    let newMeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${newAccessToken}` },
    });
    assert(newMeRes.status === 200, 'New token authenticated successfully on /api/auth/me (200 OK)');

    // 9. Verify OTHER users tokens remain unaffected
    let superAdminMeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert(superAdminMeRes.status === 200, "Other user (Super Admin) token remains valid (200 OK)");

    let schoolAdminMeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${schoolAdminToken}` },
    });
    assert(schoolAdminMeRes.status === 200, "Other user (School Admin) token remains valid (200 OK)");

    // -------------------------------------------------------------------------
    // Test Part B: Super Admin Password Reset Flow
    // -------------------------------------------------------------------------
    console.log('\n[AUD-HIGH-02 Part B] Super Admin Password Reset Session Invalidation:');

    // 1. Log in studentUser2
    let student2LoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'aud_test_student2',
        password: 'InitialSecret123!',
      }),
    });
    assert(student2LoginRes.status === 200, 'student2 login succeeds (200 OK)');
    const student2Data = await student2LoginRes.json();
    const student2OldAccessToken = student2Data.token;
    const student2OldRefreshCookie = getCookieFromHeaders(student2LoginRes, AUTH_COOKIE_NAMES.REFRESH_TOKEN);

    // Verify student2 token works before reset
    let s2MeBefore = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${student2OldAccessToken}` },
    });
    assert(s2MeBefore.status === 200, 'student2 token works before reset (200 OK)');

    // 2. Super Admin resets studentUser2 password
    const resetRes = await fetch(`${baseUrl}/api/super-admin/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({ userId: studentUser2._id.toString() }),
    });
    assert(resetRes.status === 200, 'Super Admin reset-password returns 200 OK');
    const resetData = await resetRes.json();
    assert(!!resetData.temporaryPassword, 'Reset response returns temporaryPassword');

    // Verify student2 tokenVersion incremented in DB
    const student2AfterReset = await UserModel.findById(studentUser2._id);
    assert(student2AfterReset?.tokenVersion === 1, 'student2 tokenVersion successfully incremented in DB (0 -> 1)');
    assert(student2AfterReset?.mustChangePassword === true, 'student2 mustChangePassword set to true');

    // Verify Super Admin's OWN session remains completely valid
    let saCheckRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert(saCheckRes.status === 200, "Super Admin session remains completely valid after resetting another user's password");

    // 3. Verify student2's OLD access token is REJECTED on protected endpoints
    let s2OldTokenRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${student2OldAccessToken}` },
    });
    assert(s2OldTokenRes.status === 401, 'student2 previously issued access token is REJECTED with 401');

    // 4. Verify student2's OLD refresh token CANNOT create new access tokens
    let s2OldRefreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `${AUTH_COOKIE_NAMES.REFRESH_TOKEN}=${student2OldRefreshCookie!.value}` },
    });
    assert(s2OldRefreshRes.status === 401, 'student2 previously issued refresh token is REJECTED with 401');

    // 5. Verify student2 login with OLD password fails
    let s2OldLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'aud_test_student2',
        password: 'InitialSecret123!',
      }),
    });
    assert(s2OldLoginRes.status === 401, 'student2 login with old password fails (401)');

    // 6. Verify student2 login with temporary password succeeds
    let s2TempLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'aud_test_student2',
        password: resetData.temporaryPassword,
      }),
    });
    assert(s2TempLoginRes.status === 200, 'student2 login with temporary password succeeds (200 OK)');
    const s2TempLoginData = await s2TempLoginRes.json();
    assert(s2TempLoginData.user.mustChangePassword === true, 'student2 mustChangePassword is true on first login');

    // -------------------------------------------------------------------------
    // Test Part C: Refresh Rotation & Legacy Token Compatibility
    // -------------------------------------------------------------------------
    console.log('\n[AUD-HIGH-02 Part C] Refresh Rotation & Legacy Token Compatibility:');

    // 1. Refresh rotation on valid session
    const s2TempRefreshCookie = getCookieFromHeaders(s2TempLoginRes, AUTH_COOKIE_NAMES.REFRESH_TOKEN);
    assert(!!s2TempRefreshCookie, 'Temporary login received refresh cookie');

    const firstRefreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `${AUTH_COOKIE_NAMES.REFRESH_TOKEN}=${s2TempRefreshCookie!.value}` },
    });
    assert(firstRefreshRes.status === 200, 'Valid refresh token rotates successfully (200 OK)');
    const secondRefreshCookie = getCookieFromHeaders(firstRefreshRes, AUTH_COOKIE_NAMES.REFRESH_TOKEN);
    assert(
      secondRefreshCookie?.value !== s2TempRefreshCookie?.value,
      'New rotated refresh token is distinct from original'
    );

    // Replay attack on original refresh token is rejected
    const replayRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `${AUTH_COOKIE_NAMES.REFRESH_TOKEN}=${s2TempRefreshCookie!.value}` },
    });
    assert(replayRes.status === 401, 'Replay of rotated refresh token is rejected with 401 Unauthorized');

    // 2. Legacy Token Handling:
    // Create a legacy token without tokenVersion field (simulating pre-existing tokens)
    const legacyToken = jwt.sign(
      {
        userId: superAdmin._id.toString(),
        username: superAdmin.username,
        role: superAdmin.role,
        // no tokenVersion specified
      },
      getJwtSecret(),
      { expiresIn: '15m' }
    );

    const legacyMeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${legacyToken}` },
    });
    assert(
      legacyMeRes.status === 200,
      'Legacy token with omitted tokenVersion defaults safely to 0 and matches user with tokenVersion 0 (no breaking disconnect)'
    );

    console.log('\nAll AUD-HIGH-01 and AUD-HIGH-02 test cases passed successfully!');
  } finally {
    // Teardown: Clean up test accounts and close server
    await UserModel.deleteMany({ username: { $regex: /^aud_test_/ } });
    await SchoolModel.deleteMany({ code: { $regex: /^AUD_TEST_/ } });
    await QuestionGroupModel.deleteMany({ name: { $regex: /^AUD_TEST_/ } });
    await QuestionModel.deleteMany({ content: { $regex: /^AUD_TEST_/ } });
    await PublishedTestModel.deleteMany({ publishName: { $regex: /^AUD_TEST_/ } });
    await StudentTestAssignmentModel.deleteMany({ publishName: { $regex: /^AUD_TEST_/ } });
    server.close();
    await mongoose.disconnect();
    console.log('Cleaned test data, closed test server, and disconnected from MongoDB.\n');
  }

  console.log('==================================================');
  console.log(`Final Test Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('==================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite failed with uncaught error:', err);
  process.exit(1);
});
