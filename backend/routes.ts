import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  UserModel,
  SchoolModel,
  QuestionGroupModel,
  QuestionModel,
  PublishedTestModel,
  StudentTestAssignmentModel,
  PublishHistoryModel,
  AssessmentTemplateModel,
} from '../database/models.ts';
import { generateToken, authenticate, requireRole, revokeToken } from './middleware/auth.ts';
import { createRateLimiter } from './middleware/rateLimiter.ts';
import {
  computeStudentInsights,
  selectRandomQuestionsForRuleEngine,
} from './services/randomEngine.ts';
import { hasAutomaticallyScorableAnswer } from './services/questionScoring.ts';
import { serializeQuestionForRole, serializeStudentQuestion } from './services/studentQuestionSerializer.ts';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { s3Service } from './services/s3Service.ts';
import type { Question, QuestionAttemptLog } from './types.ts';
import { to12Hour, to24Hour, toISODate, isScheduledForFuture, isAssessmentExpired } from '../src/utils/dateTime.ts';

const router = express.Router();

// File upload configuration for AWS S3 image storage (SEC-MED-05: strict MIME and size controls)
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max per image
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (allowed.includes((file.mimetype || '').toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported image type '${file.mimetype}'. Only JPEG, PNG, WebP, GIF, and SVG are allowed.`));
    }
  },
});

// Middleware wrappers that capture Multer errors and return clean JSON
const handleSingleImageUpload = (req: Request, res: Response, next: NextFunction) => {
  uploadImage.single('image')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large. Maximum file size is 5 MB.' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ error: err.message || 'Image upload failed' });
    }
    next();
  });
};

const handleMultipleImagesUpload = (req: Request, res: Response, next: NextFunction) => {
  uploadImage.array('images', 10)(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large. Maximum file size is 5 MB.' });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ error: 'Too many files or unexpected field name. Maximum is 10 images.' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ error: err.message || 'Image upload failed' });
    }
    next();
  });
};

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max for Excel import
});

function canonicalizeRequestValue(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalizeRequestValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeRequestValue(value[key])]));
  }
  return value;
}

/** Return question snapshots only from assessments the authenticated student can currently access. */
async function getStudentAccessibleAssignments(req: Request) {
  const studentId = req.user!.studentId || req.user!.username;
  const assignments = await StudentTestAssignmentModel.find({
    studentId,
    status: { $in: ['NOT_STARTED', 'IN_PROGRESS'] },
  });
  const publishIds = Array.from(new Set(assignments.map((a: any) => String(a.publishedTestId))));
  const publishedTests = publishIds.length
    ? await PublishedTestModel.find({ _id: { $in: publishIds } })
    : [];
  const publishById = new Map(publishedTests.map((p: any) => [String(p._id), p]));
  const hasValidUserId = Boolean(req.user!.userId && mongoose.isValidObjectId(req.user!.userId));
  const escapedStudentId = escapeRegExp(studentId);
  const student = (hasValidUserId ? await UserModel.findById(req.user!.userId).lean() : null) ||
    await UserModel.findOne({
      $or: [
        { uniqueStudentId: { $regex: new RegExp(`^${escapedStudentId}$`, 'i') } },
        { username: { $regex: new RegExp(`^${escapedStudentId}$`, 'i') } },
      ],
    }).lean();
  if (!student) return [];

  const now = getServerAuthoritativeDateTimeStr(req);
  return assignments.filter((assignment: any) => {
    const pub = publishById.get(String(assignment.publishedTestId));
    if (!pub || pub.isPaused || pub.status === 'PAUSED') return false;
    if (assignment.status === 'NOT_STARTED' && !isStudentTargetedByPublishedTest(student, pub)) return false;
    if (pub.startDate && pub.startDate !== 'Today') {
      const start = `${toISODate(pub.startDate)}T${to24Hour(pub.startTime || '00:00')}`;
      if (isScheduledForFuture(now, start, 0)) return false;
    }
    if (pub.endDate && pub.endDate !== 'Open') {
      const end = `${toISODate(pub.endDate)}T${to24Hour(pub.endTime || '23:59')}`;
      if (isAssessmentExpired(now, end, 0)) return false;
    }
    return true;
  });
}

// SEC-HIGH-04 & SCAL-LOW-01: Granular server-side rate limiters with distributed store support
const loginRateLimiter = createRateLimiter({
  prefix: 'login',
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many login attempts. Please try again after 15 minutes.',
});

const forgotPasswordRateLimiter = createRateLimiter({
  prefix: 'forgot_password',
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password reset requests. Please try again later.',
});

const answerRateLimiter = createRateLimiter({
  prefix: 'student_answer',
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many answer submissions. Please slow down.',
  keyGenerator: (req: Request) => {
    // Authenticated user identity is cryptographically validated by the authenticate middleware.
    // Keying by authenticated user ID ensures students sharing school Wi-Fi or public NAT IP
    // have independent rate-limit allowances and cannot block each other during assessments.
    const validUserId = req.user?.userId;
    if (typeof validUserId === 'string' && validUserId.trim()) {
      return `usr:${validUserId.trim()}`;
    }
    const validStudentId = req.user?.studentId;
    if (typeof validStudentId === 'string' && validStudentId.trim()) {
      return `stu:${validStudentId.trim()}`;
    }
    // Fallback to validated client IP for unauthenticated traffic
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || req.ip || req.socket.remoteAddress || 'unknown';
    return `ip:${ip}`;
  },
});


// Helper to convert Mongoose documents to clean JSON with 'id'
function formatDoc(doc: any): any {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject({ transform: true }) : { ...doc };
  if (obj._id && !obj.id) {
    obj.id = obj._id.toString();
  }
  delete obj.__v;
  delete obj.passwordHash;
  return obj;
}

function formatDocs(docs: any[]): any[] {
  return docs.map(formatDoc);
}

// Helper to escape regex special characters (SEC-HIGH-02: Prevent ReDoS)
const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// SEC-MED-03: Cryptographically secure temporary password generation
function generateSecureTemporaryPassword(length: number = 8): string {
  const chars = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  let pass = '';
  for (let i = 0; i < length - 1; i++) {
    pass += chars.charAt(crypto.randomInt(0, chars.length));
  }
  pass += '!';
  return pass;
}

// SEC-CRIT-04: Server-authoritative time generation for security-critical validation.
// Strips security reliance on client-controlled 'x-client-now' headers.
function getServerAuthoritativeDateTimeStr(req?: Request): string {
  const nowMs = Date.now();
  let offsetMs = 0;
  if (req) {
    const clientOffsetHeader = req.headers['x-timezone-offset'];
    if (clientOffsetHeader !== undefined && clientOffsetHeader !== '') {
      const parsedOffset = Number(clientOffsetHeader);
      // Valid timezone offsets globally range between UTC-12 (-720 min) and UTC+14 (+840 min)
      if (!isNaN(parsedOffset) && parsedOffset >= -840 && parsedOffset <= 840) {
        offsetMs = parsedOffset * 60000;
      }
    }
  }
  const dateObj = new Date(nowMs - offsetMs);
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  const hour = String(dateObj.getUTCHours()).padStart(2, '0');
  const min = String(dateObj.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${min}`;
}

// SEC-CRIT-04: Authoritative check to determine if an assessment has expired
function isRequestAssessmentExpired(req: Request, pubTest: any): boolean {
  if (!pubTest?.endDate || pubTest.endDate === 'Open') {
    return false;
  }
  const currentDateTimeStr = getServerAuthoritativeDateTimeStr(req);
  const end24 = to24Hour(pubTest.endTime || '23:59');
  const endStr = `${toISODate(pubTest.endDate)}T${end24}`;
  return isAssessmentExpired(currentDateTimeStr, endStr, 1);
}

// ==========================================
// 1. AUTHENTICATION & PASSWORD MANAGEMENT
// ==========================================

// Check if system has any users
router.get('/auth/setup-status', async (_req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ hasUsers: true, isConnected: false, totalUsers: 0 });
    }
    const usersCount = await UserModel.countDocuments();
    return res.json({ hasUsers: usersCount > 0, totalUsers: usersCount, isConnected: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to check setup status' });
  }
});

// Setup First Super Admin (Only allowed when database has 0 users)
router.post('/auth/setup-first-admin', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const count = await UserModel.countDocuments();
    if (count > 0) {
      return res.status(403).json({ error: 'Setup is already completed. Please sign in.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const firstSuperAdmin = await UserModel.create({
      username: username.trim(),
      role: 'super_admin',
      passwordHash: bcrypt.hashSync(password, salt),
      mustChangePassword: false,
    });

    const token = generateToken({
      userId: firstSuperAdmin._id.toString(),
      username: firstSuperAdmin.username,
      role: firstSuperAdmin.role,
    });

    return res.status(201).json({
      message: 'First Super Admin initialized successfully for production.',
      token,
      user: {
        id: firstSuperAdmin._id.toString(),
        username: firstSuperAdmin.username,
        role: firstSuperAdmin.role,
        mustChangePassword: false,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Unable to create administrator account. Please try again.' });
  }
});

// Login (Supports Super Admin, School Admin, Student)
// SEC-HIGH-04: Rate limiting on login attempts
// SEC-HIGH-02: Safe regex escaping to prevent ReDoS
// SEC-INFO-01: Removed /tmp/auth.log credential logging
router.post('/auth/login', loginRateLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // SEC-HIGH-02: Safely escape user-controlled regex pattern
    const escapedUsername = escapeRegExp(trimmedUsername);

    // Case-insensitive lookup for username or uniqueStudentId
    const user = await UserModel.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${escapedUsername}$`, 'i') } },
        { uniqueStudentId: { $regex: new RegExp(`^${escapedUsername}$`, 'i') } },
      ],
    });

    if (!user) {
      return res.status(401).json({ error: 'Username or password is incorrect.' });
    }

    const isMatch =
      bcrypt.compareSync(password, user.passwordHash) ||
      (typeof password === 'string' &&
        (bcrypt.compareSync(password.trim(), user.passwordHash) ||
          bcrypt.compareSync(password.trimEnd(), user.passwordHash) ||
          bcrypt.compareSync(password.trimStart(), user.passwordHash)));

    if (!isMatch) {
      return res.status(401).json({ error: 'Username or password is incorrect.' });
    }

    const token = generateToken({
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
      schoolId: user.schoolId,
      schoolName: user.schoolName,
      studentId: user.uniqueStudentId,
    });

    return res.json({
      token,
      user: {
        id: user._id.toString(),
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        schoolId: user.schoolId,
        schoolName: user.schoolName,
        studentName: user.studentName,
        className: user.className,
        section: user.section,
        schoolAdmissionNumber: user.schoolAdmissionNumber,
        uniqueStudentId: user.uniqueStudentId,
      },
    });
  } catch (err: any) {
    console.error('[Auth Login Error]:', err.message || err);
    return res.status(500).json({ error: 'Username or password is incorrect.' });
  }
});

// SEC-MED-04: User Logout & Token Revocation
router.post('/auth/logout', authenticate, async (req: Request, res: Response) => {
  try {
    if (req.token) {
      revokeToken(req.token);
    }
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (err: any) {
    console.error('[Auth Logout Error]:', err.message || err);
    return res.status(500).json({ error: 'Failed to process logout' });
  }
});

// Password Reset Request (Students and Admins)
// SEC-HIGH-04: Rate limiting on forgot-password
// SEC-HIGH-02: Safe regex escaping to prevent ReDoS
router.post('/auth/forgot-password', forgotPasswordRateLimiter, async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username or Student ID is required' });
    }

    const trimmed = username.trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'Username or Student ID is required' });
    }

    // SEC-HIGH-02: Safely escape user-controlled regex pattern
    const escapedUsername = escapeRegExp(trimmed);

    // Lookup user by username or uniqueStudentId
    const user = await UserModel.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${escapedUsername}$`, 'i') } },
        { uniqueStudentId: { $regex: new RegExp(`^${escapedUsername}$`, 'i') } },
      ],
    });

    if (user) {
      user.passwordResetRequested = true;
      user.passwordResetRequestedAt = new Date();
      await user.save();
    }

    // Return the required clear message without revealing sensitive account info
    return res.json({
      success: true,
      message:
        'Please contact your Super Admin. The Super Admin will provide you with a temporary password. Use the temporary password to log in and create a new password.',
    });
  } catch (err: any) {
    console.error('[Auth Forgot Password Error]:', err.message || err);
    return res.status(500).json({
      error: 'Unable to process reset request. Please try again.',
    });
  }
});

// Force Password Change (Mandatory on first login or after password reset)
router.post('/auth/change-password', authenticate, async (req: Request, res: Response) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.trim().length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long' });
    }

    const user = await UserModel.findById(req.user!.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent setting password identical to username
    if (newPassword.toLowerCase() === user.username.toLowerCase()) {
      return res.status(400).json({ error: 'Please choose a password different from your username or ID' });
    }

    const salt = bcrypt.genSaltSync(10);
    user.passwordHash = bcrypt.hashSync(newPassword, salt);
    user.mustChangePassword = false;
    user.passwordResetRequested = false;
    user.passwordResetRequestedAt = undefined;
    await user.save();

    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Unable to update password. Please try again.' });
  }
});

// Get Current User Profile
router.get('/auth/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await UserModel.findById(req.user!.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({
      id: user._id.toString(),
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      schoolId: user.schoolId,
      schoolName: user.schoolName,
      studentName: user.studentName,
      className: user.className,
      section: user.section,
      schoolAdmissionNumber: user.schoolAdmissionNumber,
      uniqueStudentId: user.uniqueStudentId,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// ==========================================
// 2. SUPER ADMIN: SCHOOL WORKSPACE MANAGEMENT
// ==========================================

// Create School
router.post('/schools', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { name, code } = req.body;
    if (!name || !code) {
      return res.status(400).json({ error: 'School name and code are required' });
    }

    const cleanCode = code.trim().toUpperCase();
    const existingSchool = await SchoolModel.findOne({ code: cleanCode });
    if (existingSchool) {
      return res.status(400).json({ error: `School code '${cleanCode}' is already registered.` });
    }

    const newSchool = await SchoolModel.create({
      name: name.trim(),
      code: cleanCode,
    });

    return res.status(201).json(formatDoc(newSchool));
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create school' });
  }
});

// List Schools
router.get('/schools', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (user.role === 'super_admin') {
      const schools = await SchoolModel.find();
      const sorted = formatDocs(schools).sort((a: any, b: any) =>
        (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
      );
      return res.json(sorted);
    }
    // School Admin or Student can only view their own school
    const schools = await SchoolModel.find({ _id: user.schoolId });
    return res.json(formatDocs(schools));
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch schools' });
  }
});

// List Admins for a School
router.get('/schools/:schoolId/admins', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { schoolId } = req.params;
    const admins = await UserModel.find({ role: 'school_admin', schoolId }).sort({ createdAt: -1 });

    const formatted = admins.map((u) => ({
      id: u._id.toString(),
      username: u.username,
      role: u.role,
      schoolId: u.schoolId,
      schoolName: u.schoolName,
      mustChangePassword: u.mustChangePassword,
      passwordResetRequested: Boolean(u.passwordResetRequested),
      passwordResetRequestedAt: u.passwordResetRequestedAt,
      createdAt: u.createdAt,
    }));
    return res.json(formatted);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch school admins' });
  }
});

// Super Admin Reset Password: Generates secure temporary password
router.post('/super-admin/reset-password', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    // SEC-MED-03: Generate cryptographically secure temporary password
    const tempPass = generateSecureTemporaryPassword(8);

    const salt = bcrypt.genSaltSync(10);
    user.passwordHash = bcrypt.hashSync(tempPass, salt);
    user.mustChangePassword = true;
    // Per requirement 7: The reset request must remain active until user creates new password
    user.passwordResetRequested = true;
    await user.save();

    console.log(`[SuperAdmin] Generated temporary password for user "${user.username}" (role: ${user.role})`);

    return res.json({
      success: true,
      temporaryPassword: tempPass,
      userId: user._id.toString(),
      username: user.username,
      studentName: user.studentName,
      role: user.role,
      message: 'Temporary password generated successfully.',
    });
  } catch (err: any) {
    console.error('[Super Admin Reset Password Error]:', err.message || err);
    return res.status(500).json({
      error: 'Unable to generate temporary password. Please try again.',
    });
  }
});

// Create School Admin (Username = Admin ID, Password = Admin ID)
router.post('/schools/:schoolId/admins', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { schoolId } = req.params;
    const school = await SchoolModel.findById(schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });

    // Generate unique Admin ID: e.g. ADM-SCH-XXXX
    let adminId = '';
    let isUnique = false;
    while (!isUnique) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      adminId = `ADM-${school.code}-${randomSuffix}`;
      const exists = await UserModel.findOne({ username: adminId });
      if (!exists) isUnique = true;
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(adminId, salt);

    const newAdmin = await UserModel.create({
      username: adminId,
      role: 'school_admin',
      passwordHash,
      mustChangePassword: true,
      schoolId: school._id.toString(),
      schoolName: school.name,
    });

    return res.status(201).json({
      admin: {
        id: newAdmin._id.toString(),
        username: newAdmin.username,
        role: newAdmin.role,
        schoolId: newAdmin.schoolId,
        schoolName: newAdmin.schoolName,
        mustChangePassword: newAdmin.mustChangePassword,
        createdAt: newAdmin.createdAt,
      },
      credentials: {
        username: adminId,
        initialPassword: adminId,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create school admin' });
  }
});

// Delete School Admin
router.delete('/schools/:schoolId/admins/:adminId', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { schoolId, adminId } = req.params;

    // Verify school exists
    const school = await SchoolModel.findById(schoolId);
    if (!school) {
      return res.status(404).json({ error: 'School not found' });
    }

    // Find the target school admin
    let admin = await UserModel.findById(adminId);
    if (!admin) {
      admin = await UserModel.findOne({ username: adminId });
    }

    if (!admin) {
      return res.status(404).json({ error: 'School admin not found' });
    }

    // Verify role is strictly school_admin
    if (admin.role !== 'school_admin') {
      return res.status(400).json({ error: 'User is not a school administrator' });
    }

    // Verify the admin belongs to the target school
    if (admin.schoolId !== school._id.toString()) {
      return res.status(400).json({ error: 'School admin does not belong to this school workspace' });
    }

    const adminUsername = admin.username;

    // Delete ONLY the target school admin user document from MongoDB Atlas
    await UserModel.findByIdAndDelete(admin._id);

    return res.json({
      success: true,
      message: `School Admin '${adminUsername}' deleted successfully from MongoDB Atlas.`,
      deletedId: admin._id.toString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete school admin' });
  }
});

// Delete School Workspace (Super Admin Only)
router.delete('/schools/:schoolId', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { schoolId } = req.params;

    const school = await SchoolModel.findById(schoolId);
    if (!school) {
      return res.status(404).json({ error: 'School not found' });
    }

    const schoolIdStr = school._id.toString();
    const schoolName = school.name;

    // 1. Delete all School Admin account(s) belonging to this school
    await UserModel.deleteMany({ role: 'school_admin', schoolId: schoolIdStr });

    // 2. Delete all Student account(s) belonging to this school
    await UserModel.deleteMany({ role: 'student', schoolId: schoolIdStr });

    // 3. Delete active / NOT_STARTED assessment assignments for this school
    // Note: Preserve historical COMPLETED, INCOMPLETE, LOCKED_INCOMPLETE attempt records!
    await StudentTestAssignmentModel.deleteMany({
      $or: [
        { schoolId: schoolIdStr },
        { schoolId: school.id },
        { schoolName: school.name },
      ],
      status: 'NOT_STARTED',
    });

    // 4. Delete the School Workspace record
    await SchoolModel.findByIdAndDelete(school._id);

    return res.json({
      success: true,
      message: `School Workspace '${schoolName}' and associated admin/student accounts have been deleted. Historical assessment data has been preserved.`,
      deletedSchoolId: schoolIdStr,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete school workspace' });
  }
});

// ==========================================
// 3. STUDENT REGISTRATION & MANAGEMENT
// ==========================================

// Register Student
router.post('/students', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      studentName,
      className,
      section,
      schoolAdmissionNumber,
      schoolId,
    } = req.body;

    if (!studentName || !className || !section || !schoolAdmissionNumber || !schoolId) {
      return res.status(400).json({ error: 'All student fields are required' });
    }

    // Role check: Only Super Admin or School Admin belonging to the school
    if (req.user!.role === 'school_admin' && req.user!.schoolId !== schoolId) {
      return res.status(403).json({ error: 'You cannot add students to another school' });
    }
    if (req.user!.role === 'student') {
      return res.status(403).json({ error: 'Students cannot create candidate profiles' });
    }

    const school = await SchoolModel.findById(schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });

    const cleanAdmissionNo = schoolAdmissionNumber.trim();
    if (!cleanAdmissionNo) {
      return res.status(400).json({ error: 'Admission Number is required' });
    }

    // Check whether the same Admission Number already exists in the same school
    const existingStudentInSchool = await UserModel.findOne({
      role: 'student',
      schoolId: school._id.toString(),
      schoolAdmissionNumber: { $regex: new RegExp(`^${escapeRegExp(cleanAdmissionNo)}$`, 'i') },
    });
    if (existingStudentInSchool) {
      return res.status(400).json({ error: 'Admission Number already exists in this school.' });
    }

    const cleanClass = className.replace(/[^0-9]/g, '') || '0';
    const cleanSection = section.trim().toUpperCase();

    if (!cleanSection) {
      return res.status(400).json({ error: 'Section is required' });
    }

    // Unique App Number / Student ID with Bounded Retry Limit
    const MAX_ID_ATTEMPTS = 15;
    let uniqueStudentId = '';
    let isUnique = false;

    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      const randomSuffix = crypto.randomInt(1000, 10000);
      const candidateId = `STU-${cleanClass}${cleanSection}-${randomSuffix}`;
      const exists = await UserModel.findOne(
        { $or: [{ username: candidateId }, { uniqueStudentId: candidateId }] },
        { _id: 1 }
      ).lean();
      if (!exists) {
        uniqueStudentId = candidateId;
        isUnique = true;
        break;
      }
    }

    if (!isUnique) {
      return res.status(500).json({
        error: 'Unable to generate a unique Student ID after multiple attempts. Please try again.',
      });
    }

    // SEC-HIGH-01 & SEC-MED-03: Generate cryptographically secure initial temporary password
    const initialPassword = generateSecureTemporaryPassword(8);
    const salt = bcrypt.genSaltSync(10);
    const newStudent = await UserModel.create({
      username: uniqueStudentId,
      role: 'student',
      passwordHash: bcrypt.hashSync(initialPassword, salt),
      mustChangePassword: true,
      schoolId: school._id.toString(),
      schoolName: school.name,
      studentName: studentName.trim(),
      className: className.trim(),
      section: cleanSection,
      schoolAdmissionNumber: cleanAdmissionNo,
      uniqueStudentId,
    });

    return res.status(201).json({
      student: formatDoc(newStudent),
      credentials: {
        username: uniqueStudentId,
        initialPassword,
      },
    });
  } catch (err: any) {
    if (
      err.code === 11000 &&
      (err.keyPattern?.schoolAdmissionNumber ||
        (err.message &&
          (err.message.includes('schoolAdmissionNumber') ||
            err.message.includes('schoolId_1_schoolAdmissionNumber_1'))))
    ) {
      return res.status(400).json({ error: 'Admission Number already exists in this school.' });
    }
    console.error('[Student Registration Error]:', err.message || err);
    return res.status(500).json({ error: 'Failed to register student' });
  }
});

// List Students (Filtered by school, class, section, search)
// SEC-HIGH-01: Prevent student accounts from enumerating other students
router.get('/students', authenticate, async (req: Request, res: Response) => {
  try {
    const { schoolId, className, section, search } = req.query as {
      schoolId?: string;
      className?: string;
      section?: string;
      search?: string;
    };

    const query: any = { role: 'student' };

    // Enforce access control
    if (req.user!.role === 'student') {
      // SEC-HIGH-01: A student can only view their own profile/account record
      const selfStudentId = req.user!.studentId || req.user!.username;
      query.$or = [
        { uniqueStudentId: selfStudentId },
        { username: selfStudentId },
      ];
    } else if (req.user!.role === 'school_admin') {
      query.schoolId = req.user!.schoolId;
    } else if (schoolId) {
      query.schoolId = schoolId;
    }

    if (className && req.user!.role !== 'student') {
      query.className = { $regex: new RegExp(`^${escapeRegExp(className.trim())}$`, 'i') };
    }
    if (section && req.user!.role !== 'student') {
      query.section = { $regex: new RegExp(`^${escapeRegExp(section.trim())}$`, 'i') };
    }
    if (search && req.user!.role !== 'student') {
      const q = escapeRegExp(search.trim());
      query.$or = [
        { studentName: { $regex: q, $options: 'i' } },
        { schoolAdmissionNumber: { $regex: q, $options: 'i' } },
        { uniqueStudentId: { $regex: q, $options: 'i' } },
        { username: { $regex: q, $options: 'i' } },
      ];
    }

    const list = await UserModel.find(query, { passwordHash: 0 });
    const sorted = formatDocs(list).sort((a: any, b: any) =>
      (a.studentName || '').localeCompare(b.studentName || '', undefined, { numeric: true, sensitivity: 'base' })
    );
    return res.json(sorted);
  } catch (err: any) {
    console.error('[List Students Error]:', err.message || err);
    return res.status(500).json({ error: 'Failed to list students' });
  }
});

// Update Student Profile
router.put('/students/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { studentName, schoolAdmissionNumber, className, section } = req.body;

    // Student role cannot edit profiles
    if (req.user!.role === 'student') {
      return res.status(403).json({ error: 'Students cannot edit student profiles' });
    }

    // Find student by ID or uniqueStudentId
    let student = await UserModel.findById(id);
    if (!student) {
      student = await UserModel.findOne({ uniqueStudentId: id });
    }
    if (!student || student.role !== 'student') {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Enforce school isolation for School Admins
    if (req.user!.role === 'school_admin' && student.schoolId !== req.user!.schoolId) {
      return res.status(403).json({ error: 'Forbidden: You cannot modify students from another school' });
    }

    // Validate required fields
    if (!studentName || !className || !section || !schoolAdmissionNumber) {
      return res.status(400).json({ error: 'Student Full Name, Admission Number, Class, and Section are all required' });
    }

    const cleanAdmissionNo = schoolAdmissionNumber.trim();
    if (!cleanAdmissionNo) {
      return res.status(400).json({ error: 'Admission Number is required' });
    }

    // Check whether the same Admission Number already exists in the same school (excluding current student)
    const existingStudentInSchool = await UserModel.findOne({
      _id: { $ne: student._id },
      role: 'student',
      schoolId: student.schoolId,
      schoolAdmissionNumber: { $regex: new RegExp(`^${escapeRegExp(cleanAdmissionNo)}$`, 'i') },
    });
    if (existingStudentInSchool) {
      return res.status(400).json({ error: 'Admission Number already exists in this school.' });
    }

    // Validate class (Class 1 to Class 12)
    const validClasses = [
      'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6',
      'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12',
    ];
    if (!validClasses.includes(className.trim())) {
      return res.status(400).json({ error: 'Class must be one of Class 1 through Class 12' });
    }

    const cleanSection = section.trim().toUpperCase();
    if (!cleanSection) {
      return res.status(400).json({ error: 'Section is required' });
    }

    // Update editable fields without altering username, uniqueStudentId, role, schoolId, or passwordHash
    student.studentName = studentName.trim();
    student.schoolAdmissionNumber = cleanAdmissionNo;
    student.className = className.trim();
    student.section = cleanSection;

    await student.save();

    const studentIdentifiers = [
      student.uniqueStudentId,
      student.username,
      student._id.toString(),
    ].filter(Boolean);

    // 1. Synchronize all StudentTestAssignment documents for this student across all historical/completed/active assessments
    // Strictly updates only studentName, schoolAdmissionNumber, className, and section.
    // Scores, answers, time taken, completion status, and test results are completely preserved.
    await StudentTestAssignmentModel.updateMany(
      {
        studentId: { $in: studentIdentifiers },
        $or: [
          { schoolId: student.schoolId },
          { schoolId: { $exists: false } },
          { schoolId: '' },
          { schoolId: null },
        ],
      },
      {
        $set: {
          studentName: student.studentName,
          schoolAdmissionNumber: student.schoolAdmissionNumber,
          className: student.className,
          section: student.section,
        },
      }
    );

    // 2. Synchronize all PublishHistory documents where this student appears in studentsStatus
    // Updates studentName, schoolAdmissionNumber, className, and section in studentsStatus.
    // Historical completion stats, dates, times, exit types, and scores are completely preserved.
    const matchingHistories = await PublishHistoryModel.find({
      studentsStatus: {
        $elemMatch: {
          $or: [
            { studentId: { $in: studentIdentifiers } },
            { uniqueStudentId: { $in: studentIdentifiers } },
          ],
        },
      },
    });

    for (const hDoc of matchingHistories) {
      let docModified = false;
      if (Array.isArray(hDoc.studentsStatus)) {
        for (const st of hDoc.studentsStatus) {
          const sKey = st.studentId || st.uniqueStudentId;
          if (studentIdentifiers.includes(sKey)) {
            st.studentName = student.studentName;
            st.schoolAdmissionNumber = student.schoolAdmissionNumber;
            st.className = student.className;
            st.section = student.section;
            docModified = true;
          }
        }
      }
      if (docModified) {
        hDoc.markModified('studentsStatus');
        await hDoc.save();
      }
    }

    await PublishHistoryModel.updateMany(
      {
        $or: [
          { 'studentsStatus.studentId': { $in: studentIdentifiers } },
          { 'studentsStatus.uniqueStudentId': { $in: studentIdentifiers } },
        ],
      },
      {
        $set: {
          'studentsStatus.$[elem].studentName': student.studentName,
          'studentsStatus.$[elem].schoolAdmissionNumber': student.schoolAdmissionNumber,
          'studentsStatus.$[elem].className': student.className,
          'studentsStatus.$[elem].section': student.section,
        },
      },
      {
        arrayFilters: [
          {
            $or: [
              { 'elem.studentId': { $in: studentIdentifiers } },
              { 'elem.uniqueStudentId': { $in: studentIdentifiers } },
            ],
          },
        ],
      }
    );

    return res.json({
      message: 'Student updated successfully',
      student: formatDoc(student),
    });
  } catch (err: any) {
    if (
      err.code === 11000 &&
      (err.keyPattern?.schoolAdmissionNumber ||
        (err.message &&
          (err.message.includes('schoolAdmissionNumber') ||
            err.message.includes('schoolId_1_schoolAdmissionNumber_1'))))
    ) {
      return res.status(400).json({ error: 'Admission Number already exists in this school.' });
    }
    return res.status(500).json({ error: 'Failed to update student' });
  }
});

