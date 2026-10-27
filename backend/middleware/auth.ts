import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { UserRole } from '../types.ts';
import { sharedStore } from '../services/sharedStore.ts';

let devEphemeralSecret: string | null = null;

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret && secret.length >= 32) {
    return secret;
  }

  // Fallback: Ephemeral random secret (NEVER hardcoded, cannot be predicted by external attackers)
  if (!devEphemeralSecret) {
    devEphemeralSecret = crypto.randomBytes(32).toString('hex');
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      console.warn(
        '[Security Warning] JWT_SECRET is not configured or is shorter than 32 characters in production. An ephemeral random secret has been generated for this instance. Configure a strong JWT_SECRET (>= 32 chars) in environment variables for persistent sessions.'
      );
    } else {
      console.warn(
        '[Security Notice] JWT_SECRET is not configured or shorter than 32 characters in development. An ephemeral random secret has been generated for this session.'
      );
    }
  }
  return devEphemeralSecret;
}

// Cookie name constants
export const AUTH_COOKIE_NAMES = {
  ACCESS_TOKEN: 'puzzles_access_token',
  REFRESH_TOKEN: 'puzzles_refresh_token',
  CSRF_TOKEN: 'puzzles_csrf_token',
} as const;

// Helper to parse standard cookie header into key-value map
export function parseCookies(header?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  const pairs = header.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.substring(0, idx).trim();
    let val = pair.substring(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  }
  return cookies;
}

// SEC-MED-04 & SCAL-LOW-01: Shared store token revocation registry (Redis + Memory fallback)
export function revokeToken(token: string): void {
  sharedStore.revokeToken(token).catch((err) => {
    console.warn('[Auth] Token revocation error:', err.message);
  });
}

export function isTokenRevoked(token: string): boolean {
  return sharedStore.isTokenRevokedSync(token);
}

export interface AuthUserPayload {
  userId: string;
  username: string;
  role: UserRole;
  schoolId?: string;
  schoolName?: string;
  studentId?: string;
  studentName?: string;
  jti?: string;
  type?: 'access' | 'refresh';
}

declare global {
  namespace Express {
    interface Request {
      cookies?: Record<string, string>;
      user?: AuthUserPayload;
      token?: string;
      authMode?: 'cookie' | 'bearer';
      csrfToken?: string;
    }
  }
}

// Generate Access Token (Short-lived, e.g. 15 minutes)
export function generateAccessToken(payload: AuthUserPayload): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const expiresIn = process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '15m';
  const token = jwt.sign(
    {
      ...payload,
      jti,
      type: 'access',
    },
    getJwtSecret(),
    { expiresIn: expiresIn as any }
  );
  return { token, jti };
}

// Generate Refresh Token (Long-lived, e.g. 7 days)
export function generateRefreshToken(payload: AuthUserPayload): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  const token = jwt.sign(
    {
      userId: payload.userId,
      username: payload.username,
      role: payload.role,
      schoolId: payload.schoolId,
      schoolName: payload.schoolName,
      studentId: payload.studentId,
      studentName: payload.studentName,
      jti,
      type: 'refresh',
    },
    getJwtSecret(),
    { expiresIn: expiresIn as any }
  );
  return { token, jti };
}

// Generate random CSRF Token
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Preserved for backward compatibility
export function generateToken(payload: AuthUserPayload): string {
  return generateAccessToken(payload).token;
}

