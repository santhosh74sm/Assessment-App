/**
 * Evaluates whether a question has a configured correct answer key
 * and can be scored by the automatic assessment scorer.
 */
export function hasAutomaticallyScorableAnswer(question: any): boolean {
  const isRanking = Boolean(
    question?.isRanking ||
    question?.isRankingQuestion ||
    String(question?.questionType || '').toLowerCase() === 'ranking'
  );

  if (isRanking) {
    // Ranking questions must NOT be automatically marked right or wrong when no fixed correct order is defined.
    // Free text in expectedResponse or scoringGuide is for assessor review, not automatic grading.
    // Never invent a correct ranking or scoring rule.
    const explicitOrder =
      question?.metadata?.expectedOrder ??
      question?.correctAnswers ??
      question?.correctAnswer;

    if (Array.isArray(explicitOrder) && explicitOrder.length > 0) {
      return true;
    }
    if (typeof explicitOrder === 'string' && explicitOrder.trim() !== '' && explicitOrder.includes(',')) {
      return true;
    }
    return false;
  }

  return (
    (question?.correctAnswer !== undefined &&
      question.correctAnswer !== null &&
      String(question.correctAnswer).trim() !== '') ||
    (Array.isArray(question?.correctAnswers) && question.correctAnswers.length > 0)
  );
}
