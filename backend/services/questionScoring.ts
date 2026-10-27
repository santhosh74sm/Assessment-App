import type { ScorableQuestionLike } from '../types.ts';

/**
 * Evaluates whether a question has a configured correct answer key
 * and can be scored by the automatic assessment scorer.
 */
export function hasAutomaticallyScorableAnswer(question: ScorableQuestionLike | unknown): boolean {
  if (!question || typeof question !== 'object') return false;
  const q = question as ScorableQuestionLike;
  const isRanking = Boolean(
    q.isRanking ||
    q.isRankingQuestion ||
    String(q.questionType || '').toLowerCase() === 'ranking'
  );

  if (isRanking) {
    // Ranking questions must NOT be automatically marked right or wrong when no fixed correct order is defined.
    // Free text in expectedResponse or scoringGuide is for assessor review, not automatic grading.
    // Never invent a correct ranking or scoring rule.
    const explicitOrder =
      q.metadata?.expectedOrder ??
      q.correctAnswers ??
      q.correctAnswer;

    if (Array.isArray(explicitOrder) && explicitOrder.length > 0) {
      return true;
    }
    if (typeof explicitOrder === 'string' && explicitOrder.trim() !== '' && explicitOrder.includes(',')) {
      return true;
    }
    return false;
  }

  return (
    (q.correctAnswer !== undefined &&
      q.correctAnswer !== null &&
      String(q.correctAnswer).trim() !== '') ||
    (Array.isArray(q.correctAnswers) && q.correctAnswers.length > 0)
  );
}