// Delete Student
router.delete('/students/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Student role cannot delete profiles
    if (req.user!.role === 'student') {
      return res.status(403).json({ error: 'Students cannot delete student profiles' });
    }

    // Find student by ID or uniqueStudentId
    let student = await UserModel.findById(id);
    if (!student) {
      student = await UserModel.findOne({ uniqueStudentId: id });
    }
    if (!student || student.role !== 'student') {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Enforce school isolation for School Admins
    if (req.user!.role === 'school_admin' && student.schoolId !== req.user!.schoolId) {
      return res.status(403).json({ error: 'Forbidden: You cannot delete students from another school' });
    }

    const studentUniqueId = student.uniqueStudentId;

    // Delete student user account document from MongoDB Atlas
    await UserModel.findByIdAndDelete(student._id);

    // Finding 7 Fix: Safely clean up unstarted assignments and synchronize PublishHistory,
    // while preserving completed and incomplete historical audit records.
    const notStartedAssignments = await StudentTestAssignmentModel.find({
      studentId: studentUniqueId,
      status: 'NOT_STARTED',
    });

    for (const a of notStartedAssignments) {
      await PublishHistoryModel.updateOne(
        { publishId: a.publishedTestId },
        {
          $pull: { studentsStatus: { studentId: studentUniqueId, status: 'NOT_STARTED' } },
          $inc: { totalRecipients: -1 },
        }
      );
    }
    await StudentTestAssignmentModel.deleteMany({ studentId: studentUniqueId, status: 'NOT_STARTED' });

    // For any historical attempts (COMPLETED / INCOMPLETE / IN_PROGRESS), preserve the record for audit integrity
    // and tag student name with '(Deleted)'
    await StudentTestAssignmentModel.updateMany(
      { studentId: studentUniqueId },
      { $set: { studentName: `${student.studentName || 'Student'} (Deleted)` } }
    );

    return res.json({
      success: true,
      message: `Student '${student.studentName}' (${studentUniqueId}) deleted successfully from MongoDB Atlas.`,
      deletedId: student._id.toString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete student' });
  }
});

// ==========================================
// 4. QUESTION GROUPS & QUESTION BANK
// ==========================================

// Create Question Group
router.post('/question-groups', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Group name is required' });

    const cleanName = name.trim();
    const existing = await QuestionGroupModel.findOne({
      name: { $regex: new RegExp(`^${escapeRegExp(cleanName)}$`, 'i') },
    });
    if (existing) {
      return res.status(400).json({ error: `Question Group '${cleanName}' already exists.` });
    }

    const newGroup = await QuestionGroupModel.create({
      name: cleanName,
      description: description?.trim() || '',
    });

    return res.status(201).json(formatDoc(newGroup));
  } catch (err: any) {
    console.error('[Create Question Group Error]:', err.message || err);
    return res.status(500).json({ error: 'Failed to create question group' });
  }
});

// List Question Groups (With Question Counts & Difficulty Breakdown)
// SEC-CRIT-01: Sanitize correct answers for student callers to prevent answer key disclosure
router.get('/question-groups', authenticate, async (req: Request, res: Response) => {
  try {
    if (req.user!.role === 'student') {
      const assignments = await getStudentAccessibleAssignments(req);
      const assignedQuestions = assignments.flatMap((a: any) => a.questions || []);
      const groups = await QuestionGroupModel.find().sort({ createdAt: 1 });
      const assignedGroupKeys = new Set(assignedQuestions.flatMap((q: any) => [
        String(q.groupId || '').trim(),
        String(q.groupName || '').trim().toLowerCase(),
      ]).filter(Boolean));
      const visibleGroups = groups.filter((g: any) =>
        assignedGroupKeys.has(String(g._id)) || assignedGroupKeys.has(String(g.name || '').trim().toLowerCase())
      );
      return res.json(visibleGroups.map((g: any) => {
        const groupQuestions = assignedQuestions.filter((q: any) =>
          String(q.groupId || '').trim() === String(g._id) ||
          String(q.groupName || '').trim().toLowerCase() === String(g.name || '').trim().toLowerCase()
        );
        const byDifficulty = (difficulty: string) => groupQuestions
          .filter((q: any) => String(q.difficulty || '').trim().toLowerCase() === difficulty.toLowerCase())
          .map((q: any) => serializeStudentQuestion(q));
        const easy = byDifficulty('Easy');
        const medium = byDifficulty('Medium');
        const hard = byDifficulty('Hard');
        return {
          id: String(g._id), _id: String(g._id), name: g.name, description: g.description,
          createdAt: g.createdAt, questionCount: groupQuestions.length,
          easyCount: easy.length, mediumCount: medium.length, hardCount: hard.length,
          breakdown: {
            Easy: { count: easy.length, questions: easy },
            Medium: { count: medium.length, questions: medium },
            Hard: { count: hard.length, questions: hard },
          },
        };
      }));
    }

    const groups = await QuestionGroupModel.find().sort({ createdAt: 1 });
    const questions = await QuestionModel.find();
    const formatQuestionsList = (qList: any[]) => {
      return qList.map((q) => serializeQuestionForRole(q, req.user?.role));
    };

    const withCounts = groups.map((g) => {
      const gIdStr = g._id.toString();
      const gNameLower = (g.name || '').trim().toLowerCase();

      const groupQuestions = questions.filter((q) => {
        const qGroupId = (q.groupId || '').toString().trim();
        const qGroupName = (q.groupName || '').toString().trim().toLowerCase();
        return qGroupId === gIdStr || (qGroupName && qGroupName === gNameLower);
      });

      const easyQuestions = groupQuestions.filter((q) => (q.difficulty || '').trim().toLowerCase() === 'easy');
      const mediumQuestions = groupQuestions.filter((q) => (q.difficulty || '').trim().toLowerCase() === 'medium');
      const hardQuestions = groupQuestions.filter((q) => (q.difficulty || '').trim().toLowerCase() === 'hard');

      return {
        id: gIdStr,
        _id: gIdStr,
        name: g.name,
        description: g.description,
        createdAt: g.createdAt,
        questionCount: groupQuestions.length,
        easyCount: easyQuestions.length,
        mediumCount: mediumQuestions.length,
        hardCount: hardQuestions.length,
        breakdown: {
          Easy: {
            count: easyQuestions.length,
            questions: formatQuestionsList(easyQuestions),
          },
          Medium: {
            count: mediumQuestions.length,
            questions: formatQuestionsList(mediumQuestions),
          },
          Hard: {
            count: hardQuestions.length,
            questions: formatQuestionsList(hardQuestions),
          },
        },
      };
    });

    return res.json(withCounts);
  } catch (err: any) {
    console.error('[List Question Groups Error]:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch question groups' });
  }
});

// Update Question Group Name (Super Admin Only)
// Allows editing ONLY the Question Group Name.
// Keeps stable Question Group ID, description, questions, difficulty unchanged.
// Synchronizes the new group name globally: live questions, published tests snapshots,
// publish history records, and student assessment question records.
router.put('/question-groups/:id', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Question Group Name is required' });
    }

    const cleanName = name.trim();

    let group = await QuestionGroupModel.findById(id);
    if (!group && mongoose.Types.ObjectId.isValid(id)) {
      group = await QuestionGroupModel.findById(new mongoose.Types.ObjectId(id));
    }

    if (!group) {
      return res.status(404).json({ error: 'Question Group not found' });
    }

    const oldName = group.name;
    const gIdStr = group._id.toString();

    // Check if another group already has this name (case-insensitive)
    const existing = await QuestionGroupModel.findOne({
      _id: { $ne: group._id },
      name: { $regex: new RegExp(`^${escapeRegExp(cleanName)}$`, 'i') },
    });
    if (existing) {
      return res.status(400).json({ error: `Another Question Group with name '${cleanName}' already exists.` });
    }

    // 1. Update group name ONLY - keep ID, description, questions, and other group data intact
    group.name = cleanName;
    await group.save();

    // 2. Identify all question IDs currently belonging to this group
    const groupQuestions = await QuestionModel.find({
      $or: [
        { groupId: gIdStr },
        { groupId: group.id },
        ...(mongoose.Types.ObjectId.isValid(gIdStr) ? [{ groupId: new mongoose.Types.ObjectId(gIdStr) }] : []),
        { groupName: oldName },
        { groupName: { $regex: new RegExp(`^${escapeRegExp(oldName)}$`, 'i') } },
      ],
    });
    const questionIdsInGroup = groupQuestions.map((q) => q._id.toString());

    // 3. Update groupName on live Question Bank records
    await QuestionModel.updateMany(
      {
        $or: [
          { groupId: gIdStr },
          { groupId: group.id },
          ...(mongoose.Types.ObjectId.isValid(gIdStr) ? [{ groupId: new mongoose.Types.ObjectId(gIdStr) }] : []),
          { groupName: oldName },
          { groupName: { $regex: new RegExp(`^${escapeRegExp(oldName)}$`, 'i') } },
        ],
      },
      {
        $set: { groupName: cleanName },
      }
    );

    // 4. Synchronize new groupName across PublishedTestModel snapshots
    const pubDocs = await PublishedTestModel.find({
      $or: [
        { 'questionsSnapshot.groupId': gIdStr },
        { 'questionsSnapshot.groupId': group.id },
        { 'questionsSnapshot.questionId': { $in: questionIdsInGroup } },
        { 'questionsSnapshot.id': { $in: questionIdsInGroup } },
        { 'questionsSnapshot.groupName': oldName },
        { 'questionsSnapshot.groupName': { $regex: new RegExp(`^${escapeRegExp(oldName)}$`, 'i') } },
      ],
    });
    for (const p of pubDocs) {
      let changed = false;
      if (Array.isArray(p.questionsSnapshot)) {
        for (const q of p.questionsSnapshot) {
          const isMatch =
            q.groupId === gIdStr ||
            q.groupId === group.id ||
            (q.questionId && questionIdsInGroup.includes(String(q.questionId))) ||
            (q.id && questionIdsInGroup.includes(String(q.id))) ||
            (q._id && questionIdsInGroup.includes(String(q._id))) ||
            q.groupName === oldName ||
            (q.groupName && q.groupName.trim().toLowerCase() === oldName.trim().toLowerCase());
          if (isMatch) {
            q.groupName = cleanName;
            changed = true;
          }
        }
      }
      if (changed) {
        await PublishedTestModel.findByIdAndUpdate(p._id, { $set: { questionsSnapshot: p.questionsSnapshot } });
      }
    }

    // 5. Synchronize new groupName across PublishHistoryModel snapshots
    const histDocs = await PublishHistoryModel.find({
      $or: [
        { 'questionsSnapshot.groupId': gIdStr },
        { 'questionsSnapshot.groupId': group.id },
        { 'questionsSnapshot.questionId': { $in: questionIdsInGroup } },
        { 'questionsSnapshot.id': { $in: questionIdsInGroup } },
        { 'questionsSnapshot.groupName': oldName },
        { 'questionsSnapshot.groupName': { $regex: new RegExp(`^${escapeRegExp(oldName)}$`, 'i') } },
      ],
    });
    for (const h of histDocs) {
      let changed = false;
      if (Array.isArray(h.questionsSnapshot)) {
        for (const q of h.questionsSnapshot) {
          const isMatch =
            q.groupId === gIdStr ||
            q.groupId === group.id ||
            (q.questionId && questionIdsInGroup.includes(String(q.questionId))) ||
            (q.id && questionIdsInGroup.includes(String(q.id))) ||
            (q._id && questionIdsInGroup.includes(String(q._id))) ||
            q.groupName === oldName ||
            (q.groupName && q.groupName.trim().toLowerCase() === oldName.trim().toLowerCase());
          if (isMatch) {
            q.groupName = cleanName;
            changed = true;
          }
        }
      }
      if (changed) {
        await PublishHistoryModel.findByIdAndUpdate(h._id, { $set: { questionsSnapshot: h.questionsSnapshot } });
      }
    }

    // 6. Synchronize new groupName across StudentTestAssignmentModel question logs (current & historical)
    const assignDocs = await StudentTestAssignmentModel.find({
      $or: [
        { 'questions.groupId': gIdStr },
        { 'questions.groupId': group.id },
        { 'questions.questionId': { $in: questionIdsInGroup } },
        { 'questions.id': { $in: questionIdsInGroup } },
        { 'questions.groupName': oldName },
        { 'questions.groupName': { $regex: new RegExp(`^${escapeRegExp(oldName)}$`, 'i') } },
      ],
    });
    for (const a of assignDocs) {
      let changed = false;
      if (Array.isArray(a.questions)) {
        for (const q of a.questions) {
          const isMatch =
            q.groupId === gIdStr ||
            q.groupId === group.id ||
            (q.questionId && questionIdsInGroup.includes(String(q.questionId))) ||
            (q.id && questionIdsInGroup.includes(String(q.id))) ||
            (q._id && questionIdsInGroup.includes(String(q._id))) ||
            q.groupName === oldName ||
            (q.groupName && q.groupName.trim().toLowerCase() === oldName.trim().toLowerCase());
          if (isMatch) {
            q.groupName = cleanName;
            changed = true;
          }
        }
      }
      if (changed) {
        await StudentTestAssignmentModel.findByIdAndUpdate(a._id, { $set: { questions: a.questions } });
      }
    }

    return res.json({
      success: true,
      message: `Question Group renamed from '${oldName}' to '${cleanName}' successfully.`,
      group: formatDoc(group),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update question group' });
  }
});

// Delete Question Group with Cascade Question Delete (Super Admin Only)
// Deletes BOTH:
// 1. The Question Group
// 2. ALL questions belonging to that Question Group
// Historical snapshots in PublishedTest, PublishHistory, and completed student attempts are strictly preserved.
router.delete('/question-groups/:id', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    let group = await QuestionGroupModel.findById(id);
    if (!group && mongoose.Types.ObjectId.isValid(id)) {
      group = await QuestionGroupModel.findById(new mongoose.Types.ObjectId(id));
    }

    if (!group) {
      return res.status(404).json({ error: 'Question Group not found' });
    }

    const gIdStr = group._id.toString();
    const groupName = group.name;

    // 1. Identify all questions strictly belonging to this question group
    const groupQuestions = await QuestionModel.find({
      $or: [
        { groupId: gIdStr },
        { groupId: group.id },
        ...(mongoose.Types.ObjectId.isValid(gIdStr) ? [{ groupId: new mongoose.Types.ObjectId(gIdStr) }] : []),
      ],
    });

    const questionIdsToDelete = groupQuestions.map((q) => q._id.toString());

    // 2. Cascade delete all questions belonging to this group from QuestionModel
    if (questionIdsToDelete.length > 0) {
      await QuestionModel.deleteMany({
        _id: { $in: groupQuestions.map((q) => q._id) },
      });
    }

    // 3. Delete the Question Group itself from QuestionGroupModel
    await QuestionGroupModel.findByIdAndDelete(group._id);

    // 4. Safely remove deleted questions ONLY from NOT_STARTED student assignments
    // DO NOT touch COMPLETED, IN_PROGRESS, INCOMPLETE, or LOCKED_INCOMPLETE attempts!
    if (questionIdsToDelete.length > 0) {
      const deletedIdSet = new Set(questionIdsToDelete);
      const matchingAssignments = await StudentTestAssignmentModel.find({
        status: 'NOT_STARTED',
        $or: [
          { 'questions.questionId': { $in: questionIdsToDelete } },
          { 'questions.id': { $in: questionIdsToDelete } },
          { 'questions._id': { $in: questionIdsToDelete } },
        ],
      });

      for (const assign of matchingAssignments) {
        if (Array.isArray(assign.questions)) {
          const originalCount = assign.questions.length;
          assign.questions = assign.questions.filter((q: any) => {
            const qId = String(q.questionId || q.id || q._id || '');
            return !deletedIdSet.has(qId);
          });
          if (assign.questions.length !== originalCount) {
            assign.totalQuestions = assign.questions.length;
            await assign.save();
          }
        }
      }

      // Safely remove deleted question snapshots & IDs from PublishedTestModel
      const matchingPubTests = await PublishedTestModel.find({
        $or: [
          { questionIds: { $in: questionIdsToDelete } },
          { 'questionsSnapshot.id': { $in: questionIdsToDelete } },
          { 'questionsSnapshot._id': { $in: questionIdsToDelete } },
          { 'questionsSnapshot.questionId': { $in: questionIdsToDelete } },
        ],
      });
      for (const pt of matchingPubTests) {
        let modified = false;
        if (Array.isArray(pt.questionIds)) {
          const origLen = pt.questionIds.length;
          pt.questionIds = pt.questionIds.filter((qId: any) => !deletedIdSet.has(String(qId)));
          if (pt.questionIds.length !== origLen) modified = true;
        }
        if (Array.isArray(pt.questionsSnapshot)) {
          const origLen = pt.questionsSnapshot.length;
          pt.questionsSnapshot = pt.questionsSnapshot.filter((q: any) => {
            const qId = String(q.id || q._id || q.questionId || '');
            return !deletedIdSet.has(qId);
          });
          if (pt.questionsSnapshot.length !== origLen) modified = true;
        }
        if (modified) {
          pt.markModified('questionsSnapshot');
          await pt.save();
        }
      }

      // Safely remove deleted question snapshots & IDs from PublishHistoryModel
      const matchingHistories = await PublishHistoryModel.find({
        $or: [
          { questionIds: { $in: questionIdsToDelete } },
          { 'questionsSnapshot.id': { $in: questionIdsToDelete } },
          { 'questionsSnapshot._id': { $in: questionIdsToDelete } },
          { 'questionsSnapshot.questionId': { $in: questionIdsToDelete } },
        ],
      });
      for (const ph of matchingHistories) {
        let modified = false;
        if (Array.isArray(ph.questionIds)) {
          const origLen = ph.questionIds.length;
          ph.questionIds = ph.questionIds.filter((qId: any) => !deletedIdSet.has(String(qId)));
          if (ph.questionIds.length !== origLen) modified = true;
        }
        if (Array.isArray(ph.questionsSnapshot)) {
          const origLen = ph.questionsSnapshot.length;
          ph.questionsSnapshot = ph.questionsSnapshot.filter((q: any) => {
            const qId = String(q.id || q._id || q.questionId || '');
            return !deletedIdSet.has(qId);
          });
          if (ph.questionsSnapshot.length !== origLen) modified = true;
        }
        if (modified) {
          ph.markModified('questionsSnapshot');
          await ph.save();
        }
      }
    }

    return res.json({
      success: true,
      message: `Question Group '${groupName}' and ${questionIdsToDelete.length} question(s) deleted successfully. Historical assessment snapshots remain preserved.`,
      deletedGroupId: gIdStr,
      deletedQuestionsCount: questionIdsToDelete.length,
      deletedQuestionIds: questionIdsToDelete,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete question group' });
  }
});

// Helpers for Single / Multiple selection answer parsing and evaluation
function parseMultipleCorrectAnswers(raw: any, options?: string[]): string[] {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof raw !== 'string') {
    return raw != null ? [String(raw).trim()] : [];
  }
  const str = raw.trim();
  if (!str) return [];

  const optsArray = Array.isArray(options)
    ? options
    : typeof options === 'string'
    ? (options as string).split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  if (optsArray.length > 0) {
    if (optsArray.some((opt) => opt.toLowerCase() === str.toLowerCase())) {
      return [str];
    }
  }

  if (str.includes(',')) {
    return str.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (str.includes('+')) {
    return str.split('+').map((s) => s.trim()).filter(Boolean);
  }

  return [str];
}

function normalizeToOptionValue(val: string, options?: string[]): string {
  const trimmed = val.trim();
  const optsArray = Array.isArray(options)
    ? options
    : typeof options === 'string'
    ? (options as string).split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  if (optsArray.length === 0) return trimmed.toLowerCase();

  const directMatch = optsArray.find((o) => o.trim().toLowerCase() === trimmed.toLowerCase());
  if (directMatch) return directMatch.trim().toLowerCase();

  if (/^[A-Za-z]$/.test(trimmed)) {
    const letterIdx = trimmed.toUpperCase().charCodeAt(0) - 65;
    if (letterIdx >= 0 && letterIdx < optsArray.length) {
      return optsArray[letterIdx].trim().toLowerCase();
    }
  }

  if (/^\d+$/.test(trimmed)) {
    const numIdx = Number(trimmed) - 1;
    if (numIdx >= 0 && numIdx < optsArray.length) {
      return optsArray[numIdx].trim().toLowerCase();
    }
  }

  return trimmed.toLowerCase();
}

function evaluateQuestionCorrectness(qItem: any, studentAnswer: any): boolean | undefined {
  const hasCorrectAnswer = hasAutomaticallyScorableAnswer(qItem);

  if (!hasCorrectAnswer) return undefined;

  if (studentAnswer === undefined || studentAnswer === null || (typeof studentAnswer === 'string' && studentAnswer.trim() === '')) {
    return false;
  }
  if (Array.isArray(studentAnswer) && studentAnswer.length === 0) {
    return false;
  }

  const isRanking = Boolean(
    qItem.isRanking ||
    qItem.isRankingQuestion ||
    String(qItem.questionType || '').toLowerCase() === 'ranking'
  );

  if (isRanking) {
    const expected =
      qItem.correctAnswer ??
      qItem.metadata?.expectedOrder ??
      qItem.metadata?.expectedResponse ??
      qItem.expectedResponse;

    if (!expected) return undefined;

    let studentOrder: string[] = [];
    if (Array.isArray(studentAnswer)) {
      studentOrder = studentAnswer.map((item: any) =>
        typeof item === 'string' ? item.trim() : String(item.text || item.id || '').trim()
      ).filter(Boolean);
    } else if (typeof studentAnswer === 'string') {
      studentOrder = studentAnswer.split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    let expectedOrder: string[] = [];
    if (Array.isArray(expected)) {
      expectedOrder = expected.map((item: any) =>
        typeof item === 'string' ? item.trim() : String(item.text || item.id || '').trim()
      ).filter(Boolean);
    } else if (typeof expected === 'string') {
      expectedOrder = expected.split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    if (studentOrder.length === 0 || expectedOrder.length === 0 || studentOrder.length !== expectedOrder.length) {
      return false;
    }

    return studentOrder.every((stmt, idx) => stmt.toLowerCase() === expectedOrder[idx].toLowerCase());
  }

  const isMultiple = (qItem.answerType || 'single') === 'multiple';
  const options = Array.isArray(qItem.options) ? qItem.options : [];

  if (isMultiple) {
    let studentItems: string[] = [];
    if (Array.isArray(studentAnswer)) {
      studentItems = studentAnswer.map((s: any) => String(s).trim()).filter(Boolean);
    } else if (typeof studentAnswer === 'string') {
      studentItems = studentAnswer.split(',').map((s: any) => s.trim()).filter(Boolean);
    } else {
      studentItems = [String(studentAnswer).trim()].filter(Boolean);
    }

    let expectedItems: string[] = [];
    if (Array.isArray(qItem.correctAnswers) && qItem.correctAnswers.length > 0) {
      expectedItems = qItem.correctAnswers.map((s: any) => String(s).trim()).filter(Boolean);
    } else if (Array.isArray(qItem.correctAnswer) && qItem.correctAnswer.length > 0) {
      expectedItems = qItem.correctAnswer.map((s: any) => String(s).trim()).filter(Boolean);
    } else if (typeof qItem.correctAnswer === 'string' && qItem.correctAnswer.trim()) {
      expectedItems = parseMultipleCorrectAnswers(qItem.correctAnswer, options);
    } else if (qItem.correctAnswer != null) {
      expectedItems = [String(qItem.correctAnswer).trim()];
    }

    if (studentItems.length === 0 || expectedItems.length === 0) {
      return false;
    }

    const studentNormalizedSet = new Set(studentItems.map((item) => normalizeToOptionValue(item, options)));
    const expectedNormalizedSet = new Set(expectedItems.map((item) => normalizeToOptionValue(item, options)));

    if (studentNormalizedSet.size !== expectedNormalizedSet.size) {
      return false;
    }

    for (const item of studentNormalizedSet) {
      if (!expectedNormalizedSet.has(item)) {
        return false;
      }
    }

    return true;
  }

  // Single Selection
  const expected = qItem.correctAnswer;
  if (typeof expected === 'string' && typeof studentAnswer === 'string') {
    return normalizeToOptionValue(expected, options) === normalizeToOptionValue(studentAnswer, options);
  }
  if (typeof expected === 'number' && !isNaN(Number(studentAnswer))) {
    return Number(expected) === Number(studentAnswer);
  }
  return JSON.stringify(expected) === JSON.stringify(studentAnswer);
}

// Add Question
router.post('/questions', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const {
      groupId,
      difficulty,
      content,
      timeSeconds,
      points,
      options,
      answerType,
      isRanking,
      isRankingQuestion,
      questionType,
      correctAnswer,
      correctAnswers,
      enableWrittenExplanation,
      defaultInput,
      scoringGuide,
      expectedResponse,
      images,
      imageLayout,
      metadata,
    } = req.body;

    if (!groupId || !difficulty || !content) {
      return res.status(400).json({ error: 'Question Group, Difficulty, and Content are required' });
    }

    const group = await QuestionGroupModel.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Question Group not found' });

    const parsedTime = timeSeconds !== undefined && timeSeconds !== null && timeSeconds !== ''
      ? Number(timeSeconds)
      : null;
    const parsedPoints = points !== undefined && points !== null && points !== ''
      ? Number(points)
      : null;

    let parsedOptions: string[] = [];
    if (Array.isArray(options)) {
      parsedOptions = options.map((s: any) => String(s).trim()).filter(Boolean);
    } else if (typeof options === 'string' && options.trim()) {
      parsedOptions = options.split(',').map((s: any) => s.trim()).filter(Boolean);
    }

    const normalizedIsRanking = Boolean(isRanking || isRankingQuestion || String(questionType || '').toLowerCase() === 'ranking');

    const normalizedAnswerType: 'single' | 'multiple' =
      answerType === 'multiple' ? 'multiple' : 'single';

    let finalCorrectAnswer: any = null;
    let finalCorrectAnswers: string[] = [];

    if (normalizedAnswerType === 'multiple') {
      if (Array.isArray(correctAnswers) && correctAnswers.length > 0) {
        finalCorrectAnswers = correctAnswers.map((s: any) => String(s).trim()).filter(Boolean);
      } else if (Array.isArray(correctAnswer) && correctAnswer.length > 0) {
        finalCorrectAnswers = correctAnswer.map((s: any) => String(s).trim()).filter(Boolean);
      } else if (correctAnswer !== undefined && correctAnswer !== null && String(correctAnswer).trim() !== '') {
        finalCorrectAnswers = parseMultipleCorrectAnswers(correctAnswer, parsedOptions);
      }
      finalCorrectAnswer = finalCorrectAnswers.length > 0 ? finalCorrectAnswers.join(', ') : null;
    } else {
      if (correctAnswer !== undefined && correctAnswer !== null && String(correctAnswer).trim() !== '') {
        finalCorrectAnswer = typeof correctAnswer === 'string' ? correctAnswer.trim() : correctAnswer;
        finalCorrectAnswers = [String(finalCorrectAnswer)];
      } else if (Array.isArray(correctAnswers) && correctAnswers.length > 0) {
        finalCorrectAnswer = String(correctAnswers[0]).trim();
        finalCorrectAnswers = [finalCorrectAnswer];
      }
    }

    // Process and sanitize images array
    const sanitizedImages = Array.isArray(images)
      ? images.map((img: any, idx: number) => ({
          id: img.id || `img_${Date.now()}_${idx}`,
          url: String(img.url || ''),
          s3Key: String(img.s3Key || ''),
          label: img.label ? String(img.label).trim() : undefined,
          caption: img.caption ? String(img.caption).trim() : undefined,
          order: typeof img.order === 'number' ? img.order : idx,
          role: img.role === 'option' ? 'option' : 'question',
          optionIndex: typeof img.optionIndex === 'number' ? img.optionIndex : undefined,
        }))
      : [];

    const newQuestion = await QuestionModel.create({
      groupId: group._id.toString(),
      groupName: group.name,
      difficulty,
      content: content.trim(),
      timeSeconds: parsedTime,
      points: parsedPoints,
      options: parsedOptions,
      answerType: normalizedAnswerType,
      isRanking: normalizedIsRanking,
      isRankingQuestion: normalizedIsRanking,
      questionType: questionType || (normalizedIsRanking ? 'Ranking' : undefined),
      correctAnswer: finalCorrectAnswer,
      correctAnswers: finalCorrectAnswers,
      enableWrittenExplanation: Boolean(enableWrittenExplanation),
      defaultInput: defaultInput !== undefined ? Boolean(defaultInput) : true,
      scoringGuide: scoringGuide || metadata?.scoringGuide,
      expectedResponse: expectedResponse || metadata?.expectedResponse,
      images: sanitizedImages,
      imageLayout: imageLayout || (sanitizedImages.length > 0 ? 'auto' : undefined),
      metadata: metadata || {},
    });

    return res.status(201).json(formatDoc(newQuestion));
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to add question' });
  }
});

