import mongoose from 'mongoose';
import { UserModel } from '../database/models.ts';
import bcrypt from 'bcryptjs';

// CRITICAL: fail fast, do not hang on buffered commands when MongoDB is not connected
mongoose.set('bufferCommands', false);

export function getTargetDatabaseName(): string {
  const isTest = process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'test' || process.env.TARGET_DB_MODE === 'test';
  if (isTest) {
    const testDb = (process.env.TEST_DB_NAME || 'puzzles_assessment_test').trim();
    if (testDb !== 'puzzles_assessment_test') {
      throw new Error(`[Database Security] Refusing connection: test database must be strictly 'puzzles_assessment_test', received '${testDb}'`);
    }
    return 'puzzles_assessment_test';
  }
  return (process.env.MONGO_DB_NAME || 'puzzles_assessment_dev').trim();
}

export async function connectMongoDB(): Promise<{ isConnected: boolean; dbName: string }> {
  try {
    const rawUri = (process.env.MONGO_URI || process.env.MONGODB_URI || '').trim();

    if (!rawUri) {
      throw new Error(
        'Neither MONGO_URI nor MONGODB_URI environment variable is configured.'
      );
    }

    const targetDb = getTargetDatabaseName();
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'test' || process.env.TARGET_DB_MODE === 'test';

    // Strict Safeguard 1: Test mode must NEVER point to development database
    if (isTestMode && targetDb === 'puzzles_assessment_dev') {
      throw new Error(
        '[Database Security] FATAL: Test mode is active but target database is puzzles_assessment_dev. Aborting immediately to protect development data.'
      );
    }

    // Build final URI ensuring target database is applied
    let finalUri = rawUri;
    if (finalUri.includes('/?')) {
      finalUri = finalUri.replace(/\/[^/?]*\?/, `/${targetDb}?`);
    } else if (finalUri.endsWith('/')) {
      finalUri = finalUri + targetDb;
    } else {
      const parts = finalUri.split('?');
      const basePath = parts[0];
      const lastSlashIdx = basePath.lastIndexOf('/');
      const queryString = parts[1] ? `?${parts[1]}` : '';
      if (lastSlashIdx > 0 && !basePath.slice(lastSlashIdx + 1).includes(':')) {
        finalUri = `${basePath.substring(0, lastSlashIdx)}/${targetDb}${queryString}`;
      } else {
        finalUri = `${basePath}/${targetDb}${queryString}`;
      }
    }

    console.log(`[Database] Connecting to configured MongoDB deployment (target database: ${targetDb}).`);

    await mongoose.connect(finalUri, {
      dbName: targetDb,
      serverSelectionTimeoutMS: 5000,
      autoIndex: true,
    });

    const connectedDbName = mongoose.connection.name;

    // Strict Safeguard 2: Verify actual connected Mongoose database name
    if (isTestMode) {
      if (connectedDbName !== 'puzzles_assessment_test') {
        await mongoose.disconnect();
        throw new Error(
          `[Database Security] Verification failed: Expected connected database 'puzzles_assessment_test', but actual connection is '${connectedDbName}'. Aborting immediately!`
        );
      }
    }

    console.log(`[Database] Successfully connected to dedicated database: ${connectedDbName}`);

    // Ensure required collection and schema structures exist in the database without inserting sample data
    await ensureCollectionStructures();

    // Strict Safeguard 3: Only run initial Super Admin check in development/production mode
    // In test mode, we do NOT touch 'san'. Dedicated synthetic test accounts are seeded independently.
    if (!isTestMode) {
      await ensureInitialSuperAdmin();
    }

    return { isConnected: true, dbName: connectedDbName };
  } catch (err: any) {
    const errorName = typeof err?.name === 'string' ? err.name : 'UnknownError';
    const errorCode = typeof err?.code === 'string' || typeof err?.code === 'number' ? `, code: ${err.code}` : '';
    console.error(`[Database] MongoDB Atlas connection failed (${errorName}${errorCode}):`, err.message || err);
    throw err;
  }
}

/**
 * Ensures all required collections exist in the dedicated database puzzles_assessment_dev
 * but DOES NOT insert any demo, sample, or seed data. All collections remain clean for real production entry.
 */
export async function ensureCollectionStructures() {
  const db = mongoose.connection.db;
  if (!db) {
    console.warn('[Database] Mongoose database object not available');
    return;
  }

  const existingCollections = (await db.listCollections().toArray()).map((c) => c.name);
  const requiredCollections = [
    'users',
    'schools',
    'questiongroups',
    'questions',
    'publishedtests',
    'studenttestassignments',
    'publishhistories',
    'assessmenttemplates',
  ];

  for (const coll of requiredCollections) {
    if (!existingCollections.includes(coll)) {
      try {
        await db.createCollection(coll);
        console.log(`[Database] Verified empty collection '${coll}' in puzzles_assessment_dev`);
      } catch (err: any) {
        // collection already exists
      }
    }
  }

  try {
    await UserModel.createIndexes();
    console.log('[Database] Verified UserModel compound unique indexes in puzzles_assessment_dev');
  } catch (err: any) {
    console.warn('[Database] UserModel createIndexes notice:', err.message);
  }

  console.log('[Database] puzzles_assessment_dev collections verified ready with zero sample data.');
}

/**
 * Ensures ONLY the designated initial Super Admin ('san') exists if no Super Admin is registered.
 * Enforces mustChangePassword: true. No other credentials (admin, Rolecall, etc.) or demo entities are added.
 */
export async function ensureInitialSuperAdmin() {
  try {
    const existingSuperAdmin = await UserModel.findOne({
      $or: [{ role: 'super_admin' }, { username: 'san' }],
    });
    if (!existingSuperAdmin) {
      const username = 'san';
      const password = 'san';
      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(password, salt);

      await UserModel.create({
        username,
        role: 'super_admin',
        passwordHash,
        mustChangePassword: true,
      });

      console.log(`[Database] Initial Super Admin 'san' initialized in Atlas puzzles_assessment_dev with mustChangePassword: true.`);
    } else {
      console.log(`[Database] Verified existing Super Admin '${existingSuperAdmin.username}' in Atlas (mustChangePassword: ${existingSuperAdmin.mustChangePassword}). Existing credentials preserved.`);
    }
  } catch (err: any) {
    console.error('[Database] Failed to verify/initialize initial Super Admin:', err.message);
  }
}

export function getMongoConnectionInfo() {
  const isConnected = mongoose.connection.readyState === 1;
  return {
    isConnected,
    readyState: mongoose.connection.readyState,
    status: isConnected ? 'connected' : 'disconnected',
  };
}

export async function closeMongoDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
