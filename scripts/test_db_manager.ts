import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {
  UserModel,
  SchoolModel,
  QuestionGroupModel,
  QuestionModel,
  PublishedTestModel,
  StudentTestAssignmentModel,
} from '../database/models.ts';

const EXPECTED_TEST_DB = 'puzzles_assessment_test';
const FORBIDDEN_DEV_DB = 'puzzles_assessment_dev';

const SYNTHETIC_IDENTIFIERS = {
  usernames: ['test_superadmin', 'test_schooladmin', 'test_student_01', 'test_student_02'],
  studentIds: ['test_student_01', 'test_student_02', 'TEST-STU-001', 'TEST-STU-002'],
  schoolCodes: ['TESTSCH01'],
  groupNames: ['Synthetic Test Group'],
  publishNames: ['Synthetic Test Assessment'],
};

/**
 * Connects to MongoDB Atlas strictly enforcing puzzles_assessment_test.
 * Aborts immediately with a fatal error if the connected database is not puzzles_assessment_test
 * or if it resolves to puzzles_assessment_dev.
 */
async function connectTestDatabase(): Promise<mongoose.Connection> {
  const rawUri = (process.env.MONGO_URI || process.env.MONGODB_URI || '').trim();
  if (!rawUri) {
    throw new Error('[Test DB Manager] Neither MONGO_URI nor MONGODB_URI is configured.');
  }

  // Explicitly substitute target database
  let testUri = rawUri;
  if (testUri.includes('/?')) {
    testUri = testUri.replace(/\/[^/?]*\?/, `/${EXPECTED_TEST_DB}?`);
  } else if (testUri.endsWith('/')) {
    testUri = testUri + EXPECTED_TEST_DB;
  } else {
    const parts = testUri.split('?');
    const basePath = parts[0];
    const lastSlashIdx = basePath.lastIndexOf('/');
    const queryString = parts[1] ? `?${parts[1]}` : '';
    if (lastSlashIdx > 0 && !basePath.slice(lastSlashIdx + 1).includes(':')) {
      testUri = `${basePath.substring(0, lastSlashIdx)}/${EXPECTED_TEST_DB}${queryString}`;
    } else {
      testUri = `${basePath}/${EXPECTED_TEST_DB}${queryString}`;
    }
  }

  console.log(`[Test DB Manager] Connecting to designated test database: ${EXPECTED_TEST_DB}...`);
  await mongoose.connect(testUri, {
    dbName: EXPECTED_TEST_DB,
    serverSelectionTimeoutMS: 5000,
    autoIndex: true,
  });

  const connectedDb = mongoose.connection.name;

  // Safeguard 1: Connected name must match EXPECTED_TEST_DB exactly
  if (connectedDb !== EXPECTED_TEST_DB) {
    await mongoose.disconnect();
    throw new Error(
      `[FATAL SECURITY CHECK] Connected database is '${connectedDb}', NOT '${EXPECTED_TEST_DB}'. Aborting immediately!`
    );
  }

  // Safeguard 2: Connected name must NEVER match FORBIDDEN_DEV_DB
  if ((connectedDb as string) === FORBIDDEN_DEV_DB) {
    await mongoose.disconnect();
    throw new Error(
      `[FATAL SECURITY CHECK] Refusing to touch development database '${FORBIDDEN_DEV_DB}'. Aborting immediately!`
    );
  }

  console.log(`[Test DB Manager] Confirmed safe connection to test database: ${connectedDb}`);
  return mongoose.connection;
}

/**
 * Seeds purely synthetic test records into puzzles_assessment_test.
 * Zero real data is copied or exported.
 */