// Set secure auth cookies on Express response
export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  csrfToken: string,
  isProduction = process.env.NODE_ENV === 'production'
): void {
  // 1. Access Token: HttpOnly, SameSite=Lax, 15 minutes
  res.cookie(AUTH_COOKIE_NAMES.ACCESS_TOKEN, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60 * 1000,
  });

  // 2. Refresh Token: HttpOnly, SameSite=Lax, 7 days
  res.cookie(AUTH_COOKIE_NAMES.REFRESH_TOKEN, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // 3. CSRF Token: Accessible to client-side JS to send in X-CSRF-Token header
  res.cookie(AUTH_COOKIE_NAMES.CSRF_TOKEN, csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// Clear all auth cookies on logout or session invalidation
export function clearAuthCookies(
  res: Response,
  isProduction = process.env.NODE_ENV === 'production'
): void {
  res.clearCookie(AUTH_COOKIE_NAMES.ACCESS_TOKEN, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
  res.clearCookie(AUTH_COOKIE_NAMES.REFRESH_TOKEN, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
  res.clearCookie(AUTH_COOKIE_NAMES.CSRF_TOKEN, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

// Authentication middleware supporting both secure cookies and Authorization: Bearer
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.cookies) {
    req.cookies = parseCookies(req.headers.cookie);
  }

  let token: string | undefined;
  let authMode: 'cookie' | 'bearer' = 'bearer';

  const cookieToken = req.cookies[AUTH_COOKIE_NAMES.ACCESS_TOKEN];
  const authHeader = req.headers.authorization;

  if (cookieToken) {
    token = cookieToken;
    authMode = 'cookie';
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
    authMode = 'bearer';
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication token missing or invalid' });
    return;
  }

  // SEC-MED-04 & SCAL-LOW-01: Ensure revoked tokens cannot be reused across instances
  const tokenRevoked = await sharedStore.isTokenRevoked(token);
  if (tokenRevoked) {
    res.status(401).json({ error: 'Token has been revoked or expired. Please sign in again.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthUserPayload & { type?: string };
    if (decoded.jti) {
      const jtiRevoked = await sharedStore.isTokenRevoked(decoded.jti);
      if (jtiRevoked) {
        res.status(401).json({ error: 'Token has been revoked or expired. Please sign in again.' });
        return;
      }
    }
    req.user = decoded;
    req.token = token;
    req.authMode = authMode;

    // Enforce CSRF protection on state-changing requests when authenticated via cookie
    if (authMode === 'cookie') {
      const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
      if (stateChangingMethods.includes(req.method.toUpperCase())) {
        const csrfCookie = req.cookies?.[AUTH_COOKIE_NAMES.CSRF_TOKEN];
        const csrfHeader = (req.headers['x-csrf-token'] || req.headers['x-xsrf-token']) as string | undefined;

        if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
          res.status(403).json({ error: 'CSRF token missing or invalid' });
          return;
        }
      }
    }

    next();
  } catch (err) {
    res.status(401).json({ error: 'Token expired or invalid' });
    return;
  }
}

// CSRF validation middleware for cookie-authenticated state-changing requests
export function verifyCsrfToken(req: Request, res: Response, next: NextFunction): void {
  // Only enforce for state-changing HTTP methods
  const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  if (!stateChangingMethods.includes(req.method.toUpperCase())) {
    return next();
  }

  // Only enforce when authenticated via cookie (Bearer headers are immune to browser cross-origin CSRF)
  if (req.authMode !== 'cookie') {
    return next();
  }

  const csrfCookie = req.cookies?.[AUTH_COOKIE_NAMES.CSRF_TOKEN];
  const csrfHeader = (req.headers['x-csrf-token'] || req.headers['x-xsrf-token']) as string | undefined;

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    res.status(403).json({ error: 'CSRF token missing or invalid' });
    return;
  }

  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Access forbidden: Insufficient permissions' });
      return;
    }
    next();
  };
}

// SEC-INFO-02: Audited school isolation middleware helper
export function checkSchoolIsolation(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  // Super Admin can access all schools
  if (req.user.role === 'super_admin') {
    return next();
  }

  // School Admin and Student can only access their assigned school
  const requestedSchoolId = req.params.schoolId || req.query.schoolId || req.body.schoolId;
  if (requestedSchoolId && req.user.schoolId && requestedSchoolId !== req.user.schoolId) {
    res.status(403).json({ error: 'Forbidden: Access restricted to your own school workspace' });
    return;
  }
  next();
}
