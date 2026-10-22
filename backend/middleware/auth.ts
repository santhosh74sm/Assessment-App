import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { UserRole } from '../types.ts';

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

import { sharedStore } from '../services/sharedStore.ts';

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
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
      token?: string;
    }
  }
}

export function generateToken(payload: AuthUserPayload): string {
  const tokenPayload = {
    ...payload,
    jti: crypto.randomUUID(),
  };
  const expiresIn = process.env.JWT_EXPIRES_IN || '2h';
  return jwt.sign(tokenPayload, getJwtSecret(), { expiresIn: expiresIn as any });
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication token missing or invalid' });
    return;
  }

  const token = authHeader.split(' ')[1];

  // SEC-MED-04 & SCAL-LOW-01: Ensure revoked tokens cannot be reused across instances
  const tokenRevoked = await sharedStore.isTokenRevoked(token);
  if (tokenRevoked) {
    res.status(401).json({ error: 'Token has been revoked or expired. Please sign in again.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthUserPayload;
    if (decoded.jti) {
      const jtiRevoked = await sharedStore.isTokenRevoked(decoded.jti);
      if (jtiRevoked) {
        res.status(401).json({ error: 'Token has been revoked or expired. Please sign in again.' });
        return;
      }
    }
    req.user = decoded;
    req.token = token;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token expired or invalid' });
    return;
  }
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