// Update Question (Super Admin Only)
router.put('/questions/:id', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      groupId,
      difficulty,
      content,
      timeSeconds,
      points,
      options,
      answerType,
      isRanking,
      isRankingQuestion,
      questionType,
      correctAnswer,
      correctAnswers,
      enableWrittenExplanation,
      defaultInput,
      scoringGuide,
      expectedResponse,
      images,
      imageLayout,
      metadata,
    } = req.body;

    let question = await QuestionModel.findById(id);
    if (!question && mongoose.Types.ObjectId.isValid(id)) {
      question = await QuestionModel.findById(new mongoose.Types.ObjectId(id));
    }
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (groupId) {
      const grp = await QuestionGroupModel.findById(groupId);
      if (grp) {
        question.groupId = grp._id.toString();
        question.groupName = grp.name;
      }
    }
    if (difficulty && ['Easy', 'Medium', 'Hard'].includes(difficulty)) {
      question.difficulty = difficulty;
    }
    if (content) {
      question.content = content.trim();
    }
    if (timeSeconds !== undefined) {
      question.timeSeconds = timeSeconds !== null && timeSeconds !== '' ? Number(timeSeconds) : null;
    }
    if (points !== undefined) {
      question.points = points !== null && points !== '' ? Number(points) : null;
    }
    if (options !== undefined) {
      if (Array.isArray(options)) {
        question.options = options.map((s: any) => String(s).trim()).filter(Boolean);
      } else if (typeof options === 'string' && options.trim()) {
        question.options = options.split(',').map((s: any) => s.trim()).filter(Boolean);
      } else if (options === null) {
        question.options = [];
      }
    }

    if (isRanking !== undefined || isRankingQuestion !== undefined || questionType !== undefined) {
      const isRank = Boolean(
        isRanking ?? isRankingQuestion ?? (String(questionType || '').toLowerCase() === 'ranking')
      );
      question.isRanking = isRank;
      question.isRankingQuestion = isRank;
      if (isRank && !questionType) {
        question.questionType = 'Ranking';
      } else if (questionType !== undefined) {
        question.questionType = questionType;
      }
    }

    if (scoringGuide !== undefined) {
      question.scoringGuide = scoringGuide;
    }
    if (expectedResponse !== undefined) {
      question.expectedResponse = expectedResponse;
    }

    if (images !== undefined) {
      question.images = Array.isArray(images)
        ? images.map((img: any, idx: number) => ({
            id: img.id || `img_${Date.now()}_${idx}`,
            url: String(img.url || ''),
            s3Key: String(img.s3Key || ''),
            label: img.label ? String(img.label).trim() : undefined,
            caption: img.caption ? String(img.caption).trim() : undefined,
            order: typeof img.order === 'number' ? img.order : idx,
            role: img.role === 'option' ? 'option' : 'question',
            optionIndex: typeof img.optionIndex === 'number' ? img.optionIndex : undefined,
          }))
        : [];
    }

    if (imageLayout !== undefined) {
      question.imageLayout = imageLayout;
    }

    const normalizedAnswerType: 'single' | 'multiple' =
      answerType ? (answerType === 'multiple' ? 'multiple' : 'single') : (question.answerType || 'single');
    question.answerType = normalizedAnswerType;

    if (normalizedAnswerType === 'multiple') {
      let finalCorrectAnswers: string[] = [];
      if (Array.isArray(correctAnswers) && correctAnswers.length > 0) {
        finalCorrectAnswers = correctAnswers.map((s: any) => String(s).trim()).filter(Boolean);
      } else if (Array.isArray(correctAnswer) && correctAnswer.length > 0) {
        finalCorrectAnswers = correctAnswer.map((s: any) => String(s).trim()).filter(Boolean);
      } else if (correctAnswer !== undefined && correctAnswer !== null && String(correctAnswer).trim() !== '') {
        finalCorrectAnswers = parseMultipleCorrectAnswers(correctAnswer, question.options);
      }
      question.correctAnswers = finalCorrectAnswers;
      question.correctAnswer = finalCorrectAnswers.length > 0 ? finalCorrectAnswers.join(', ') : null;
    } else {
      if (correctAnswer !== undefined && correctAnswer !== null && String(correctAnswer).trim() !== '') {
        const val = typeof correctAnswer === 'string' ? correctAnswer.trim() : correctAnswer;
        question.correctAnswer = val;
        question.correctAnswers = [String(val)];
      } else if (Array.isArray(correctAnswers) && correctAnswers.length > 0) {
        const val = String(correctAnswers[0]).trim();
        question.correctAnswer = val;
        question.correctAnswers = [val];
      } else if (correctAnswer === null || correctAnswer === '') {
        question.correctAnswer = null;
        question.correctAnswers = [];
      }
    }

    if (enableWrittenExplanation !== undefined) {
      question.enableWrittenExplanation = Boolean(enableWrittenExplanation);
    }

    if (defaultInput !== undefined) {
      question.defaultInput = Boolean(defaultInput);
    }

    if (metadata) {
      question.metadata = metadata;
    }

    await question.save();

    const qIdStr = question._id.toString();

    // Synchronize edited question ONLY to non-completed student assignments (NOT_STARTED, IN_PROGRESS, etc.).
    // CRITICAL COMPLETED STUDENT RULE:
    // Completed student historical attempts (status === 'COMPLETED') must remain strictly immutable.
    const nonCompletedAssignments = await StudentTestAssignmentModel.find({
      status: { $ne: 'COMPLETED' },
      $or: [
        { 'questions.questionId': qIdStr },
        { 'questions.id': qIdStr },
        { 'questions._id': qIdStr },
      ],
    });

    for (const a of nonCompletedAssignments) {
      let modified = false;
      if (Array.isArray(a.questions)) {
        for (let i = 0; i < a.questions.length; i++) {
          const q = a.questions[i];
          const matches =
            String(q.questionId || '') === qIdStr ||
            String(q.id || '') === qIdStr ||
            String(q._id || '') === qIdStr;

          if (matches) {
            q.content = question.content;
            q.options = question.options || [];
            q.difficulty = question.difficulty;
            q.groupName = question.groupName;
            q.groupId = question.groupId;
            q.answerType = question.answerType || 'single';
            q.isRanking = Boolean(question.isRanking || question.isRankingQuestion);
            q.isRankingQuestion = Boolean(question.isRanking || question.isRankingQuestion);
            if (question.questionType) q.questionType = question.questionType;
            q.points = question.points != null ? Number(question.points) : null;
            q.timeAllowedSeconds = question.timeSeconds != null ? Number(question.timeSeconds) : null;
            q.timeSeconds = question.timeSeconds != null ? Number(question.timeSeconds) : null;
            q.enableWrittenExplanation = Boolean(question.enableWrittenExplanation);
            q.defaultInput = question.defaultInput !== undefined ? Boolean(question.defaultInput) : true;
            q.correctAnswer = question.correctAnswer;
            q.correctAnswers = question.correctAnswers;
            q.images = question.images || [];
            q.imageLayout = question.imageLayout || 'auto';
            if (question.scoringGuide) q.scoringGuide = question.scoringGuide;
            if (question.expectedResponse) q.expectedResponse = question.expectedResponse;
            if (question.metadata) {
              q.metadata = question.metadata;
            }
            modified = true;
          }
        }
      }
      if (modified) {
        a.markModified('questions');
        await a.save();
      }
    }

    // Synchronize active published test snapshots for non-completed / future tests
    const activePubTests = await PublishedTestModel.find({
      $or: [
        { 'questionsSnapshot.questionId': qIdStr },
        { 'questionsSnapshot.id': qIdStr },
        { 'questionsSnapshot._id': qIdStr },
      ],
    });
    for (const p of activePubTests) {
      let modified = false;
      if (Array.isArray(p.questionsSnapshot)) {
        for (const snap of p.questionsSnapshot) {
          const matches =
            String(snap.questionId || '') === qIdStr ||
            String(snap.id || '') === qIdStr ||
            String(snap._id || '') === qIdStr;
          if (matches) {
            snap.content = question.content;
            snap.options = question.options || [];
            snap.difficulty = question.difficulty;
            snap.groupName = question.groupName;
            snap.groupId = question.groupId;
            snap.points = question.points != null ? Number(question.points) : null;
            snap.timeAllowedSeconds = question.timeSeconds != null ? Number(question.timeSeconds) : null;
            snap.timeSeconds = question.timeSeconds != null ? Number(question.timeSeconds) : null;
            snap.answerType = question.answerType || 'single';
            snap.isRanking = Boolean(question.isRanking || question.isRankingQuestion);
            snap.isRankingQuestion = Boolean(question.isRanking || question.isRankingQuestion);
            if (question.questionType) snap.questionType = question.questionType;
            snap.enableWrittenExplanation = Boolean(question.enableWrittenExplanation);
            snap.defaultInput = question.defaultInput !== undefined ? Boolean(question.defaultInput) : true;
            snap.correctAnswer = question.correctAnswer ?? null;
            snap.correctAnswers = Array.isArray(question.correctAnswers)
              ? question.correctAnswers
              : (question.correctAnswer ? [String(question.correctAnswer)] : []);
            snap.images = question.images || [];
            snap.imageLayout = question.imageLayout || 'auto';
            if (question.scoringGuide) snap.scoringGuide = question.scoringGuide;
            if (question.expectedResponse) snap.expectedResponse = question.expectedResponse;
            if (question.metadata) {
              snap.metadata = question.metadata;
            }
            modified = true;
          }
        }
      }
      if (modified) {
        p.markModified('questionsSnapshot');
        await p.save();
      }
    }

    // Synchronize PublishHistoryModel questionsSnapshot for Publish History Preview
    const histPubTests = await PublishHistoryModel.find({
      $or: [
        { 'questionsSnapshot.questionId': qIdStr },
        { 'questionsSnapshot.id': qIdStr },
        { 'questionsSnapshot._id': qIdStr },
      ],
    });
    for (const h of histPubTests) {
      let modified = false;
      if (Array.isArray(h.questionsSnapshot)) {
        for (const snap of h.questionsSnapshot) {
          const matches =
            String(snap.questionId || '') === qIdStr ||
            String(snap.id || '') === qIdStr ||
            String(snap._id || '') === qIdStr;
          if (matches) {
            snap.content = question.content;
            snap.options = question.options || [];
            snap.difficulty = question.difficulty;
            snap.groupName = question.groupName;
            snap.groupId = question.groupId;
            snap.points = question.points != null ? Number(question.points) : null;
            snap.timeAllowedSeconds = question.timeSeconds != null ? Number(question.timeSeconds) : null;
            snap.timeSeconds = question.timeSeconds != null ? Number(question.timeSeconds) : null;
            snap.answerType = question.answerType || 'single';
            snap.isRanking = Boolean(question.isRanking || question.isRankingQuestion);
            snap.isRankingQuestion = Boolean(question.isRanking || question.isRankingQuestion);
            if (question.questionType) snap.questionType = question.questionType;
            snap.enableWrittenExplanation = Boolean(question.enableWrittenExplanation);
            snap.defaultInput = question.defaultInput !== undefined ? Boolean(question.defaultInput) : true;
            snap.correctAnswer = question.correctAnswer ?? null;
            snap.correctAnswers = Array.isArray(question.correctAnswers)
              ? question.correctAnswers
              : (question.correctAnswer ? [String(question.correctAnswer)] : []);
            snap.images = question.images || [];
            snap.imageLayout = question.imageLayout || 'auto';
            if (question.scoringGuide) snap.scoringGuide = question.scoringGuide;
            if (question.expectedResponse) snap.expectedResponse = question.expectedResponse;
            if (question.metadata) {
              snap.metadata = question.metadata;
            }
            modified = true;
          }
        }
      }
      if (modified) {
        h.markModified('questionsSnapshot');
        await h.save();
      }
    }

    return res.json(formatDoc(question));
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update question' });
  }
});

// List Questions (Filtered by groupId, difficulty)
router.get('/questions', authenticate, async (req: Request, res: Response) => {
  try {
    const { groupId, difficulty } = req.query as {
      groupId?: string;
      difficulty?: string;
    };

    if (req.user!.role === 'student') {
      const assignments = await getStudentAccessibleAssignments(req);
      const questions = assignments.flatMap((a: any) => a.questions || []).filter((q: any) => {
        if (groupId && String(q.groupId || '') !== groupId) return false;
        if (difficulty && String(q.difficulty || '').toLowerCase() !== difficulty.toLowerCase()) return false;
        return true;
      });
      return res.json(questions.map((q: any) => serializeStudentQuestion(q)));
    }

    const query: any = {};
    if (groupId) query.groupId = groupId;
    if (difficulty) query.difficulty = difficulty;

    const list = await QuestionModel.find(query).sort({ createdAt: -1 });

    return res.json(formatDocs(list));
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to list questions' });
  }
});

// Delete Question from Question Bank (Super Admin Only)
// CRITICAL: Deleting from Question Bank removes ONLY the live/current Question Bank record.
// Lifecycle rule for student assignments:
// - COMPLETED, IN_PROGRESS, INCOMPLETE, LOCKED_INCOMPLETE: preserve historical snapshot permanently.
// - NOT_STARTED: safely remove the deleted question from pending unstarted assignments.
// - Historical PublishedTest & PublishHistory snapshots remain strictly preserved!
router.delete('/questions/:id', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    let question = await QuestionModel.findById(id);
    if (!question && mongoose.Types.ObjectId.isValid(id)) {
      question = await QuestionModel.findById(new mongoose.Types.ObjectId(id));
    }

    if (!question) {
      return res.status(404).json({ error: 'Question not found in Question Bank' });
    }

    const questionContentPreview = question.content
      ? question.content.substring(0, 60) + (question.content.length > 60 ? '...' : '')
      : 'Question';

    const deletedIdStr = question._id.toString();

    // 1. Delete ONLY the live Question Bank document from QuestionModel
    await QuestionModel.findByIdAndDelete(question._id);

    // 2. Safely remove the deleted question ONLY from NOT_STARTED student assignments that actually contain it
    // DO NOT touch COMPLETED, IN_PROGRESS, INCOMPLETE, or LOCKED_INCOMPLETE attempts!
    const matchingAssignments = await StudentTestAssignmentModel.find({
      status: 'NOT_STARTED',
      $or: [
        { 'questions.questionId': deletedIdStr },
        { 'questions.id': deletedIdStr },
        { 'questions._id': deletedIdStr },
      ],
    });
    for (const assign of matchingAssignments) {
      if (Array.isArray(assign.questions)) {
        const originalCount = assign.questions.length;
        assign.questions = assign.questions.filter((q: any) => {
          const qId = String(q.questionId || q.id || q._id || '');
          return qId !== deletedIdStr;
        });
        if (assign.questions.length !== originalCount) {
          assign.totalQuestions = assign.questions.length;
          await assign.save();
        }
      }
    }

    // 3. Safely remove the deleted question from PublishedTestModel snapshots & IDs so previews do not surface old snapshots
    const matchingPubTests = await PublishedTestModel.find({
      $or: [
        { questionIds: deletedIdStr },
        { 'questionsSnapshot.id': deletedIdStr },
        { 'questionsSnapshot._id': deletedIdStr },
        { 'questionsSnapshot.questionId': deletedIdStr },
      ],
    });
    for (const pt of matchingPubTests) {
      let modified = false;
      if (Array.isArray(pt.questionIds) && pt.questionIds.includes(deletedIdStr)) {
        pt.questionIds = pt.questionIds.filter((qId: any) => String(qId) !== deletedIdStr);
        modified = true;
      }
      if (Array.isArray(pt.questionsSnapshot)) {
        const origLen = pt.questionsSnapshot.length;
        pt.questionsSnapshot = pt.questionsSnapshot.filter((q: any) => {
          const qId = String(q.id || q._id || q.questionId || '');
          return qId !== deletedIdStr;
        });
        if (pt.questionsSnapshot.length !== origLen) {
          modified = true;
        }
      }
      if (modified) {
        pt.markModified('questionsSnapshot');
        await pt.save();
      }
    }

    // 4. Safely remove the deleted question from PublishHistoryModel snapshots & IDs
    const matchingHistories = await PublishHistoryModel.find({
      $or: [
        { questionIds: deletedIdStr },
        { 'questionsSnapshot.id': deletedIdStr },
        { 'questionsSnapshot._id': deletedIdStr },
        { 'questionsSnapshot.questionId': deletedIdStr },
      ],
    });
    for (const ph of matchingHistories) {
      let modified = false;
      if (Array.isArray(ph.questionIds) && ph.questionIds.includes(deletedIdStr)) {
        ph.questionIds = ph.questionIds.filter((qId: any) => String(qId) !== deletedIdStr);
        modified = true;
      }
      if (Array.isArray(ph.questionsSnapshot)) {
        const origLen = ph.questionsSnapshot.length;
        ph.questionsSnapshot = ph.questionsSnapshot.filter((q: any) => {
          const qId = String(q.id || q._id || q.questionId || '');
          return qId !== deletedIdStr;
        });
        if (ph.questionsSnapshot.length !== origLen) {
          modified = true;
        }
      }
      if (modified) {
        ph.markModified('questionsSnapshot');
        await ph.save();
      }
    }

    // Clean up associated S3 images in the background if any exist
    if (Array.isArray(question.images) && question.images.length > 0) {
      for (const img of question.images) {
        if (img?.s3Key) {
          s3Service.deleteImage(img.s3Key).catch(() => {});
        }
      }
    }

    return res.json({
      success: true,
      message: `Question '${questionContentPreview}' deleted successfully from Question Bank. Historical assessment snapshots remain preserved.`,
      deletedId: deletedIdStr,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete question' });
  }
});

// ==========================================
// 4B. AWS S3 IMAGE STORAGE & MEDIA ROUTES
// ==========================================

// Get AWS S3 storage status
router.get('/s3/status', authenticate, async (_req: Request, res: Response) => {
  return res.json({ status: 'ok', s3: s3Service.getStatus() });
});

// Stream or serve S3 media object securely
router.get('/media/image/:key(*)', async (req: Request, res: Response) => {
  try {
    const s3Key = req.params.key;
    if (!s3Key) {
      return res.status(400).json({ error: 'Image key is required' });
    }

    // SEC-01: Reject path traversal patterns and directory boundary escapes
    if (!s3Service.isSafeKey(s3Key)) {
      return res.status(400).json({ error: 'Invalid or forbidden image path' });
    }

    const media = await s3Service.getObjectStream(s3Key);
    if (!media || !media.stream) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.setHeader('Content-Type', media.contentType);
    if (media.contentLength) {
      res.setHeader('Content-Length', media.contentLength);
    }
    // Cache for 24 hours to reduce S3 requests
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');

    media.stream.pipe(res);
  } catch (err: any) {
    console.error('[Media Stream Error]:', err.message || err);
    return res.status(500).json({ error: 'Failed to load media' });
  }
});

// Upload Single Image to AWS S3 (Super Admin Only)
router.post(
  '/uploads/image',
  authenticate,
  requireRole('super_admin'),
  handleSingleImageUpload,
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided. Field name must be "image".' });
      }

      const { label, caption, order, role, optionIndex } = req.body;

      const result = await s3Service.uploadImage(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        'questions'
      );

      const imageMeta = {
        id: `img_${Date.now()}_${crypto.randomInt(1000, 9999)}`,
        url: result.url,
        s3Key: result.s3Key,
        originalName: result.originalName,
        mimeType: result.mimeType,
        size: result.size,
        label: label ? String(label).trim() : undefined,
        caption: caption ? String(caption).trim() : undefined,
        order: order !== undefined && order !== '' ? Number(order) : 0,
        role: role === 'option' ? 'option' : 'question',
        optionIndex: optionIndex !== undefined && optionIndex !== '' ? Number(optionIndex) : undefined,
      };

      return res.status(201).json({
        success: true,
        message: 'Image uploaded successfully to AWS S3',
        image: imageMeta,
      });
    } catch (err: any) {
      console.error('[Upload Image Error]:', err.message || err);
      return res.status(400).json({ error: err.message || 'Failed to upload image' });
    }
  }
);

// Upload Multiple Images to AWS S3 (Super Admin Only)
router.post(
  '/uploads/images',
  authenticate,
  requireRole('super_admin'),
  handleMultipleImagesUpload,
  async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No image files provided. Field name must be "images".' });
      }

      const uploadedImages = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const result = await s3Service.uploadImage(
          file.buffer,
          file.originalname,
          file.mimetype,
          'questions'
        );

        uploadedImages.push({
          id: `img_${Date.now()}_${i}_${crypto.randomInt(1000, 9999)}`,
          url: result.url,
          s3Key: result.s3Key,
          originalName: result.originalName,
          mimeType: result.mimeType,
          size: result.size,
          label: `Picture ${String.fromCharCode(65 + i)}`,
          order: i,
          role: 'question' as const,
        });
      }

      return res.status(201).json({
        success: true,
        message: `${uploadedImages.length} image(s) uploaded successfully to AWS S3`,
        images: uploadedImages,
      });
    } catch (err: any) {
      console.error('[Upload Multiple Images Error]:', err.message || err);
      return res.status(400).json({ error: err.message || 'Failed to upload images' });
    }
  }
);

// Delete Image from AWS S3 (Super Admin Only)
router.delete('/uploads/image', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { s3Key } = req.body;
    if (!s3Key) {
      return res.status(400).json({ error: 's3Key is required for deletion' });
    }

    // SEC-01: Reject path traversal patterns and directory boundary escapes
    if (!s3Service.isSafeKey(s3Key)) {
      return res.status(400).json({ error: 'Invalid or forbidden image key for deletion' });
    }

    const deleted = await s3Service.deleteImage(s3Key);
    return res.json({
      success: true,
      message: deleted ? 'Image deleted from AWS S3' : 'Image record processed',
      s3Key,
    });
  } catch (err: any) {
    console.error('[Delete S3 Image Error]:', err.message || err);
    return res.status(500).json({ error: 'Failed to delete image from S3' });
  }
});

// Import Questions from Excel (Pictorial(1).xlsx) (Super Admin Only)
// Accepts either multipart file or base64Data JSON payload
router.post(
  '/questions/import-excel',
  authenticate,
  requireRole('super_admin'),
  uploadExcel.single('file'),
  async (req: Request, res: Response) => {
    try {
      let fileBuffer: Buffer | null = null;
      let filename = 'import.xlsx';
      const isDryRun = req.body.dryRun === 'true' || req.body.dryRun === true;
      const targetGroupId = req.body.groupId ? String(req.body.groupId).trim() : null;

      if (req.file) {
        fileBuffer = req.file.buffer;
        filename = req.file.originalname;
      } else if (req.body.base64Data) {
        fileBuffer = Buffer.from(req.body.base64Data.replace(/^data:.*?;base64,/, ''), 'base64');
        if (req.body.filename) filename = req.body.filename;
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return res.status(400).json({ error: 'No Excel file data provided. Upload via "file" field or send "base64Data".' });
      }

      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        return res.status(400).json({ error: 'Excel workbook contains no sheets.' });
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (rawRows.length === 0) {
        return res.status(400).json({ error: 'The uploaded Excel sheet contains no data rows.' });
      }

      // Fetch or resolve question groups
      const allGroups = await QuestionGroupModel.find();
      const groupByName = new Map(allGroups.map((g: any) => [g.name.trim().toLowerCase(), g]));
      let defaultGroup = targetGroupId ? allGroups.find((g: any) => g._id.toString() === targetGroupId || g.id === targetGroupId) : allGroups[0];

      if (!defaultGroup) {
        // Auto-create "Pictorial Puzzles" group if no groups exist
        const newGroup = await QuestionGroupModel.create({
          name: 'Pictorial Puzzles',
          description: 'Visual reasoning, pattern matching, and pictorial evaluation questions',
        });
        defaultGroup = newGroup;
        groupByName.set('pictorial puzzles', newGroup);
      }

      const parsedQuestions: any[] = [];
      const warnings: string[] = [];
      let skippedCount = 0;

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const rowNum = i + 2; // Row number in Excel (header is row 1)

        // Helper to find column case-insensitively
        const getCol = (...candidates: string[]) => {
          for (const cand of candidates) {
            const foundKey = Object.keys(row).find((k) => k.trim().toLowerCase() === cand.toLowerCase());
            if (foundKey && String(row[foundKey]).trim()) {
              return String(row[foundKey]).trim();
            }
          }
          return '';
        };

        const questionText = getCol('Question Text', 'Question', 'Content', 'Problem', 'Question Content', 'Text');
        if (!questionText) {
          warnings.push(`Row ${rowNum}: Skipped because Question Text is empty.`);
          skippedCount++;
          continue;
        }

        // Difficulty
        let difficulty = getCol('Difficulty', 'Difficulty Level', 'Level');
        if (difficulty) {
          const lower = difficulty.toLowerCase();
          if (lower.includes('easy')) difficulty = 'Easy';
          else if (lower.includes('hard')) difficulty = 'Hard';
          else difficulty = 'Medium';
        } else {
          difficulty = 'Medium';
        }

        // Group
        const rowGroupName = getCol('Group', 'Question Group', 'Subject', 'Category');
        let selectedGroup = defaultGroup;
        if (rowGroupName) {
          const match = groupByName.get(rowGroupName.toLowerCase());
          if (match) {
            selectedGroup = match;
          } else if (!isDryRun) {
            const created = await QuestionGroupModel.create({
              name: rowGroupName,
              description: `Imported group from ${filename}`,
            });
            groupByName.set(rowGroupName.toLowerCase(), created);
            selectedGroup = created;
          }
        }

        // Options (A, B, C, D)
        const optA = getCol('Option A', 'A', 'Choice A');
        const optB = getCol('Option B', 'B', 'Choice B');
        const optC = getCol('Option C', 'C', 'Choice C');
        const optD = getCol('Option D', 'D', 'Choice D');
        const optionsListCol = getCol('Options', 'Choices');

        let options: string[] = [];
        if (optA || optB || optC || optD) {
          if (optA) options.push(optA);
          if (optB) options.push(optB);
          if (optC) options.push(optC);
          if (optD) options.push(optD);
        } else if (optionsListCol) {
          options = optionsListCol.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
        }

        // Correct Answer
        const rawCorrect = getCol('Correct Answer', 'Answer', 'Key', 'Correct', 'Correct Option');
        let correctAnswer: any = null;
        let correctAnswers: string[] = [];

        if (rawCorrect) {
          // Check if letter A, B, C, D matches options
          const upperLetter = rawCorrect.toUpperCase();
          if (/^[A-D]$/.test(upperLetter) && options.length > 0) {
            const idx = upperLetter.charCodeAt(0) - 65;
            if (options[idx]) {
              correctAnswer = options[idx];
              correctAnswers = [options[idx]];
            } else {
              correctAnswer = rawCorrect;
              correctAnswers = [rawCorrect];
            }
          } else {
            correctAnswer = rawCorrect;
            correctAnswers = [rawCorrect];
          }
        } else {
          warnings.push(`Row ${rowNum}: No explicit correct answer found. Imported for assessor review.`);
        }

        // Points & Time Limit
        const rawPoints = getCol('Points', 'Marks', 'Score');
        const points = rawPoints ? Number(rawPoints) : 10;

        const rawTime = getCol('Time', 'Time Limit', 'Duration', 'Time Seconds');
        const timeSeconds = rawTime ? Number(rawTime) : 45;

        // Written Explanation
        const rawExplanation = getCol('Enable Written Explanation', 'Written Explanation', 'Explanation');
        const enableWrittenExplanation = rawExplanation
          ? ['true', 'yes', '1', 'y', 'enabled'].includes(rawExplanation.toLowerCase())
          : false;

        // Default Input (defaults to true if column omitted or empty)
        const rawDefaultInput = getCol('Default Input', 'Show Default Input');
        const defaultInput = rawDefaultInput
          ? !['false', 'no', '0', 'n', 'disabled'].includes(rawDefaultInput.toLowerCase())
          : true;

        // Image / Visual Prompts
        const rowImages: any[] = [];
        const mainImage = getCol('Image', 'Image Name', 'Main Image', 'Picture', 'Image URL');
        if (mainImage) {
          rowImages.push({
            id: `img_imp_${i}_0`,
            url: mainImage.startsWith('http') || mainImage.startsWith('/') ? mainImage : `/api/media/image/${encodeURIComponent(mainImage)}`,
            s3Key: mainImage.startsWith('http') ? '' : mainImage,
            label: 'Main Image',
            order: 0,
            role: 'question',
          });
        }

        const picA = getCol('Picture A', 'Image A');
        const picB = getCol('Picture B', 'Image B');
        const picC = getCol('Picture C', 'Image C');
        const picD = getCol('Picture D', 'Image D');

        if (picA) rowImages.push({ id: `img_imp_${i}_1`, url: picA, s3Key: picA, label: 'Picture A', order: 1, role: 'question' });
        if (picB) rowImages.push({ id: `img_imp_${i}_2`, url: picB, s3Key: picB, label: 'Picture B', order: 2, role: 'question' });
        if (picC) rowImages.push({ id: `img_imp_${i}_3`, url: picC, s3Key: picC, label: 'Picture C', order: 3, role: 'question' });
        if (picD) rowImages.push({ id: `img_imp_${i}_4`, url: picD, s3Key: picD, label: 'Picture D', order: 4, role: 'question' });

        // Determine Layout
        let imageLayout: 'single_top' | 'comparison' | 'options_grid' | 'auto' = 'auto';
        if (picA && picB && !picC && !picD) {
          imageLayout = 'comparison';
        } else if (rowImages.length === 1) {
          imageLayout = 'single_top';
        }

        const questionPayload = {
          groupId: selectedGroup._id ? selectedGroup._id.toString() : selectedGroup.id,
          groupName: selectedGroup.name,
          difficulty,
          content: questionText,
          points,
          timeSeconds,
          options,
          answerType: 'single',
          correctAnswer,
          correctAnswers,
          enableWrittenExplanation,
          defaultInput,
          images: rowImages,
          imageLayout,
          metadata: {
            importedFrom: filename,
            importedAt: new Date().toISOString(),
            excelRow: rowNum,
          },
        };

        parsedQuestions.push(questionPayload);
      }

      if (isDryRun) {
        return res.json({
          success: true,
          dryRun: true,
          totalRows: rawRows.length,
          validCount: parsedQuestions.length,
          skippedCount,
          warnings,
          sampleQuestions: parsedQuestions.slice(0, 5),
        });
      }

      // Perform MongoDB Insertion
      const createdDocs = await QuestionModel.insertMany(parsedQuestions);

      return res.status(201).json({
        success: true,
        dryRun: false,
        totalRows: rawRows.length,
        importedCount: createdDocs.length,
        skippedCount,
        warnings,
        importedQuestions: createdDocs.map(formatDoc),
      });
    } catch (err: any) {
      console.error('[Excel Import Error]:', err.message || err);
      return res.status(500).json({ error: err.message || 'Failed to import Excel workbook' });
    }
  }
);

