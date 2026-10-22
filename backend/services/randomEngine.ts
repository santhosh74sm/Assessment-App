import type { Question, StudentTestAssignment, QuestionDifficulty } from '../types.ts';

export interface StudentHistoryInsight {
  totalCompletedTests: number;
  easyAccuracy: number; // 0.0 to 1.0
  mediumAccuracy: number; // 0.0 to 1.0
  hardAccuracy: number; // 0.0 to 1.0
  recentlyUsedQuestionIds: Set<string>;
}

// Helper for unbiased Fisher-Yates / Durstenfeld shuffle
function fisherYatesShuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function computeStudentInsights(
  studentId: string,
  allAssignments: StudentTestAssignment[],
  repetitionWindowDays = 21 // Eligible after suitable gap (e.g., 3 weeks)
): StudentHistoryInsight {
  // Finding 4 fix: Include INCOMPLETE along with COMPLETED and LOCKED_INCOMPLETE
  const studentAssignments = allAssignments.filter(
    (a) => a.studentId === studentId && (a.status === 'COMPLETED' || a.status === 'INCOMPLETE' || a.status === 'LOCKED_INCOMPLETE')
  );

  let easyTotal = 0;
  let easyCorrect = 0;
  let mediumTotal = 0;
  let mediumCorrect = 0;
  let hardTotal = 0;
  let hardCorrect = 0;

  const recentlyUsed = new Set<string>();
  const now = Date.now();
  const windowMs = repetitionWindowDays * 24 * 60 * 60 * 1000;

  for (const a of studentAssignments) {
    const testDate = a.completedAt
      ? new Date(a.completedAt).getTime()
      : a.lockedAt
      ? new Date(a.lockedAt).getTime()
      : a.startedAt
      ? new Date(a.startedAt).getTime()
      : 0;
    const isRecent = testDate > 0 && (now - testDate < windowMs);
    const isFullCompleted = a.status === 'COMPLETED';

    for (const q of a.questions || []) {
      // For incomplete assessments, only questions that were genuinely attempted/presented
      // (student answered or took time on) participate in the 21-day repetition window and accuracy stats.
      const wasAttempted = isFullCompleted ||
        (q.studentAnswer !== undefined && q.studentAnswer !== null && String(q.studentAnswer).trim() !== '') ||
        (q.timeTakenSeconds != null && Number(q.timeTakenSeconds) > 0);

      if (wasAttempted && isRecent && q.questionId) {
        recentlyUsed.add(String(q.questionId));
      }

      // Only count attempted evaluable questions towards historical difficulty accuracy
      if (wasAttempted) {
        if (q.difficulty === 'Easy') {
          easyTotal++;
          if (q.isCorrect) easyCorrect++;
        } else if (q.difficulty === 'Medium') {
          mediumTotal++;
          if (q.isCorrect) mediumCorrect++;
        } else if (q.difficulty === 'Hard') {
          hardTotal++;
          if (q.isCorrect) hardCorrect++;
        }
      }
    }
  }

  return {
    totalCompletedTests: studentAssignments.filter((a) => a.status === 'COMPLETED').length,
    easyAccuracy: easyTotal > 0 ? easyCorrect / easyTotal : -1, // -1 means no prior exposure
    mediumAccuracy: mediumTotal > 0 ? mediumCorrect / mediumTotal : -1,
    hardAccuracy: hardTotal > 0 ? hardCorrect / hardTotal : -1,
    recentlyUsedQuestionIds: recentlyUsed,
  };
}

export function selectRandomQuestionsForRuleEngine(
  targetCount: number,
  allQuestions: Question[],
  insights: StudentHistoryInsight
): Question[] {
  // Filter out recently used questions
  let eligibleQuestions = allQuestions.filter(
    (q) => !insights.recentlyUsedQuestionIds.has(q.id)
  );

  // If pool too small due to repetition window, allow eligible questions to expand back
  if (eligibleQuestions.length < targetCount) {
    eligibleQuestions = [...allQuestions];
  }

  // Determine allowed difficulty progression tiers:
  // Finding 5 fix:
  // - Fresh student (0 completed tests and no evaluable attempts): -> Easy
  // - Good Medium performance (>= 70%): -> Medium + Hard (even if no Easy history)
  // - Good Easy performance (>= 70%): -> Easy + Medium
  // - Poor Easy (< 70%): -> Easy
  // - Medium < 70% with no Easy: -> Easy
  let targetDifficulties: QuestionDifficulty[] = ['Easy'];

  if (insights.totalCompletedTests === 0 && insights.easyAccuracy < 0 && insights.mediumAccuracy < 0) {
    // Fresh student with zero evaluable attempts
    targetDifficulties = ['Easy'];
  } else if (insights.mediumAccuracy >= 0.7) {
    // Strong Medium performance -> Medium or Medium + Hard
    targetDifficulties = ['Medium', 'Hard'];
  } else if (insights.easyAccuracy >= 0.7) {
    // Strong Easy performance -> Easy or Easy + Medium
    targetDifficulties = ['Easy', 'Medium'];
  } else if (insights.easyAccuracy >= 0) {
    // Evaluated on Easy but < 70% -> keep in Easy
    targetDifficulties = ['Easy'];
  } else if (insights.mediumAccuracy >= 0) {
    // Had Medium attempts but < 70% -> step down to Easy
    targetDifficulties = ['Easy'];
  } else {
    targetDifficulties = ['Easy'];
  }

  // Filter pool matching progression difficulty
  const matchedQuestions = eligibleQuestions.filter((q) =>
    targetDifficulties.includes(q.difficulty)
  );

  let selected: Question[] = [];

  // Finding 14 fix: Prioritize target difficulty questions
  if (matchedQuestions.length <= targetCount) {
    // Include ALL available questions matching target difficulty
    selected = [...matchedQuestions];

    // If there is a shortfall, fill remaining deficit from the fallback pool
    const neededDeficit = targetCount - matchedQuestions.length;
    if (neededDeficit > 0) {
      const remainingPool = eligibleQuestions.filter((q) => !matchedQuestions.some((m) => m.id === q.id));
      const shuffledRemaining = fisherYatesShuffle(remainingPool);
      selected = [...selected, ...shuffledRemaining.slice(0, neededDeficit)];
    }
  } else {
    // More questions available than targetCount: pick targetCount using Fisher-Yates
    selected = fisherYatesShuffle(matchedQuestions).slice(0, targetCount);
  }

  // Finding 11 fix: Shuffle the final combined selection with Fisher-Yates
  return fisherYatesShuffle(selected);
}
