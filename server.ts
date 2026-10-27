import 'dotenv/config';

import express from 'express';
import { createServer as createViteServer } from 'vite';
import routes from './backend/routes.ts';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { connectMongoDB, getMongoConnectionInfo } from './backend/database.ts';
import { getJwtSecret, parseCookies } from './backend/middleware/auth.ts';

async function startServer() {
  const app = express();
  // Parse command line arguments (--port, --host)
  let cliPort: number | undefined;
  let cliHost: string | undefined;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--port' && process.argv[i + 1]) {
      const p = parseInt(process.argv[i + 1], 10);
      if (!isNaN(p) && p > 0) cliPort = p;
    } else if (arg.startsWith('--port=')) {
      const p = parseInt(arg.split('=')[1], 10);
      if (!isNaN(p) && p > 0) cliPort = p;
    } else if (arg === '--host' && process.argv[i + 1]) {
      cliHost = process.argv[i + 1];
    } else if (arg.startsWith('--host=')) {
      cliHost = arg.split('=')[1];
    }
  }

  // Port configuration:
  // - In AI Studio and Nginx proxy setups, the dev server listens on port 3000 (proxied from 8080).
  // - If DEFAULT_APP_PORT is defined (e.g. 3000), prefer it over PORT (which Nginx binds on 8080).
  // - In standalone production Cloud Run containers without Nginx, bind to process.env.PORT.
  const isDevCommand = process.env.npm_lifecycle_event === 'dev' || process.env.NODE_ENV !== 'production';
  const defaultPort = Number(process.env.DEFAULT_APP_PORT) || 3000;
  let targetPort: number;
  if (cliPort) {
    targetPort = cliPort;
  } else if (process.env.DEFAULT_APP_PORT) {
    targetPort = Number(process.env.DEFAULT_APP_PORT);
  } else if (isDevCommand || process.env.PORT === '8080') {
    targetPort = 3000;
  } else {
    targetPort = Number(process.env.PORT) || 3000;
  }

  const fallbackPort = 3000;
  const HOST = cliHost || process.env.HOST || '0.0.0.0';

  // JWT_SECRET security enforcement: Ephemeral fallback in development, validated in production
  try {
    getJwtSecret();
  } catch (err: any) {
    console.warn('[System] Warning initializing JWT secret:', err.message);
  }

  // SEC-MED-05 & SEC-05: HTTP Security Headers Middleware & Hardened CSP
  app.use((req, res, next) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.nonce = nonce;

    // Parse incoming cookies into req.cookies
    if (!req.cookies) {
      req.cookies = parseCookies(req.headers.cookie);
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Hardened CSP: No unsafe-eval, no raw unsafe-inline for scripts (nonce-guarded), strict base-uri and object-src
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

  // Normalize consecutive slashes in request paths to prevent path confusion (e.g. "//788887" -> "/788887", "//api" -> "/api")
  app.use((req, _res, next) => {
    const [pathname, ...queryParts] = req.url.split('?');
    const normalizedPath = pathname.replace(/\/+/g, '/');
    if (normalizedPath !== pathname) {
      req.url = queryParts.length > 0 ? `${normalizedPath}?${queryParts.join('?')}` : normalizedPath;
    }
    next();
  });

  app.use(express.json());

  // Root and API health check endpoints for Cloud Run / Nginx container probes
  // SEC-LOW-01: Public health endpoints must NOT expose hostnames, ports, URIs, or internal topology
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'Puzzles Assessment Engine' });
  });

  app.get('/api/health', (_req, res) => {
    const info = getMongoConnectionInfo();
    res.status(200).json({
      status: 'ok',
      service: 'Puzzles Assessment Engine (Node.js + Express)',
      uptime: process.uptime(),
      database: {
        status: info.isConnected ? 'connected' : 'disconnected',
        readyState: info.readyState,
      },
    });
  });

  // Database status and verification endpoint (Sanitized against info leakage)
  app.get('/api/database/status', (_req, res) => {
    const info = getMongoConnectionInfo();
    res.json({
      status: info.isConnected ? 'connected' : 'disconnected',
      readyState: info.readyState,
    });
  });

  // Serve downloadable static assets
  app.use(express.static(path.resolve(process.cwd(), 'public')));

  // Mount API endpoints
  app.use('/api', routes);

  // 404 Catch-All for unmatched /api/* endpoints
  // Ensures unknown API requests return HTTP 404 JSON in both dev and production
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });
  app.all('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Database connection error handler: Return clear error if MongoDB Atlas is unavailable
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (
      err?.name === 'MongooseError' ||
      err?.name === 'MongoNetworkError' ||
      err?.name === 'MongoServerSelectionError' ||
      (typeof err?.message === 'string' &&
        (err.message.includes('buffering timed out') ||
         err.message.includes('not connected') ||
         err.message.includes('connect ECONNREFUSED')))
    ) {
      console.error('[Database Error] MongoDB Atlas unavailable:', err.message || err);
      return res.status(503).json({
        error: 'Database connection error: MongoDB Atlas is currently unavailable. Please verify your MongoDB connection string and network configuration.',
        details: err.message,
      });
    }
    next(err);
  });

  // Determine whether running in production mode
  const distPath = path.resolve(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.resolve(distPath, 'index.html'));
  const isProduction = Boolean(hasDist && process.env.NODE_ENV === 'production' && process.env.npm_lifecycle_event !== 'dev');

  if (isProduction && hasDist) {
    console.log(`[System] Running in production mode, serving built SPA from: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path === '/health') {
        return next();
      }
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    console.log('[System] Running in development mode with Vite middleware');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  let activeServer: any = null;

  function startListening(port: number, fallback?: number) {
    const serverInstance = app.listen(port, HOST, () => {
      console.log(`[System] Server listening on ${HOST}:${port} (mode: ${isProduction ? 'production' : 'development'})`);
    });

    serverInstance.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE' && fallback && fallback !== port) {
        console.warn(`[System] Port ${port} is in use (EADDRINUSE), attempting fallback to port ${fallback}...`);
        startListening(fallback);
      } else {
        console.error(`[System] Server listen error on port ${port}:`, err.message);
      }
    });

    activeServer = serverInstance;
    return serverInstance;
  }

  startListening(targetPort, fallbackPort);

  const cleanShutdown = () => {
    if (activeServer) {
      activeServer.close(() => {
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  };
  process.on('SIGTERM', cleanShutdown);
  process.on('SIGINT', cleanShutdown);

  process.on('unhandledRejection', (reason) => {
    console.warn('[System] Unhandled promise rejection notice:', reason);
  });

  // Establish and verify MongoDB Connection asynchronously so server startup is instantaneous
  console.log('[System] Initializing MongoDB database connection...');
  connectMongoDB()
    .then((dbInfo) => {
      if (dbInfo.isConnected) {
        console.log(`[System] Verified MongoDB connection to database: ${dbInfo.dbName}`);
      } else {
        console.warn('[System] MongoDB operating in offline/preview resilience mode.');
      }
    })
    .catch((err: any) => {
      const errorName = typeof err?.name === 'string' ? err.name : 'UnknownError';
      const errorCode = typeof err?.code === 'string' || typeof err?.code === 'number' ? `, code: ${err.code}` : '';
      console.warn(`[System] MongoDB connection unavailable (${errorName}${errorCode}).`);
    });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});