// ==========================================
// 5. PUBLISH ASSESSMENT & TARGET METADATA
// ==========================================

// Helper to validate target configurations and detect duplicates/overlaps
async function validatePublishTargets(rawTargets: any[]) {
  if (!Array.isArray(rawTargets) || rawTargets.length === 0) {
    return { valid: false, error: 'At least one target configuration is required.' };
  }

  const normalizedTargets: Array<{
    targetIndex: number;
    schoolIds: string[];
    classes: string[];
    className: string;
    sections: string[];
    studentIds: string[];
  }> = [];

  for (let i = 0; i < rawTargets.length; i++) {
    const t = rawTargets[i];
    let sIds: string[] = [];
    if (Array.isArray(t.schoolIds) && t.schoolIds.length > 0) {
      sIds = t.schoolIds.map((s: any) => String(s).trim()).filter(Boolean);
    } else if (t.schoolId) {
      sIds = Array.isArray(t.schoolId)
        ? t.schoolId.map((s: any) => String(s).trim()).filter(Boolean)
        : [String(t.schoolId).trim()].filter(Boolean);
    }

    if (sIds.length === 0) {
      return { valid: false, error: `Target ${i + 1}: Please select at least one target school workspace.` };
    }

    if (sIds.some((s) => s.toUpperCase() === 'ALL' || s.toUpperCase() === 'ALL_SCHOOLS')) {
      const allSchools = await SchoolModel.find({}, { _id: 1 });
      sIds = allSchools.map((s: any) => s._id.toString());
    }

    let classList: string[] = [];
    if (Array.isArray(t.classes)) {
      classList = t.classes.map((c: any) => String(c).trim()).filter(Boolean);
    } else if (typeof t.className === 'string') {
      classList = t.className
        .split(',')
        .map((c: string) => c.trim())
        .filter(Boolean);
    }

    // Filter out 'ALL' and 'All Classes'
    classList = classList.filter(
      (c) => c.toUpperCase() !== 'ALL' && c.toLowerCase() !== 'all classes'
    );

    let secList: string[] = [];
    if (Array.isArray(t.sections)) {
      secList = Array.from(new Set(t.sections.map((s: any) => String(s).trim().toUpperCase()).filter(Boolean)));
    }

    let studentIdList: string[] = [];
    if (Array.isArray(t.studentIds)) {
      studentIdList = Array.from(
        new Set(
          t.studentIds
            .map((s: any) => String(s).trim())
            .filter((s: string) => s && s.toUpperCase() !== 'ALL')
        )
      );
    }

    normalizedTargets.push({
      targetIndex: i + 1,
      schoolIds: sIds,
      classes: classList,
      className: classList.length === 1 ? classList[0] : classList.join(', '),
      sections: secList,
      studentIds: studentIdList,
    });
  }

  // 1. Check for Exact Duplicate Targets
  for (let i = 0; i < normalizedTargets.length; i++) {
    for (let j = i + 1; j < normalizedTargets.length; j++) {
      const t1 = normalizedTargets[i];
      const t2 = normalizedTargets[j];

      const s1 = [...t1.schoolIds].sort().join(',');
      const s2 = [...t2.schoolIds].sort().join(',');
      const c1 = [...t1.classes].map((c) => c.toLowerCase()).sort().join(',');
      const c2 = [...t2.classes].map((c) => c.toLowerCase()).sort().join(',');
      const sec1 = [...t1.sections].sort().join(',');
      const sec2 = [...t2.sections].sort().join(',');
      const stu1 = [...(t1.studentIds || [])].sort().join(',');
      const stu2 = [...(t2.studentIds || [])].sort().join(',');

      if (s1 === s2 && c1 === c2 && sec1 === sec2 && stu1 === stu2) {
        return {
          valid: false,
          error: `Duplicate Target Detected: Target ${t1.targetIndex} and Target ${t2.targetIndex} are exact duplicates with identical School(s), Class(es), Section(s), and Student(s). Please remove or edit one of the duplicate targets.`,
        };
      }
    }
  }

  // 2. Query actual students from MongoDB Atlas for each target
  const targetStudentsMap: any[][] = [];
  for (let i = 0; i < normalizedTargets.length; i++) {
    const t = normalizedTargets[i];
    const q: any = {
      role: 'student',
      schoolId: { $in: t.schoolIds },
    };
    if (t.classes.length === 1) {
      q.className = { $regex: new RegExp(`^${escapeRegExp(t.classes[0])}$`, 'i') };
    } else if (t.classes.length > 1) {
      q.className = { $in: t.classes.map((c) => new RegExp(`^${escapeRegExp(c)}$`, 'i')) };
    }
    if (t.sections.length > 0) {
      q.section = { $in: t.sections };
    }
    if (t.studentIds && t.studentIds.length > 0) {
      const validObjIds = t.studentIds.filter((id: string) => mongoose.Types.ObjectId.isValid(id));
      q.$or = [
        { uniqueStudentId: { $in: t.studentIds } },
        { _id: { $in: validObjIds } },
        { username: { $in: t.studentIds } },
      ];
    }
    const students = await UserModel.find(q, {
      _id: 1,
      uniqueStudentId: 1,
      studentName: 1,
      schoolId: 1,
      schoolName: 1,
      className: 1,
      section: 1,
    }).lean();
    targetStudentsMap.push(students);
  }

  // 3. Detect Student-Level Overlaps based on actual student records in MongoDB Atlas
  const studentTargetMap = new Map<string, { student: any; targetIndices: number[] }>();
  for (let i = 0; i < normalizedTargets.length; i++) {
    for (const st of targetStudentsMap[i]) {
      const studentKey = String(st.uniqueStudentId || st._id).trim();
      if (!studentTargetMap.has(studentKey)) {
        studentTargetMap.set(studentKey, { student: st, targetIndices: [] });
      }
      studentTargetMap.get(studentKey)!.targetIndices.push(normalizedTargets[i].targetIndex);
    }
  }

  const conflictingPairs = new Map<string, { tA: number; tB: number; students: any[] }>();
  for (const [_, entry] of studentTargetMap.entries()) {
    if (entry.targetIndices.length > 1) {
      for (let a = 0; a < entry.targetIndices.length; a++) {
        for (let b = a + 1; b < entry.targetIndices.length; b++) {
          const tA = entry.targetIndices[a];
          const tB = entry.targetIndices[b];
          const pairKey = `${tA}-${tB}`;
          if (!conflictingPairs.has(pairKey)) {
            conflictingPairs.set(pairKey, { tA, tB, students: [] });
          }
          conflictingPairs.get(pairKey)!.students.push(entry.student);
        }
      }
    }
  }

  if (conflictingPairs.size > 0) {
    const conflictMsgs: string[] = [];
    for (const [_, info] of conflictingPairs.entries()) {
      const sampleNames = info.students
        .slice(0, 3)
        .map((s) => `${s.studentName || s.uniqueStudentId} (${s.className || 'Class'} Sec ${s.section || 'All'})`)
        .join(', ');
      conflictMsgs.push(
        `Target ${info.tA} and Target ${info.tB} overlap: ${info.students.length} student(s) would be assigned more than once (e.g. ${sampleNames}).`
      );
    }
    return {
      valid: false,
      error: `Overlapping Targets Detected: ${conflictMsgs.join(' ')} Please adjust your target configurations to avoid assigning the same students multiple times.`,
    };
  }

  // 4. Also check Logical Overlap (e.g. in case schools currently have no registered students yet)
  for (let i = 0; i < normalizedTargets.length; i++) {
    for (let j = i + 1; j < normalizedTargets.length; j++) {
      const t1 = normalizedTargets[i];
      const t2 = normalizedTargets[j];

      const sharedSchools = t1.schoolIds.filter((id) => t2.schoolIds.includes(id));
      if (sharedSchools.length > 0) {
        const classOverlap =
          t1.classes.length === 0 ||
          t2.classes.length === 0 ||
          t1.classes.some((c) => t2.classes.map((x) => x.toLowerCase()).includes(c.toLowerCase()));
        const sectionOverlap =
          t1.sections.length === 0 ||
          t2.sections.length === 0 ||
          t1.sections.some((sec) => t2.sections.includes(sec));

        const studentOverlap =
          !t1.studentIds?.length ||
          !t2.studentIds?.length ||
          t1.studentIds.includes('ALL') ||
          t2.studentIds.includes('ALL') ||
          t1.studentIds.some((id: string) => t2.studentIds!.includes(id));

        if (classOverlap && sectionOverlap && studentOverlap) {
          const c1Desc = t1.classes.length > 0 ? t1.classes.join(' + ') : 'All Classes';
          const c2Desc = t2.classes.length > 0 ? t2.classes.join(' + ') : 'All Classes';
          return {
            valid: false,
            error: `Target Conflict Detected: Target ${t1.targetIndex} and Target ${t2.targetIndex} have overlapping criteria on common school(s), class (${c1Desc} vs ${c2Desc}), sections, and students. Please refine them to be mutually exclusive.`,
          };
        }
      }
    }
  }

  return {
    valid: true,
    normalizedTargets,
    targetStudentsMap,
  };
}

// Helper to verify whether a student matches the targets of a published test
export function isStudentTargetedByPublishedTest(
  student: any,
  pubTest: any,
  _totalSchoolsCount?: number
): boolean {
  if (!pubTest || !student) return false;

  const targetList = Array.isArray(pubTest.targets) && pubTest.targets.length > 0
    ? pubTest.targets
    : pubTest.target
    ? [pubTest.target]
    : [];

  if (targetList.length === 0) return false;

  const studentSchoolId = student.schoolId ? String(student.schoolId).trim() : '';
  const studentSchoolName = student.schoolName ? String(student.schoolName).trim().toLowerCase() : '';
  const studentClass = student.className ? String(student.className).trim().toLowerCase() : '';
  const studentSection = student.section ? String(student.section).trim().toUpperCase() : '';
  const studentKeys = [
    student.uniqueStudentId ? String(student.uniqueStudentId).trim() : '',
    student.username ? String(student.username).trim() : '',
    student._id ? String(student._id).trim() : '',
    student.id ? String(student.id).trim() : '',
  ].filter(Boolean);

  for (const t of targetList) {
    if (!t) continue;

    // 1. School check
    const sIds: string[] = [];
    if (Array.isArray(t.schoolIds)) {
      sIds.push(...t.schoolIds.map((s: any) => String(s).trim()).filter(Boolean));
    } else if (t.schoolId) {
      sIds.push(...(Array.isArray(t.schoolId) ? t.schoolId.map((s: any) => String(s).trim()) : [String(t.schoolId).trim()]).filter(Boolean));
    }

    const sNames: string[] = [];
    if (Array.isArray(t.schoolNames)) {
      sNames.push(...t.schoolNames.map((s: any) => String(s).trim().toLowerCase()).filter(Boolean));
    } else if (t.schoolName) {
      sNames.push(...String(t.schoolName).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
    }

    const isAllSchools =
      t.isAllSchools === true ||
      sIds.some((s) => s.toUpperCase() === 'ALL' || s.toUpperCase() === 'ALL_SCHOOLS') ||
      sNames.some((n) => n === 'all' || n === 'all schools');

    const matchSchool =
      isAllSchools ||
      (studentSchoolId && sIds.includes(studentSchoolId)) ||
      (studentSchoolName && sNames.includes(studentSchoolName));

    if (!matchSchool) continue;

    // 2. Class check
    const cList: string[] = [];
    if (Array.isArray(t.classes)) {
      cList.push(...t.classes.map((c: any) => String(c).trim().toLowerCase()).filter(Boolean));
    } else if (t.className) {
      cList.push(...String(t.className).split(',').map((c) => c.trim().toLowerCase()).filter(Boolean));
    }

    const isAllClasses =
      cList.length === 0 ||
      cList.some((c) => c === 'all' || c === 'all classes');

    const matchClass =
      isAllClasses ||
      (studentClass && cList.includes(studentClass));

    if (!matchClass) continue;

    // 3. Section check
    const secList: string[] = [];
    if (Array.isArray(t.sections)) {
      secList.push(...t.sections.map((s: any) => String(s).trim().toUpperCase()).filter(Boolean));
    } else if (t.section) {
      secList.push(...String(t.section).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
    }

    const isAllSections =
      secList.length === 0 ||
      secList.some((s) => s === 'ALL' || s === 'ALL SECTIONS');

    const matchSection =
      isAllSections ||
      (studentSection && secList.includes(studentSection));

    if (!matchSection) continue;

    // 4. Student check
    const stuList: string[] = [];
    if (Array.isArray(t.studentIds)) {
      stuList.push(...t.studentIds.map((s: any) => String(s).trim()).filter(Boolean));
    }

    const isAllStudents =
      stuList.length === 0 ||
      stuList.some((s) => s.toUpperCase() === 'ALL' || s.toUpperCase() === 'ALL_STUDENTS' || s.toLowerCase() === 'all students');

    const matchStudent =
      isAllStudents ||
      stuList.some((sId) => studentKeys.includes(sId));

    if (!matchStudent) continue;

    // All criteria matched for this target!
    return true;
  }

  return false;
}

// Target Configuration Validation Endpoint
router.post('/publish/validate-targets', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { targets } = req.body;
    const result = await validatePublishTargets(targets);
    if (!result.valid) {
      return res.status(400).json({ valid: false, error: result.error });
    }
    return res.json({ valid: true, message: 'All target configurations are valid and conflict-free.' });
  } catch (err: any) {
    return res.status(500).json({ valid: false, error: 'Failed to validate targets' });
  }
});

