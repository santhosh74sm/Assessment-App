import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import type { QuestionAttemptLog, QuestionImage } from '../src/types.ts';

// ==========================================
// 1. USER SCHEMA & MODEL
// ==========================================
export interface IUserDocument extends Document {
  id?: string;
  username: string;
  role: 'super_admin' | 'school_admin' | 'student';
  passwordHash: string;
  mustChangePassword: boolean;
  passwordResetRequested?: boolean;
  passwordResetRequestedAt?: Date;
  schoolId?: string;
  schoolName?: string;
  studentName?: string;
  className?: string;
  section?: string;
  schoolAdmissionNumber?: string;
  uniqueStudentId?: string;
  tokenVersion?: number;
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = new Schema<IUserDocument>(
  {
    username: { type: String, required: true, unique: true, index: true },
    role: { type: String, required: true, enum: ['super_admin', 'school_admin', 'student'], index: true },
    passwordHash: { type: String, required: true },
    mustChangePassword: { type: Boolean, default: true },
    passwordResetRequested: { type: Boolean, default: false, index: true },
    passwordResetRequestedAt: { type: Date },
    schoolId: { type: String, index: true },
    schoolName: { type: String },
    studentName: { type: String },
    className: { type: String, index: true },
    section: { type: String, index: true },
    schoolAdmissionNumber: { type: String, trim: true },
    uniqueStudentId: { type: String, index: true },
    tokenVersion: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

UserSchema.index({ role: 1, schoolId: 1, className: 1, section: 1 });
UserSchema.index(
  { schoolId: 1, schoolAdmissionNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      role: 'student',
      schoolId: { $type: 'string' },
      schoolAdmissionNumber: { $type: 'string' },
    },
  }
);

// ==========================================
// 2. SCHOOL SCHEMA & MODEL
// ==========================================
export interface ISchoolDocument extends Document {
  id?: string;
  name: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
}

export const SchoolSchema = new Schema<ISchoolDocument>(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true, uppercase: true, index: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ==========================================
// 3. QUESTION GROUP SCHEMA & MODEL
// ==========================================
export interface IQuestionGroupDocument extends Document {
  id?: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const QuestionGroupSchema = new Schema<IQuestionGroupDocument>(
  {
    name: { type: String, required: true, unique: true, index: true },
    description: { type: String, default: '' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ==========================================
// 4. QUESTION SCHEMA & MODEL
// ==========================================
export interface IQuestionDocument extends Document {
  id?: string;
  groupId: string;
  groupName: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  questionType?: string;
  answerType?: 'single' | 'multiple';
  isRanking?: boolean;
  isRankingQuestion?: boolean;
  content: string;
  timeSeconds?: number | null;
  points?: number | null;
  options: string[];
  correctAnswer?: unknown;
  correctAnswers?: string[];
  enableWrittenExplanation?: boolean;
  defaultInput?: boolean;
  scoringGuide?: string;
  expectedResponse?: unknown;
  images?: QuestionImage[];
  imageLayout?: 'single_top' | 'comparison' | 'options_grid' | 'auto';
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const QuestionSchema = new Schema<IQuestionDocument>(
  {
    groupId: { type: String, required: true, index: true },
    groupName: { type: String, required: true },
    difficulty: { type: String, required: true, enum: ['Easy', 'Medium', 'Hard'], index: true },
    questionType: { type: String, required: false },
    answerType: { type: String, enum: ['single', 'multiple'], default: 'single' },
    isRanking: { type: Boolean, default: false },
    isRankingQuestion: { type: Boolean, default: false },
    content: { type: String, required: true },
    timeSeconds: { type: Number, required: false, default: null },
    points: { type: Number, required: false, default: null },
    options: { type: [String], default: [] },
    correctAnswer: { type: Schema.Types.Mixed, required: false, default: null },
    correctAnswers: { type: [String], default: [] },
    enableWrittenExplanation: { type: Boolean, default: false },
    defaultInput: { type: Boolean, default: true },
    scoringGuide: { type: String, required: false },
    expectedResponse: { type: Schema.Types.Mixed, required: false },
    images: { type: [Schema.Types.Mixed], default: [] },
    imageLayout: {
      type: String,
      enum: ['single_top', 'comparison', 'options_grid', 'auto'],
      default: 'auto',
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

QuestionSchema.index({ groupId: 1, difficulty: 1, createdAt: -1 });

// ==========================================
// 5. PUBLISHED TEST SCHEMA & MODEL
// ==========================================
export interface IPublishedTestDocument extends Document {
  id?: string;
  idempotencyKey?: string;
  requestFingerprint?: string;
  publishState?: 'PUBLISHING' | 'COMPLETE' | 'FAILED';
  failureReason?: string;
  failedAt?: Date;
  publishName: string;
  publishMode: 'Selected Questions' | 'Random Questions';
  target: {
    schoolId: string;
    schoolIds?: string[];
    schoolName?: string;
    schoolNames?: string[];
    classes: string[];
    sections: string[];
    studentIds?: string[];
  };
  targets?: Array<{
    schoolIds: string[];
    schoolNames?: string[];
    classes: string[];
    sections: string[];
    studentIds?: string[];
  }>;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  shuffle: boolean;
  questionIds: string[];
  questionsSnapshot?: QuestionAttemptLog[];
  randomCount?: number;
  createdBy?: string;
  status?: 'ACTIVE' | 'PAUSED';
  isPaused?: boolean;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const PublishedTestSchema = new Schema<IPublishedTestDocument>(
  {
    publishName: { type: String, required: true, index: true },
    idempotencyKey: { type: String },
    requestFingerprint: { type: String },
    publishState: { type: String, enum: ['PUBLISHING', 'COMPLETE', 'FAILED'] },
    failureReason: { type: String },
    failedAt: { type: Date },
    publishMode: { type: String, required: true, enum: ['Selected Questions', 'Random Questions'] },
    status: { type: String, enum: ['ACTIVE', 'PAUSED'], default: 'ACTIVE', index: true },
    isPaused: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date },
    target: {
      schoolId: { type: String, default: '', index: true },
      schoolIds: { type: [String], default: [] },
      schoolName: { type: String, default: '' },
      schoolNames: { type: [String], default: [] },
      classes: { type: [String], default: [] },
      sections: { type: [String], default: [] },
      studentIds: { type: [String], default: [] },
    },
    targets: {
      type: [
        {
          schoolIds: { type: [String], default: [] },
          schoolNames: { type: [String], default: [] },
          classes: { type: [String], default: [] },
          sections: { type: [String], default: [] },
          studentIds: { type: [String], default: [] },
        },
      ],
      default: [],
    },
    startDate: { type: String, required: true },
    startTime: { type: String, required: true },
    endDate: { type: String, required: true },
    endTime: { type: String, required: true },
    shuffle: { type: Boolean, default: false },
    questionIds: { type: [String], default: [] },
    questionsSnapshot: [{ type: Schema.Types.Mixed }],
    randomCount: { type: Number, default: 5 },
    createdBy: { type: String, default: 'san' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

PublishedTestSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

// ==========================================
// 6. STUDENT TEST ASSIGNMENT SCHEMA & MODEL
// ==========================================
export interface IStudentTestAssignmentDocument extends Document {
  id?: string;
  publishedTestId: string;
  publishName: string;
  studentId: string;
  studentName: string;
  schoolAdmissionNumber?: string;
  schoolId: string;
  schoolName: string;
  className: string;
  section: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'INCOMPLETE' | 'LOCKED_INCOMPLETE';
  exitType?: 'EXIT' | 'LOGOUT' | string | null;
  scoreOutOf100: number;
  totalPointsEarned: number;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  totalTimeTakenSeconds: number;
  questions: QuestionAttemptLog[];
  startedAt?: Date;
  completedAt?: Date;
  lockedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const StudentTestAssignmentSchema = new Schema<IStudentTestAssignmentDocument>(
  {
    publishedTestId: { type: String, required: true, index: true },
    publishName: { type: String, required: true },
    studentId: { type: String, required: true, index: true },
    studentName: { type: String, default: '' },
    schoolAdmissionNumber: { type: String, default: '' },
    schoolId: { type: String, required: true, index: true },
    schoolName: { type: String, default: '' },
    className: { type: String, required: true },
    section: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'INCOMPLETE', 'LOCKED_INCOMPLETE'],
      default: 'NOT_STARTED',
      index: true,
    },
    exitType: {
      type: String,
      enum: ['EXIT', 'LOGOUT', null],
      default: null,
      index: true,
    },
    scoreOutOf100: { type: Number, default: 0 },
    totalPointsEarned: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },
    totalTimeTakenSeconds: { type: Number, default: 0 },
    questions: [{ type: Schema.Types.Mixed }],
    startedAt: { type: Date },
    completedAt: { type: Date },
    lockedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound Unique Index: prevents duplicate assignments of the same test to the same student
StudentTestAssignmentSchema.index({ publishedTestId: 1, studentId: 1 }, { unique: true });
StudentTestAssignmentSchema.index({ studentId: 1, createdAt: -1 });
StudentTestAssignmentSchema.index({ schoolId: 1, status: 1 });
StudentTestAssignmentSchema.index({ publishedTestId: 1, schoolId: 1 });

// ==========================================
// 7. PUBLISH HISTORY SCHEMA & MODEL
// ==========================================
export interface IPublishHistoryDocument extends Document {
  id?: string;
  publishId: string;
  publishName: string;
  date: string;
  time: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  schoolId: string;
  schoolName: string;
  schoolIds?: string[];
  schoolNames?: string[];
  classes: string[];
  sections: string[];
  totalRecipients: number;
  targets?: Array<{
    schoolIds: string[];
    schoolNames?: string[];
    classes: string[];
    sections: string[];
  }>;
  publishMode: 'Selected Questions' | 'Random Questions';
  shuffle?: boolean;
  assignedQuestionsCount: number;
  questionIds?: string[];
  questionsSnapshot?: QuestionAttemptLog[];
  randomCount?: number;
  completedCount: number;
  incompleteCount: number;
  studentsStatus: any[];
  status?: 'ACTIVE' | 'PAUSED';
  isPaused?: boolean;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const PublishHistorySchema = new Schema<IPublishHistoryDocument>(
  {
    publishId: { type: String, required: true, unique: true, index: true },
    publishName: { type: String, required: true },
    status: { type: String, enum: ['ACTIVE', 'PAUSED'], default: 'ACTIVE', index: true },
    isPaused: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date },
    date: { type: String, required: true },
    time: { type: String, required: true },
    startDate: { type: String, required: false },
    startTime: { type: String, required: false },
    endDate: { type: String, required: false },
    endTime: { type: String, required: false },
    schoolId: { type: String, required: true, index: true },
    schoolName: { type: String, required: true },
    schoolIds: { type: [String], default: [] },
    schoolNames: { type: [String], default: [] },
    classes: { type: [String], default: [] },
    sections: { type: [String], default: [] },
    totalRecipients: { type: Number, default: 0 },
    targets: {
      type: [
        {
          schoolIds: { type: [String], default: [] },
          schoolNames: { type: [String], default: [] },
          classes: { type: [String], default: [] },
          sections: { type: [String], default: [] },
        },
      ],
      default: [],
    },
    publishMode: { type: String, required: true },
    assignedQuestionsCount: { type: Number, default: 0 },
    questionIds: { type: [String], default: [] },
    questionsSnapshot: [{ type: Schema.Types.Mixed }],
    randomCount: { type: Number },
    completedCount: { type: Number, default: 0 },
    incompleteCount: { type: Number, default: 0 },
    studentsStatus: [{ type: Schema.Types.Mixed }],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

PublishHistorySchema.index({ updatedAt: -1, createdAt: -1 });
export const UserModel = mongoose.models.User || mongoose.model<IUserDocument>('User', UserSchema);
export const SchoolModel = mongoose.models.School || mongoose.model<ISchoolDocument>('School', SchoolSchema);
export const QuestionGroupModel = mongoose.models.QuestionGroup || mongoose.model<IQuestionGroupDocument>('QuestionGroup', QuestionGroupSchema);
export const QuestionModel = mongoose.models.Question || mongoose.model<IQuestionDocument>('Question', QuestionSchema);
export const PublishedTestModel = mongoose.models.PublishedTest || mongoose.model<IPublishedTestDocument>('PublishedTest', PublishedTestSchema);
export const StudentTestAssignmentModel = mongoose.models.StudentTestAssignment || mongoose.model<IStudentTestAssignmentDocument>('StudentTestAssignment', StudentTestAssignmentSchema);
export const PublishHistoryModel = mongoose.models.PublishHistory || mongoose.model<IPublishHistoryDocument>('PublishHistory', PublishHistorySchema);

// ==========================================
// 8. ASSESSMENT TEMPLATE SCHEMA & MODEL
// ==========================================
export interface IAssessmentTemplateDocument extends Document {
  id?: string;
  name: string;
  publishMode: 'Selected Questions' | 'Random Questions';
  selectedQuestionIds: string[];
  randomSelectedDifficulties?: string[];
  shuffleQuestions: boolean;
  randomCount: number;
  targets: Array<{
    id?: string;
    selectedSchoolIds: string[];
    selectedClasses: string[];
    selectedSections: string[];
    selectedStudentIds: string[];
  }>;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const AssessmentTemplateSchema = new Schema<IAssessmentTemplateDocument>(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    publishMode: { type: String, required: true, enum: ['Selected Questions', 'Random Questions'] },
    selectedQuestionIds: { type: [String], default: [] },
    randomSelectedDifficulties: { type: [String], default: [] },
    shuffleQuestions: { type: Boolean, default: false },
    randomCount: { type: Number, default: 5 },
    targets: {
      type: [
        {
          id: { type: String },
          selectedSchoolIds: { type: [String], default: [] },
          selectedClasses: { type: [String], default: [] },
          selectedSections: { type: [String], default: [] },
          selectedStudentIds: { type: [String], default: [] },
        },
      ],
      default: [],
    },
    createdBy: { type: String, default: 'san' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const AssessmentTemplateModel =
  mongoose.models.AssessmentTemplate ||
  mongoose.model<IAssessmentTemplateDocument>('AssessmentTemplate', AssessmentTemplateSchema);