async function seedSyntheticTestData() {
  await connectTestDatabase();

  console.log('[Test DB Manager] Seeding synthetic test fixtures...');

  const salt = bcrypt.genSaltSync(10);
  const hashedAdminPass = bcrypt.hashSync('TestAdminPass123!', salt);
  const hashedSchoolPass = bcrypt.hashSync('TestSchoolPass123!', salt);
  const hashedStudentPass = bcrypt.hashSync('TestStudentPass123!', salt);

  // 1. Synthetic School
  const school = await SchoolModel.findOneAndUpdate(
    { code: 'TESTSCH01' },
    { name: 'Synthetic Test Academy', code: 'TESTSCH01' },
    { upsert: true, returnDocument: 'after' }
  );

  const schoolId = String(school._id);

  // 2. Synthetic Super Admin (Dedicated test credential, does NOT touch 'san')
  await UserModel.findOneAndUpdate(
    { username: 'test_superadmin' },
    {
      username: 'test_superadmin',
      role: 'super_admin',
      passwordHash: hashedAdminPass,
      mustChangePassword: false,
    },
    { upsert: true, returnDocument: 'after' }
  );

  // 3. Synthetic School Admin
  await UserModel.findOneAndUpdate(
    { username: 'test_schooladmin' },
    {
      username: 'test_schooladmin',
      role: 'school_admin',
      passwordHash: hashedSchoolPass,
      mustChangePassword: false,
      schoolId: schoolId,
      schoolName: 'Synthetic Test Academy',
    },
    { upsert: true, returnDocument: 'after' }
  );

  // 4. Synthetic Students
  await UserModel.findOneAndUpdate(
    { username: 'test_student_01' },
    {
      username: 'test_student_01',
      role: 'student',
      passwordHash: hashedStudentPass,
      mustChangePassword: false,
      schoolId: schoolId,
      schoolName: 'Synthetic Test Academy',
      studentName: 'Test Student Alpha',
      className: '10',
      section: 'A',
      schoolAdmissionNumber: 'TEST-ADM-001',
      uniqueStudentId: 'TEST-STU-001',
    },
    { upsert: true, returnDocument: 'after' }
  );

  await UserModel.findOneAndUpdate(
    { username: 'test_student_02' },
    {
      username: 'test_student_02',
      role: 'student',
      passwordHash: hashedStudentPass,
      mustChangePassword: false,
      schoolId: schoolId,
      schoolName: 'Synthetic Test Academy',
      studentName: 'Test Student Beta',
      className: '10',
      section: 'A',
      schoolAdmissionNumber: 'TEST-ADM-002',
      uniqueStudentId: 'TEST-STU-002',
    },
    { upsert: true, returnDocument: 'after' }
  );

  // 5. Synthetic Question Group
  const group = await QuestionGroupModel.findOneAndUpdate(
    { name: 'Synthetic Test Group' },
    {
      name: 'Synthetic Test Group',
      description: 'Synthetic test question group for automated test suite',
    },
    { upsert: true, returnDocument: 'after' }
  );

  const groupId = String(group._id);

  // 6. Synthetic Questions
  await QuestionModel.findOneAndUpdate(
    { groupId: groupId, content: 'What comes next in the test sequence: 2, 4, 6, ?' },
    {
      groupId: groupId,
      groupName: 'Synthetic Test Group',
      difficulty: 'Easy',
      questionType: 'multiple_choice',
      answerType: 'single',
      content: 'What comes next in the test sequence: 2, 4, 6, ?',
      options: ['6', '7', '8', '10'],
      correctAnswer: '8',
      points: 10,
    },
    { upsert: true, returnDocument: 'after' }
  );

  await QuestionModel.findOneAndUpdate(
    { groupId: groupId, content: 'Identify the missing element in the synthetic grid.' },
    {
      groupId: groupId,
      groupName: 'Synthetic Test Group',
      difficulty: 'Medium',
      questionType: 'multiple_choice',
      answerType: 'single',
      content: 'Identify the missing element in the synthetic grid.',
      options: ['Top-Left', 'Top-Right', 'Bottom-Left', 'Bottom-Right'],
      correctAnswer: 'Bottom-Right',
      points: 10,
    },
    { upsert: true, returnDocument: 'after' }
  );

  // 7. Synthetic Published Test
  await PublishedTestModel.findOneAndUpdate(
    { publishName: 'Synthetic Test Assessment' },
    {
      publishName: 'Synthetic Test Assessment',
      publishMode: 'Selected Questions',
      target: {
        schoolId: schoolId,
        schoolName: 'Synthetic Test Academy',
        classes: ['10'],
        sections: ['A'],
      },
      startDate: 'Today',
      endDate: 'Open',
      startTime: '00:00',
      endTime: '23:59',
      durationMinutes: 30,
      totalMarks: 20,
      totalQuestions: 2,
      questions: [],
      status: 'PUBLISHED',
      isPaused: false,
    },
    { upsert: true, returnDocument: 'after' }
  );

  console.log('✓ Successfully seeded synthetic fixtures into puzzles_assessment_test (zero real data touched).');
  await mongoose.disconnect();
}

