import { randomInt } from 'node:crypto';

import type { QuestionAttemptLog, ScorableQuestionLike, StudentAnswerValue } from '../types.ts';

export interface SerializedStudentQuestion {
  questionId?: string;
  id?: string;
  groupId?: string;
  groupName?: string;
  difficulty?: string;
  questionType?: string;
  answerType?: string;
  content?: string;
  timeSeconds?: number | null;
  timeAllowedSeconds?: number | null;
  points?: number | null;
  options?: string[];
  studentAnswer?: StudentAnswerValue;
  writtenExplanation?: string;
  timeTakenSeconds?: number;
  isRanking?: boolean;
  isRankingQuestion?: boolean;
  imageLayout?: string;
  defaultInput?: boolean;
  enableWrittenExplanation?: boolean;
  images: Array<{
    id: string;
    url: string;
    label?: string;
    caption?: string;
    order: number;
    role: 'option' | 'question';
    optionIndex?: number;
  }>;
  pairs?: Array<{ left?: string; right?: string }>;
  [key: string]: unknown;
}

/**
 * Student payloads are intentionally allowlisted. Question metadata is a mixed
 * source field and must never be spread into a student response.
 */
export function serializeStudentQuestion(
  question: ScorableQuestionLike | QuestionAttemptLog | Record<string, unknown> | null | undefined
): SerializedStudentQuestion {
  const q = question as Record<string, unknown> | null | undefined;
  const source: Record<string, unknown> = (q && typeof q.toObject === 'function')
    ? (q.toObject({ transform: true }) as Record<string, unknown>)
    : q || {};
  const questionId = source.questionId || source.id || source._id;
  const safe: SerializedStudentQuestion = { images: [] };

  const allowedFields = [
    'groupId',
    'groupName',
    'difficulty',
    'questionType',
    'answerType',
    'content',
    'timeSeconds',
    'timeAllowedSeconds',
    'points',
    'options',
    'studentAnswer',
    'writtenExplanation',
    'timeTakenSeconds',
    'isRanking',
    'isRankingQuestion',
    'imageLayout',
    'defaultInput',
  ];

  if (questionId != null) {
    safe.questionId = String(questionId);
    safe.id = String(questionId);
  }

  for (const field of allowedFields) {
    if (source[field] !== undefined) safe[field] = source[field];
  }

  // Sanitize images: pass only public/safe fields (id, url, label, caption, order, role, optionIndex)
  if (Array.isArray(source.images) && source.images.length > 0) {
    safe.images = source.images.map((img: unknown) => {
      const i = (img && typeof img === 'object') ? (img as Record<string, unknown>) : {};
      return {
        id: String(i.id || i._id || ''),
        url: String(i.url || ''),
        label: i.label ? String(i.label) : undefined,
        caption: i.caption ? String(i.caption) : undefined,
        order: typeof i.order === 'number' ? i.order : 0,
        role: i.role === 'option' ? 'option' : 'question',
        optionIndex: typeof i.optionIndex === 'number' ? i.optionIndex : undefined,
      };
    });
  } else {
    safe.images = [];
  }

  // Always supply a boolean for enableWrittenExplanation (default false for older questions)
  safe.enableWrittenExplanation = Boolean(source.enableWrittenExplanation);

  // Backward compatibility: defaultInput defaults to true if undefined or missing
  safe.defaultInput = source.defaultInput !== undefined ? Boolean(source.defaultInput) : true;

  // Supply boolean for isRanking / isRankingQuestion
  const isRanking = Boolean(
    source.isRanking ||
    source.isRankingQuestion ||
    (typeof source.questionType === 'string' && source.questionType.toLowerCase() === 'ranking')
  );
  safe.isRanking = isRanking;
  safe.isRankingQuestion = isRanking;

  const metadata = source.metadata as Record<string, unknown> | undefined;
  const pairs = (source.pairs ?? metadata?.pairs) as Array<{ left?: string; right?: string }> | undefined;
  if (Array.isArray(pairs) && pairs.length >= 2 && pairs.every((pair) =>
    pair && typeof pair.left === 'string' && typeof pair.right === 'string'
  )) {
    // Keep the existing matching UI, but break the source left/right mapping.
    // A non-zero cyclic offset is a derangement, so the original key is never sent.
    const offset = randomInt(1, pairs.length);
    safe.pairs = pairs.map((pair, index) => ({
      left: pair.left,
      right: pairs[(index + offset) % pairs.length]?.right,
    }));
  }

  return safe;
}

/** Keep the existing full assessor/admin representation; restrict only student callers. */
export function serializeQuestionForRole(
  question: ScorableQuestionLike | Record<string, unknown> | null | undefined,
  role?: string
): unknown {
  if (role === 'student') return serializeStudentQuestion(question);
  const q = question as Record<string, unknown> | null | undefined;
  return (q && typeof q.toObject === 'function')
    ? q.toObject({ transform: true })
    : question;
}