// Dynamic Class List for Target Configuration
// Fetches unique classes from actual students in MongoDB Atlas matching selected school(s)
router.get('/target-classes', authenticate, async (req: Request, res: Response) => {
  try {
    const { schoolIds } = req.query as { schoolIds?: string };

    let schoolIdList: string[] = [];
    if (schoolIds) {
      schoolIdList = schoolIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    if (schoolIdList.some((s) => s.toUpperCase() === 'ALL' || s.toUpperCase() === 'ALL_SCHOOLS')) {
      const allSchools = await SchoolModel.find({}, { _id: 1 });
      schoolIdList = allSchools.map((s: any) => s._id.toString());
    }

    // Role-based restrictions if not super_admin
    if (req.user!.role === 'school_admin' || req.user!.role === 'student') {
      if (req.user!.schoolId) {
        schoolIdList = [req.user!.schoolId];
      }
    }

    if (schoolIdList.length === 0) {
      return res.json({ classes: [] });
    }

    const query: any = {
      role: 'student',
      schoolId: { $in: schoolIdList },
    };

    const rawClasses = await UserModel.distinct('className', query);

    const cleanClasses = Array.from(
      new Set(
        rawClasses
          .filter((c: any) => typeof c === 'string' && c.trim().length > 0)
          .map((c: string) => c.trim())
      )
    ).sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    return res.json({ classes: cleanClasses });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch dynamic classes' });
  }
});

// Dynamic Section List for Target Configuration
// Fetches unique sections from actual students in MongoDB Atlas matching selected school(s) and optional class(es)
router.get('/target-sections', authenticate, async (req: Request, res: Response) => {
  try {
    const { schoolIds, className, classes } = req.query as {
      schoolIds?: string;
      className?: string;
      classes?: string;
    };

    let schoolIdList: string[] = [];
    if (schoolIds) {
      schoolIdList = schoolIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    if (schoolIdList.some((s) => s.toUpperCase() === 'ALL' || s.toUpperCase() === 'ALL_SCHOOLS')) {
      const allSchools = await SchoolModel.find({}, { _id: 1 });
      schoolIdList = allSchools.map((s: any) => s._id.toString());
    }

    // Role-based restrictions if not super_admin
    if (req.user!.role === 'school_admin' || req.user!.role === 'student') {
      if (req.user!.schoolId) {
        schoolIdList = [req.user!.schoolId];
      }
    }

    if (schoolIdList.length === 0) {
      return res.json({ sections: [] });
    }

    const query: any = {
      role: 'student',
      schoolId: { $in: schoolIdList },
    };

    let classList: string[] = [];
    if (classes) {
      classList = classes
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
    } else if (className) {
      classList = [className.trim()].filter(Boolean);
    }

    classList = classList.filter(
      (c) => c.toUpperCase() !== 'ALL' && c.toLowerCase() !== 'all classes'
    );

    if (classList.length === 1) {
      query.className = { $regex: new RegExp(`^${escapeRegExp(classList[0])}$`, 'i') };
    } else if (classList.length > 1) {
      query.className = {
        $in: classList.map((c) => new RegExp(`^${escapeRegExp(c)}$`, 'i')),
      };
    }

    const rawSections = await UserModel.distinct('section', query);

    const cleanSections = Array.from(
      new Set(
        rawSections
          .filter((s: any) => typeof s === 'string' && s.trim().length > 0)
          .map((s: string) => s.trim().toUpperCase())
      )
    ).sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    return res.json({ sections: cleanSections });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch dynamic sections' });
  }
});

// Dynamic Student List for Target Configuration
// Fetches students from MongoDB Atlas matching selected school(s), class(es), and section(s)
// SEC-HIGH-01: Block student role from accessing student enumeration endpoints
router.get('/target-students', authenticate, async (req: Request, res: Response) => {
  try {
    if (req.user!.role === 'student') {
      return res.status(403).json({ error: 'Access forbidden: Insufficient permissions' });
    }

    const { schoolIds, classes, sections } = req.query as {
      schoolIds?: string;
      classes?: string;
      sections?: string;
    };

    let schoolIdList: string[] = [];
    if (schoolIds) {
      schoolIdList = schoolIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    if (schoolIdList.some((s) => s.toUpperCase() === 'ALL' || s.toUpperCase() === 'ALL_SCHOOLS')) {
      const allSchools = await SchoolModel.find({}, { _id: 1 });
      schoolIdList = allSchools.map((s: any) => s._id.toString());
    }

    if (req.user!.role === 'school_admin') {
      if (req.user!.schoolId) {
        schoolIdList = [req.user!.schoolId];
      }
    }

    if (schoolIdList.length === 0) {
      return res.json({ students: [] });
    }

    const query: any = {
      role: 'student',
      schoolId: { $in: schoolIdList },
    };

    let classList: string[] = [];
    if (classes) {
      classList = classes
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c && c.toUpperCase() !== 'ALL' && c.toLowerCase() !== 'all classes');
    }

    if (classList.length === 1) {
      query.className = { $regex: new RegExp(`^${escapeRegExp(classList[0])}$`, 'i') };
    } else if (classList.length > 1) {
      query.className = {
        $in: classList.map((c) => new RegExp(`^${escapeRegExp(c)}$`, 'i')),
      };
    }

    let sectionList: string[] = [];
    if (sections) {
      sectionList = sections
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s && s !== 'ALL' && s !== 'ALL SECTIONS');
    }

    if (sectionList.length === 1) {
      query.section = { $regex: new RegExp(`^${escapeRegExp(sectionList[0])}$`, 'i') };
    } else if (sectionList.length > 1) {
      query.section = {
        $in: sectionList.map((s) => new RegExp(`^${escapeRegExp(s)}$`, 'i')),
      };
    }

    const rawStudents = await UserModel.find(query, {
      _id: 1,
      uniqueStudentId: 1,
      studentName: 1,
      schoolAdmissionNumber: 1,
      username: 1,
      className: 1,
      section: 1,
      schoolId: 1,
      schoolName: 1,
    });

    const formatted = formatDocs(rawStudents);
    const sorted = formatted.sort((a: any, b: any) =>
      (a.studentName || '').localeCompare(b.studentName || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    );

    return res.json({ students: sorted });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch target students' });
  }
});

router.post('/publish', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const {
      publishName,
      publishMode,
      target,
      targets,
      startDate,
      startTime,
      endDate,
      endTime,
      selectedQuestionIds,
      randomCount,
      shuffle,
    } = req.body;

    const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();
    if (!idempotencyKey || idempotencyKey.length > 128) {
      return res.status(400).json({ error: 'A valid Idempotency-Key header is required to publish safely.' });
    }
    const requestFingerprint = crypto.createHash('sha256').update(JSON.stringify(canonicalizeRequestValue({
      publishName, publishMode, target, targets, startDate, startTime, endDate, endTime,
      selectedQuestionIds, randomCount, shuffle,
    }))).digest('hex');
    const previousRequest = await PublishedTestModel.findOne({ idempotencyKey });
    if (previousRequest) {
      if (previousRequest.requestFingerprint === requestFingerprint && previousRequest.publishState === 'FAILED') {
        // Repair a prior failed attempt by removing only records tied to this request before retrying.
        await StudentTestAssignmentModel.deleteMany({ publishedTestId: String(previousRequest._id) });
        await PublishHistoryModel.deleteOne({ publishId: String(previousRequest._id) });
        await PublishedTestModel.deleteOne({ _id: previousRequest._id, publishState: 'FAILED' });
      } else {
        if (previousRequest.requestFingerprint !== requestFingerprint) {
          return res.status(409).json({ error: 'This Idempotency-Key was already used for a different publication request.' });
        }
        if (previousRequest.publishState === 'COMPLETE') {
          const history = await PublishHistoryModel.findOne({ publishId: String(previousRequest._id) });
          const assignmentCount = await StudentTestAssignmentModel.countDocuments({ publishedTestId: String(previousRequest._id) });
          return res.status(200).json({
            message: `Assessment '${previousRequest.publishName}' was already published for this request.`,
            publishedTest: formatDoc(previousRequest),
            assignedStudentCount: assignmentCount,
            totalAssignedStudents: assignmentCount,
            historyRecordId: history?._id?.toString(),
            idempotentReplay: true,
          });
        }
        return res.status(409).json({ error: 'This publication request is still in progress. Retry with the same key shortly.' });
      }
    }

    const targetList = Array.isArray(targets) && targets.length > 0 ? targets : target ? [target] : [];

    if (!publishName || !publishMode || targetList.length === 0 || !startDate || !endDate) {
      return res.status(400).json({ error: 'Publish Name, Mode, at least one Target Configuration, and Dates are mandatory.' });
    }

    if (startDate && endDate && startDate !== 'Today' && endDate !== 'Open') {
      const startISO = `${toISODate(startDate)}T${to24Hour(startTime || '00:00')}`;
      const endISO = `${toISODate(endDate)}T${to24Hour(endTime || '23:59')}`;
      if (endISO <= startISO) {
        return res.status(400).json({ error: 'End Date & Time must be after Start Date & Time.' });
      }
    }

    if (publishMode === 'Selected Questions' && (!selectedQuestionIds || selectedQuestionIds.length === 0)) {
      return res.status(400).json({ error: 'Please select at least 1 question for Selected Questions mode.' });
    }

    if (publishMode === 'Random Questions') {
      const eligibleQDocs = await QuestionModel.find({ _id: { $in: selectedQuestionIds || [] } });
      const eligiblePool: Question[] = formatDocs(eligibleQDocs);
      if (eligiblePool.length === 0) {
        return res.status(400).json({ error: '0 eligible questions are available. Select at least one Group and Difficulty.' });
      }
      const count = Number(randomCount) || 0;
      if (count <= 0) {
        return res.status(400).json({ error: 'Please specify a valid number of questions per student.' });
      }
      if (count > eligiblePool.length) {
        return res.status(400).json({ error: `Only ${eligiblePool.length} eligible questions are available. You cannot assign ${count} questions per student.` });
      }
    }

    // Validate duplicate & overlapping targets across the assessment
    const validation = await validatePublishTargets(targetList);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const allTargetSchoolIds = Array.from(
      new Set(validation.normalizedTargets!.flatMap((t) => t.schoolIds))
    );

    const schools = await SchoolModel.find({ _id: { $in: allTargetSchoolIds } });
    if (schools.length === 0) {
      return res.status(404).json({ error: 'Selected target school(s) not found.' });
    }

    const schoolMap = new Map<string, any>(schools.map((s: any) => [s._id.toString(), s]));

    // Deduplicate candidate students across all targets using uniqueStudentId / _id
    const uniqueStudentsMap = new Map<string, any>();
    for (const studentList of validation.targetStudentsMap!) {
      for (const student of studentList) {
        const key = String(student.uniqueStudentId || student._id).trim();
        if (!uniqueStudentsMap.has(key)) {
          uniqueStudentsMap.set(key, student);
        }
      }
    }

    const candidateStudents = Array.from(uniqueStudentsMap.values());
    if (candidateStudents.length === 0) {
      return res.status(400).json({ error: 'No students found matching the selected target criteria across all targets.' });
    }

    const allTargetSchoolNames = allTargetSchoolIds.map((id) => schoolMap.get(id)?.name || id);
    const combinedSchoolNames = allTargetSchoolNames.join(', ');
    const allTargetClasses = Array.from(
      new Set(
        validation.normalizedTargets!.flatMap((t) =>
          t.classes.length > 0 ? t.classes : ['All Classes']
        )
      )
    );
    const allTargetSections = Array.from(new Set(validation.normalizedTargets!.flatMap((t) => t.sections)));

    const targetsRecord = validation.normalizedTargets!.map((nt) => {
      const sNames = nt.schoolIds.map((id) => schoolMap.get(id)?.name || id);
      return {
        schoolIds: nt.schoolIds,
        schoolNames: sNames,
        classes: nt.classes.length > 0 ? nt.classes : ['All Classes'],
        sections: nt.sections,
        studentIds: nt.studentIds || [],
      };
    });

    const allQuestionsDocs = await QuestionModel.find({ _id: { $in: selectedQuestionIds || [] } });
    const allQuestions: Question[] = formatDocs(allQuestionsDocs);

    const eligibleQuestionsSnapshot = allQuestions
      .filter((q) => (selectedQuestionIds || []).includes(q.id))
      .map((q) => ({
        id: q.id,
        questionId: q.id,
        groupId: q.groupId,
        groupName: (q.groupName || 'General').trim(),
        difficulty: (q.difficulty || 'Medium').trim(),
        content: q.content,
        points: q.points != null ? Number(q.points) : null,
        timeAllowedSeconds: q.timeSeconds != null ? Number(q.timeSeconds) : null,
        timeSeconds: q.timeSeconds != null ? Number(q.timeSeconds) : null,
        options: q.options || [],
        answerType: q.answerType || 'single',
        isRanking: Boolean(q.isRanking || q.isRankingQuestion || String(q.questionType || '').toLowerCase() === 'ranking'),
        isRankingQuestion: Boolean(q.isRanking || q.isRankingQuestion || String(q.questionType || '').toLowerCase() === 'ranking'),
        questionType: q.questionType || (q.isRanking ? 'Ranking' : undefined),
        correctAnswer: q.correctAnswer ?? null,
        correctAnswers: Array.isArray(q.correctAnswers)
          ? q.correctAnswers
          : (Array.isArray(q.correctAnswer) ? q.correctAnswer : (q.correctAnswer ? [String(q.correctAnswer)] : [])),
        enableWrittenExplanation: Boolean(q.enableWrittenExplanation),
        defaultInput: q.defaultInput !== undefined ? Boolean(q.defaultInput) : true,
        scoringGuide: q.scoringGuide || q.metadata?.scoringGuide,
        expectedResponse: q.expectedResponse || q.metadata?.expectedResponse,
        metadata: q.metadata || {},
        pairs: q.metadata?.pairs || [],
        images: q.images || [],
        imageLayout: q.imageLayout || 'auto',
      }));

    const allTargetStudentIds = Array.from(
      new Set(validation.normalizedTargets!.flatMap((t) => t.studentIds || []))
    );

    // Pre-allocate target Published Test ID so in-memory assignment preparation can reference it before any database writes
    const newPublishId = new mongoose.Types.ObjectId();
    const publishedTestId = newPublishId.toString();
    const newAssignments: any[] = [];

    // Pre-fetch past assignments only for candidate students if in Random mode
    const candidateStudentIds = candidateStudents.map((s) => s.uniqueStudentId).filter(Boolean);
    const pastAssignmentsDocs = publishMode === 'Random Questions' && candidateStudentIds.length > 0
      ? await StudentTestAssignmentModel.find(
          { studentId: { $in: candidateStudentIds } },
          { studentId: 1, questions: 1, status: 1, scoreOutOf100: 1, startedAt: 1, completedAt: 1 }
        )
      : [];
    const pastAssignments = formatDocs(pastAssignmentsDocs);

    // Create assignments for every unique target student (guarantees exactly 1 assignment per student)
    for (const student of candidateStudents) {
      let studentQuestionList: Question[] = [];

      if (publishMode === 'Selected Questions') {
        const qMap = new Map(allQuestions.map((q) => [q.id, q]));
        const orderedQuestions = (selectedQuestionIds || [])
          .map((id: string) => qMap.get(id))
          .filter(Boolean) as Question[];

        if (shuffle) {
          studentQuestionList = [...orderedQuestions];
          for (let i = studentQuestionList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [studentQuestionList[i], studentQuestionList[j]] = [studentQuestionList[j], studentQuestionList[i]];
          }
        } else {
          studentQuestionList = [...orderedQuestions];
        }
      } else {
        const insights = computeStudentInsights(student.uniqueStudentId!, pastAssignments);
        const candidatePool = allQuestions.filter((q) => (selectedQuestionIds || []).includes(q.id));
        studentQuestionList = selectRandomQuestionsForRuleEngine(
          Number(randomCount) || 5,
          candidatePool.length > 0 ? candidatePool : allQuestions,
          insights
        );
      }

      const questionLogs: QuestionAttemptLog[] = studentQuestionList.map((q: any) => ({
        questionId: q.id,
        groupName: q.groupName,
        difficulty: q.difficulty,
        questionType: q.questionType || (q.isRanking || q.isRankingQuestion ? 'Ranking' : undefined),
        answerType: q.answerType || 'single',
        isRanking: Boolean(q.isRanking || q.isRankingQuestion || String(q.questionType || '').toLowerCase() === 'ranking'),
        isRankingQuestion: Boolean(q.isRanking || q.isRankingQuestion || String(q.questionType || '').toLowerCase() === 'ranking'),
        content: q.content,
        points: q.points != null ? Number(q.points) : null,
        studentAnswer: null,
        writtenExplanation: '',
        enableWrittenExplanation: Boolean(q.enableWrittenExplanation),
        defaultInput: q.defaultInput !== undefined ? Boolean(q.defaultInput) : true,
        correctAnswer: q.correctAnswer ?? null,
        correctAnswers: Array.isArray(q.correctAnswers)
          ? q.correctAnswers
          : (Array.isArray(q.correctAnswer) ? q.correctAnswer : (q.correctAnswer ? [String(q.correctAnswer)] : [])),
        isCorrect: false,
        timeAllowedSeconds: q.timeSeconds != null ? Number(q.timeSeconds) : null,
        timeSeconds: q.timeSeconds != null ? Number(q.timeSeconds) : null,
        timeTakenSeconds: 0,
        earnedPoints: 0,
        scoringGuide: q.scoringGuide || q.metadata?.scoringGuide,
        expectedResponse: q.expectedResponse || q.metadata?.expectedResponse,
        options: q.options || [],
        metadata: q.metadata || {},
        images: q.images || [],
        imageLayout: q.imageLayout || 'auto',
      }));

      const stSchool = schoolMap.get(student.schoolId);

      newAssignments.push({
        publishedTestId,
        publishName: publishName.trim(),
        studentId: student.uniqueStudentId!,
        studentName: student.studentName || '',
        schoolAdmissionNumber: student.schoolAdmissionNumber || '',
        schoolId: student.schoolId,
        schoolName: stSchool ? stSchool.name : (student.schoolName || ''),
        className: student.className || '',
        section: student.section || '',
        status: 'NOT_STARTED',
        totalQuestions: questionLogs.length,
        correctCount: 0,
        wrongCount: 0,
        totalPointsEarned: 0,
        scoreOutOf100: 0,
        totalTimeTakenSeconds: 0,
        questions: questionLogs,
      });
    }

    // Multi-Document Transaction Execution:
    // Guarantees PublishedTest, StudentTestAssignment, and PublishHistory writes succeed or fail together atomically.
    let session: mongoose.ClientSession | null = null;
    let useTransaction = false;

    try {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    } catch (_sessionErr: any) {
      session = null;
      useTransaction = false;
    }

    let newPublish: any;
    let historyRecord: any;

    const executePublishWrites = async (activeSession: mongoose.ClientSession | null) => {
      const sessionOptions = activeSession ? { session: activeSession } : undefined;

      // 1. Create Published Test Record with targets array
      newPublish = new PublishedTestModel({
        _id: newPublishId,
        idempotencyKey,
        requestFingerprint,
        publishState: 'PUBLISHING',
        publishName: publishName.trim(),
        publishMode,
        target: {
          schoolId: allTargetSchoolIds[0] || '',
          schoolIds: allTargetSchoolIds,
          schoolName: combinedSchoolNames,
          schoolNames: allTargetSchoolNames,
          classes: allTargetClasses,
          sections: allTargetSections,
          studentIds: allTargetStudentIds,
        },
        targets: targetsRecord,
        startDate,
        startTime: to12Hour(startTime || '12:00 AM'),
        endDate,
        endTime: to12Hour(endTime || '11:59 PM'),
        questionIds: selectedQuestionIds || [],
        questionsSnapshot: eligibleQuestionsSnapshot,
        randomCount: randomCount ? Number(randomCount) : undefined,
        shuffle: Boolean(shuffle),
        createdBy: req.user!.username,
        status: 'ACTIVE',
        isPaused: false,
        publishedAt: new Date(),
      });
      await newPublish.save(sessionOptions);

      // 2. Insert student assignments into MongoDB
      if (newAssignments.length > 0) {
        if (activeSession) {
          await StudentTestAssignmentModel.insertMany(newAssignments, { session: activeSession });
        } else {
          await StudentTestAssignmentModel.insertMany(newAssignments);
        }
      }

      // 3. Create permanent history record in MongoDB
      historyRecord = new PublishHistoryModel({
        publishId: publishedTestId,
        publishName: publishName.trim(),
        date: startDate,
        time: to12Hour(startTime || new Date().toLocaleTimeString()),
        startDate,
        startTime: to12Hour(startTime || '12:00 AM'),
        endDate,
        endTime: to12Hour(endTime || '11:59 PM'),
        schoolId: allTargetSchoolIds[0] || '',
        schoolName: combinedSchoolNames,
        schoolIds: allTargetSchoolIds,
        schoolNames: allTargetSchoolNames,
        classes: allTargetClasses.length > 0 ? allTargetClasses : ['All Classes'],
        sections: allTargetSections.length > 0 ? allTargetSections : ['All Sections'],
        totalRecipients: candidateStudents.length,
        targets: targetsRecord,
        publishMode,
        assignedQuestionsCount: publishMode === 'Selected Questions' ? (selectedQuestionIds?.length || 0) : (randomCount ? Number(randomCount) : 0),
        questionIds: selectedQuestionIds || [],
        questionsSnapshot: eligibleQuestionsSnapshot,
        randomCount: randomCount ? Number(randomCount) : undefined,
        completedCount: 0,
        incompleteCount: 0,
        status: 'ACTIVE',
        isPaused: false,
        publishedAt: new Date(),
        studentsStatus: candidateStudents.map((s) => ({
          studentId: s.uniqueStudentId!,
          uniqueStudentId: s.uniqueStudentId!,
          studentName: s.studentName!,
          schoolAdmissionNumber: s.schoolAdmissionNumber || '',
          schoolId: s.schoolId || '',
          schoolName: (schoolMap.get(s.schoolId)?.name) || s.schoolName || '',
          className: s.className!,
          section: s.section!,
          status: 'NOT_STARTED',
        })),
      });
      await historyRecord.save(sessionOptions);

      // 4. Mark publication completion state
      newPublish.publishState = 'COMPLETE';
      await newPublish.save(sessionOptions);
    };

    try {
      if (useTransaction && session) {
        try {
          await executePublishWrites(session);
          await session.commitTransaction();
        } catch (txErr: any) {
          await session.abortTransaction().catch(() => undefined);

          // Check if error is due to MongoDB topology not supporting transactions (standalone mongod without replica set)
          const isTxUnsupported =
            txErr?.code === 20 ||
            txErr?.codeName === 'IllegalOperation' ||
            (typeof txErr?.message === 'string' &&
              txErr.message.includes('Transaction numbers are only allowed on a replica set member or mongos'));

          if (isTxUnsupported) {
            console.warn('[Publish] Multi-document transactions unsupported by current MongoDB topology (standalone mode). Falling back to resilient non-transactional writes with compensatory cleanup.');
            useTransaction = false;
            try {
              await executePublishWrites(null);
            } catch (fallbackErr: any) {
              await StudentTestAssignmentModel.deleteMany({ publishedTestId }).catch(() => undefined);
              await PublishHistoryModel.deleteOne({ publishId: publishedTestId }).catch(() => undefined);
              await PublishedTestModel.deleteOne({ _id: newPublishId }).catch(() => undefined);
              throw fallbackErr;
            }
          } else {
            throw txErr;
          }
        }
      } else {
        // Non-transactional fallback with compensatory rollback
        try {
          await executePublishWrites(null);
        } catch (directErr: any) {
          await StudentTestAssignmentModel.deleteMany({ publishedTestId }).catch(() => undefined);
          await PublishHistoryModel.deleteOne({ publishId: publishedTestId }).catch(() => undefined);
          await PublishedTestModel.deleteOne({ _id: newPublishId }).catch(() => undefined);
          throw directErr;
        }
      }
    } catch (writeError: any) {
      if (writeError?.code === 11000) {
        const racedRequest = await PublishedTestModel.findOne({ idempotencyKey });
        if (racedRequest?.requestFingerprint === requestFingerprint && racedRequest?.publishState === 'COMPLETE') {
          const history = await PublishHistoryModel.findOne({ publishId: String(racedRequest._id) });
          const assignmentCount = await StudentTestAssignmentModel.countDocuments({ publishedTestId: String(racedRequest._id) });
          return res.status(200).json({
            message: `Assessment '${racedRequest.publishName}' was already published for this request.`,
            publishedTest: formatDoc(racedRequest),
            assignedStudentCount: assignmentCount,
            totalAssignedStudents: assignmentCount,
            historyRecordId: history?._id?.toString(),
            idempotentReplay: true,
          });
        }
        if (racedRequest) {
          return res.status(409).json({ error: 'This publication request is already being processed.' });
        }
      }
      console.error('[Publish Write Error]:', writeError?.message || writeError);
      return res.status(500).json({ error: 'Failed to publish assessment' });
    } finally {
      if (session) {
        await session.endSession().catch(() => undefined);
      }
    }

    return res.status(201).json({
      message: `Assessment '${publishName}' published successfully to ${candidateStudents.length} students across ${schools.length} school(s).`,
      publishedTest: formatDoc(newPublish),
      assignedStudentCount: candidateStudents.length,
      totalAssignedStudents: candidateStudents.length,
      historyRecordId: historyRecord._id.toString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to publish assessment' });
  }
});

// List All Published Tests
router.get('/published-tests', authenticate, requireRole('super_admin'), async (_req: Request, res: Response) => {
  try {
    const list = await PublishedTestModel.find().sort({ createdAt: -1 });
    return res.json(formatDocs(list));
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch published tests' });
  }
});

// Get a Specific Published Test for Edit Mode
router.get('/published-tests/:publishId', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { publishId } = req.params;
    const pubTest = await PublishedTestModel.findById(publishId);
    if (!pubTest) {
      return res.status(404).json({ error: 'Published test not found' });
    }
    const history = await PublishHistoryModel.findOne({ publishId });
    const doc = formatDoc(pubTest);
    return res.json({
      ...doc,
      startTime: to12Hour(doc.startTime || '12:00 AM'),
      endTime: to12Hour(doc.endTime || '11:59 PM'),
      historyId: history?._id?.toString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch published test' });
  }
});

// Update / Edit an Existing Published Assessment
const handleUpdatePublishedAssessment = async (req: Request, res: Response) => {
  try {
    const { publishId } = req.params;
    const {
      publishName,
      publishMode,
      target,
      targets,
      startDate,
      startTime,
      endDate,
      endTime,
      selectedQuestionIds,
      randomCount,
      shuffle,
    } = req.body;

    const pubTest = await PublishedTestModel.findById(publishId);
    if (!pubTest) {
      return res.status(404).json({ error: 'Assessment not found for update' });
    }

    const historyDoc = await PublishHistoryModel.findOne({ publishId });

    const targetList = Array.isArray(targets) && targets.length > 0 ? targets : target ? [target] : [];

    if (!publishName || !publishMode || targetList.length === 0 || !startDate || !endDate) {
      return res.status(400).json({ error: 'Publish Name, Mode, at least one Target Configuration, and Dates are mandatory.' });
    }

    if (startDate && endDate && startDate !== 'Today' && endDate !== 'Open') {
      const startISO = `${toISODate(startDate)}T${to24Hour(startTime || '00:00')}`;
      const endISO = `${toISODate(endDate)}T${to24Hour(endTime || '23:59')}`;
      if (endISO <= startISO) {
        return res.status(400).json({ error: 'End Date & Time must be after Start Date & Time.' });
      }
    }

    if (publishMode === 'Selected Questions' && (!selectedQuestionIds || selectedQuestionIds.length === 0)) {
      return res.status(400).json({ error: 'Please select at least 1 question for Selected Questions mode.' });
    }

    if (publishMode === 'Random Questions') {
      const eligibleQDocs = await QuestionModel.find({ _id: { $in: selectedQuestionIds || [] } });
      const eligiblePool: Question[] = formatDocs(eligibleQDocs);
      if (eligiblePool.length === 0) {
        return res.status(400).json({ error: '0 eligible questions are available. Select at least one Group and Difficulty.' });
      }
      const count = Number(randomCount) || 0;
      if (count <= 0) {
        return res.status(400).json({ error: 'Please specify a valid number of questions per student.' });
      }
      if (count > eligiblePool.length) {
        return res.status(400).json({ error: `Only ${eligiblePool.length} eligible questions are available. You cannot assign ${count} questions per student.` });
      }
    }

    // Validate duplicate & overlapping targets across the assessment
    const validation = await validatePublishTargets(targetList);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const allTargetSchoolIds = Array.from(
      new Set(validation.normalizedTargets!.flatMap((t) => t.schoolIds))
    );
    const schools = await SchoolModel.find({ _id: { $in: allTargetSchoolIds } });
    const schoolMap = new Map<string, any>(schools.map((s: any) => [s._id.toString(), s]));

    // Deduplicate candidate students across all targets
    const uniqueStudentsMap = new Map<string, any>();
    for (const studentList of validation.targetStudentsMap!) {
      for (const student of studentList) {
        const key = String(student.uniqueStudentId || student._id).trim();
        if (!uniqueStudentsMap.has(key)) {
          uniqueStudentsMap.set(key, student);
        }
      }
    }

    const candidateStudents = Array.from(uniqueStudentsMap.values());
    if (candidateStudents.length === 0) {
      return res.status(400).json({ error: 'No students found matching the selected target criteria.' });
    }

    const allTargetSchoolNames = allTargetSchoolIds.map((id) => schoolMap.get(id)?.name || id);
    const combinedSchoolNames = allTargetSchoolNames.join(', ');
    const allTargetClasses = Array.from(
      new Set(
        validation.normalizedTargets!.flatMap((t) =>
          t.classes.length > 0 ? t.classes : ['All Classes']
        )
      )
    );
    const allTargetSections = Array.from(new Set(validation.normalizedTargets!.flatMap((t) => t.sections)));
    const allTargetStudentIds = Array.from(
      new Set(validation.normalizedTargets!.flatMap((t) => t.studentIds || []))
    );

    const targetsRecord = validation.normalizedTargets!.map((nt) => {
      const sNames = nt.schoolIds.map((id) => schoolMap.get(id)?.name || id);
      return {
        schoolIds: nt.schoolIds,
        schoolNames: sNames,
        classes: nt.classes.length > 0 ? nt.classes : ['All Classes'],
        sections: nt.sections,
        studentIds: nt.studentIds || [],
      };
    });

    // Prepare questions snapshot
    const allQuestionsDocs = await QuestionModel.find({ _id: { $in: selectedQuestionIds || [] } });
    const allQuestions: Question[] = formatDocs(allQuestionsDocs);
    const selectedQuestionsDocs = allQuestions.filter((q) => (selectedQuestionIds || []).includes(q.id));
    const eligibleQuestionsSnapshot = selectedQuestionsDocs.map((q) => ({
      id: q.id,
      questionId: q.id,
      groupName: (q.groupName || 'General').trim(),
      difficulty: (q.difficulty || 'Medium').trim(),
      content: q.content,
      points: q.points != null ? Number(q.points) : null,
      timeAllowedSeconds: q.timeSeconds != null ? Number(q.timeSeconds) : null,
      timeSeconds: q.timeSeconds != null ? Number(q.timeSeconds) : null,
      options: q.options || [],
      isRanking: Boolean(q.isRanking || q.isRankingQuestion || String(q.questionType || '').toLowerCase() === 'ranking'),
      isRankingQuestion: Boolean(q.isRanking || q.isRankingQuestion || String(q.questionType || '').toLowerCase() === 'ranking'),
      questionType: q.questionType || (q.isRanking ? 'Ranking' : undefined),
      enableWrittenExplanation: Boolean(q.enableWrittenExplanation),
      defaultInput: q.defaultInput !== undefined ? Boolean(q.defaultInput) : true,
      scoringGuide: q.scoringGuide || q.metadata?.scoringGuide,
      expectedResponse: q.expectedResponse || q.metadata?.expectedResponse,
      metadata: q.metadata || {},
      pairs: q.metadata?.pairs || [],
      images: q.images || [],
      imageLayout: q.imageLayout || 'auto',
    }));

    // Update published test document with latest update timestamp
    const serverNow = new Date();
    pubTest.publishName = publishName.trim();
    pubTest.publishMode = publishMode;
    pubTest.target = {
      schoolId: allTargetSchoolIds[0] || '',
      schoolIds: allTargetSchoolIds,
      schoolName: combinedSchoolNames,
      schoolNames: allTargetSchoolNames,
      classes: allTargetClasses,
      sections: allTargetSections,
      studentIds: allTargetStudentIds,
    };
    pubTest.targets = targetsRecord;
    pubTest.startDate = startDate;
    pubTest.startTime = to12Hour(startTime || '12:00 AM');
    pubTest.endDate = endDate;
    pubTest.endTime = to12Hour(endTime || '11:59 PM');
    pubTest.questionIds = selectedQuestionIds || [];
    pubTest.questionsSnapshot = eligibleQuestionsSnapshot;
    pubTest.randomCount = randomCount ? Number(randomCount) : undefined;
    pubTest.shuffle = Boolean(shuffle);
    pubTest.publishedAt = serverNow;
    pubTest.updatedAt = serverNow;
    await pubTest.save();

    // Update existing student assignments publishName
    await StudentTestAssignmentModel.updateMany(
      { publishedTestId: publishId },
      { $set: { publishName: publishName.trim() } }
    );

    // Build lookup set of targeted students
    const targetStudentIdSet = new Set<string>();
    for (const student of candidateStudents) {
      if (student.uniqueStudentId) targetStudentIdSet.add(String(student.uniqueStudentId).trim());
      if (student.username) targetStudentIdSet.add(String(student.username).trim());
      if (student._id) targetStudentIdSet.add(String(student._id).trim());
      if (student.id) targetStudentIdSet.add(String(student.id).trim());
    }

    // Existing live assignments
    const existingAssignments = await StudentTestAssignmentModel.find({
      $or: [{ publishedTestId: publishId }, { publishedTestId: pubTest._id ? pubTest._id.toString() : publishId }],
    });

    // Revoke/remove assignments for students who are NO LONGER targeted AND have not started
    // Note: Preserve historical attempt records (COMPLETED, INCOMPLETE, LOCKED_INCOMPLETE, IN_PROGRESS) safely!
    const assignmentsToDelete: string[] = [];
    for (const a of existingAssignments) {
      if (!targetStudentIdSet.has(a.studentId)) {
        if (a.status === 'NOT_STARTED') {
          assignmentsToDelete.push(a._id.toString());
        }
      }
    }

    if (assignmentsToDelete.length > 0) {
      await StudentTestAssignmentModel.deleteMany({ _id: { $in: assignmentsToDelete } });
    }

    // Remaining live assignments after revocation
    const remainingAssignments = await StudentTestAssignmentModel.find({
      $or: [{ publishedTestId: publishId }, { publishedTestId: pubTest._id ? pubTest._id.toString() : publishId }],
    });
    const remainingAssignMap = new Map<string, any>();
    for (const a of remainingAssignments) {
      remainingAssignMap.set(a.studentId, a);
    }

    // Prepare questions for newly assigned students or update NOT_STARTED students
    const candidateStudentIds = candidateStudents.map((s) => s.uniqueStudentId).filter(Boolean);
    const pastAssignmentsDocs = publishMode === 'Random Questions' && candidateStudentIds.length > 0
      ? await StudentTestAssignmentModel.find(
          { studentId: { $in: candidateStudentIds } },
          { studentId: 1, questions: 1, status: 1, scoreOutOf100: 1, startedAt: 1, completedAt: 1 }
        )
      : [];
    const pastAssignments = formatDocs(pastAssignmentsDocs);

    // For any candidate student who does not have an assignment yet, create one safely
    const newAssignmentsToAdd: any[] = [];
    for (const student of candidateStudents) {
      const sId = (student.uniqueStudentId || student.username || student._id?.toString()).trim();
      const stSchool = schoolMap.get(student.schoolId);

      if (!remainingAssignMap.has(sId)) {
        let studentQuestionList = [...selectedQuestionsDocs];
        if (publishMode === 'Selected Questions') {
          if (shuffle) {
            studentQuestionList = [...selectedQuestionsDocs];
            for (let i = studentQuestionList.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [studentQuestionList[i], studentQuestionList[j]] = [studentQuestionList[j], studentQuestionList[i]];
            }
          }
        } else {
          const insights = computeStudentInsights(sId, pastAssignments);
          const candidatePool = allQuestions.filter((q) => (selectedQuestionIds || []).includes(q.id));
          studentQuestionList = selectRandomQuestionsForRuleEngine(
            Number(randomCount) || 5,
            candidatePool.length > 0 ? candidatePool : allQuestions,
            insights
          );
        }

        const questionLogs: QuestionAttemptLog[] = studentQuestionList.map((q: any) => ({
          questionId: q.id,
          groupName: q.groupName,
          difficulty: q.difficulty,
          questionType: q.questionType || (q.isRanking || q.isRankingQuestion ? 'Ranking' : undefined),
          answerType: q.answerType || 'single',
          isRanking: Boolean(q.isRanking || q.isRankingQuestion || String(q.questionType || '').toLowerCase() === 'ranking'),
          isRankingQuestion: Boolean(q.isRanking || q.isRankingQuestion || String(q.questionType || '').toLowerCase() === 'ranking'),
          content: q.content,
          points: q.points != null ? Number(q.points) : null,
          studentAnswer: null,
          writtenExplanation: '',
          enableWrittenExplanation: Boolean(q.enableWrittenExplanation),
          defaultInput: q.defaultInput !== undefined ? Boolean(q.defaultInput) : true,
          correctAnswer: q.correctAnswer ?? null,
          correctAnswers: Array.isArray(q.correctAnswers)
            ? q.correctAnswers
            : (Array.isArray(q.correctAnswer) ? q.correctAnswer : (q.correctAnswer ? [String(q.correctAnswer)] : [])),
          isCorrect: false,
          timeAllowedSeconds: q.timeSeconds != null ? Number(q.timeSeconds) : null,
          timeSeconds: q.timeSeconds != null ? Number(q.timeSeconds) : null,
          timeTakenSeconds: 0,
          earnedPoints: 0,
          scoringGuide: q.scoringGuide || q.metadata?.scoringGuide,
          expectedResponse: q.expectedResponse || q.metadata?.expectedResponse,
          options: q.options || [],
          metadata: q.metadata || {},
          images: q.images || [],
          imageLayout: q.imageLayout || 'auto',
        }));

        newAssignmentsToAdd.push({
          publishedTestId: publishId,
          publishName: publishName.trim(),
          studentId: sId,
          studentName: student.studentName || '',
          schoolAdmissionNumber: student.schoolAdmissionNumber || '',
          schoolId: student.schoolId,
          schoolName: stSchool ? stSchool.name : (student.schoolName || ''),
          className: student.className || '',
          section: student.section || '',
          status: 'NOT_STARTED',
          totalQuestions: questionLogs.length,
          correctCount: 0,
          wrongCount: 0,
          totalPointsEarned: 0,
          scoreOutOf100: 0,
          totalTimeTakenSeconds: 0,
          questions: questionLogs,
        });
      } else {
        // Student already exists: if status is NOT_STARTED, update school/class/section details & questions if needed
        const existing = remainingAssignMap.get(sId);
        if (existing.status === 'NOT_STARTED') {
          existing.studentName = student.studentName || existing.studentName;
          existing.schoolAdmissionNumber = student.schoolAdmissionNumber || existing.schoolAdmissionNumber;
          existing.schoolId = student.schoolId;
          existing.schoolName = stSchool ? stSchool.name : (student.schoolName || existing.schoolName);
          existing.className = student.className || existing.className;
          existing.section = student.section || existing.section;

          if (publishMode === 'Selected Questions') {
            let updatedList = [...selectedQuestionsDocs];
            if (shuffle) {
              for (let i = updatedList.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [updatedList[i], updatedList[j]] = [updatedList[j], updatedList[i]];
              }
            }
            const questionLogs: QuestionAttemptLog[] = updatedList.map((q) => ({
              questionId: q.id,
              groupName: q.groupName,
              difficulty: q.difficulty,
              content: q.content,
              points: q.points != null ? Number(q.points) : null,
              studentAnswer: null,
              writtenExplanation: '',
              enableWrittenExplanation: Boolean(q.enableWrittenExplanation),
              defaultInput: q.defaultInput !== undefined ? Boolean(q.defaultInput) : true,
              answerType: q.answerType || 'single',
              correctAnswer: q.correctAnswer ?? null,
              correctAnswers: Array.isArray(q.correctAnswers)
                ? q.correctAnswers
                : (Array.isArray(q.correctAnswer) ? q.correctAnswer : (q.correctAnswer ? [String(q.correctAnswer)] : [])),
              isCorrect: false,
              timeAllowedSeconds: q.timeSeconds != null ? Number(q.timeSeconds) : null,
              timeTakenSeconds: 0,
              earnedPoints: 0,
              options: q.options || [],
              metadata: q.metadata || {},
              images: q.images || [],
              imageLayout: q.imageLayout || 'auto',
            }));
            existing.questions = questionLogs;
            existing.totalQuestions = questionLogs.length;
          } else if (publishMode === 'Random Questions') {
            // Finding 6 Fix: Regenerate questions for unstarted students in Random Questions mode
            const insights = computeStudentInsights(sId, pastAssignments);
            const candidatePool = allQuestions.filter((q) => (selectedQuestionIds || []).includes(q.id));
            const updatedRandomList = selectRandomQuestionsForRuleEngine(
              Number(randomCount) || 5,
              candidatePool.length > 0 ? candidatePool : allQuestions,
              insights
            );
            const questionLogs: QuestionAttemptLog[] = updatedRandomList.map((q) => ({
              questionId: q.id,
              groupName: q.groupName,
              difficulty: q.difficulty,
              content: q.content,
              points: q.points != null ? Number(q.points) : null,
              studentAnswer: null,
              writtenExplanation: '',
              enableWrittenExplanation: Boolean(q.enableWrittenExplanation),
              defaultInput: q.defaultInput !== undefined ? Boolean(q.defaultInput) : true,
              answerType: q.answerType || 'single',
              correctAnswer: q.correctAnswer ?? null,
              correctAnswers: Array.isArray(q.correctAnswers)
                ? q.correctAnswers
                : (Array.isArray(q.correctAnswer) ? q.correctAnswer : (q.correctAnswer ? [String(q.correctAnswer)] : [])),
              isCorrect: false,
              timeAllowedSeconds: q.timeSeconds != null ? Number(q.timeSeconds) : null,
              timeTakenSeconds: 0,
              earnedPoints: 0,
              options: q.options || [],
              metadata: q.metadata || {},
              images: q.images || [],
              imageLayout: q.imageLayout || 'auto',
            }));
            existing.questions = questionLogs;
            existing.totalQuestions = questionLogs.length;
          }
          await existing.save();
        }
      }
    }

    if (newAssignmentsToAdd.length > 0) {
      await StudentTestAssignmentModel.insertMany(newAssignmentsToAdd);
    }

    // Refresh all live assignments for this published test
    const allCurrentAssignments = await StudentTestAssignmentModel.find({
      $or: [{ publishedTestId: publishId }, { publishedTestId: pubTest._id ? pubTest._id.toString() : publishId }],
    });
    const currentCompleted = allCurrentAssignments.filter((a) => a.status === 'COMPLETED').length;
    const currentIncomplete = allCurrentAssignments.filter((a) => a.status === 'INCOMPLETE' || a.status === 'LOCKED_INCOMPLETE').length;

    // Update PublishHistory record with latest update timestamp and updated recipient list
    if (historyDoc) {
      historyDoc.publishedAt = serverNow;
      historyDoc.updatedAt = serverNow;
      historyDoc.publishName = publishName.trim();
      historyDoc.publishMode = publishMode;
      historyDoc.startDate = startDate;
      historyDoc.startTime = to12Hour(startTime || '12:00 AM');
      historyDoc.endDate = endDate;
      historyDoc.endTime = to12Hour(endTime || '11:59 PM');
      historyDoc.schoolId = allTargetSchoolIds[0] || '';
      historyDoc.schoolName = combinedSchoolNames;
      historyDoc.schoolIds = allTargetSchoolIds;
      historyDoc.schoolNames = allTargetSchoolNames;
      historyDoc.classes = allTargetClasses.length > 0 ? allTargetClasses : ['All Classes'];
      historyDoc.sections = allTargetSections.length > 0 ? allTargetSections : ['All Sections'];
      historyDoc.targets = targetsRecord;
      historyDoc.totalRecipients = allCurrentAssignments.length;
      historyDoc.assignedQuestionsCount = publishMode === 'Selected Questions' ? (selectedQuestionIds?.length || 0) : (randomCount || 0);
      historyDoc.questionIds = selectedQuestionIds || [];
      historyDoc.questionsSnapshot = eligibleQuestionsSnapshot;
      historyDoc.randomCount = randomCount ? Number(randomCount) : undefined;
      historyDoc.completedCount = currentCompleted;
      historyDoc.incompleteCount = currentIncomplete;

      // Update studentsStatus:
      // Remove stale NOT_STARTED entries for students who are no longer targeted.
      // Keep students who are in allCurrentAssignments or who have a completed/incomplete attempt.
      const prevStatusMap = new Map<string, any>(
        (historyDoc.studentsStatus || []).map((s: any) => [s.studentId || s.uniqueStudentId, s])
      );

      const liveAssignMap = new Map<string, any>(allCurrentAssignments.map((a) => [a.studentId, a]));
      const updatedStudentsStatus: any[] = [];

      for (const a of allCurrentAssignments) {
        const prev = prevStatusMap.get(a.studentId);
        updatedStudentsStatus.push({
          studentId: a.studentId,
          uniqueStudentId: a.studentId,
          studentName: a.studentName || prev?.studentName || '',
          schoolAdmissionNumber: a.schoolAdmissionNumber || prev?.schoolAdmissionNumber || '',
          schoolId: a.schoolId || prev?.schoolId || '',
          schoolName: a.schoolName || prev?.schoolName || '',
          className: a.className || prev?.className || '',
          section: a.section || prev?.section || '',
          status: a.status,
          scoreOutOf100: a.scoreOutOf100 || 0,
          exitType: a.exitType || null,
          completionDate: prev?.completionDate,
          completionTime: prev?.completionTime,
        });
      }

      // Also preserve any previous historical attempts (status !== 'NOT_STARTED') for students not currently in live assignments
      for (const [sId, prev] of prevStatusMap.entries()) {
        if (!liveAssignMap.has(sId) && prev.status && prev.status !== 'NOT_STARTED') {
          updatedStudentsStatus.push(prev);
        }
      }

      historyDoc.studentsStatus = updatedStudentsStatus;
      await historyDoc.save();
    }

    return res.json({
      success: true,
      message: `Assessment '${publishName}' updated successfully. Total assigned: ${allCurrentAssignments.length} students.`,
      publishedTest: formatDoc(pubTest),
      totalAssignedStudents: allCurrentAssignments.length,
      publishedAt: serverNow,
      updatedAt: serverNow,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update assessment' });
  }
};

router.put('/publish/:publishId', authenticate, requireRole('super_admin'), handleUpdatePublishedAssessment);
router.put('/published-tests/:publishId', authenticate, requireRole('super_admin'), handleUpdatePublishedAssessment);

// ==========================================
// 6. STUDENT ASSESSMENT PORTAL & EXECUTION
// ==========================================

// Get All Tests Assigned to Current Student
router.get('/student/tests', authenticate, async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'student') {
      return res.status(403).json({ error: 'Only student accounts can access candidate assessments' });
    }

    const studentId = req.user!.studentId || req.user!.username;
    const assignments = await StudentTestAssignmentModel.find({ studentId }).sort({ createdAt: -1 });

    const publishedTests = await PublishedTestModel.find({
      _id: { $in: assignments.map((a) => a.publishedTestId) },
    });
    const pubMap = new Map<string, any>();
    for (const pt of publishedTests) {
      pubMap.set(pt._id.toString(), pt);
    }

    const escapedStudentId = escapeRegExp(studentId);
    const hasValidUserId = Boolean(req.user!.userId && mongoose.isValidObjectId(req.user!.userId));
    const studentUser = (hasValidUserId ? await UserModel.findById(req.user!.userId).lean() : null) ||
      await UserModel.findOne({
        $or: [
          { uniqueStudentId: { $regex: new RegExp(`^${escapedStudentId}$`, 'i') } },
          { username: { $regex: new RegExp(`^${escapedStudentId}$`, 'i') } },
        ],
      }).lean();

    // SEC-CRIT-04: Determine current date-time using server-authoritative time source
    const currentDateTimeStr = getServerAuthoritativeDateTimeStr(req);

    // Pre-fetch active question IDs only for question IDs present in student's NOT_STARTED tests
    const unstartedQuestionIds = Array.from(
      new Set(
        assignments
          .filter((a) => a.status === 'NOT_STARTED')
          .flatMap((a) => (a.questions || []).map((q: any) => String(q.questionId || q.id || q._id || '')).filter(Boolean))
      )
    );
    const activeQuestionsDocs = unstartedQuestionIds.length > 0
      ? await QuestionModel.find({ _id: { $in: unstartedQuestionIds } }, { _id: 1 }).lean()
      : [];
    const activeQuestionIdSet = new Set(activeQuestionsDocs.map((q: any) => q._id.toString()));

    const result: any[] = [];
    const staleAssignmentsToDelete: string[] = [];

    for (const a of assignments) {
      const pubId = a.publishedTestId?.toString ? a.publishedTestId.toString() : String(a.publishedTestId);
      const pub = pubMap.get(pubId);
      if (!pub) {
        continue;
      }

      // If test has NOT_STARTED, ensure student is still targeted under updated target configuration
      if (a.status === 'NOT_STARTED' && studentUser) {
        const isTargeted = isStudentTargetedByPublishedTest(studentUser, pub);
        if (!isTargeted) {
          staleAssignmentsToDelete.push(a._id.toString());
          continue;
        }
      }

      let isUpcoming = false;
      let isExpired = false;

      if (pub?.startDate && pub.startDate !== 'Today') {
        const start24 = to24Hour(pub.startTime || '00:00');
        const startStr = `${toISODate(pub.startDate)}T${start24}`;
        if (isScheduledForFuture(currentDateTimeStr, startStr, 0)) {
          isUpcoming = true;
        }
      }

      if (pub?.endDate && pub.endDate !== 'Open') {
        const end24 = to24Hour(pub.endTime || '23:59');
        const endStr = `${toISODate(pub.endDate)}T${end24}`;
        if (isAssessmentExpired(currentDateTimeStr, endStr, 0)) {
          isExpired = true;
        }
      }

      // Finding 9 Fix: Clean transition for abandoned/expired in-progress attempts
      if (a.status === 'IN_PROGRESS' && isExpired) {
        await markAssignmentIncomplete(a._id.toString(), a.studentId, 'EXIT', 'Assessment testing window has expired');
        a.status = 'INCOMPLETE';
        a.exitType = 'EXIT';
      }

      let activeQuestionsCount = (a.questions || []).length;
      if (a.status === 'NOT_STARTED') {
        const validActive = (a.questions || []).filter((q: any) => {
          const qId = String(q.questionId || q.id || q._id || '');
          return activeQuestionIdSet.has(qId);
        });
        activeQuestionsCount = validActive.length;
      }

      const isPaused = pub?.isPaused === true || pub?.status === 'PAUSED';
      const hasActiveQuestions = a.status !== 'NOT_STARTED' || activeQuestionsCount > 0;
      const canStart = a.status === 'NOT_STARTED' && !isUpcoming && !isExpired && !isPaused && hasActiveQuestions;
      // Finding 15 Fix: Support test resumption for in-progress tests
      const canResume = a.status === 'IN_PROGRESS' && !isPaused && !isExpired;

      result.push({
        id: a._id.toString(),
        _id: a._id.toString(),
        assignmentId: a._id.toString(),
        publishedTestId: pubId,
        studentName: studentUser?.studentName || a.studentName || '',
        schoolAdmissionNumber: studentUser?.schoolAdmissionNumber || a.schoolAdmissionNumber || '',
        publishName: pub?.publishName || a.publishName,
        status: a.status,
        exitType: a.exitType || null,
        totalQuestions: activeQuestionsCount,
        startDate: pub?.startDate || 'Today',
        startTime: to12Hour(pub?.startTime || a.startTime || '12:00 AM'),
        endDate: pub?.endDate || 'Open',
        endTime: to12Hour(pub?.endTime || a.endTime || '11:59 PM'),
        isUpcoming,
        isExpired,
        isPaused,
        canStart,
        canResume,
      });
    }

    if (staleAssignmentsToDelete.length > 0) {
      await StudentTestAssignmentModel.deleteMany({ _id: { $in: staleAssignmentsToDelete } });
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch student tests' });
  }
});

// Start or Resume an Assessment
router.post('/student/tests/:assignmentId/start', authenticate, async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'student') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { assignmentId } = req.params;
    const studentId = req.user!.studentId || req.user!.username;

    const assignment = await StudentTestAssignmentModel.findById(assignmentId);
    if (!assignment) return res.status(404).json({ error: 'Test not found' });
    if (assignment.studentId !== studentId) return res.status(403).json({ error: 'Access denied' });

    // Block start if assessment is paused by admin or not found
    const pubTest = await PublishedTestModel.findById(assignment.publishedTestId);
    if (!pubTest) {
      return res.status(404).json({ error: 'Test not found' });
    }
    if (pubTest?.isPaused || pubTest?.status === 'PAUSED') {
      return res.status(403).json({ error: 'This test is temporarily paused. Please check back later.' });
    }

    // SEC-CRIT-04: Server-authoritative assessment date & time validation
    const currentDateTimeStr = getServerAuthoritativeDateTimeStr(req);

    if (pubTest?.startDate && pubTest.startDate !== 'Today') {
      const start24 = to24Hour(pubTest.startTime || '00:00');
      const startStr = `${toISODate(pubTest.startDate)}T${start24}`;
      if (isScheduledForFuture(currentDateTimeStr, startStr, 2)) {
        return res.status(400).json({ error: 'This assessment is scheduled for a future date and time and cannot be started yet.' });
      }
    }

    if (pubTest?.endDate && pubTest.endDate !== 'Open') {
      const end24 = to24Hour(pubTest.endTime || '23:59');
      const endStr = `${toISODate(pubTest.endDate)}T${end24}`;
      if (isAssessmentExpired(currentDateTimeStr, endStr, 1)) {
        return res.status(400).json({ error: 'This assessment has expired and can no longer be started.' });
      }
    }

    // Verify student is still targeted under updated target configuration
    if (assignment.status === 'NOT_STARTED') {
      const escapedStudentId = escapeRegExp(studentId);
      const hasValidUserId = Boolean(req.user!.userId && mongoose.isValidObjectId(req.user!.userId));
      const studentUser = (hasValidUserId ? await UserModel.findById(req.user!.userId).lean() : null) ||
        await UserModel.findOne({
          $or: [
            { uniqueStudentId: { $regex: new RegExp(`^${escapedStudentId}$`, 'i') } },
            { username: { $regex: new RegExp(`^${escapedStudentId}$`, 'i') } },
          ],
        }).lean();
      if (studentUser && !isStudentTargetedByPublishedTest(studentUser, pubTest)) {
        await StudentTestAssignmentModel.deleteOne({ _id: assignment._id });
        return res.status(403).json({ error: 'You are no longer assigned to this test.' });
      }
    }

    // Strict One-Time Attempt Enforcement:
    if (assignment.status === 'COMPLETED') {
      return res.status(400).json({ error: 'You have already completed this test.' });
    }
    if (assignment.status === 'LOCKED_INCOMPLETE' || assignment.status === 'INCOMPLETE') {
      return res.status(400).json({ error: 'This test ended early and cannot be reopened.' });
    }

    // Finding 15 Fix: If test is already IN_PROGRESS, allow resuming the same attempt without restarting
    if (assignment.status === 'IN_PROGRESS') {
      const targetQuestionIds = Array.from(
        new Set(
          (assignment.questions || [])
            .map((q: any) => String(q.questionId || q.id || q._id || '').trim())
            .filter(Boolean)
        )
      );
      const validQuestionIds = targetQuestionIds.filter((id) => mongoose.isValidObjectId(id));
      const relevantQuestionDocs = validQuestionIds.length > 0
        ? await QuestionModel.find({ _id: { $in: validQuestionIds } }).lean()
        : [];
      const qMap = new Map<string, any>();
      for (const q of relevantQuestionDocs) {
        const idStr = q._id ? q._id.toString() : '';
        if (idStr) qMap.set(idStr, q);
        if (q.id && String(q.id) !== idStr) qMap.set(String(q.id), q);
      }
      const sanitizedQuestions = (assignment.questions || []).map((q: any) => {
        const fullQ = qMap.get(String(q.questionId || q.id || q._id));
        const isRanking = Boolean(
          q.isRanking ||
          q.isRankingQuestion ||
          fullQ?.isRanking ||
          fullQ?.isRankingQuestion ||
          String(q.questionType || fullQ?.questionType || '').toLowerCase() === 'ranking'
        );
        return serializeStudentQuestion({
          questionId: q.questionId || q.id || q._id,
          groupName: q.groupName || fullQ?.groupName || 'General',
          difficulty: q.difficulty || fullQ?.difficulty || 'Medium',
          content: q.content || fullQ?.content || 'Question',
          points: q.points != null ? Number(q.points) : (fullQ?.points != null ? Number(fullQ.points) : null),
          timeAllowedSeconds: q.timeAllowedSeconds != null ? Number(q.timeAllowedSeconds) : (fullQ?.timeSeconds != null ? Number(fullQ.timeSeconds) : null),
          options: (q.options && q.options.length > 0) ? q.options : (fullQ?.options || []),
          answerType: q.answerType || fullQ?.answerType || 'single',
          isRanking,
          isRankingQuestion: isRanking,
          questionType: isRanking ? 'Ranking' : (q.questionType || fullQ?.questionType || (q.answerType === 'multiple' ? 'Multiple Selection' : 'Single Selection')),
          enableWrittenExplanation: q.enableWrittenExplanation !== undefined ? q.enableWrittenExplanation : fullQ?.enableWrittenExplanation,
          defaultInput: q.defaultInput !== undefined ? q.defaultInput : (fullQ?.defaultInput !== undefined ? fullQ.defaultInput : true),
          writtenExplanation: q.writtenExplanation !== undefined ? q.writtenExplanation : '',
          metadata: q.metadata || fullQ?.metadata || {},
          pairs: q.pairs || fullQ?.pairs || fullQ?.metadata?.pairs || q.metadata?.pairs || [],
          images: q.images || fullQ?.images || [],
          imageLayout: q.imageLayout || fullQ?.imageLayout || 'auto',
          timeTakenSeconds: q.timeTakenSeconds || 0,
          studentAnswer: q.studentAnswer !== undefined ? q.studentAnswer : null,
        });
      });

      return res.json({
        assignmentId: assignment._id.toString(),
        id: assignment._id.toString(),
        publishedTestId: assignment.publishedTestId,
        publishName: assignment.publishName,
        status: assignment.status,
        startedAt: assignment.startedAt,
        questions: sanitizedQuestions,
        isResumed: true,
      });
    }

    if (assignment.status !== 'NOT_STARTED') {
      return res.status(400).json({ error: 'Only unstarted tests can be started.' });
    }

    // Defensive active question check:
    // Ensure that if any question was deleted from the active Question Bank while this assignment was NOT_STARTED,
    // that deleted question is excluded when starting.
    // Efficiently query only the questions referenced in this assignment instead of scanning the entire collection.
    const targetQuestionIds = Array.from(
      new Set(
        (assignment.questions || [])
          .map((q: any) => String(q.questionId || q.id || q._id || '').trim())
          .filter(Boolean)
      )
    );
    const validQuestionIds = targetQuestionIds.filter((id) => mongoose.isValidObjectId(id));
    const relevantQuestionDocs = validQuestionIds.length > 0
      ? await QuestionModel.find({ _id: { $in: validQuestionIds } }).lean()
      : [];
    const activeQuestionIdSet = new Set(
      relevantQuestionDocs.map((q: any) => (q._id ? q._id.toString() : String(q.id || '')))
    );

    const activeQuestions = (assignment.questions || []).filter((q: any) => {
      const qId = String(q.questionId || q.id || q._id || '');
      return activeQuestionIdSet.has(qId);
    });

    if (activeQuestions.length === 0) {
      // Finding 13 Fix: Do not destroy the assignment questions array snapshot
      return res.status(400).json({
        error: 'This test cannot be started because its questions are no longer available in the Question Bank.',
      });
    }

    assignment.questions = activeQuestions;
    assignment.totalQuestions = activeQuestions.length;

    // Set startedAt and status to IN_PROGRESS on initial start (permanently saved in MongoDB Atlas)
    assignment.status = 'IN_PROGRESS';
    assignment.exitType = null;
    assignment.startedAt = new Date();
    await assignment.save();

    // Update student status in publish history
    await PublishHistoryModel.updateOne(
      { publishId: assignment.publishedTestId, 'studentsStatus.studentId': studentId },
      { $set: { 'studentsStatus.$.status': 'IN_PROGRESS', 'studentsStatus.$.exitType': null } }
    );

    const qMap = new Map<string, any>();
    for (const q of relevantQuestionDocs) {
      const idStr = q._id ? q._id.toString() : '';
      if (idStr) qMap.set(idStr, q);
      if (q.id && String(q.id) !== idStr) qMap.set(String(q.id), q);
    }

    const sanitizedQuestions = assignment.questions.map((q: any) => {
      const fullQ = qMap.get(String(q.questionId || q.id || q._id));
      const isRanking = Boolean(
        q.isRanking ||
        q.isRankingQuestion ||
        fullQ?.isRanking ||
        fullQ?.isRankingQuestion ||
        String(q.questionType || fullQ?.questionType || '').toLowerCase() === 'ranking'
      );
      return serializeStudentQuestion({
        questionId: q.questionId || q.id || q._id,
        groupName: q.groupName || fullQ?.groupName || 'General',
        difficulty: q.difficulty || fullQ?.difficulty || 'Medium',
        content: q.content || fullQ?.content || 'Question',
        points: q.points != null ? Number(q.points) : (fullQ?.points != null ? Number(fullQ.points) : null),
        timeAllowedSeconds: q.timeAllowedSeconds != null ? Number(q.timeAllowedSeconds) : (fullQ?.timeSeconds != null ? Number(fullQ.timeSeconds) : null),
        options: (q.options && q.options.length > 0) ? q.options : (fullQ?.options || []),
        answerType: q.answerType || fullQ?.answerType || 'single',
        isRanking,
        isRankingQuestion: isRanking,
        questionType: isRanking ? 'Ranking' : (q.questionType || fullQ?.questionType || (q.answerType === 'multiple' ? 'Multiple Selection' : 'Single Selection')),
        enableWrittenExplanation: q.enableWrittenExplanation !== undefined ? q.enableWrittenExplanation : fullQ?.enableWrittenExplanation,
        defaultInput: q.defaultInput !== undefined ? q.defaultInput : (fullQ?.defaultInput !== undefined ? fullQ.defaultInput : true),
        writtenExplanation: q.writtenExplanation !== undefined ? q.writtenExplanation : '',
        metadata: q.metadata || fullQ?.metadata || {},
        pairs: q.pairs || fullQ?.pairs || fullQ?.metadata?.pairs || q.metadata?.pairs || [],
        images: q.images || fullQ?.images || [],
        imageLayout: q.imageLayout || fullQ?.imageLayout || 'auto',
        timeTakenSeconds: q.timeTakenSeconds || 0,
        studentAnswer: q.studentAnswer !== undefined ? q.studentAnswer : null,
      });
    });

    return res.json({
      assignmentId: assignment._id.toString(),
      id: assignment._id.toString(),
      publishedTestId: assignment.publishedTestId,
      publishName: assignment.publishName,
      status: assignment.status,
      startedAt: assignment.startedAt,
      questions: sanitizedQuestions,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Unable to start test. Please try again.' });
  }
});

// Helper to transition assessment to INCOMPLETE with distinct EXIT or LOGOUT tracking
async function markAssignmentIncomplete(
  assignmentId: string,
  studentId: string,
  exitType: 'EXIT' | 'LOGOUT',
  reason?: string
) {
  const assignment = await StudentTestAssignmentModel.findById(assignmentId);
  if (!assignment) return { error: 'Assessment not found', code: 404 };
  if (assignment.studentId !== studentId) return { error: 'Access forbidden', code: 403 };

  if (assignment.status === 'COMPLETED') {
    return { error: 'Assessment is already submitted and completed.', code: 400 };
  }

  // Calculate points and stats up to exit/lockout
  let earnedTotal = 0;
  let possibleTotal = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let totalTime = 0;

  for (const q of assignment.questions) {
    // Finding 8 Fix: Non-evaluative questions without correctAnswer must not distort possible total
    const hasCorrectAnswer = hasAutomaticallyScorableAnswer(q);
    const hasPoints = q.points != null && !isNaN(Number(q.points)) && Number(q.points) > 0;
    if (hasCorrectAnswer && hasPoints) {
      possibleTotal += Number(q.points);
    }
    totalTime += q.timeTakenSeconds || 0;
    if (hasCorrectAnswer) {
      if (q.isCorrect) {
        earnedTotal += q.earnedPoints || (hasPoints ? Number(q.points) : 0);
        correctCount++;
      } else {
        wrongCount++;
      }
    }
  }

  const wasAlreadyIncomplete = assignment.status === 'INCOMPLETE' || assignment.status === 'LOCKED_INCOMPLETE';

  assignment.status = 'INCOMPLETE';
  assignment.exitType = exitType;
  assignment.lockedAt = new Date();
  assignment.totalPointsEarned = earnedTotal;
  assignment.correctCount = correctCount;
  assignment.wrongCount = wrongCount;
  assignment.totalTimeTakenSeconds = totalTime;
  assignment.scoreOutOf100 = possibleTotal > 0 ? Math.round((earnedTotal / possibleTotal) * 100) : 0;
  await assignment.save();

  // Update permanent publish history record in MongoDB Atlas
  try {
    if (!wasAlreadyIncomplete) {
      await PublishHistoryModel.updateOne(
        { publishId: assignment.publishedTestId },
        { $inc: { incompleteCount: 1 } }
      );
    }

    await PublishHistoryModel.updateOne(
      { publishId: assignment.publishedTestId, 'studentsStatus.studentId': studentId },
      {
        $set: {
          'studentsStatus.$.status': 'INCOMPLETE',
          'studentsStatus.$.exitType': exitType,
          'studentsStatus.$.scoreOutOf100': assignment.scoreOutOf100,
        },
      }
    );
  } catch (histErr: any) {
    console.error('[History Incomplete Update Error]:', histErr.message);
  }

  return {
    status: 'INCOMPLETE',
    exitType,
    message: reason || `Assessment marked INCOMPLETE (${exitType}).`,
    scoreOutOf100: assignment.scoreOutOf100,
  };
}

// Student Assessment Explicit Exit (Recorded as INCOMPLETE with Exit Type: EXIT)
router.post('/student/tests/:assignmentId/exit', authenticate, async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'student') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { assignmentId } = req.params;
    const studentId = req.user!.studentId || req.user!.username;
    const requestedExitType: 'EXIT' | 'LOGOUT' = req.body.exitType === 'LOGOUT' ? 'LOGOUT' : 'EXIT';
    const reason = req.body.reason || (requestedExitType === 'LOGOUT' ? 'Student logged out during assessment' : 'Student explicitly exited assessment');

    const result = await markAssignmentIncomplete(assignmentId, studentId, requestedExitType, reason);
    if ('error' in result) {
      return res.status(result.code || 400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to record assessment exit' });
  }
});

