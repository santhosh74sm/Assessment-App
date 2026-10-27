import 'dotenv/config';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import routes from '../backend/routes.ts';
import {
  AUTH_COOKIE_NAMES,
  getJwtSecret,
  setAuthCookies,
  clearAuthCookies,
  generateAccessToken,
  generateRefreshToken,
  generateCsrfToken,
  revokeToken,
  parseCookies,
} from '../backend/middleware/auth.ts';
import { sharedStore } from '../backend/services/sharedStore.ts';
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

// Helper to extract cookie from Set-Cookie headers
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
  console.log('=== SEC-05: CSP & JWT Security Automated Test Suite ===\n');

  // 1. Database Connection
  console.log('Connecting to test database...');
  await connectTestDatabase();
  console.log(`Connected to: ${mongoose.connection.name}\n`);

  // Setup test school and users
  await UserModel.deleteMany({ username: { $regex: /^sec05_/ } });
  await SchoolModel.deleteMany({ code: { $regex: /^SEC05_/ } });

  const testSchool = await SchoolModel.create({
    name: 'SEC05 Test Academy',
    code: 'SEC05_SCH_A',
  });

  const passwordHash = bcrypt.hashSync('TestSecretPassword123!', 10);

  const superAdmin = await UserModel.create({
    username: 'sec05_superadmin',
    role: 'super_admin',
    passwordHash,
    mustChangePassword: false,
  });

  const schoolAdminA = await UserModel.create({
    username: 'sec05_schooladmin_a',
    role: 'school_admin',
    schoolId: testSchool._id.toString(),
    schoolName: testSchool.name,
    passwordHash,
    mustChangePassword: false,
  });

  const schoolAdminB = await UserModel.create({
    username: 'sec05_schooladmin_b',
    role: 'school_admin',
    schoolId: new mongoose.Types.ObjectId().toString(),
    schoolName: 'Other Foreign School',
    passwordHash,
    mustChangePassword: false,
  });

  // 2. Setup Test Server with exact CSP and middleware as server.ts
  const app = express();
  app.use(express.json());

  // Security Headers & CSP Middleware
  app.use((req, res, next) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.nonce = nonce;

    if (!req.cookies) {
      req.cookies = parseCookies(req.headers.cookie);
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    const cspDirectives = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' ws: wss:",
      "frame-ancestors 'self' https://*.google.com https://*.run.app",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    const isCspReportOnly = process.env.CSP_REPORT_ONLY === 'true';
    if (isCspReportOnly) {
      res.setHeader('Content-Security-Policy-Report-Only', cspDirectives);
    } else {
      res.setHeader('Content-Security-Policy', cspDirectives);
    }

    next();
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'Puzzles Assessment Engine' });
  });

  app.use('/api', routes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Test Express server running at: ${baseUrl}\n`);

  try {
    // -------------------------------------------------------------------------
    // Test 1: Successful Login & Cookie-Authenticated API Requests
    // -------------------------------------------------------------------------
    console.log('--- Test 1: Successful Login & Cookie-Authenticated API Requests ---');
    let accessTokenCookie = '';
    let refreshTokenCookie = '';
    let csrfTokenCookie = '';

    {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'sec05_superadmin',
          password: 'TestSecretPassword123!',
        }),
      });

      const body = await res.json();
      assert(res.status === 200, 'Login returns 200 OK', body);
      assert(typeof body.token === 'string', 'Returns token string');
      assert(typeof body.csrfToken === 'string', 'Returns csrfToken string');

      const accessCookie = getCookieFromHeaders(res, AUTH_COOKIE_NAMES.ACCESS_TOKEN);
      const refreshCookie = getCookieFromHeaders(res, AUTH_COOKIE_NAMES.REFRESH_TOKEN);
      const csrfCookie = getCookieFromHeaders(res, AUTH_COOKIE_NAMES.CSRF_TOKEN);

      assert(accessCookie !== null, 'Set-Cookie contains puzzles_access_token');
      assert(Boolean(accessCookie?.raw.includes('HttpOnly')), 'puzzles_access_token cookie has HttpOnly');
      assert(refreshCookie !== null, 'Set-Cookie contains puzzles_refresh_token');
      assert(Boolean(refreshCookie?.raw.includes('HttpOnly')), 'puzzles_refresh_token cookie has HttpOnly');
      assert(csrfCookie !== null, 'Set-Cookie contains puzzles_csrf_token');
      assert(!csrfCookie?.raw.includes('HttpOnly'), 'puzzles_csrf_token is readable by client (no HttpOnly)');

      accessTokenCookie = accessCookie!.value;
      refreshTokenCookie = refreshCookie!.value;
      csrfTokenCookie = csrfCookie!.value;

      // Make authenticated request to /api/auth/me using Cookie only
      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: `${AUTH_COOKIE_NAMES.ACCESS_TOKEN}=${accessTokenCookie}`,
        },
      });

      const meBody = await meRes.json();
      assert(meRes.status === 200, 'Cookie-authenticated request to /api/auth/me returns 200');
      assert(meBody.username === 'sec05_superadmin', 'Profile returns correct username');
      assert(meBody.role === 'super_admin', 'Profile returns correct role');
    }

    // -------------------------------------------------------------------------
    // Test 2: Logout Clears the Session Correctly
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Logout Clears the Session Correctly ---');
    {
      const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Cookie: `${AUTH_COOKIE_NAMES.ACCESS_TOKEN}=${accessTokenCookie}; ${AUTH_COOKIE_NAMES.REFRESH_TOKEN}=${refreshTokenCookie}; ${AUTH_COOKIE_NAMES.CSRF_TOKEN}=${csrfTokenCookie}`,
          'X-CSRF-Token': csrfTokenCookie,
        },
      });

      const logoutBody = await logoutRes.json();
      assert(logoutRes.status === 200, 'Logout returns 200 OK');
      assert(logoutBody.success === true, 'Logout body has success: true');

      const clearedAccess = getCookieFromHeaders(logoutRes, AUTH_COOKIE_NAMES.ACCESS_TOKEN);
      const clearedRefresh = getCookieFromHeaders(logoutRes, AUTH_COOKIE_NAMES.REFRESH_TOKEN);
      const clearedCsrf = getCookieFromHeaders(logoutRes, AUTH_COOKIE_NAMES.CSRF_TOKEN);

      assert(clearedAccess !== null && (clearedAccess.raw.includes('Max-Age=0') || clearedAccess.raw.includes('Expires=')), 'Logout expires access token cookie');
      assert(clearedRefresh !== null && (clearedRefresh.raw.includes('Max-Age=0') || clearedRefresh.raw.includes('Expires=')), 'Logout expires refresh token cookie');
      assert(clearedCsrf !== null && (clearedCsrf.raw.includes('Max-Age=0') || clearedCsrf.raw.includes('Expires=')), 'Logout expires csrf token cookie');

      // Subsequent call to /api/auth/me with revoked access token must return 401
      const meAfterLogout = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: `${AUTH_COOKIE_NAMES.ACCESS_TOKEN}=${accessTokenCookie}`,
        },
      });
      assert(meAfterLogout.status === 401, 'Logged-out access token is rejected with 401 Unauthorized');
    }

    // -------------------------------------------------------------------------
    // Test 3: Session Restoration after Refreshing the Page
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Session Restoration after Refreshing the Page ---');
    {
      // Log in again to get fresh session
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'sec05_superadmin',
          password: 'TestSecretPassword123!',
        }),
      });

      const accessCookie = getCookieFromHeaders(loginRes, AUTH_COOKIE_NAMES.ACCESS_TOKEN);
      const refreshCookie = getCookieFromHeaders(loginRes, AUTH_COOKIE_NAMES.REFRESH_TOKEN);
      const csrfCookie = getCookieFromHeaders(loginRes, AUTH_COOKIE_NAMES.CSRF_TOKEN);

      accessTokenCookie = accessCookie!.value;
      refreshTokenCookie = refreshCookie!.value;
      csrfTokenCookie = csrfCookie!.value;

      // Simulate browser reloading the page and calling /api/auth/me with cookies
      const restoreRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: `${AUTH_COOKIE_NAMES.ACCESS_TOKEN}=${accessTokenCookie}`,
        },
      });

      assert(restoreRes.status === 200, 'Page refresh restores session via HttpOnly cookie (200 OK)');
      const restoreBody = await restoreRes.json();
      assert(restoreBody.username === 'sec05_superadmin', 'Restored user profile matches expected user');
    }

    // -------------------------------------------------------------------------
    // Test 4: Expired Access Token and Successful Refresh Flow
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Expired Access Token and Successful Refresh Flow ---');
    {
      // Create an expired access token
      const expiredAccessToken = jwt.sign(
        {
          userId: superAdmin._id.toString(),
          username: superAdmin.username,
          role: superAdmin.role,
          jti: crypto.randomUUID(),
          type: 'access',
        },
        getJwtSecret(),
        { expiresIn: '-1s' }
      );

      // Accessing /api/auth/me with expired token fails with 401
      const expiredRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: `${AUTH_COOKIE_NAMES.ACCESS_TOKEN}=${expiredAccessToken}`,
        },
      });
      assert(expiredRes.status === 401, 'Expired access token returns 401 Unauthorized');

      // Call /api/auth/refresh with valid refresh token cookie
      const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: `${AUTH_COOKIE_NAMES.REFRESH_TOKEN}=${refreshTokenCookie}`,
        },
      });

      const refreshBody = await refreshRes.json();
      assert(refreshRes.status === 200, 'Session refresh returns 200 OK', refreshBody);
      assert(refreshBody.success === true, 'Refresh returns success: true');

      const newAccessCookie = getCookieFromHeaders(refreshRes, AUTH_COOKIE_NAMES.ACCESS_TOKEN);
      const newRefreshCookie = getCookieFromHeaders(refreshRes, AUTH_COOKIE_NAMES.REFRESH_TOKEN);
      assert(newAccessCookie !== null, 'New access token cookie was issued');
      assert(newRefreshCookie !== null, 'New refresh token cookie was issued');

      // Update active cookies
      accessTokenCookie = newAccessCookie!.value;
      refreshTokenCookie = newRefreshCookie!.value;

      // Verify that the new access token cookie successfully authenticates /api/auth/me
      const restoredRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: `${AUTH_COOKIE_NAMES.ACCESS_TOKEN}=${accessTokenCookie}`,
        },
      });
      assert(restoredRes.status === 200, 'New access token cookie successfully authenticates (200 OK)');
    }

    // -------------------------------------------------------------------------
    // Test 5: Invalid or Revoked Refresh Token Rejection
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Invalid or Revoked Refresh Token Rejection ---');
    {
      // Subtest A: Missing refresh token
      const missingRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
      });
      assert(missingRes.status === 401, 'Missing refresh token rejected with 401');

      // Subtest B: Tampered/garbage token
      const garbageRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: `${AUTH_COOKIE_NAMES.REFRESH_TOKEN}=garbage.tampered.signature`,
        },
      });
      assert(garbageRes.status === 401, 'Tampered refresh token rejected with 401');

      // Subtest C: Token with wrong type (type === 'access')
      const wrongTypeToken = jwt.sign(
        { userId: superAdmin._id.toString(), username: superAdmin.username, jti: crypto.randomUUID(), type: 'access' },
        getJwtSecret(),
        { expiresIn: '1h' }
      );
      const wrongTypeRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: `${AUTH_COOKIE_NAMES.REFRESH_TOKEN}=${wrongTypeToken}`,
        },
      });
      assert(wrongTypeRes.status === 401, 'Token with type="access" cannot be used as refresh token (401)');

      // Subtest D: Explicitly revoked refresh token
      const revokedJti = crypto.randomUUID();
      const validButRevokedToken = jwt.sign(
        { userId: superAdmin._id.toString(), username: superAdmin.username, jti: revokedJti, type: 'refresh' },
        getJwtSecret(),
        { expiresIn: '7d' }
      );
      await revokeToken(revokedJti);

      const revokedRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: `${AUTH_COOKIE_NAMES.REFRESH_TOKEN}=${validButRevokedToken}`,
        },
      });
      assert(revokedRes.status === 401, 'Revoked refresh token is rejected with 401');
    }

    // -------------------------------------------------------------------------
    // Test 6: Refresh-Token Rotation and Replay Protection
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Refresh-Token Rotation and Replay Protection ---');
    {
      // 1. Generate fresh session
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'sec05_superadmin',
          password: 'TestSecretPassword123!',
        }),
      });

      const refreshCookie1 = getCookieFromHeaders(loginRes, AUTH_COOKIE_NAMES.REFRESH_TOKEN)!.value;

      // 2. Refresh once with Token R1 -> server rotates and issues Token R2
      const refresh1Res = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: `${AUTH_COOKIE_NAMES.REFRESH_TOKEN}=${refreshCookie1}`,
        },
      });
      assert(refresh1Res.status === 200, 'First refresh with Token R1 succeeds');
      const refreshCookie2 = getCookieFromHeaders(refresh1Res, AUTH_COOKIE_NAMES.REFRESH_TOKEN)!.value;
      assert(refreshCookie1 !== refreshCookie2, 'Rotated refresh token R2 is different from R1');

      // 3. Replay attack: Attacker tries to reuse Token R1
      const replayRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: `${AUTH_COOKIE_NAMES.REFRESH_TOKEN}=${refreshCookie1}`,
        },
      });
      assert(replayRes.status === 401, 'Replayed refresh token R1 is immediately rejected with 401');
      const replayBody = await replayRes.json();
      assert(replayBody.error?.includes('already been used or revoked'), 'Replay error details specify already used or revoked token');
    }

    // -------------------------------------------------------------------------
    // Test 7: CSRF Rejection for Unauthorized State-Changing Requests
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7: CSRF Rejection for Unauthorized State-Changing Requests ---');
    {
      // Login to get fresh tokens
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'sec05_superadmin',
          password: 'TestSecretPassword123!',
        }),
      });

      const accessCookie = getCookieFromHeaders(loginRes, AUTH_COOKIE_NAMES.ACCESS_TOKEN)!.value;
      const csrfCookie = getCookieFromHeaders(loginRes, AUTH_COOKIE_NAMES.CSRF_TOKEN)!.value;

      // Subtest A: State-changing request via Cookie WITHOUT X-CSRF-Token header -> MUST 403
      const noCsrfRes = await fetch(`${baseUrl}/api/schools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${AUTH_COOKIE_NAMES.ACCESS_TOKEN}=${accessCookie}; ${AUTH_COOKIE_NAMES.CSRF_TOKEN}=${csrfCookie}`,
        },
        body: JSON.stringify({ name: 'CSRF Exploit School', code: 'EXPLOIT1' }),
      });
      assert(noCsrfRes.status === 403, 'Cookie-authenticated state-changing request without CSRF header returns 403 Forbidden');
      const noCsrfBody = await noCsrfRes.json();
      assert(noCsrfBody.error?.includes('CSRF token missing or invalid'), 'Returns descriptive CSRF error');

      // Subtest B: State-changing request via Cookie with MISMATCHED X-CSRF-Token header -> MUST 403
      const badCsrfRes = await fetch(`${baseUrl}/api/schools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${AUTH_COOKIE_NAMES.ACCESS_TOKEN}=${accessCookie}; ${AUTH_COOKIE_NAMES.CSRF_TOKEN}=${csrfCookie}`,
          'X-CSRF-Token': 'forged_malicious_csrf_token',
        },
        body: JSON.stringify({ name: 'CSRF Exploit School', code: 'EXPLOIT2' }),
      });
      assert(badCsrfRes.status === 403, 'Mismatched CSRF token header returns 403 Forbidden');

      // Subtest C: State-changing request via Cookie with MATCHING X-CSRF-Token header -> PROCEEDS
      const validCsrfRes = await fetch(`${baseUrl}/api/schools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${AUTH_COOKIE_NAMES.ACCESS_TOKEN}=${accessCookie}; ${AUTH_COOKIE_NAMES.CSRF_TOKEN}=${csrfCookie}`,
          'X-CSRF-Token': csrfCookie,
        },
        body: JSON.stringify({ name: 'Valid CSRF School', code: 'SEC05_VALID' }),
      });
      assert(validCsrfRes.status === 201, 'Matching CSRF token allows state-changing request to succeed (201 Created)');

      // Subtest D: Safe GET request does NOT require CSRF header
      const safeGetRes = await fetch(`${baseUrl}/api/schools`, {
        method: 'GET',
        headers: {
          Cookie: `${AUTH_COOKIE_NAMES.ACCESS_TOKEN}=${accessCookie}; ${AUTH_COOKIE_NAMES.CSRF_TOKEN}=${csrfCookie}`,
        },
      });
      assert(safeGetRes.status === 200, 'Safe GET request succeeds without CSRF header (200 OK)');

      // Subtest E: Direct Authorization: Bearer token is immune to browser CSRF and does not require CSRF header
      const bearerRes = await fetch(`${baseUrl}/api/schools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessCookie}`,
        },
        body: JSON.stringify({ name: 'Direct Bearer School', code: 'SEC05_BEARER' }),
      });
      assert(bearerRes.status === 201, 'Direct Bearer token succeeds without CSRF header (201 Created)');
    }

    // -------------------------------------------------------------------------
    // Test 8: Cookie Security Attributes in Production vs Development Configuration
    // -------------------------------------------------------------------------
    console.log('\n--- Test 8: Cookie Security Attributes in Production vs Development ---');
    {
      const dummyRes = {
        cookiesSet: [] as Array<{ name: string; val: string; opts: any }>,
        cookie(name: string, val: string, opts: any) {
          this.cookiesSet.push({ name, val, opts });
        },
      } as any;

      // 1. Production Mode
      setAuthCookies(dummyRes, 'acc_prod', 'ref_prod', 'csrf_prod', true);
      const prodAccess = dummyRes.cookiesSet.find((c: any) => c.name === AUTH_COOKIE_NAMES.ACCESS_TOKEN);
      const prodRefresh = dummyRes.cookiesSet.find((c: any) => c.name === AUTH_COOKIE_NAMES.REFRESH_TOKEN);
      const prodCsrf = dummyRes.cookiesSet.find((c: any) => c.name === AUTH_COOKIE_NAMES.CSRF_TOKEN);

      assert(prodAccess?.opts.httpOnly === true, 'Production access cookie has httpOnly: true');
      assert(prodAccess?.opts.secure === true, 'Production access cookie has secure: true');
      assert(prodAccess?.opts.sameSite === 'lax', 'Production access cookie has sameSite: lax');
      assert(prodRefresh?.opts.httpOnly === true, 'Production refresh cookie has httpOnly: true');
      assert(prodRefresh?.opts.secure === true, 'Production refresh cookie has secure: true');
      assert(prodCsrf?.opts.httpOnly === false, 'Production CSRF cookie has httpOnly: false (client accessible)');
      assert(prodCsrf?.opts.secure === true, 'Production CSRF cookie has secure: true');

      // 2. Development Mode
      dummyRes.cookiesSet = [];
      setAuthCookies(dummyRes, 'acc_dev', 'ref_dev', 'csrf_dev', false);
      const devAccess = dummyRes.cookiesSet.find((c: any) => c.name === AUTH_COOKIE_NAMES.ACCESS_TOKEN);
      assert(devAccess?.opts.httpOnly === true, 'Development access cookie has httpOnly: true');
      assert(devAccess?.opts.secure === false, 'Development access cookie has secure: false (allows localhost)');
    }

    // -------------------------------------------------------------------------
    // Test 9: Role-Based Authorization & Tenant Isolation Intact
    // -------------------------------------------------------------------------
    console.log('\n--- Test 9: Role-Based Authorization & Tenant Isolation Intact ---');
    {
      const schoolAdminLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'sec05_schooladmin_a',
          password: 'TestSecretPassword123!',
        }),
      });

      const schoolAdminAccess = getCookieFromHeaders(schoolAdminLogin, AUTH_COOKIE_NAMES.ACCESS_TOKEN)!.value;
      const schoolAdminCsrf = getCookieFromHeaders(schoolAdminLogin, AUTH_COOKIE_NAMES.CSRF_TOKEN)!.value;

      // School admin cannot access Super Admin endpoint (/api/schools POST)
      const forbiddenRes = await fetch(`${baseUrl}/api/schools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${AUTH_COOKIE_NAMES.ACCESS_TOKEN}=${schoolAdminAccess}; ${AUTH_COOKIE_NAMES.CSRF_TOKEN}=${schoolAdminCsrf}`,
          'X-CSRF-Token': schoolAdminCsrf,
        },
        body: JSON.stringify({ name: 'Unauthorized School', code: 'UNAUTH1' }),
      });
      assert(forbiddenRes.status === 403, 'School Admin is forbidden from Super Admin endpoint (403)');

      // Tenant isolation: School admin of School A cannot create students in School B
      const isolationRes = await fetch(`${baseUrl}/api/students`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${AUTH_COOKIE_NAMES.ACCESS_TOKEN}=${schoolAdminAccess}; ${AUTH_COOKIE_NAMES.CSRF_TOKEN}=${schoolAdminCsrf}`,
          'X-CSRF-Token': schoolAdminCsrf,
        },
        body: JSON.stringify({
          studentName: 'Foreign Student',
          className: 'Grade 5',
          section: 'A',
          schoolAdmissionNumber: 'SEC05_ISOL_01',
          schoolId: schoolAdminB.schoolId, // Belongs to School B!
        }),
      });
      assert(isolationRes.status === 403, 'Cross-tenant school access is rejected with 403 Forbidden');
    }

    // -------------------------------------------------------------------------
    // Test 10 & 11: Content Security Policy Verification
    // -------------------------------------------------------------------------
    console.log('\n--- Test 10 & 11: Content Security Policy Verification ---');
    {
      const res = await fetch(`${baseUrl}/health`);
      const cspHeader = res.headers.get('content-security-policy') || '';

      assert(cspHeader.length > 0, 'Content-Security-Policy response header is present');
      assert(!cspHeader.includes("'unsafe-eval'"), 'CSP strictly omits unsafe-eval');
      assert(!cspHeader.includes("script-src 'self' 'unsafe-inline'"), 'CSP script-src strictly omits raw unsafe-inline');
      assert(cspHeader.includes("'nonce-"), 'CSP script-src enforces per-request cryptographic nonces');
      assert(cspHeader.includes("default-src 'self'"), 'CSP default-src is self');
      assert(cspHeader.includes("object-src 'none'"), 'CSP object-src is none');
      assert(cspHeader.includes("base-uri 'self'"), 'CSP base-uri is self');
      assert(cspHeader.includes("form-action 'self'"), 'CSP form-action is self');
      assert(cspHeader.includes('https://fonts.googleapis.com'), 'CSP preserves Google Fonts stylesheet');
      assert(cspHeader.includes('https://fonts.gstatic.com'), 'CSP preserves Google Fonts fonts');
      assert(cspHeader.includes('ws:'), 'CSP preserves websocket connectivity for dev/updates');
    }

    // -------------------------------------------------------------------------
    // Test 12: No Obsolete JWT Storage Remains in localStorage
    // -------------------------------------------------------------------------
    console.log('\n--- Test 12: No Obsolete JWT Storage Remains in localStorage ---');
    {
      const appContent = fs.readFileSync(path.resolve(process.cwd(), 'src', 'App.tsx'), 'utf-8');
      const forcePasswordContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src', 'components', 'ForcePasswordModal.tsx'),
        'utf-8'
      );

      const appHasSetToken = appContent.includes("localStorage.setItem('puzzles_token'");
      const appHasGetToken = appContent.includes("localStorage.getItem('puzzles_token'");
      const forceHasGetToken = forcePasswordContent.includes("localStorage.getItem('puzzles_token'");

      assert(!appHasSetToken, 'src/App.tsx contains NO localStorage.setItem for puzzles_token');
      assert(!appHasGetToken, 'src/App.tsx contains NO localStorage.getItem for puzzles_token');
      assert(!forceHasGetToken, 'src/components/ForcePasswordModal.tsx contains NO localStorage.getItem for puzzles_token');

      // Verify explicit cleanup exists
      assert(appContent.includes("localStorage.removeItem('puzzles_token')"), 'src/App.tsx includes purge of legacy tokens');
    }
  } finally {
    // Clean test database and close server
    await UserModel.deleteMany({ username: { $regex: /^sec05_/ } });
    await SchoolModel.deleteMany({ code: { $regex: /^SEC05_/ } });
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
  console.error('Fatal error in SEC-05 test suite:', err);
  process.exit(1);
});
