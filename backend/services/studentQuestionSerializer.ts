import { randomInt } from 'node:crypto';

/**
 * Student payloads are intentionally allowlisted. Question metadata is a mixed
 * source field and must never be spread into a student response.
 */
export function serializeStudentQuestion(question: any): Record<string, any> {
  const source = question?.toObject ? question.toObject({ transform: true }) : question || {};
  const questionId = source.questionId || source.id || source._id;
  const safe: Record<string, any> = {};

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
    safe.images = source.images.map((img: any) => ({
      id: String(img.id || img._id || ''),
      url: String(img.url || ''),
      label: img.label ? String(img.label) : undefined,
      caption: img.caption ? String(img.caption) : undefined,
      order: typeof img.order === 'number' ? img.order : 0,
      role: img.role === 'option' ? 'option' : 'question',
      optionIndex: typeof img.optionIndex === 'number' ? img.optionIndex : undefined,
    }));
  } else {
    safe.images = [];
  }

  // Always supply a boolean for enableWrittenExplanation (default false for older questions)
  safe.enableWrittenExplanation = Boolean(source.enableWrittenExplanation);

  // Backward compatibility: defaultInput defaults to true if undefined or missing
  safe.defaultInput = source.defaultInput !== undefined ? Boolean(source.defaultInput) : true;

  // Supply boolean for isRanking / isRankingQuestion
  const isRanking = Boolean(source.isRanking || source.isRankingQuestion || source.questionType?.toLowerCase() === 'ranking');
  safe.isRanking = isRanking;
  safe.isRankingQuestion = isRanking;

  const pairs = source.pairs ?? source.metadata?.pairs;
  if (Array.isArray(pairs) && pairs.length >= 2 && pairs.every((pair) =>
    pair && typeof pair.left === 'string' && typeof pair.right === 'string'
  )) {
    // Keep the existing matching UI, but break the source left/right mapping.
    // A non-zero cyclic offset is a derangement, so the original key is never sent.
    const offset = randomInt(1, pairs.length);
    safe.pairs = pairs.map((pair, index) => ({
      left: pair.left,
      right: pairs[(index + offset) % pairs.length].right,
    }));
  }

  return safe;
}

/** Keep the existing full assessor/admin representation; restrict only student callers. */
export function serializeQuestionForRole(question: any, role?: string): any {
  if (role === 'student') return serializeStudentQuestion(question);
  return question?.toObject ? question.toObject({ transform: true }) : question;
}


