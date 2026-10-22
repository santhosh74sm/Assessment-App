export type UserRole = 'super_admin' | 'school_admin' | 'student';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  passwordHash: string;
  mustChangePassword: boolean;
  schoolId?: string;
  schoolName?: string;
  // Student attributes
  studentName?: string;
  className?: string;
  section?: string;
  schoolAdmissionNumber?: string;
  uniqueStudentId?: string; // App number
  createdAt: string;
  updatedAt: string;
}

export interface School {
  id: string;
  name: string;
  code: string;
  createdAt: string;
}

export type QuestionDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface QuestionGroup {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface MatchPair {
  left: string;
  right: string;
}

export type AnswerType = 'single' | 'multiple';

export interface QuestionImage {
  id: string;
  url: string;
  s3Key: string;
  label?: string;
  caption?: string;
  order: number;
  role?: 'question' | 'option';
  optionIndex?: number;
}

export type QuestionImageLayout = 'single_top' | 'comparison' | 'options_grid' | 'auto';

export interface Question {
  id: string;
  groupId: string;
  groupName: string;
  difficulty: QuestionDifficulty;
  questionType?: string;
  answerType?: AnswerType;
  isRanking?: boolean;
  isRankingQuestion?: boolean;
  content: string;
  timeSeconds?: number | null;
  points?: number | null;
  options?: string[];
  correctAnswer?: any; // string, number, or record of match pairs
  correctAnswers?: string[];
  enableWrittenExplanation?: boolean;
  scoringGuide?: string;
  expectedResponse?: any;
  images?: QuestionImage[];
  imageLayout?: QuestionImageLayout;
  metadata?: Record<string, any>;
  createdAt: string;
}

export type PublishMode = 'Selected Questions' | 'Random Questions';

export interface TargetConfig {
  schoolIds: string[];
  schoolNames?: string[];
  classes: string[];
  sections: string[];
}

export interface PublishTarget {
  schoolId: string;
  schoolIds?: string[];
  schoolName?: string;
  schoolNames?: string[];
  classes?: string[]; // Empty means all classes
  sections?: string[]; // Empty means all sections
  studentIds?: string[]; // Empty means all students in target
  targets?: TargetConfig[];
}

export interface PublishedTest {
  id: string;
  publishName: string;
  publishMode: PublishMode;
  target: PublishTarget;
  targets?: TargetConfig[];
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  questionIds: string[]; // for Selected, or resolved pool
  randomCount?: number;
  shuffle: boolean;
  createdAt: string;
  createdBy: string;
}

export type TestAttemptStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'INCOMPLETE' | 'LOCKED_INCOMPLETE';
export type ExitType = 'EXIT' | 'LOGOUT' | null;

export interface QuestionAttemptLog {
  questionId: string;
  groupName: string;
  difficulty: QuestionDifficulty;
  questionType?: string;
  answerType?: AnswerType;
  isRanking?: boolean;
  isRankingQuestion?: boolean;
  content: string;
  points?: number | null;
  studentAnswer: any;
  writtenExplanation?: string;
  enableWrittenExplanation?: boolean;
  correctAnswer?: any;
  correctAnswers?: string[];
  isCorrect?: boolean;
  timeAllowedSeconds?: number | null;
  timeSeconds?: number | null;
  timeTakenSeconds: number;
  earnedPoints?: number;
  assessorScore?: number | null;
  assessorNotes?: string;
  assessedBy?: string;
  assessedAt?: string;
  scoringGuide?: string;
  expectedResponse?: any;
  options?: string[];
  images?: QuestionImage[];
  imageLayout?: QuestionImageLayout;
  metadata?: Record<string, any>;
}

export interface StudentTestAssignment {
  id: string;
  assignmentId?: string;
  publishedTestId: string;
  publishName: string;
  studentId: string;
  studentName: string;
  schoolId: string;
  schoolName: string;
  className: string;
  section: string;
  status: TestAttemptStatus;
  exitType?: 'EXIT' | 'LOGOUT' | string | null;
  canStart?: boolean;
  isUpcoming?: boolean;
  isExpired?: boolean;
  startedAt?: string;
  completedAt?: string;
  lockedAt?: string;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  totalPointsEarned: number;
  scoreOutOf100: number;
  totalTimeTakenSeconds: number;
  questions: QuestionAttemptLog[];
}

export interface PublishHistoryRecord {
  id: string;
  publishId: string;
  publishName: string;
  date: string;
  time: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  createdAt?: string;
  schoolId: string;
  schoolName: string;
  schoolIds?: string[];
  schoolNames?: string[];
  classes: string[];
  sections: string[];
  totalRecipients: number;
  targets?: TargetConfig[];
  publishMode: PublishMode;
  shuffle?: boolean;
  assignedQuestionsCount: number;
  completedCount: number;
  incompleteCount: number;
  studentsStatus: {
    studentId: string;
    studentName: string;
    assessmentName?: string;
    className: string;
    section: string;
    status: TestAttemptStatus;
    exitType?: 'EXIT' | 'LOGOUT' | string | null;
    completionDate?: string;
    completionTime?: string;
    scoreOutOf100?: number;
  }[];
}

export interface AssessmentTemplate {
  id: string;
  name: string;
  publishMode: PublishMode;
  selectedQuestionIds: string[];
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
  createdAt: string;
  updatedAt: string;
}