// Security Lockout / Violation / Timeout Trigger (also sets status: INCOMPLETE)
router.post('/student/tests/:assignmentId/lock', authenticate, async (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params;
    const studentId = req.user!.studentId || req.user!.username;
    const exitType: 'EXIT' | 'LOGOUT' = req.body.exitType === 'LOGOUT' ? 'LOGOUT' : 'EXIT';
    const reason = req.body.reason || 'Assessment exit or security lock';

    const result = await markAssignmentIncomplete(assignmentId, studentId, exitType, reason);
    if ('error' in result) {
      return res.status(result.code || 400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to lock assessment' });
  }
});

// Student Logout Handler: Automatically marks any IN_PROGRESS test as INCOMPLETE with Exit Type: LOGOUT
router.post('/student/logout', authenticate, async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'student') {
      return res.json({ success: true, message: 'Logged out' });
    }
    const studentId = req.user!.studentId || req.user!.username;

    // Find all IN_PROGRESS assignments for this student
    const inProgressList = await StudentTestAssignmentModel.find({
      studentId,
      status: 'IN_PROGRESS',
    });

    for (const assignment of inProgressList) {
      await markAssignmentIncomplete(
        assignment._id.toString(),
        studentId,
        'LOGOUT',
        'Student logged out during active assessment'
      );
    }

    // SEC-MED-04: Revoke authentication token on student logout
    if (req.token) {
      revokeToken(req.token);
    }

    return res.json({
      success: true,
      markedIncompleteCount: inProgressList.length,
      message: inProgressList.length > 0
        ? `Marked ${inProgressList.length} in-progress assessment(s) as INCOMPLETE (LOGOUT).`
        : 'Logged out successfully.'
    });
  } catch (err: any) {
    console.error('[Student Logout Error]:', err.message || err);
    return res.status(500).json({ error: 'Failed to handle student logout' });
  }
});