/**
 * Cleans up ONLY the explicitly identified synthetic test records.
 * NEVER drops collections or deletes unrelated records.
 */
async function cleanSyntheticTestData() {
  await connectTestDatabase();

  console.log('[Test DB Manager] Cleaning only explicitly identified synthetic test records...');

  const userRes = await UserModel.deleteMany({ username: { $in: SYNTHETIC_IDENTIFIERS.usernames } });
  const schoolRes = await SchoolModel.deleteMany({
    $or: [{ code: { $in: SYNTHETIC_IDENTIFIERS.schoolCodes } }, { code: { $regex: /^TESTBETA/ } }],
  });
  const group = await QuestionGroupModel.findOne({ name: 'Synthetic Test Group' });
  let qDeleted = 0;
  let gDeleted = 0;
  if (group) {
    const qRes = await QuestionModel.deleteMany({ groupId: String(group._id) });
    qDeleted = qRes.deletedCount;
    const gRes = await QuestionGroupModel.deleteOne({ _id: group._id });
    gDeleted = gRes.deletedCount;
  }
  const testRes = await PublishedTestModel.deleteMany({
    $or: [
      { publishName: { $in: SYNTHETIC_IDENTIFIERS.publishNames } },
      { publishName: { $regex: /^Functional Assessment/ } },
    ],
  });
  const assignRes = await StudentTestAssignmentModel.deleteMany({
    studentId: { $in: SYNTHETIC_IDENTIFIERS.studentIds },
  });

  console.log(`✓ Cleaned synthetic records:
    - Users: ${userRes.deletedCount}
    - Schools: ${schoolRes.deletedCount}
    - Question Groups: ${gDeleted}
    - Questions: ${qDeleted}
    - Published Tests: ${testRes.deletedCount}
    - Student Assignments: ${assignRes.deletedCount}`);

  await mongoose.disconnect();
}

/**
 * Safe verification mode: verifies connection and database name without making any writes.
 */
async function verifyTestConnection() {
  await connectTestDatabase();
  console.log(`✓ Connection verified: Target is strictly '${mongoose.connection.name}'. No writes performed.`);
  await mongoose.disconnect();
}

// CLI Command Dispatcher
const command = process.argv[2] || 'verify';

switch (command) {
  case 'seed':
    seedSyntheticTestData().catch((err) => {
      console.error('[Test DB Manager Error]', err.message);
      process.exit(1);
    });
    break;
  case 'clean':
    cleanSyntheticTestData().catch((err) => {
      console.error('[Test DB Manager Error]', err.message);
      process.exit(1);
    });
    break;
  case 'verify':
    verifyTestConnection().catch((err) => {
      console.error('[Test DB Manager Error]', err.message);
      process.exit(1);
    });
    break;
  default:
    console.error(`Unknown command: ${command}. Valid commands: verify, seed, clean.`);
    process.exit(1);
}
