import type { Request, Response, NextFunction } from 'express';
import { sharedStore } from '../services/sharedStore.ts';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  prefix?: string;
  keyGenerator?: (req: Request) => string;
}

export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = 'Too many requests, please try again later.',
    prefix = 'general',
    keyGenerator = (req: Request) => {
      const forwarded = req.headers['x-forwarded-for'];
      const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || req.ip || req.socket.remoteAddress || 'unknown';
      return ip;
    },
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawKey = keyGenerator(req);
    const storeKey = `${prefix}:${rawKey}`;

    try {
      const result = await sharedStore.checkRateLimit(storeKey, max, windowMs);

      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        res.status(429).json({ error: message, retryAfterSeconds: result.retryAfterSeconds });
        return;
      }

      next();
    } catch (err: any) {
      console.warn('[RateLimiter] Error during rate check, passing through safely:', err.message);
      next();
    }
  };
}