// Answer Question & Real-Time Timing / Correctness Evaluation
// SEC-HIGH-04: Rate limiting on answer submission
// SEC-CRIT-03: No real-time answer correctness leakage and no repeated answer changes
router.post('/student/tests/:assignmentId/answer', authenticate, answerRateLimiter, async (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params;
    const { questionId, answer, writtenExplanation, timeTakenSeconds } = req.body;
    const studentId = req.user!.studentId || req.user!.username;

    const assignment = await StudentTestAssignmentModel.findById(assignmentId);
    if (!assignment) return res.status(404).json({ error: 'Test not found' });
    if (assignment.studentId !== studentId) return res.status(403).json({ error: 'Access denied' });

    // Block answers if assessment is temporarily paused
    const pubTest = await PublishedTestModel.findById(assignment.publishedTestId);
    if (pubTest?.isPaused || pubTest?.status === 'PAUSED') {
      return res.status(403).json({ error: 'This test is temporarily paused. Please check back later.' });
    }

    if (pubTest && isRequestAssessmentExpired(req, pubTest)) {
      return res.status(400).json({ error: 'Assessment has expired and can no longer accept answers.' });
    }

    if (assignment.status === 'COMPLETED') {
      return res.status(400).json({ error: 'This test has already been completed and is no longer accepting answers.' });
    }

    if (assignment.status === 'LOCKED_INCOMPLETE') {
      return res.status(400).json({ error: 'This test is no longer accepting answers' });
    }

    if (assignment.status === 'INCOMPLETE') {
      return res.status(400).json({
        error: assignment.exitType === 'EXIT'
          ? 'Assessment was exited and cannot accept further answers.'
          : 'Assessment is not in progress and cannot accept answers.',
      });
    }

    const questionIndex = assignment.questions.findIndex((q: any) => q.questionId === questionId);
    if (questionIndex === -1) return res.status(404).json({ error: 'Question not found in this test' });

    const qItem = assignment.questions[questionIndex];

    // SEC-CRIT-03: Once a question answer is accepted, it must not be changed through repeated answer requests
    const alreadyAnswered = qItem.studentAnswer !== undefined && qItem.studentAnswer !== null;
    if (alreadyAnswered) {
      return res.status(400).json({ error: 'Answer for this question has already been submitted and cannot be changed.' });
    }

    // Evaluate answer correctness ONLY if question has a configured correct answer
    const hasCorrectAnswer = hasAutomaticallyScorableAnswer(qItem);
    const isCorrect = evaluateQuestionCorrectness(qItem, answer);
    const hasPoints = qItem.points != null && !isNaN(Number(qItem.points)) && Number(qItem.points) > 0;
    const pointsEarned = (hasCorrectAnswer && isCorrect && hasPoints) ? Number(qItem.points) : 0;

    // Server-side validation and constraint on timeTakenSeconds
    const qAllowedSeconds = qItem.timeAllowedSeconds != null && Number(qItem.timeAllowedSeconds) > 0 ? Number(qItem.timeAllowedSeconds) : null;
    const rawTime = Number(timeTakenSeconds);
    const validTime = isNaN(rawTime) || rawTime < 0 ? 0 : rawTime;
    const sanitizedTime = qAllowedSeconds != null ? Math.min(validTime, qAllowedSeconds) : validTime;

    // Use atomic update to prevent Mongoose document version conflicts
    const updatePayload: Record<string, any> = {
      [`questions.${questionIndex}.studentAnswer`]: answer,
      [`questions.${questionIndex}.isCorrect`]: hasCorrectAnswer ? (isCorrect ?? false) : false,
      [`questions.${questionIndex}.timeTakenSeconds`]: sanitizedTime,
      [`questions.${questionIndex}.earnedPoints`]: pointsEarned,
    };
    if (writtenExplanation !== undefined) {
      updatePayload[`questions.${questionIndex}.writtenExplanation`] = String(writtenExplanation);
    }

    await StudentTestAssignmentModel.findByIdAndUpdate(assignmentId, {
      $set: updatePayload,
    });

    // SEC-CRIT-03: Do NOT return isCorrect or earnedPoints immediately to the student
    return res.json({
      success: true,
      questionId,
      timeTakenSeconds: sanitizedTime,
    });
  } catch (err: any) {
    console.error('[Student Answer Error]:', err.message || err);
    return res.status(500).json({ error: 'Failed to save question answer' });
  }
});

// Final Test Submission
router.post('/student/tests/:assignmentId/submit', authenticate, async (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params;
    const studentId = req.user!.studentId || req.user!.username;

    const assignment = await StudentTestAssignmentModel.findById(assignmentId);
    if (!assignment) return res.status(404).json({ error: 'Test not found' });
    if (assignment.studentId !== studentId) return res.status(403).json({ error: 'Access denied' });

    // Block submit if assessment is temporarily paused
    const pubTest = await PublishedTestModel.findById(assignment.publishedTestId);
    if (pubTest?.isPaused || pubTest?.status === 'PAUSED') {
      return res.status(403).json({ error: 'This test is temporarily paused. Please check back later.' });
    }

    if (pubTest && isRequestAssessmentExpired(req, pubTest)) {
      return res.status(400).json({ error: 'Assessment has expired and can no longer be submitted.' });
    }

    if (assignment.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Assessment has already been completed.' });
    }

    if (assignment.status === 'LOCKED_INCOMPLETE') {
      return res.status(400).json({ error: 'This test has ended and can no longer be submitted.' });
    }

    if (assignment.status === 'INCOMPLETE') {
      return res.status(400).json({
        error: assignment.exitType === 'EXIT'
          ? 'Assessment was exited and cannot be submitted.'
          : 'Assessment ended early and cannot be submitted.',
      });
    }

    // Process answers payload if sent from frontend
    // SEC-CRIT-03: Preserve previously submitted answers so they cannot be altered upon submit
    const { answers } = req.body;
    if (answers && Array.isArray(answers)) {
      for (const ansItem of answers) {
        const qIdx = assignment.questions.findIndex((q: any) => q.questionId === ansItem.questionId);
        if (qIdx !== -1) {
          const qItem = assignment.questions[qIdx];
          const alreadyAnswered = qItem.studentAnswer !== undefined && qItem.studentAnswer !== null;
          const answerToUse = alreadyAnswered ? qItem.studentAnswer : ansItem.answer;
          const timeToUse = alreadyAnswered ? qItem.timeTakenSeconds : Math.max(0, Number(ansItem.timeTakenSeconds) || 0);

          const hasCorrectAnswer = hasAutomaticallyScorableAnswer(qItem);
          const isCorrect = evaluateQuestionCorrectness(qItem, answerToUse);
          const hasPoints = qItem.points != null && !isNaN(Number(qItem.points)) && Number(qItem.points) > 0;
          const pointsEarned = (hasCorrectAnswer && isCorrect && hasPoints) ? Number(qItem.points) : 0;
          const explanationToUse = ansItem.writtenExplanation !== undefined
            ? String(ansItem.writtenExplanation)
            : (qItem.writtenExplanation || '');

          assignment.questions[qIdx].studentAnswer = answerToUse;
          assignment.questions[qIdx].writtenExplanation = explanationToUse;
          assignment.questions[qIdx].isCorrect = hasCorrectAnswer ? (isCorrect ?? false) : false;
          assignment.questions[qIdx].timeTakenSeconds = timeToUse;
          assignment.questions[qIdx].earnedPoints = pointsEarned;
        }
      }
    }

    // Finalize score computations
    let earnedPointsTotal = 0;
    let possiblePointsTotal = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let totalTime = 0;

    for (const q of assignment.questions) {
      const hasPoints = q.points != null && !isNaN(Number(q.points)) && Number(q.points) > 0;
      const hasCorrectAnswer = hasAutomaticallyScorableAnswer(q);
      // Finding 8 Fix: Non-evaluative questions without correctAnswer must not distort possible points
      if (hasCorrectAnswer && hasPoints) {
        possiblePointsTotal += Number(q.points);
      }
      totalTime += Math.max(0, Number(q.timeTakenSeconds) || 0);

      if (hasCorrectAnswer) {
        if (q.isCorrect) {
          earnedPointsTotal += (q.earnedPoints != null && !isNaN(Number(q.earnedPoints)) ? Number(q.earnedPoints) : (hasPoints ? Number(q.points) : 0));
          correctCount++;
        } else {
          wrongCount++;
        }
      }
      // If question has no correct answer, do not attempt automatic evaluation or increment counts
    }

    const calculatedScore = possiblePointsTotal > 0 ? Math.round((earnedPointsTotal / possiblePointsTotal) * 100) : 0;
    const finalScore = Number.isFinite(calculatedScore) ? calculatedScore : 0;

    const completedAt = new Date();
    // Finding 1 Fix: Check whether THIS specific student was previously incomplete before completing
    const wasPreviouslyIncomplete = assignment.status === 'INCOMPLETE' || assignment.status === 'LOCKED_INCOMPLETE';

    // Atomic direct update in MongoDB Atlas to avoid Mongoose VersionError and parallel save issues
    await StudentTestAssignmentModel.findByIdAndUpdate(assignmentId, {
      $set: {
        questions: assignment.questions,
        status: 'COMPLETED',
        completedAt,
        totalPointsEarned: earnedPointsTotal,
        correctCount,
        wrongCount,
        totalTimeTakenSeconds: totalTime,
        scoreOutOf100: finalScore,
      },
    });

    // Update publish history in Atlas
    try {
      const publishHistory = await PublishHistoryModel.findOne({ publishId: assignment.publishedTestId });
      if (publishHistory) {
        await PublishHistoryModel.updateOne(
          { publishId: assignment.publishedTestId },
          {
            $inc: {
              completedCount: 1,
              ...(wasPreviouslyIncomplete ? { incompleteCount: -1 } : {}),
            },
          }
        );
        await PublishHistoryModel.updateOne(
          { publishId: assignment.publishedTestId, 'studentsStatus.studentId': studentId },
          {
            $set: {
              'studentsStatus.$.status': 'COMPLETED',
              'studentsStatus.$.completionDate': new Date().toISOString().split('T')[0],
              'studentsStatus.$.completionTime': new Date().toLocaleTimeString(),
              'studentsStatus.$.scoreOutOf100': finalScore,
            },
          }
        );
      }
    } catch (historyErr: any) {
      console.error('[Submit] Warning: Failed to update publish history record:', historyErr.message);
      // Non-blocking: student assignment is already safely completed in MongoDB Atlas
    }

    return res.json({
      status: 'COMPLETED',
      scoreOutOf100: finalScore,
      totalPointsEarned: earnedPointsTotal,
      correctCount,
      wrongCount,
      totalTimeTakenSeconds: totalTime,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Unable to submit test. Please try again.' });
  }
});

// ==========================================
// 7. PUBLISH HISTORY & DRILL-DOWN
// ==========================================

// Get All Publish History
router.get('/publish-history', authenticate, requireRole('super_admin'), async (_req: Request, res: Response) => {
  try {
    const history = await PublishHistoryModel.find({}, { questionsSnapshot: 0, studentsStatus: 0 }).sort({ updatedAt: -1, publishedAt: -1, createdAt: -1 });

    const publishIds = history.map((h) => h.publishId).filter(Boolean);
    const pubTests = await PublishedTestModel.find(
      { _id: { $in: publishIds } },
      { startDate: 1, startTime: 1, endDate: 1, endTime: 1, createdAt: 1, publishedAt: 1, updatedAt: 1, status: 1, isPaused: 1, shuffle: 1 }
    ).lean();
    const pubTestMap = new Map<string, any>(pubTests.map((pt: any) => [pt._id.toString(), pt]));

    // Aggregation of actual assigned student counts per school per publishedTestId (filtered to active published tests)
    const schoolCountsAgg = publishIds.length > 0 ? await StudentTestAssignmentModel.aggregate([
      {
        $match: { publishedTestId: { $in: publishIds } },
      },
      {
        $group: {
          _id: { publishedTestId: '$publishedTestId', schoolName: '$schoolName', schoolId: '$schoolId' },
          count: { $sum: 1 },
        },
      },
    ]) : [];

    const schoolCountsMap = new Map<string, Array<{ schoolName: string; schoolId?: string; count: number }>>();
    for (const item of schoolCountsAgg) {
      const pId = item._id.publishedTestId;
      const sName = item._id.schoolName || 'Unknown School';
      if (!schoolCountsMap.has(pId)) {
        schoolCountsMap.set(pId, []);
      }
      schoolCountsMap.get(pId)!.push({ schoolName: sName, schoolId: item._id.schoolId, count: item.count });
    }

    const formatted = formatDocs(history).map((h: any) => {
      let schoolCounts = schoolCountsMap.get(h.publishId) || [];
      // Fallback if no live assignments exist (e.g. legacy publish records)
      if (schoolCounts.length === 0) {
        if (Array.isArray(h.studentsStatus) && h.studentsStatus.length > 0) {
          const sMap = new Map<string, number>();
          for (const st of h.studentsStatus) {
            const name = st.schoolName || h.schoolName || 'School';
            sMap.set(name, (sMap.get(name) || 0) + 1);
          }
          schoolCounts = Array.from(sMap.entries()).map(([schoolName, count]) => ({ schoolName, count }));
        } else if (h.schoolNames && h.schoolNames.length > 0) {
          schoolCounts = h.schoolNames.map((name: string) => ({
            schoolName: name,
            count: Math.round((h.totalRecipients || 0) / h.schoolNames.length) || 1,
          }));
        } else if (h.schoolName) {
          schoolCounts = [{ schoolName: h.schoolName, count: h.totalRecipients || 0 }];
        }
      }

      const pub = pubTestMap.get(h.publishId);
      const effectivePublishTime = h.publishedAt || h.updatedAt || h.createdAt || pub?.publishedAt || pub?.updatedAt || pub?.createdAt;
      return {
        ...h,
        shuffle: Boolean(pub?.shuffle ?? h.shuffle),
        schoolCounts,
        startDate: h.startDate || pub?.startDate || h.date,
        startTime: to12Hour(h.startTime || pub?.startTime || h.time || '12:00 AM'),
        endDate: h.endDate || pub?.endDate || '',
        endTime: to12Hour(h.endTime || pub?.endTime || '11:59 PM'),
        publishedAt: effectivePublishTime,
        updatedAt: h.updatedAt || pub?.updatedAt || effectivePublishTime,
        createdAt: effectivePublishTime,
        status: h.status || pub?.status || 'ACTIVE',
        isPaused: h.isPaused ?? pub?.isPaused ?? false,
      };
    });

    return res.json(formatted);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch publish history' });
  }
});

// Get Specific Publish History Record with Who Completed & Who Did Not Complete
router.get('/publish-history/:publishId', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { publishId } = req.params;
    let historyDoc = await PublishHistoryModel.findOne({
      $or: [
        { publishId },
        ...(mongoose.Types.ObjectId.isValid(publishId) ? [{ _id: new mongoose.Types.ObjectId(publishId) }] : []),
      ],
    });
    if (!historyDoc) return res.status(404).json({ error: 'Publish history record not found' });

    const resolvedPubId = historyDoc.publishId || publishId;
    let pubTest = await PublishedTestModel.findById(resolvedPubId).lean();
    if (!pubTest && mongoose.Types.ObjectId.isValid(publishId)) {
      pubTest = await PublishedTestModel.findById(publishId).lean();
    }

    // Fetch live assignments from MongoDB collection studenttestassignments
    const liveAssignments = await StudentTestAssignmentModel.find({
      $or: [
        { publishedTestId: resolvedPubId },
        { publishedTestId: publishId },
      ],
    });
    const assignMap = new Map<string, any>();
    for (const a of liveAssignments) {
      assignMap.set(a.studentId, a);
    }

    const history = formatDoc(historyDoc);

    // Resolve canonical student details from UserModel to guarantee latest Name & Admission Number
    const allStudentIds = [
      ...(history.studentsStatus || []).map((s: any) => s.studentId || s.uniqueStudentId),
      ...liveAssignments.map((a: any) => a.studentId),
    ].filter(Boolean);

    const userDocs = await UserModel.find(
      {
        $or: [
          { uniqueStudentId: { $in: allStudentIds } },
          { username: { $in: allStudentIds } },
        ],
      },
      { studentName: 1, schoolAdmissionNumber: 1, className: 1, section: 1, schoolId: 1, schoolName: 1, uniqueStudentId: 1, username: 1 }
    ).lean();

    const userMap = new Map<string, any>();
    for (const u of userDocs) {
      if (u.uniqueStudentId) userMap.set(u.uniqueStudentId, u);
      if (u.username) userMap.set(u.username, u);
      userMap.set(u._id.toString(), u);
    }

    const processedStudentIds = new Set<string>();
    const studentsStatus: any[] = (history.studentsStatus || []).map((s: any) => {
      const sId = s.studentId || s.uniqueStudentId;
      processedStudentIds.add(sId);
      const live = assignMap.get(sId);
      const userDoc = userMap.get(sId) || (live ? userMap.get(live.studentId) : null);
      const effectiveStatus = live ? live.status : s.status;
      const effectiveExitType = (effectiveStatus === 'COMPLETED' || effectiveStatus === 'NOT_STARTED')
        ? null
        : (live && (live.exitType === 'EXIT' || live.exitType === 'LOGOUT')
          ? live.exitType
          : (s.exitType === 'EXIT' || s.exitType === 'LOGOUT' ? s.exitType : null));
      const effectiveScore = live ? live.scoreOutOf100 : s.scoreOutOf100;
      return {
        ...s,
        studentName: userDoc?.studentName || live?.studentName || s.studentName || 'Student',
        schoolAdmissionNumber: userDoc?.schoolAdmissionNumber || live?.schoolAdmissionNumber || s.schoolAdmissionNumber || '',
        schoolId: userDoc?.schoolId || live?.schoolId || s.schoolId || history.schoolId || '',
        schoolName: userDoc?.schoolName || live?.schoolName || s.schoolName || history.schoolName || '',
        className: userDoc?.className || live?.className || s.className || '',
        section: userDoc?.section || live?.section || s.section || '',
        assessmentName: history.publishName,
        status: effectiveStatus,
        exitType: effectiveExitType || null,
        scoreOutOf100: effectiveScore != null ? effectiveScore : 0,
      };
    });

    for (const [stId, live] of assignMap.entries()) {
      if (!processedStudentIds.has(stId)) {
        const userDoc = userMap.get(stId);
        studentsStatus.push({
          studentId: stId,
          uniqueStudentId: stId,
          studentName: userDoc?.studentName || live.studentName || 'Student',
          schoolAdmissionNumber: userDoc?.schoolAdmissionNumber || live.schoolAdmissionNumber || '',
          schoolId: userDoc?.schoolId || live.schoolId || history.schoolId || '',
          schoolName: userDoc?.schoolName || live.schoolName || history.schoolName || '',
          className: userDoc?.className || live.className || '',
          section: userDoc?.section || live.section || '',
          assessmentName: history.publishName,
          status: live.status,
          exitType: (live.status === 'COMPLETED' || live.status === 'NOT_STARTED')
            ? null
            : (live.exitType === 'EXIT' || live.exitType === 'LOGOUT' ? live.exitType : null),
          scoreOutOf100: live.scoreOutOf100 != null ? live.scoreOutOf100 : 0,
        });
      }
    }

    // Resolve targets configuration: check historyDoc.targets, historyDoc.target, or PublishedTestModel.targets
    let rawTargets: any[] = [];
    if (Array.isArray(history.targets) && history.targets.length > 0) {
      rawTargets = history.targets;
    } else {
      if (pubTest && Array.isArray(pubTest.targets) && pubTest.targets.length > 0) {
        rawTargets = pubTest.targets;
      } else if (history.target) {
        rawTargets = [history.target];
      } else if (pubTest?.target) {
        rawTargets = [pubTest.target];
      } else {
        rawTargets = [
          {
            schoolNames: history.schoolNames || (history.schoolName ? [history.schoolName] : []),
            schoolIds: history.schoolIds || (history.schoolId ? [history.schoolId] : []),
            classes: history.classes || ['All Classes'],
            sections: history.sections || [],
          },
        ];
      }
    }

    // For each target, compute the exact assigned student count from studentsStatus
    const allSchoolsList = await SchoolModel.find({}, { _id: 1, name: 1 });
    const totalSchoolsCount = allSchoolsList.length;

    const resolvedTargets = rawTargets.map((t: any, idx: number) => {
      // Determine if target covers All Schools
      const isAllSchools =
        t.isAllSchools === true ||
        (Array.isArray(t.schoolIds) && (t.schoolIds.includes('ALL') || (totalSchoolsCount > 1 && t.schoolIds.length >= totalSchoolsCount))) ||
        (Array.isArray(t.schoolNames) && t.schoolNames.includes('All Schools'));

      // Count students matching this specific target configuration
      const matchingCount = studentsStatus.filter((st: any) => {
        const matchSchool =
          isAllSchools ||
          !t.schoolIds ||
          t.schoolIds.length === 0 ||
          t.schoolIds.includes(st.schoolId) ||
          (Array.isArray(t.schoolNames) && t.schoolNames.includes(st.schoolName));

        const matchClass =
          !t.classes ||
          t.classes.length === 0 ||
          t.classes.includes('ALL') ||
          t.classes.includes('All Classes') ||
          t.classes.some((c: string) => c.toLowerCase() === (st.className || '').toLowerCase());

        const matchSection =
          !t.sections ||
          t.sections.length === 0 ||
          t.sections.includes('ALL') ||
          t.sections.includes('All Sections') ||
          t.sections.some((sec: string) => sec.toUpperCase() === (st.section || '').toUpperCase());

        const matchStudent =
          !t.studentIds ||
          t.studentIds.length === 0 ||
          t.studentIds.includes('ALL') ||
          t.studentIds.includes(st.studentId) ||
          t.studentIds.includes(st.uniqueStudentId);

        return matchSchool && matchClass && matchSection && matchStudent;
      }).length;

      return {
        ...t,
        targetNumber: idx + 1,
        isAllSchools,
        assignedCount: matchingCount > 0 ? matchingCount : (t.assignedCount != null ? t.assignedCount : 0),
      };
    });

    const completedStudents = studentsStatus.filter((s: any) => s.status === 'COMPLETED');
    const notCompletedStudents = studentsStatus.filter((s: any) => s.status !== 'COMPLETED');

    // Extract historical questions snapshot from historyDoc / pubTest questionsSnapshot (preserves full eligible pool)
    const storedSnapshot =
      Array.isArray(history.questionsSnapshot) && history.questionsSnapshot.length > 0
        ? history.questionsSnapshot
        : Array.isArray(pubTest?.questionsSnapshot) && pubTest.questionsSnapshot.length > 0
        ? pubTest.questionsSnapshot
        : [];

    const targetQIds =
      Array.isArray(history.questionIds) && history.questionIds.length > 0
        ? history.questionIds
        : Array.isArray(pubTest?.questionIds) && pubTest.questionIds.length > 0
        ? pubTest.questionIds
        : [];

    // Candidate base pool: storedSnapshot, or fallback to targetQIds or liveAssignments
    let rawCandidates: any[] = [];
    if (storedSnapshot.length > 0) {
      rawCandidates = storedSnapshot;
    } else if (targetQIds.length > 0) {
      rawCandidates = targetQIds.map((id: any) => ({ questionId: String(id), id: String(id) }));
    } else {
      for (const a of liveAssignments) {
        if (Array.isArray(a.questions)) {
          for (const q of a.questions) {
            rawCandidates.push(q);
          }
        }
      }
    }

    // Deduplicate candidate questions by questionId
    const candidateMap = new Map<string, any>();
    for (const q of rawCandidates) {
      const qId = String(q.questionId || q.id || q._id || '');
      if (qId && !candidateMap.has(qId)) {
        candidateMap.set(qId, q);
      }
    }

    // Query live questions and groups to synchronize updates, deletions, and renames
    const allQIds = Array.from(candidateMap.keys());
    const validObjectIds = allQIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const objectIdList = validObjectIds.map((id) => new mongoose.Types.ObjectId(id));
    const liveQuestionDocs = await QuestionModel.find({
      $or: [
        { _id: { $in: objectIdList } },
        { _id: { $in: validObjectIds } },
      ],
    }).lean();

    const liveQuestionMap = new Map<string, any>();
    for (const lq of liveQuestionDocs) {
      liveQuestionMap.set(lq._id.toString(), lq);
      if (lq.id) liveQuestionMap.set(String(lq.id), lq);
    }

    const liveGroupDocs = await QuestionGroupModel.find({}).lean();
    const liveGroupMap = new Map<string, any>();
    for (const lg of liveGroupDocs) {
      liveGroupMap.set(lg._id.toString(), lg);
      if (lg.id) liveGroupMap.set(String(lg.id), lg);
    }

    const questionMap = new Map<string, any>();
    for (const [qId, snap] of candidateMap.entries()) {
      const liveQ = liveQuestionMap.get(qId);
      const isQuestionDeleted = !liveQ;

      // Group resolution: live group name if active, or snapshot group name if deleted
      const targetGroupId = String(liveQ?.groupId || snap.groupId || '');
      let groupName = (liveQ?.groupName || snap.groupName || 'General').trim();
      let isGroupDeleted = false;

      if (targetGroupId) {
        if (liveGroupMap.has(targetGroupId)) {
          groupName = liveGroupMap.get(targetGroupId).name.trim();
          isGroupDeleted = false;
        } else {
          isGroupDeleted = true;
        }
      } else {
        const found = liveGroupDocs.some((g) => g.name.toLowerCase() === groupName.toLowerCase());
        isGroupDeleted = !found;
      }

      const qType = liveQ
        ? (liveQ.answerType === 'multiple' ? 'Multiple Selection' : (liveQ.answerType === 'type' ? 'Type' : 'Single Selection'))
        : (snap.questionType || (snap.answerType === 'multiple' ? 'Multiple Selection' : (snap.answerType === 'type' ? 'Type' : 'Single Selection')));

      const rawAnsType = liveQ
        ? (liveQ.answerType || 'single')
        : (snap.answerType || (qType === 'Multiple Selection' ? 'multiple' : (qType === 'Type' ? 'type' : 'single')));

      const correctAns = liveQ ? (liveQ.correctAnswer ?? null) : (snap.correctAnswer ?? null);
      const correctAnsList = liveQ
        ? (Array.isArray(liveQ.correctAnswers) && liveQ.correctAnswers.length > 0
            ? liveQ.correctAnswers
            : (liveQ.correctAnswer ? [String(liveQ.correctAnswer)] : []))
        : (Array.isArray(snap.correctAnswers) && snap.correctAnswers.length > 0
            ? snap.correctAnswers
            : (snap.correctAnswer ? [String(snap.correctAnswer)] : []));

        const isRanking = Boolean(
          liveQ
            ? (liveQ.isRanking || liveQ.isRankingQuestion || String(liveQ.questionType || '').toLowerCase() === 'ranking')
            : (snap.isRanking || snap.isRankingQuestion || String(snap.questionType || '').toLowerCase() === 'ranking')
        );

        questionMap.set(qId, {
          id: qId,
          questionId: qId,
          groupId: targetGroupId,
          groupName,
          isGroupDeleted,
          isQuestionDeleted,
          difficulty: (liveQ ? liveQ.difficulty : snap.difficulty) || 'Medium',
          content: (liveQ ? liveQ.content : snap.content) || 'Question',
          points: liveQ ? (liveQ.points != null ? Number(liveQ.points) : null) : (snap.points != null ? Number(snap.points) : null),
          timeAllowedSeconds: liveQ
            ? (liveQ.timeSeconds != null ? Number(liveQ.timeSeconds) : null)
            : (snap.timeAllowedSeconds != null ? Number(snap.timeAllowedSeconds) : (snap.timeSeconds != null ? Number(snap.timeSeconds) : null)),
          timeSeconds: liveQ
            ? (liveQ.timeSeconds != null ? Number(liveQ.timeSeconds) : null)
            : (snap.timeSeconds != null ? Number(snap.timeSeconds) : (snap.timeAllowedSeconds != null ? Number(snap.timeAllowedSeconds) : null)),
          options: liveQ ? (liveQ.options || []) : (snap.options || []),
          answerType: rawAnsType,
          isRanking,
          isRankingQuestion: isRanking,
          questionType: isRanking ? 'Ranking' : qType,
          correctAnswer: correctAns,
          correctAnswers: correctAnsList,
          scoringGuide: liveQ?.scoringGuide || snap.scoringGuide || snap.metadata?.scoringGuide,
          expectedResponse: liveQ?.expectedResponse || snap.expectedResponse || snap.metadata?.expectedResponse,
          enableWrittenExplanation: liveQ
            ? Boolean(liveQ.enableWrittenExplanation !== undefined ? liveQ.enableWrittenExplanation : (liveQ.metadata?.enableWrittenExplanation ?? snap.enableWrittenExplanation))
            : Boolean(snap.enableWrittenExplanation !== undefined ? snap.enableWrittenExplanation : snap.metadata?.enableWrittenExplanation),
          defaultInput: liveQ?.defaultInput !== undefined
            ? Boolean(liveQ.defaultInput)
            : (snap.defaultInput !== undefined ? Boolean(snap.defaultInput) : true),
          metadata: (liveQ ? liveQ.metadata : snap.metadata) || {},
          pairs: (liveQ ? liveQ.metadata?.pairs : (snap.pairs || snap.metadata?.pairs)) || [],
          images:
            Array.isArray(snap.images) && snap.images.length > 0
              ? snap.images
              : Array.isArray(liveQ?.images) && liveQ.images.length > 0
              ? liveQ.images
              : [],
          imageLayout:
            snap.imageLayout && snap.imageLayout !== 'auto'
              ? snap.imageLayout
              : liveQ?.imageLayout || 'auto',
        });
    }

    // Filter out deleted questions so only remaining valid questions appear in history & preview
    const historicalQuestions = Array.from(questionMap.values()).filter((q) => !q.isQuestionDeleted);

    // Build question summary breakdown: Group -> Difficulty -> count
    const questionSummaryMap = new Map<string, { diffMap: Map<string, number>; isGroupDeleted: boolean }>();
    for (const q of historicalQuestions) {
      const g = q.groupName || 'General';
      const d = q.difficulty || 'Medium';
      if (!questionSummaryMap.has(g)) {
        questionSummaryMap.set(g, { diffMap: new Map(), isGroupDeleted: false });
      }
      const entry = questionSummaryMap.get(g)!;
      if (q.isGroupDeleted) {
        entry.isGroupDeleted = true;
      }
      entry.diffMap.set(d, (entry.diffMap.get(d) || 0) + 1);
    }

    const questionSummary: Array<{
      groupName: string;
      isGroupDeleted?: boolean;
      difficulties: Array<{ difficulty: string; count: number }>;
    }> = [];

    for (const [g, entry] of questionSummaryMap.entries()) {
      const standardOrder = ['Easy', 'Medium', 'Hard'];
      const diffKeys = Array.from(entry.diffMap.keys());
      const sortedKeys = [
        ...standardOrder.filter((d) => diffKeys.includes(d)),
        ...diffKeys.filter((d) => !standardOrder.includes(d)),
      ];
      questionSummary.push({
        groupName: g,
        isGroupDeleted: entry.isGroupDeleted,
        difficulties: sortedKeys.map((d) => ({
          difficulty: d,
          count: entry.diffMap.get(d) || 0,
        })),
      });
    }

    // School counts summary
    const schoolCountsMap = new Map<string, number>();
    for (const st of studentsStatus) {
      const sName = st.schoolName || history.schoolName || 'School';
      schoolCountsMap.set(sName, (schoolCountsMap.get(sName) || 0) + 1);
    }
    const schoolCounts = Array.from(schoolCountsMap.entries()).map(([schoolName, count]) => ({ schoolName, count }));

    const effectivePublishTime = history.publishedAt || history.updatedAt || history.createdAt || pubTest?.publishedAt || pubTest?.updatedAt || pubTest?.createdAt;
    return res.json({
      ...history,
      shuffle: Boolean(pubTest?.shuffle ?? history.shuffle),
      startDate: history.startDate || pubTest?.startDate || history.date,
      startTime: to12Hour(history.startTime || pubTest?.startTime || history.time || '12:00 AM'),
      endDate: history.endDate || pubTest?.endDate || '',
      endTime: to12Hour(history.endTime || pubTest?.endTime || '11:59 PM'),
      publishedAt: effectivePublishTime,
      updatedAt: history.updatedAt || pubTest?.updatedAt || effectivePublishTime,
      createdAt: effectivePublishTime,
      status: history.status || pubTest?.status || 'ACTIVE',
      isPaused: history.isPaused ?? pubTest?.isPaused ?? false,
      targets: resolvedTargets,
      schoolCounts,
      studentsStatus,
      completedStudents,
      notCompletedStudents,
      questions: historicalQuestions,
      questionSummary,
      totalQuestionsCount: historicalQuestions.length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch publish history detail' });
  }
});

// Pause an Assessment (Super Admin Only)
router.post('/publish-history/:publishId/pause', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { publishId } = req.params;
    const pubTest = await PublishedTestModel.findById(publishId);
    const history = await PublishHistoryModel.findOne({ publishId });

    if (!pubTest && !history) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    if (pubTest) {
      pubTest.status = 'PAUSED';
      pubTest.isPaused = true;
      await pubTest.save();
    }
    if (history) {
      history.status = 'PAUSED';
      history.isPaused = true;
      await history.save();
    }

    return res.json({
      success: true,
      status: 'PAUSED',
      isPaused: true,
      message: `Assessment '${history?.publishName || pubTest?.publishName || publishId}' is now temporarily paused.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to pause assessment' });
  }
});

// Resume an Assessment (Super Admin Only)
router.post('/publish-history/:publishId/resume', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { publishId } = req.params;
    const pubTest = await PublishedTestModel.findById(publishId);
    const history = await PublishHistoryModel.findOne({ publishId });

    if (!pubTest && !history) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    if (pubTest) {
      pubTest.status = 'ACTIVE';
      pubTest.isPaused = false;
      await pubTest.save();
    }
    if (history) {
      history.status = 'ACTIVE';
      history.isPaused = false;
      await history.save();
    }

    return res.json({
      success: true,
      status: 'ACTIVE',
      isPaused: false,
      message: `Assessment '${history?.publishName || pubTest?.publishName || publishId}' has been resumed.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to resume assessment' });
  }
});

// Delete an Assessment (Super Admin Only)
const handleDeletePublishedAssessment = async (req: Request, res: Response) => {
  try {
    const { publishId } = req.params;
    const pubTest = await PublishedTestModel.findById(publishId);
    const history = await PublishHistoryModel.findOne({ publishId });

    if (!pubTest && !history) {
      return res.status(404).json({ error: 'Published assessment not found for deletion' });
    }

    const assessmentName = history?.publishName || pubTest?.publishName || publishId;

    // Delete associated student assignments strictly for this published test only
    const deletedAssignments = await StudentTestAssignmentModel.deleteMany({ publishedTestId: publishId });

    // Delete publish history record
    await PublishHistoryModel.deleteOne({ publishId });

    // Delete published test record
    await PublishedTestModel.deleteOne({ _id: publishId });

    return res.json({
      success: true,
      message: `Assessment '${assessmentName}' and all associated student assignments deleted successfully.`,
      deletedAssignmentsCount: deletedAssignments.deletedCount,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete assessment' });
  }
};

router.delete('/publish-history/:publishId', authenticate, requireRole('super_admin'), handleDeletePublishedAssessment);
router.delete('/published-tests/:publishId', authenticate, requireRole('super_admin'), handleDeletePublishedAssessment);

// ==========================================
// 8. REPORTS & STUDENT TEST TIMELINE
// ==========================================

// Get unique classes for a school from actual student records in MongoDB Atlas
router.get('/reports/schools/:schoolId/classes', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { schoolId } = req.params;
    const rawClasses = await UserModel.distinct('className', {
      role: 'student',
      schoolId,
    });

    const cleanClasses = Array.from(
      new Set(
        rawClasses
          .filter((c: any) => typeof c === 'string' && c.trim().length > 0)
          .map((c: string) => c.trim())
      )
    ).sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    return res.json({ classes: cleanClasses });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch classes for school' });
  }
});

// Get unique sections for a school and class from actual student records in MongoDB Atlas
router.get('/reports/schools/:schoolId/sections', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { schoolId } = req.params;
    const { className } = req.query as { className?: string };

    const query: any = {
      role: 'student',
      schoolId,
    };

    if (className && className.trim()) {
      query.className = { $regex: new RegExp(`^${escapeRegExp(className.trim())}$`, 'i') };
    }

    const rawSections = await UserModel.distinct('section', query);

    const cleanSections = Array.from(
      new Set(
        rawSections
          .filter((s: any) => typeof s === 'string' && s.trim().length > 0)
          .map((s: string) => s.trim().toUpperCase())
      )
    ).sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    return res.json({ sections: cleanSections });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch sections for school and class' });
  }
});

