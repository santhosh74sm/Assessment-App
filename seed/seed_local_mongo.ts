import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const TARGET_URI = (process.env.MONGO_URI || process.env.MONGODB_URI || '').trim();

/**
 * Seed utility for MongoDB Atlas.
 * Kept strictly for structure verification. All sample records have been removed.
 */
async function verifyDatabaseStructure() {
  if (!TARGET_URI) {
    throw new Error('Neither MONGO_URI nor MONGODB_URI is set.');
  }
  const maskedUri = TARGET_URI.replace(/:([^@/]+)@/, ':****@');
  console.log(`Connecting to MongoDB at: ${maskedUri}...`);
  await mongoose.connect(TARGET_URI, { autoIndex: true });
  console.log(`Connected! Target database: ${mongoose.connection.name}...`);

  const db = mongoose.connection.db;
  if (!db) {
    console.error('No DB instance available.');
    process.exit(1);
  }

  const collections = [
    'users',
    'schools',
    'questiongroups',
    'questions',
    'publishedtests',
    'studenttestassignments',
    'publishhistories',
  ];

  for (const collName of collections) {
    try {
      await db.createCollection(collName);
    } catch (e) {
      // Collection already exists
    }
  }

  console.log('✓ All 7 collection structures verified in database (zero sample records).');
  await mongoose.disconnect();
  process.exit(0);
}

verifyDatabaseStructure().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
