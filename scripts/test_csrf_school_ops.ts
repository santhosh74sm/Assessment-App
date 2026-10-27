import 'dotenv/config';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import routes from '../backend/routes.ts';
import {
  AUTH_COOKIE_NAMES,
  parseCookies,
} from '../backend/middleware/auth.ts';
import { UserModel, SchoolModel } from '../database/models.ts';
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
  console.log('=== CSRF & Schools/Students Operations Automated Verification ===\n');

  // 1. Connect to DB
  await connectTestDatabase();
  console.log(`Connected to test database: ${mongoose.connection.name}\n`);

  // Clean previous test data
  await UserModel.deleteMany({ username: { $regex: /^csrf_test_/ } });
  await SchoolModel.deleteMany({ code: { $regex: /^CSRF_TEST_/ } });
  await UserModel.deleteMany({ studentName: { $regex: /^CSRF Test Student/ } });

  const passwordHash = bcrypt.hashSync('TestSuperAdminSecret123!', 10);
  await UserModel.create({
    username: 'csrf_test_superadmin',
    role: 'super_admin',
    passwordHash,
    mustChangePassword: false,
  });

  // 2. Setup Test Express Server
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
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}\n`);

  try {
    // ----------------------------------------------------
    // Section 1: Login & Cookie/CSRF issuance
    // ----------------------------------------------------
    console.log('--- Step 1: Login and verify CSRF cookie issuance ---');
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'csrf_test_superadmin',
        password: 'TestSuperAdminSecret123!',
      }),
    });

    const loginData = await loginRes.json();
    assert(loginRes.status === 200, 'Login returns 200 OK');
    assert(typeof loginData.csrfToken === 'string' && loginData.csrfToken.length > 10, 'Login returns csrfToken string');

    const accessCookie = getCookieFromHeaders(loginRes, AUTH_COOKIE_NAMES.ACCESS_TOKEN);
    const refreshCookie = getCookieFromHeaders(loginRes, AUTH_COOKIE_NAMES.REFRESH_TOKEN);
    const csrfCookie = getCookieFromHeaders(loginRes, AUTH_COOKIE_NAMES.CSRF_TOKEN);

    assert(accessCookie !== null, 'puzzles_access_token cookie received');
    assert(refreshCookie !== null, 'puzzles_refresh_token cookie received');
    assert(csrfCookie !== null, 'puzzles_csrf_token cookie received');
    assert(csrfCookie?.value === loginData.csrfToken, 'CSRF cookie value matches response csrfToken payload');

    const authCookiesHeader = `${AUTH_COOKIE_NAMES.ACCESS_TOKEN}=${accessCookie?.value}; ${AUTH_COOKIE_NAMES.CSRF_TOKEN}=${csrfCookie?.value}`;
    const validCsrfToken = csrfCookie?.value!;

    // ----------------------------------------------------
    // Section 2: Session Restoration (/api/auth/me)
    // ----------------------------------------------------
    console.log('\n--- Step 2: Session restoration (/api/auth/me) ---');
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: authCookiesHeader },
    });
    const meData = await meRes.json();
    assert(meRes.status === 200, 'GET /api/auth/me returns 200 OK with cookie');
    assert(meData.username === 'csrf_test_superadmin', 'GET /api/auth/me returns correct user');
    assert(typeof meData.token === 'string', 'GET /api/auth/me returns token string for in-memory frontend sync');

    // ----------------------------------------------------
    // Section 3: School Management Operations
    // ----------------------------------------------------
    console.log('\n--- Step 3: School Operations with CSRF Validation ---');

    // 3a. Create School without CSRF header -> 403
    const createSchoolNoCsrf = await fetch(`${baseUrl}/api/schools`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookiesHeader,
      },
      body: JSON.stringify({
        name: 'CSRF Test Academy Alpha',
        code: 'CSRF_TEST_SCH_A',
      }),
    });
    const noCsrfSchoolData = await createSchoolNoCsrf.json();
    assert(createSchoolNoCsrf.status === 403, 'POST /api/schools without CSRF header is rejected with 403 Forbidden');
    assert(noCsrfSchoolData.error === 'CSRF token missing or invalid', 'Returns exact error: CSRF token missing or invalid');

    // 3b. Create School with wrong CSRF header -> 403
    const createSchoolBadCsrf = await fetch(`${baseUrl}/api/schools`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookiesHeader,
        'X-CSRF-Token': 'invalid-csrf-token-12345',
      },
      body: JSON.stringify({
        name: 'CSRF Test Academy Alpha',
        code: 'CSRF_TEST_SCH_A',
      }),
    });
    assert(createSchoolBadCsrf.status === 403, 'POST /api/schools with invalid CSRF token is rejected with 403 Forbidden');

    // 3c. Create School with valid CSRF header -> 201 Created
    const createSchoolValid = await fetch(`${baseUrl}/api/schools`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookiesHeader,
        'X-CSRF-Token': validCsrfToken,
      },
      body: JSON.stringify({
        name: 'CSRF Test Academy Alpha',
        code: 'CSRF_TEST_SCH_A',
      }),
    });
    const schoolData = await createSchoolValid.json();
    assert(createSchoolValid.status === 201, 'POST /api/schools with valid CSRF token succeeds with 201 Created');
    assert(schoolData.code === 'CSRF_TEST_SCH_A', 'Created school has correct code');
    const createdSchoolId = schoolData.id || schoolData._id;

    // ----------------------------------------------------
    // Section 4: School Admin Creation & Management
    // ----------------------------------------------------
    console.log('\n--- Step 4: School Admin Operations with CSRF Validation ---');

    // 4a. Create School Admin without CSRF -> 403
    const createAdminNoCsrf = await fetch(`${baseUrl}/api/schools/${createdSchoolId}/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookiesHeader,
      },
      body: JSON.stringify({}),
    });
    assert(createAdminNoCsrf.status === 403, 'POST /api/schools/:id/admins without CSRF is rejected with 403');

    // 4b. Create School Admin with valid CSRF -> 201
    const createAdminValid = await fetch(`${baseUrl}/api/schools/${createdSchoolId}/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookiesHeader,
        'X-CSRF-Token': validCsrfToken,
      },
      body: JSON.stringify({}),
    });
    const adminData = await createAdminValid.json();
    assert(createAdminValid.status === 201, 'POST /api/schools/:id/admins with valid CSRF token succeeds with 201 Created');
    assert(adminData.admin?.username?.startsWith('ADM-CSRF_TEST_SCH_A'), 'Created admin has correct prefix');
    const createdAdminId = adminData.admin?.id || adminData.admin?._id;

    // ----------------------------------------------------
    // Section 5: Student Operations
    // ----------------------------------------------------
    console.log('\n--- Step 5: Student Operations with CSRF Validation ---');

    // 5a. Create Student without CSRF -> 403
    const createStudentNoCsrf = await fetch(`${baseUrl}/api/students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookiesHeader,
      },
      body: JSON.stringify({
        schoolId: createdSchoolId,
        studentName: 'CSRF Test Student 1',
        schoolAdmissionNumber: 'ADM_CSRF_001',
        className: 'Class 10',
        section: 'A',
      }),
    });
    assert(createStudentNoCsrf.status === 403, 'POST /api/students without CSRF is rejected with 403');

    // 5b. Create Student with valid CSRF -> 201
    const createStudentValid = await fetch(`${baseUrl}/api/students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookiesHeader,
        'X-CSRF-Token': validCsrfToken,
      },
      body: JSON.stringify({
        schoolId: createdSchoolId,
        studentName: 'CSRF Test Student 1',
        schoolAdmissionNumber: 'ADM_CSRF_001',
        className: 'Class 10',
        section: 'A',
      }),
    });
    const studentData = await createStudentValid.json();
    assert(createStudentValid.status === 201, 'POST /api/students with valid CSRF token succeeds with 201 Created');
    assert(studentData.student?.studentName === 'CSRF Test Student 1', 'Created student has correct name');
    const createdStudentId = studentData.student?.id || studentData.student?._id;

    // 5c. Update Student without CSRF -> 403
    const updateStudentNoCsrf = await fetch(`${baseUrl}/api/students/${createdStudentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookiesHeader,
      },
      body: JSON.stringify({
        studentName: 'CSRF Test Student 1 Updated',
        schoolAdmissionNumber: 'ADM_CSRF_001',
        className: 'Class 10',
        section: 'A',
      }),
    });
    assert(updateStudentNoCsrf.status === 403, 'PUT /api/students/:id without CSRF is rejected with 403');

    // 5d. Update Student with valid CSRF -> 200
    const updateStudentValid = await fetch(`${baseUrl}/api/students/${createdStudentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookiesHeader,
        'X-CSRF-Token': validCsrfToken,
      },
      body: JSON.stringify({
        studentName: 'CSRF Test Student 1 Updated',
        schoolAdmissionNumber: 'ADM_CSRF_001',
        className: 'Class 10',
        section: 'A',
      }),
    });
    const updatedStudentData = await updateStudentValid.json();
    assert(updateStudentValid.status === 200, 'PUT /api/students/:id with valid CSRF succeeds with 200 OK');
    assert(updatedStudentData.student?.studentName === 'CSRF Test Student 1 Updated', 'Student updated successfully');

    // ----------------------------------------------------
    // Section 6: Deletions with CSRF Validation
    // ----------------------------------------------------
    console.log('\n--- Step 6: Deletions with CSRF Validation ---');

    // 6a. Delete Student without CSRF -> 403
    const deleteStudentNoCsrf = await fetch(`${baseUrl}/api/students/${createdStudentId}`, {
      method: 'DELETE',
      headers: { Cookie: authCookiesHeader },
    });
    assert(deleteStudentNoCsrf.status === 403, 'DELETE /api/students/:id without CSRF is rejected with 403');

    // 6b. Delete Student with valid CSRF -> 200
    const deleteStudentValid = await fetch(`${baseUrl}/api/students/${createdStudentId}`, {
      method: 'DELETE',
      headers: {
        Cookie: authCookiesHeader,
        'X-CSRF-Token': validCsrfToken,
      },
    });
    assert(deleteStudentValid.status === 200, 'DELETE /api/students/:id with valid CSRF succeeds with 200 OK');

    // 6c. Delete School Admin without CSRF -> 403
    const deleteAdminNoCsrf = await fetch(`${baseUrl}/api/schools/${createdSchoolId}/admins/${createdAdminId}`, {
      method: 'DELETE',
      headers: { Cookie: authCookiesHeader },
    });
    assert(deleteAdminNoCsrf.status === 403, 'DELETE /api/schools/:id/admins/:adminId without CSRF is rejected with 403');

    // 6d. Delete School Admin with valid CSRF -> 200
    const deleteAdminValid = await fetch(`${baseUrl}/api/schools/${createdSchoolId}/admins/${createdAdminId}`, {
      method: 'DELETE',
      headers: {
        Cookie: authCookiesHeader,
        'X-CSRF-Token': validCsrfToken,
      },
    });
    assert(deleteAdminValid.status === 200, 'DELETE /api/schools/:id/admins/:adminId with valid CSRF succeeds with 200 OK');

    // 6e. Delete School without CSRF -> 403
    const deleteSchoolNoCsrf = await fetch(`${baseUrl}/api/schools/${createdSchoolId}`, {
      method: 'DELETE',
      headers: { Cookie: authCookiesHeader },
    });
    assert(deleteSchoolNoCsrf.status === 403, 'DELETE /api/schools/:id without CSRF is rejected with 403');

    // 6f. Delete School with valid CSRF -> 200
    const deleteSchoolValid = await fetch(`${baseUrl}/api/schools/${createdSchoolId}`, {
      method: 'DELETE',
      headers: {
        Cookie: authCookiesHeader,
        'X-CSRF-Token': validCsrfToken,
      },
    });
    assert(deleteSchoolValid.status === 200, 'DELETE /api/schools/:id with valid CSRF succeeds with 200 OK');

    // ----------------------------------------------------
    // Section 7: Refresh Token Flow & CSRF Rotation
    // ----------------------------------------------------
    console.log('\n--- Step 7: Refresh Token Flow & CSRF Synchronization ---');
    const refreshCookiesHeader = `${AUTH_COOKIE_NAMES.REFRESH_TOKEN}=${refreshCookie?.value}`;
    const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: refreshCookiesHeader },
    });
    const refreshData = await refreshRes.json();
    assert(refreshRes.status === 200, 'POST /api/auth/refresh returns 200 OK');
    assert(refreshData.success === true, 'Refresh returns success: true');
    assert(typeof refreshData.csrfToken === 'string', 'Refresh returns new csrfToken string');

    const newCsrfCookie = getCookieFromHeaders(refreshRes, AUTH_COOKIE_NAMES.CSRF_TOKEN);
    assert(newCsrfCookie !== null, 'Refresh issues new puzzles_csrf_token cookie');
    assert(newCsrfCookie?.value === refreshData.csrfToken, 'Refreshed CSRF cookie matches payload');

  } finally {
    // Clean test data
    await UserModel.deleteMany({ username: { $regex: /^csrf_test_/ } });
    await SchoolModel.deleteMany({ code: { $regex: /^CSRF_TEST_/ } });
    await UserModel.deleteMany({ studentName: { $regex: /^CSRF Test Student/ } });

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    console.log('\nCleaned test data, closed test server, and disconnected from MongoDB.');
  }

  console.log('\n==================================================');
  console.log(`Final Verification Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('==================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite encountered an uncaught error:', err);
  process.exit(1);
});