// Super Admin Student Reports List (School -> Class -> Section -> Search)
router.get('/reports/schools/:schoolId/students', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { schoolId } = req.params;
    const { className, section, search } = req.query as { className?: string; section?: string; search?: string };

    const query: any = { role: 'student', schoolId };

    if (className && className.trim()) {
      query.className = { $regex: new RegExp(`^${escapeRegExp(className.trim())}$`, 'i') };
    }
    if (section && section.trim()) {
      query.section = { $regex: new RegExp(`^${escapeRegExp(section.trim())}$`, 'i') };
    }
    if (search && search.trim()) {
      const escapedQ = escapeRegExp(search.trim());
      query.$or = [
        { studentName: { $regex: escapedQ, $options: 'i' } },
        { schoolAdmissionNumber: { $regex: escapedQ, $options: 'i' } },
        { uniqueStudentId: { $regex: escapedQ, $options: 'i' } },
        { username: { $regex: escapedQ, $options: 'i' } },
      ];
    }

    const students = await UserModel.find(query, { passwordHash: 0 });
    const sorted = formatDocs(students).sort((a: any, b: any) =>
      (a.studentName || '').localeCompare(b.studentName || '', undefined, { numeric: true, sensitivity: 'base' })
    );
    return res.json(sorted);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch student reports list' });
  }
});

// Helper to format date and time as DD-MM-YYYY | hh:mm A
function formatAssessmentDateTime(dateVal?: Date | string | null): string {
  if (!dateVal) return '—';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = pad(d.getMinutes());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursStr = pad(hours);
  return `${day}-${month}-${year} | ${hoursStr}:${minutes} ${ampm}`;
}

// Student Individual Report & Timeline
router.get('/reports/students/:studentId', authenticate, async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;

    const isMongoId = mongoose.Types.ObjectId.isValid(studentId);
    const student = await UserModel.findOne({
      $or: [
        { uniqueStudentId: studentId },
        { username: studentId },
        ...(isMongoId ? [{ _id: studentId }] : []),
      ],
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Student can only access their own report
    if (req.user!.role === 'student') {
      const isSelf = req.user!.studentId === student.uniqueStudentId || req.user!.username === student.username || req.user!.userId === student._id.toString();
      if (!isSelf) {
        return res.status(403).json({ error: 'Access forbidden: You can only view your own report' });
      }
    }

    // Finding 2 Fix: Enforce strict school tenant isolation for School Admins
    if (req.user!.role === 'school_admin' && student.schoolId !== req.user!.schoolId) {
      return res.status(403).json({ error: 'Access forbidden: You can only view reports for students in your own school' });
    }

    const targetStudentId = student?.uniqueStudentId || studentId;
    const assignments = await StudentTestAssignmentModel.find({
      $or: [
        { studentId: targetStudentId },
        { studentId },
      ],
    });

    // Sort assignments chronologically (oldest attempt first = Assessment - 1, then Assessment - 2, etc.)
    const sortedAssignments = [...assignments].sort((a, b) => {
      const timeA = new Date(a.createdAt || a.startedAt || a.completedAt || 0).getTime();
      const timeB = new Date(b.createdAt || b.startedAt || b.completedAt || 0).getTime();
      return timeA - timeB;
    });

    // Fetch published tests and publish histories to get exact assessment name, mode, and published timestamp
    const publishIds = Array.from(new Set(sortedAssignments.map((a) => a.publishedTestId).filter(Boolean)));
    const publishedTests = await PublishedTestModel.find({ _id: { $in: publishIds } }).lean();
    const pubMap = new Map<string, any>(publishedTests.map((pt: any) => [pt._id.toString(), pt]));
    const publishHistories = await PublishHistoryModel.find({ publishId: { $in: publishIds } }).lean();
    const histMap = new Map<string, any>(publishHistories.map((ph: any) => [ph.publishId, ph]));

    // Fetch only needed questions and groups for this student's attempts
    const neededQuestionIds = Array.from(
      new Set(
        sortedAssignments.flatMap((a) => (a.questions || []).map((q: any) => q.questionId).filter(Boolean))
      )
    );
    const relevantQuestions = neededQuestionIds.length > 0
      ? await QuestionModel.find({ _id: { $in: neededQuestionIds } }).lean()
      : [];
    const qMap = new Map<string, any>(relevantQuestions.map((q: any) => [q._id.toString(), q]));

    const neededGroupIds = Array.from(
      new Set(
        [
          ...relevantQuestions.map((q: any) => q.groupId),
          ...sortedAssignments.flatMap((a) => (a.questions || []).map((q: any) => q.groupId)),
        ].filter(Boolean)
      )
    );
    const relevantGroups = neededGroupIds.length > 0
      ? await QuestionGroupModel.find({ _id: { $in: neededGroupIds } }).lean()
      : [];
    const gMap = new Map<string, any>(relevantGroups.map((g: any) => [g._id.toString(), g]));

    // Timeline entries
    const timeline = sortedAssignments.map((a, idx) => {
      const assessmentNumber = idx + 1;
      const assessmentTitle = `Assessment - ${assessmentNumber}`;
      const effectiveDateObj =
        a.status === 'COMPLETED'
          ? a.completedAt || a.updatedAt || a.startedAt || a.createdAt
          : a.lockedAt || a.startedAt || a.updatedAt || a.createdAt;

      const formattedDate = formatAssessmentDateTime(effectiveDateObj);

      const pubTest = pubMap.get(a.publishedTestId);
      const hist = histMap.get(a.publishedTestId);
      const assessmentName = pubTest?.publishName || hist?.publishName || a.publishName || assessmentTitle;
      const publishMode = pubTest?.publishMode || hist?.publishMode || 'Selected Questions';
      const publishedCreatedAt = pubTest?.createdAt || hist?.createdAt || pubTest?.publishedAt || hist?.publishedAt || a.createdAt;

      return {
        assignmentId: a._id.toString(),
        publishedTestId: a.publishedTestId,
        studentId: a.studentId,
        studentName: student?.studentName || a.studentName,
        schoolAdmissionNumber: student?.schoolAdmissionNumber || a.schoolAdmissionNumber || '',
        assessmentNumber,
        assessmentTitle,
        testName: assessmentTitle,
        assessmentName,
        publishName: assessmentName,
        publishMode,
        publishedCreatedAt: publishedCreatedAt ? new Date(publishedCreatedAt).toISOString() : null,
        originalPublishName: a.publishName,
        status: a.status,
        exitType: (a.status === 'COMPLETED' || a.status === 'NOT_STARTED') ? null : (a.exitType === 'EXIT' || a.exitType === 'LOGOUT' ? a.exitType : null),
        completedAt: a.completedAt,
        startedAt: a.startedAt,
        lockedAt: a.lockedAt,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        date: formattedDate,
        formattedDateTime: formattedDate,
        scoreOutOf100: a.scoreOutOf100,
        totalPointsEarned: a.totalPointsEarned,
        correctCount: a.correctCount,
        wrongCount: a.wrongCount,
        totalTimeTakenSeconds: a.totalTimeTakenSeconds,
        questions: (a.questions || []).map((q: any) => {
          if (a.status === 'COMPLETED') {
            // For a COMPLETED assessment, preserve exactly the immutable historical snapshot used for that assessment.
            // Do NOT dynamically resolve the completed student's question from the current Question Bank.
            const isRanking = Boolean(
              q.isRanking ||
              q.isRankingQuestion ||
              String(q.questionType || '').toLowerCase() === 'ranking'
            );

            const reportQuestion = {
              ...q,
              questionId: q.questionId || q.id || q._id,
              groupName: q.groupName || 'General',
              difficulty: q.difficulty || 'Medium',
              isRanking,
              isRankingQuestion: isRanking,
              questionType: isRanking ? 'Ranking' : (q.questionType || (q.answerType === 'multiple' ? 'Multiple Selection' : 'Single Selection')),
              answerType: q.answerType || 'single',
              content: q.content || 'Question',
              points: q.points != null ? Number(q.points) : null,
              timeAllowedSeconds: q.timeAllowedSeconds != null ? Number(q.timeAllowedSeconds) : (q.timeSeconds != null ? Number(q.timeSeconds) : null),
              timeSeconds: q.timeAllowedSeconds != null ? Number(q.timeAllowedSeconds) : (q.timeSeconds != null ? Number(q.timeSeconds) : null),
              options: Array.isArray(q.options) ? q.options : [],
              correctAnswer: q.correctAnswer ?? null,
              correctAnswers: Array.isArray(q.correctAnswers)
                ? q.correctAnswers
                : (q.correctAnswer ? [String(q.correctAnswer)] : []),
              studentAnswer: q.studentAnswer !== undefined ? q.studentAnswer : null,
              isCorrect: Boolean(q.isCorrect),
              timeTakenSeconds: q.timeTakenSeconds != null ? Number(q.timeTakenSeconds) : 0,
              earnedPoints: q.earnedPoints != null ? Number(q.earnedPoints) : 0,
              assessorScore: q.assessorScore !== undefined ? q.assessorScore : (q.earnedPoints !== undefined ? q.earnedPoints : null),
              assessorNotes: q.assessorNotes || '',
              assessedBy: q.assessedBy || '',
              assessedAt: q.assessedAt || null,
              scoringGuide: q.scoringGuide || q.metadata?.scoringGuide,
              expectedResponse: q.expectedResponse || q.metadata?.expectedResponse,
              metadata: q.metadata || {},
              images: (Array.isArray(q.images) && q.images.length > 0) ? q.images : (q.questionId ? qMap.get(String(q.questionId))?.images : []) || [],
              imageLayout: q.imageLayout || (q.questionId ? qMap.get(String(q.questionId))?.imageLayout : 'auto') || 'auto',
            };
            return req.user!.role === 'student'
              ? serializeStudentQuestion(reportQuestion)
              : reportQuestion;
          }

          // SEC-CRIT-02: For NOT_STARTED, IN_PROGRESS, or non-completed assessments,
          // NEVER expose correctAnswer or correctAnswers!
          const qCopy = { ...q };
          delete qCopy.correctAnswer;
          delete qCopy.correctAnswers;

          const fullQ = q.questionId ? qMap.get(String(q.questionId)) : null;
          const groupFromId = q.groupId ? gMap.get(String(q.groupId))?.name : (fullQ?.groupId ? gMap.get(String(fullQ.groupId))?.name : null);
          const isRanking = Boolean(
            qCopy.isRanking ||
            qCopy.isRankingQuestion ||
            fullQ?.isRanking ||
            fullQ?.isRankingQuestion ||
            String(qCopy.questionType || fullQ?.questionType || '').toLowerCase() === 'ranking'
          );

          const reportQuestion = {
            ...qCopy,
            questionId: q.questionId || q.id || q._id,
            groupName: q.groupName || groupFromId || fullQ?.groupName || 'General',
            difficulty: q.difficulty || fullQ?.difficulty || 'Medium',
            isRanking,
            isRankingQuestion: isRanking,
            questionType: isRanking ? 'Ranking' : (q.questionType || fullQ?.questionType || (q.answerType === 'multiple' ? 'Multiple Selection' : 'Single Selection')),
            answerType: q.answerType || fullQ?.answerType || 'single',
            content: q.content || fullQ?.content || 'Question',
            points: q.points != null ? q.points : (fullQ?.points != null ? fullQ.points : null),
            timeAllowedSeconds: q.timeAllowedSeconds != null ? q.timeAllowedSeconds : (fullQ?.timeSeconds != null ? fullQ.timeSeconds : null),
            timeSeconds: q.timeAllowedSeconds != null ? q.timeAllowedSeconds : (fullQ?.timeSeconds != null ? fullQ.timeSeconds : null),
            options: q.options || fullQ?.options || [],
            images: (Array.isArray(q.images) && q.images.length > 0) ? q.images : (fullQ?.images || []),
            imageLayout: q.imageLayout || fullQ?.imageLayout || 'auto',
            studentAnswer: q.studentAnswer !== undefined ? q.studentAnswer : null,
            isCorrect: false,
            earnedPoints: 0,
            timeTakenSeconds: q.timeTakenSeconds != null ? Number(q.timeTakenSeconds) : 0,
            scoringGuide: q.scoringGuide || fullQ?.scoringGuide || q.metadata?.scoringGuide || fullQ?.metadata?.scoringGuide,
            expectedResponse: q.expectedResponse || fullQ?.expectedResponse || q.metadata?.expectedResponse || fullQ?.metadata?.expectedResponse,
          };
          return req.user!.role === 'student'
            ? serializeStudentQuestion(reportQuestion)
            : reportQuestion;
        }),
      };
    });

    return res.json({
      student: student ? {
        id: student._id.toString(),
        studentName: student.studentName,
        className: student.className,
        section: student.section,
        schoolAdmissionNumber: student.schoolAdmissionNumber,
        uniqueStudentId: student.uniqueStudentId,
        schoolName: student.schoolName,
      } : (sortedAssignments.length > 0 ? {
        id: targetStudentId,
        studentName: sortedAssignments[0].studentName || targetStudentId,
        className: sortedAssignments[0].className || '',
        section: sortedAssignments[0].section || '',
        schoolAdmissionNumber: sortedAssignments[0].schoolAdmissionNumber || targetStudentId,
        uniqueStudentId: targetStudentId,
        schoolName: sortedAssignments[0].schoolName || '',
      } : null),
      timeline,
    });
  } catch (err: any) {
    console.error('[Student Report Error]:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch student report' });
  }
});

// Assessor Manual Scoring and Notes
router.put(
  '/assessments/:assignmentId/questions/:questionId/score',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { assignmentId, questionId } = req.params;
      const { score, notes } = req.body;

      if (req.user!.role === 'student') {
        return res.status(403).json({ error: 'Students cannot score assessments.' });
      }

      if (score === undefined || score === null || isNaN(Number(score)) || Number(score) < 0) {
        return res.status(400).json({ error: 'A valid non-negative score number is required.' });
      }

      const assignment = await StudentTestAssignmentModel.findById(assignmentId);
      if (!assignment) {
        return res.status(404).json({ error: 'Assessment not found.' });
      }

      // School tenant isolation: school_admin can only score students in their own school
      if (req.user!.role === 'school_admin' && assignment.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ error: 'Access forbidden: You can only score assessments in your own school.' });
      }

      const qIdx = assignment.questions.findIndex(
        (q: any) => String(q.questionId || q.id || q._id) === String(questionId)
      );
      if (qIdx === -1) {
        return res.status(404).json({ error: 'Question not found in this assessment.' });
      }

      const qItem = assignment.questions[qIdx];
      const parsedScore = Number(score);

      const maxPts = qItem.points != null && Number(qItem.points) > 0 ? Number(qItem.points) : null;
      if (maxPts !== null && parsedScore > maxPts) {
        return res.status(400).json({ error: `Score cannot exceed the question's maximum points (${maxPts} pts).` });
      }

      // Update question score and notes
      qItem.assessorScore = parsedScore;
      qItem.earnedPoints = parsedScore;
      qItem.assessorNotes = typeof notes === 'string' ? notes.trim() : (notes || '');
      qItem.assessedBy = req.user!.username || 'Assessor';
      qItem.assessedAt = new Date().toISOString();
      if (parsedScore > 0) {
        qItem.isCorrect = true;
      } else if (parsedScore === 0 && maxPts !== null && maxPts > 0) {
        qItem.isCorrect = false;
      }

      // Recalculate assessment totals
      let earnedPointsTotal = 0;
      let possiblePointsTotal = 0;
      let correctCount = 0;
      let wrongCount = 0;

      for (const q of assignment.questions) {
        const hasPoints = q.points != null && !isNaN(Number(q.points)) && Number(q.points) > 0;
        const hasAutoAnswer = hasAutomaticallyScorableAnswer(q);
        const hasAssessorScore = q.assessorScore != null && !isNaN(Number(q.assessorScore));

        if (hasAutoAnswer || hasAssessorScore) {
          if (hasPoints) {
            possiblePointsTotal += Number(q.points);
          }
        }

        if (hasAssessorScore) {
          earnedPointsTotal += Number(q.assessorScore);
          if (Number(q.assessorScore) > 0) {
            correctCount++;
          } else {
            wrongCount++;
          }
        } else if (hasAutoAnswer) {
          if (q.isCorrect) {
            earnedPointsTotal += (q.earnedPoints != null && !isNaN(Number(q.earnedPoints)) ? Number(q.earnedPoints) : (hasPoints ? Number(q.points) : 0));
            correctCount++;
          } else {
            wrongCount++;
          }
        }
      }

      const calculatedScore = possiblePointsTotal > 0 ? Math.round((earnedPointsTotal / possiblePointsTotal) * 100) : 0;
      const finalScore = Number.isFinite(calculatedScore) ? calculatedScore : 0;

      assignment.totalPointsEarned = earnedPointsTotal;
      assignment.correctCount = correctCount;
      assignment.wrongCount = wrongCount;
      assignment.scoreOutOf100 = finalScore;
      assignment.markModified('questions');
      await assignment.save();

      // Synchronize student's score in PublishHistoryModel
      try {
        await PublishHistoryModel.updateOne(
          {
            publishId: assignment.publishedTestId,
            'studentsStatus.studentId': assignment.studentId,
          },
          {
            $set: {
              'studentsStatus.$.scoreOutOf100': finalScore,
            },
          }
        );
      } catch (hErr: any) {
        console.error('[PublishHistory Score Sync Error]:', hErr.message);
      }

      return res.json({
        success: true,
        message: 'Score and notes saved successfully.',
        assignmentId: assignment._id.toString(),
        questionId,
        assessorScore: parsedScore,
        assessorNotes: qItem.assessorNotes,
        totalPointsEarned: earnedPointsTotal,
        scoreOutOf100: finalScore,
        question: qItem,
      });
    } catch (err: any) {
      console.error('[Assessor Score Error]:', err.message || err);
      return res.status(500).json({ error: 'Failed to save score and notes.' });
    }
  }
);

// ==========================================
// 12. ASSESSMENT TEMPLATES
// ==========================================

// List all templates
router.get('/templates', authenticate, requireRole('super_admin'), async (_req: Request, res: Response) => {
  try {
    const templates = await AssessmentTemplateModel.find().sort({ createdAt: -1 });
    return res.json(formatDocs(templates));
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Create a new template
router.post('/templates', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const {
      name,
      publishMode,
      selectedQuestionIds = [],
      randomSelectedDifficulties = [],
      shuffleQuestions = false,
      randomCount = 5,
      targets = [],
    } = req.body;

    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      return res.status(400).json({ error: 'Template Name is required.' });
    }

    // Check duplicate template name (case-insensitive)
    const existing = await AssessmentTemplateModel.findOne({
      name: { $regex: new RegExp(`^${escapeRegExp(trimmedName)}$`, 'i') },
    });

    if (existing) {
      return res.status(400).json({
        error: `A template named '${trimmedName}' already exists. Please choose a different unique name.`,
      });
    }

    if (!publishMode || !['Selected Questions', 'Random Questions'].includes(publishMode)) {
      return res.status(400).json({ error: 'Valid Publish Mode is required.' });
    }

    if (publishMode === 'Selected Questions' && (!selectedQuestionIds || selectedQuestionIds.length === 0)) {
      return res.status(400).json({ error: 'Please select at least 1 question before saving the template.' });
    }

    if (publishMode === 'Random Questions') {
      if ((!selectedQuestionIds || selectedQuestionIds.length === 0) && (!randomSelectedDifficulties || randomSelectedDifficulties.length === 0)) {
        return res.status(400).json({ error: 'Please select at least 1 Group and Difficulty for Random Questions mode.' });
      }
    }

    const cleanTargets = Array.isArray(targets)
      ? targets.map((t: any, idx: number) => ({
          id: t.id || `target-${Date.now()}-${idx}`,
          selectedSchoolIds: Array.isArray(t.selectedSchoolIds) ? t.selectedSchoolIds : ['ALL'],
          selectedClasses: Array.isArray(t.selectedClasses) ? t.selectedClasses : ['ALL'],
          selectedSections: Array.isArray(t.selectedSections) ? t.selectedSections : [],
          selectedStudentIds: Array.isArray(t.selectedStudentIds) ? t.selectedStudentIds : [],
        }))
      : [];

    const newTemplate = await AssessmentTemplateModel.create({
      name: trimmedName,
      publishMode,
      selectedQuestionIds: Array.isArray(selectedQuestionIds) ? selectedQuestionIds : [],
      randomSelectedDifficulties: Array.isArray(randomSelectedDifficulties) ? randomSelectedDifficulties : [],
      shuffleQuestions: Boolean(shuffleQuestions),
      randomCount: Number(randomCount) || 5,
      targets: cleanTargets,
      createdBy: req.user?.username || 'san',
    });

    return res.status(201).json({
      message: `Template '${trimmedName}' saved successfully.`,
      template: formatDoc(newTemplate),
    });
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(400).json({
        error: 'A template with this name already exists. Please choose a unique name.',
      });
    }
    return res.status(500).json({ error: 'Failed to save template' });
  }
});

// Delete a template
router.delete('/templates/:id', authenticate, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let deleted = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      deleted = await AssessmentTemplateModel.findByIdAndDelete(id);
    }
    if (!deleted) {
      deleted = await AssessmentTemplateModel.findOneAndDelete({
        $or: [{ _id: id }, { name: id }].filter(Boolean),
      });
    }
    if (!deleted) {
      return res.status(404).json({ error: 'Template not found' });
    }
    return res.json({ message: 'Template deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Fallback error-handling middleware for API router to guarantee JSON error responses
router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum file size is 5 MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(err.status || 400).json({ error: err.message || 'Request processing failed' });
  }
  _next();
});

export default router;
