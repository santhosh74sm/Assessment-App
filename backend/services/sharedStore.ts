import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import dns from 'dns';
import { URL } from 'url';

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

export interface SharedStoreConfig {
  redisUrl?: string;
  redisHost?: string;
  redisPort?: number;
  redisPassword?: string;
}

class SharedStore {
  private redisClient: Redis | null = null;
  private subscriberClient: Redis | null = null;
  private isRedisConnected = false;
  private memoryRevokedTokens = new Map<string, number>(); // key -> expiryTimestampMs
  private memoryRateLimits = new Map<string, { count: number; resetTime: number }>();
  private memoryCleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.initMemoryCleanup();
    this.initRedis();
  }

  private initMemoryCleanup(): void {
    this.memoryCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, expiry] of this.memoryRevokedTokens.entries()) {
        if (now > expiry) {
          this.memoryRevokedTokens.delete(key);
        }
      }
      for (const [key, data] of this.memoryRateLimits.entries()) {
        if (now > data.resetTime) {
          this.memoryRateLimits.delete(key);
        }
      }
    }, 2 * 60 * 1000);

    if (this.memoryCleanupTimer.unref) {
      this.memoryCleanupTimer.unref();
    }
  }

  private closeRedisSilently(): void {
    this.isRedisConnected = false;
    try {
      this.redisClient?.disconnect();
    } catch (_) {}
    try {
      this.subscriberClient?.disconnect();
    } catch (_) {}
    this.redisClient = null;
    this.subscriberClient = null;
  }

  private initRedis(): void {
    const rawUrl = process.env.REDIS_URL?.trim();
    const rawHost = process.env.REDIS_HOST?.trim();
    const redisPort = Number(process.env.REDIS_PORT) || 6379;
    const redisPassword = process.env.REDIS_PASSWORD || undefined;

    if (!rawUrl && !rawHost) {
      console.log('[SharedStore] No REDIS_URL or REDIS_HOST configured. Using active in-memory store adapter (single-node mode).');
      return;
    }

    // Determine target hostname for pre-flight resolution check
    let targetHost = rawHost || '';
    if (rawUrl) {
      try {
        const parsed = new URL(rawUrl);
        targetHost = parsed.hostname;
      } catch (_) {
        targetHost = rawUrl.split('@').pop()?.split(':')[0] || '';
      }
    }

    if (!targetHost) {
      console.log('[SharedStore] Notice: Redis host not specified. Operating with active in-memory store adapter.');
      return;
    }

    // Pre-flight check: Verify if the Redis host is resolvable in the current network environment.
    // This prevents noise and DNS resolution errors (e.g. Render private hostnames red-* when running outside the internal VPC).
    dns.lookup(targetHost, (dnsErr, address) => {
      if (dnsErr || !address) {
        console.log(`[SharedStore] Notice: Redis host '${targetHost}' is not reachable in this environment (${dnsErr?.code || 'UNRESOLVABLE'}). Running with in-memory adapter.`);
        return;
      }

      // Hostname is resolvable; attempt clean lazy connection
      this.connectRedis(rawUrl, targetHost, redisPort, redisPassword);
    });
  }

  private connectRedis(
    redisUrl?: string,
    redisHost?: string,
    redisPort?: number,
    redisPassword?: string
  ): void {
    try {
      const redisOptions = {
        lazyConnect: true,
        enableReadyCheck: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 4000,
        retryStrategy: (times: number) => {
          if (times > 3) {
            this.closeRedisSilently();
            return null; // Stop reconnecting after 3 attempts, rely on memory fallback
          }
          return Math.min(times * 300, 1500);
        },
      };

      if (redisUrl) {
        const masked = redisUrl.replace(/:([^@/]+)@/, ':****@');
        console.log(`[SharedStore] Connecting to distributed Redis store at: ${masked}`);
        this.redisClient = new Redis(redisUrl, redisOptions);
      } else if (redisHost) {
        console.log(`[SharedStore] Connecting to distributed Redis store at: ${redisHost}:${redisPort}`);
        this.redisClient = new Redis({
          host: redisHost,
          port: redisPort,
          password: redisPassword,
          ...redisOptions,
        });
      }

      if (!this.redisClient) return;

      this.redisClient.on('error', (err: any) => {
        this.isRedisConnected = false;
        if (err.code === 'EAI_AGAIN' || err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
          this.closeRedisSilently();
        }
      });

      this.redisClient.on('connect', () => {
        this.isRedisConnected = true;
      });

      this.redisClient.on('ready', () => {
        this.isRedisConnected = true;
      });

      this.redisClient.on('close', () => {
        this.isRedisConnected = false;
      });

      this.redisClient
        .connect()
        .then(() => {
          this.isRedisConnected = true;
          console.log('[SharedStore] Successfully connected to distributed Redis store.');
          this.initSubscriber(redisUrl, redisHost, redisPort, redisPassword, redisOptions);
        })
        .catch((err: any) => {
          this.closeRedisSilently();
          console.log(`[SharedStore] Notice: Redis connection unavailable (${err.message}). Seamlessly active in in-memory mode.`);
        });
    } catch (err: any) {
      this.closeRedisSilently();
      console.log(`[SharedStore] Notice: Redis client initialization skipped (${err.message}). Operating in in-memory mode.`);
    }
  }

  private initSubscriber(
    redisUrl?: string,
    redisHost?: string,
    redisPort?: number,
    redisPassword?: string,
    redisOptions?: any
  ): void {
    try {
      if (redisUrl) {
        this.subscriberClient = new Redis(redisUrl, redisOptions);
      } else if (redisHost) {
        this.subscriberClient = new Redis({
          host: redisHost,
          port: redisPort,
          password: redisPassword,
          ...redisOptions,
        });
      }

      if (!this.subscriberClient) return;

      this.subscriberClient.on('error', () => {
        // Suppress subscriber errors
      });

      this.subscriberClient
        .connect()
        .then(() => {
          this.subscriberClient?.subscribe('puzzles:token_revocations', (err) => {
            if (err) {
              // Subscriber channel notice
            }
          });
        })
        .catch(() => {
          this.subscriberClient = null;
        });

      this.subscriberClient.on('message', (_channel, message) => {
        try {
          const data = JSON.parse(message);
          if (data.key && data.expiryMs) {
            this.memoryRevokedTokens.set(data.key, data.expiryMs);
          }
        } catch (_) {}
      });
    } catch (_) {
      this.subscriberClient = null;
    }
  }

  public isRedisActive(): boolean {
    return Boolean(this.isRedisConnected && this.redisClient && this.redisClient.status === 'ready');
  }

  /**
   * Synchronously checks if a token or jti is in the local memory revoked registry.
   */
  public isTokenRevokedSync(tokenOrJti: string): boolean {
    if (!tokenOrJti) return false;
    if (this.memoryRevokedTokens.has(tokenOrJti)) return true;
    try {
      const decoded = jwt.decode(tokenOrJti) as any;
      if (decoded?.jti && this.memoryRevokedTokens.has(decoded.jti)) return true;
    } catch (_) {}
    return false;
  }

  /**
   * Asynchronously checks if a token or jti is revoked, querying both memory cache and distributed Redis.
   */
  public async isTokenRevoked(tokenOrJti: string): Promise<boolean> {
    if (!tokenOrJti) return false;

    // Fast-path: local memory check
    if (this.isTokenRevokedSync(tokenOrJti)) {
      return true;
    }

    let jti: string | undefined;
    try {
      const decoded = jwt.decode(tokenOrJti) as any;
      jti = decoded?.jti;
      if (jti && this.memoryRevokedTokens.has(jti)) {
        return true;
      }
    } catch (_) {}

    // Distributed Redis check if active
    if (this.isRedisActive() && this.redisClient) {
      try {
        const keysToCheck = [`revoked_token:${tokenOrJti}`];
        if (jti) keysToCheck.push(`revoked_token:${jti}`);

        const results = await this.redisClient.mget(...keysToCheck);
        const isRevokedInRedis = results.some((val) => val !== null);

        if (isRevokedInRedis) {
          // Cache in local memory for fast future checks
          const defaultExpiry = Date.now() + 2 * 60 * 60 * 1000;
          this.memoryRevokedTokens.set(tokenOrJti, defaultExpiry);
          if (jti) this.memoryRevokedTokens.set(jti, defaultExpiry);
          return true;
        }
      } catch (_) {
        // Safe fallback to local memory state
      }
    }

    return false;
  }

  /**
   * Revokes a token across local memory and distributed Redis store.
   */
  public async revokeToken(token: string): Promise<void> {
    let expiryMs = Date.now() + 2 * 60 * 60 * 1000;
    let jti: string | undefined;

    try {
      const decoded = jwt.decode(token) as any;
      if (decoded?.exp) {
        expiryMs = decoded.exp * 1000;
      }
      jti = decoded?.jti;
    } catch (_) {}

    // 1. Update local memory
    this.memoryRevokedTokens.set(token, expiryMs);
    if (jti) {
      this.memoryRevokedTokens.set(jti, expiryMs);
    }

    // 2. Update distributed Redis if active
    if (this.isRedisActive() && this.redisClient) {
      const ttlSeconds = Math.max(60, Math.ceil((expiryMs - Date.now()) / 1000));
      try {
        const pipeline = this.redisClient.pipeline();
        pipeline.set(`revoked_token:${token}`, '1', 'EX', ttlSeconds);
        if (jti) {
          pipeline.set(`revoked_token:${jti}`, '1', 'EX', ttlSeconds);
        }
        pipeline.publish(
          'puzzles:token_revocations',
          JSON.stringify({ key: token, jti, expiryMs })
        );
        await pipeline.exec();
      } catch (_) {
        // Safe fallback: token is preserved in local memory
      }
    }
  }

  /**
   * Distributed rate limit evaluation. Uses atomic Redis increments or safe local memory fallback.
   */
  public async checkRateLimit(
    key: string,
    max: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    const now = Date.now();

    // 1. If Redis is active, perform atomic distributed rate limiting
    if (this.isRedisActive() && this.redisClient) {
      try {
        const redisKey = `ratelimit:${key}`;
        // Lua script ensures atomic INCR and PEXPIRE on first access
        const luaScript = `
          local current = redis.call('INCR', KEYS[1])
          if current == 1 then
            redis.call('PEXPIRE', KEYS[1], ARGV[1])
          end
          local ttl = redis.call('PTTL', KEYS[1])
          return { current, ttl }
        `;

        const res = (await this.redisClient.eval(
          luaScript,
          1,
          redisKey,
          windowMs
        )) as [number, number];

        const count = Number(res[0]);
        const ttlMs = Number(res[1]) > 0 ? Number(res[1]) : windowMs;
        const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000));

        return {
          allowed: count <= max,
          count,
          retryAfterSeconds,
        };
      } catch (_) {
        // Safe fallback to in-memory evaluation
      }
    }

    // 2. Safe in-memory fallback
    const record = this.memoryRateLimits.get(key);
    if (!record || now > record.resetTime) {
      this.memoryRateLimits.set(key, { count: 1, resetTime: now + windowMs });
      return { allowed: true, count: 1, retryAfterSeconds: Math.ceil(windowMs / 1000) };
    }

    record.count++;
    const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));

    return {
      allowed: record.count <= max,
      count: record.count,
      retryAfterSeconds,
    };
  }

  public getStatus() {
    return {
      type: this.isRedisActive() ? 'redis' : 'in-memory',
      isRedisConnected: this.isRedisConnected,
      isRedisActive: this.isRedisActive(),
    };
  }

  public async close(): Promise<void> {
    if (this.memoryCleanupTimer) {
      clearInterval(this.memoryCleanupTimer);
      this.memoryCleanupTimer = null;
    }
    this.closeRedisSilently();
  }
}

export const sharedStore = new SharedStore();
