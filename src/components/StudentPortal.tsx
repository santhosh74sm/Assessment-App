import { useState, useEffect, useRef } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertOctagon,
  ArrowRight,
  Trophy,
  Calendar,
  Lock,
} from 'lucide-react';
import { FlameMiniGameCanvas } from './FlameMiniGameCanvas.tsx';
import { ProfileMenu } from './ProfileMenu.tsx';
import confetti from 'canvas-confetti';
import { to24Hour, toISODate, formatAvailabilityWindow } from '../utils/dateTime.ts';

interface StudentPortalProps {
  token: string;
  user: any;
  onLogout: () => void;
}

export function StudentPortal({ token, user, onLogout }: StudentPortalProps) {
  const [studentProfile, setStudentProfile] = useState<any>(user);
  const [assignedTests, setAssignedTests] = useState<any[]>([]);
  const [activeTest, setActiveTest] = useState<any | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answersMap, setAnswersMap] = useState<Record<string, { answer: any; writtenExplanation?: string; timeTaken: number }>>({});
  const [currentSelectedAnswer, setCurrentSelectedAnswer] = useState<any | null>(null);
  const [currentWrittenExplanation, setCurrentWrittenExplanation] = useState<string>('');

  // Refs to guarantee fresh, non-stale state access inside timer callbacks
  const currentSelectedAnswerRef = useRef<any | null>(null);
  const currentWrittenExplanationRef = useRef<string>('');
  const answersMapRef = useRef<Record<string, { answer: any; writtenExplanation?: string; timeTaken: number }>>({});
  const activeTestRef = useRef<any | null>(null);
  const currentQuestionIndexRef = useRef<number>(0);
  const isSubmittingRef = useRef<boolean>(false);

  // Per-question timer
  const [timeRemaining, setTimeRemaining] = useState<number>(30);
  const questionStartTimeRef = useRef<number>(Date.now());
  const timerIntervalRef = useRef<any>(null);

  const [testResult, setTestResult] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pendingAnswerSaveRef = useRef<Promise<any> | null>(null);

  useEffect(() => {
    currentSelectedAnswerRef.current = currentSelectedAnswer;
  }, [currentSelectedAnswer]);

  useEffect(() => {
    currentWrittenExplanationRef.current = currentWrittenExplanation;
  }, [currentWrittenExplanation]);

  useEffect(() => {
    answersMapRef.current = answersMap;
  }, [answersMap]);

  useEffect(() => {
    activeTestRef.current = activeTest;
  }, [activeTest]);

  useEffect(() => {
    currentQuestionIndexRef.current = currentQuestionIndex;
  }, [currentQuestionIndex]);

  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const getClientHeaders = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const clientDateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-client-now': clientDateTime,
      'x-timezone-offset': String(now.getTimezoneOffset()),
    };
  };

  const loadStudentTests = async () => {
    try {
      const res = await fetch('/api/student/tests', {
        headers: getClientHeaders(),
      });
      const data = await res.json();
      setAssignedTests(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    }
  };

  const refreshProfile = async () => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const fresh = await res.json();
        setStudentProfile(fresh);
        try {
          localStorage.setItem('puzzles_user', JSON.stringify(fresh));
        } catch (_) {}
      }
    } catch (e) {
      console.error('Failed to refresh student profile', e);
    }
  };

  useEffect(() => {
    loadStudentTests();
    refreshProfile();
  }, []);

  useEffect(() => {
    if (user) {
      setStudentProfile((prev: any) => ({ ...prev, ...user }));
    }
  }, [user]);

  // Timer runner for current question
  useEffect(() => {
    if (!activeTest) return;

    const currentQ = activeTest.questions[currentQuestionIndex];
    if (!currentQ) return;

    questionStartTimeRef.current = Date.now();

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    // Only run timer if timeAllowedSeconds is explicitly configured (> 0)
    if (currentQ.timeAllowedSeconds != null && currentQ.timeAllowedSeconds > 0) {
      setTimeRemaining(currentQ.timeAllowedSeconds);
      timerIntervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }
            // Timer expired! Execute auto-advance capturing fresh selected answer
            setTimeout(() => {
              handleAutoAdvanceOnTimerExpireRef.current();
            }, 0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setTimeRemaining(0);
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [activeTest, currentQuestionIndex]);

  // Start Test Attempt (Consumed immediately on start)
  const handleStartTest = async (assignmentId: string) => {
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/student/tests/${assignmentId}/start`, {
        method: 'POST',
        headers: getClientHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to start test. Please try again.');
      }

      const testData = {
        ...data,
        assignmentId: data.assignmentId || data._id || data.id || assignmentId,
      };

      // Restore previously saved answers if any (for IN_PROGRESS resumption)
      const initialAnswers: Record<string, { answer: any; writtenExplanation?: string; timeTaken: number }> = {};
      let firstUnansweredIdx = 0;
      if (Array.isArray(testData.questions)) {
        testData.questions.forEach((q: any, idx: number) => {
          if ((q.studentAnswer !== undefined && q.studentAnswer !== null) || (q.writtenExplanation !== undefined && q.writtenExplanation !== '')) {
            initialAnswers[q.questionId] = {
              answer: q.studentAnswer,
              writtenExplanation: q.writtenExplanation || '',
              timeTaken: q.timeTakenSeconds || 0,
            };
            if (firstUnansweredIdx === idx && q.studentAnswer !== undefined && q.studentAnswer !== null) {
              firstUnansweredIdx = idx + 1;
            }
          }
        });
      }
      const startIndex = Math.min(firstUnansweredIdx, Math.max(0, (testData.questions?.length || 1) - 1));
      const firstQ = testData.questions?.[startIndex];
      const isFirstQRanking = Boolean(
        firstQ?.isRanking ||
        firstQ?.isRankingQuestion ||
        String(firstQ?.questionType || '').toLowerCase() === 'ranking'
      );
      const initialAns =
        initialAnswers[firstQ?.questionId]?.answer ??
        (isFirstQRanking
          ? (Array.isArray(firstQ?.options) ? firstQ.options.map((opt: string, i: number) => ({ id: `stmt-${i}`, text: opt, rank: i + 1 })) : [])
          : (firstQ?.answerType === 'multiple' ? [] : null));
      const initialExplanation =
        initialAnswers[firstQ?.questionId]?.writtenExplanation ??
        (firstQ?.writtenExplanation || '');

      setActiveTest(testData);
      activeTestRef.current = testData;
      setCurrentQuestionIndex(startIndex);
      currentQuestionIndexRef.current = startIndex;
      setAnswersMap(initialAnswers);
      answersMapRef.current = initialAnswers;
      setCurrentSelectedAnswer(initialAns);
      currentSelectedAnswerRef.current = initialAns;
      setCurrentWrittenExplanation(initialExplanation);
      currentWrittenExplanationRef.current = initialExplanation;
      setTestResult(null);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);

  // Exit / Abandon Test -> Transitions to INCOMPLETE with Exit Type: EXIT
  const executeAbandonTest = async () => {
    if (!activeTest) return;
    const testId = activeTest.assignmentId || activeTest.id;
    setShowExitConfirmModal(false);
    try {
      if (pendingAnswerSaveRef.current) {
        await pendingAnswerSaveRef.current;
      }
      await fetch(`/api/student/tests/${testId}/exit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ exitType: 'EXIT', reason: 'Student explicitly exited assessment' }),
      });
      setActiveTest(null);
      loadStudentTests();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAbandonTest = () => {
    setShowExitConfirmModal(true);
  };

  const performLogout = async () => {
    try {
      if (pendingAnswerSaveRef.current) {
        await pendingAnswerSaveRef.current;
      }
      if (activeTest) {
        const testId = activeTest.assignmentId || activeTest.id;
        await fetch(`/api/student/tests/${testId}/exit`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ exitType: 'LOGOUT', reason: 'Student logged out during active assessment' }),
        }).catch(console.error);
      }
      await fetch('/api/student/logout', {
        method: 'POST',
        headers,
      }).catch(console.error);
    } finally {
      onLogout();
    }
  };

  // Save current answer and advance
  const recordAndAdvance = (answer?: any) => {
    const test = activeTestRef.current || activeTest;
    const qIndex = currentQuestionIndexRef.current ?? currentQuestionIndex;
    if (!test || isSubmittingRef.current) return;
    const currentQ = test.questions[qIndex];
    if (!currentQ) return;

    const elapsedSeconds = Math.max(1, Math.round((Date.now() - questionStartTimeRef.current) / 1000));
    const timeSpent = (currentQ.timeAllowedSeconds != null && currentQ.timeAllowedSeconds > 0)
      ? Math.min(currentQ.timeAllowedSeconds, elapsedSeconds)
      : elapsedSeconds;

    const answerToRecord = answer !== undefined ? answer : currentSelectedAnswerRef.current;
    const explanationToRecord = currentWrittenExplanationRef.current || '';
    const updatedAnswers: Record<string, { answer: any; writtenExplanation?: string; timeTaken: number }> = {
      ...answersMapRef.current,
      [currentQ.questionId]: {
        answer: answerToRecord,
        writtenExplanation: explanationToRecord,
        timeTaken: timeSpent || 1,
      },
    };
    answersMapRef.current = updatedAnswers;
    setAnswersMap(updatedAnswers);

    const testId = test.assignmentId || test._id || test.id;
    const isFinalQuestion = qIndex >= test.questions.length - 1;

    // Save intermediate answer to backend ONLY if not the final question.
    // The final question submit payload sends all answers in one atomic request,
    // avoiding redundant parallel requests and document version race conditions.
    if (!isFinalQuestion) {
      pendingAnswerSaveRef.current = fetch(`/api/student/tests/${testId}/answer`, {
        method: 'POST',
        headers: getClientHeaders(),
        body: JSON.stringify({
          questionId: currentQ.questionId,
          answer: answerToRecord,
          writtenExplanation: explanationToRecord,
          timeTakenSeconds: timeSpent || 1,
        }),
      }).catch(console.error);

      const nextIndex = qIndex + 1;
      currentQuestionIndexRef.current = nextIndex;
      setCurrentQuestionIndex(nextIndex);
      const nextQ = test.questions[nextIndex];
      const isNextQRanking = Boolean(
        nextQ?.isRanking ||
        nextQ?.isRankingQuestion ||
        String(nextQ?.questionType || '').toLowerCase() === 'ranking'
      );
      const nextAns =
        updatedAnswers[nextQ?.questionId]?.answer ??
        (isNextQRanking
          ? (Array.isArray(nextQ?.options) ? nextQ.options.map((opt: string, i: number) => ({ id: `stmt-${i}`, text: opt, rank: i + 1 })) : [])
          : (nextQ?.answerType === 'multiple' ? [] : null));
      const nextExplanation =
        updatedAnswers[nextQ?.questionId]?.writtenExplanation ??
        (nextQ?.writtenExplanation || '');
      currentSelectedAnswerRef.current = nextAns;
      setCurrentSelectedAnswer(nextAns);
      currentWrittenExplanationRef.current = nextExplanation;
      setCurrentWrittenExplanation(nextExplanation);
    } else {
      // Last question completed -> submit test
      submitFullTest(updatedAnswers);
    }
  };

  const handleAutoAdvanceOnTimerExpire = () => {
    recordAndAdvance(currentSelectedAnswerRef.current);
  };
  const handleAutoAdvanceOnTimerExpireRef = useRef(handleAutoAdvanceOnTimerExpire);
  handleAutoAdvanceOnTimerExpireRef.current = handleAutoAdvanceOnTimerExpire;

  const submitFullTest = async (finalAnswers: Record<string, { answer: any; writtenExplanation?: string; timeTaken: number }>) => {
    const test = activeTestRef.current || activeTest;
    if (!test || isSubmittingRef.current) return;
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsSubmitting(true);
    isSubmittingRef.current = true;
    setErrorMsg(null);

    const testId = test.assignmentId || test._id || test.id;
    const answersPayload = (test.questions || []).map((q: any) => {
      const entry = finalAnswers[q.questionId];
      return {
        questionId: q.questionId,
        answer: entry?.answer !== undefined ? entry.answer : (q.studentAnswer ?? null),
        writtenExplanation: entry?.writtenExplanation !== undefined ? entry.writtenExplanation : (q.writtenExplanation || ''),
        timeTakenSeconds: Math.max(0, Number(entry?.timeTaken ?? q.timeTakenSeconds) || 0),
      };
    });

    try {
      const res = await fetch(`/api/student/tests/${testId}/submit`, {
        method: 'POST',
        headers: getClientHeaders(),
        body: JSON.stringify({ answers: answersPayload }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult(data);
        setActiveTest(null);
        const prefersReducedMotion =
          typeof window !== 'undefined' && window.matchMedia
            ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
            : false;
        if (!prefersReducedMotion) {
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        }
        loadStudentTests();
      } else {
        const errorDetail = data.error || 'Unable to submit test. Please try again.';
        setErrorMsg(errorDetail);
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg('Unable to submit test. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  const currentQ = activeTest?.questions?.[currentQuestionIndex];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs font-bold text-xs shrink-0">
            P
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate max-w-[140px] sm:max-w-xs">
              {studentProfile?.studentName || studentProfile?.username || user?.studentName || user?.username}
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-[140px] sm:max-w-xs">
              Class {studentProfile?.className || user?.className}{studentProfile?.section || user?.section ? ` (${studentProfile?.section || user?.section})` : ''} &bull; {studentProfile?.schoolName || user?.schoolName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right text-[11px] font-mono tabular-nums">
            <span className="text-slate-500 dark:text-slate-400 block">ID: {studentProfile?.uniqueStudentId || user?.uniqueStudentId}</span>
            {(studentProfile?.schoolAdmissionNumber || user?.schoolAdmissionNumber) && (
              <span className="text-slate-400 dark:text-slate-500 block">Adm: {studentProfile?.schoolAdmissionNumber || user?.schoolAdmissionNumber}</span>
            )}
          </div>
          <ProfileMenu 
            user={studentProfile || user} 
            onLogout={performLogout} 
            isAssessmentActive={!!activeTest} 
          />
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-5xl mx-auto w-full">
        {errorMsg && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-6 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-500/50 text-rose-700 dark:text-rose-300 text-sm flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-xs px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/60 dark:hover:bg-rose-800 text-rose-800 dark:text-rose-200 font-semibold cursor-pointer transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 1. TEST RESULT SUMMARY BANNER */}
        {testResult && (
          <div
            role="status"
            aria-live="polite"
            className="mb-8 p-6 sm:p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center shadow-xs space-y-4"
          >
            <div className="w-12 h-12 mx-auto rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-center shadow-xs">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Assessment Completed
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                Your responses have been successfully recorded and submitted to your institution.
              </p>
            </div>

            <div className="max-w-xs mx-auto pt-1">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] text-slate-600 dark:text-slate-400 block font-semibold mb-0.5">Submission Status</span>
                <span className="text-base font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                  Submitted & Scored
                </span>
              </div>
            </div>

            <button
              onClick={() => setTestResult(null)}
              className="mt-4 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 font-semibold text-xs text-white shadow-xs transition-all cursor-pointer"
            >
              Back to Assessments
            </button>
          </div>
        )}

        {/* 2. ACTIVE TEST ENGINE (FLAME CANVAS + TIMER) */}
        {activeTest && currentQ && (
          <div className="space-y-6">
            {/* Top Game Bar */}
            <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 rounded-xl shadow-xs">
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-medium block truncate">
                  {activeTest.publishName}
                </span>
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                  Question {currentQuestionIndex + 1} of {activeTest.questions.length}
                </h3>
              </div>

              {/* Per-Question Countdown Timer - Only shown when configured */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                {currentQ.timeAllowedSeconds != null && currentQ.timeAllowedSeconds > 0 && (
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs sm:text-sm font-semibold tabular-nums transition-colors ${
                      timeRemaining <= 5
                        ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>{timeRemaining}s</span>
                  </div>
                )}

                {/* Exit / Abandon Button */}
                <button
                  type="button"
                  onClick={handleAbandonTest}
                  className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 text-xs font-semibold transition-colors cursor-pointer shrink-0"
                  title="Abandon attempt"
                >
                  Exit Test
                </button>
              </div>
            </div>

            {/* Flame Puzzle Canvas Mini-Game */}
            <FlameMiniGameCanvas
              content={currentQ.content}
              points={currentQ.points}
              timeRemaining={timeRemaining}
              options={currentQ.options}
              answerType={currentQ.answerType || 'single'}
              isRanking={Boolean(currentQ.isRanking || currentQ.isRankingQuestion || String(currentQ.questionType || '').toLowerCase() === 'ranking')}
              isRankingQuestion={Boolean(currentQ.isRanking || currentQ.isRankingQuestion || String(currentQ.questionType || '').toLowerCase() === 'ranking')}
              questionType={currentQ.questionType}
              pairs={currentQ.metadata?.pairs || currentQ.pairs}
              images={currentQ.images || []}
              imageLayout={currentQ.imageLayout || 'auto'}
              onAnswerSubmit={(ans) => {
                currentSelectedAnswerRef.current = ans;
                setCurrentSelectedAnswer(ans);
              }}
              selectedAnswer={currentSelectedAnswer}
              disabled={false}
            />

            {/* Written Explanation (Optional) - Shown only when enabled */}
            {Boolean(currentQ.enableWrittenExplanation) && (
              <div className="space-y-1.5 pt-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Your Explanation (Optional)
                </label>
                <textarea
                  rows={3}
                  value={currentWrittenExplanation}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCurrentWrittenExplanation(val);
                    currentWrittenExplanationRef.current = val;
                  }}
                  placeholder="Write your reason here..."
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all resize-y min-h-[80px] shadow-xs"
                />
              </div>
            )}

            {/* Next / Submit Question Button */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-4">
              <span className="text-xs text-slate-600 dark:text-slate-400">
                * Your answer will be saved when you move forward.
              </span>

              <button
                type="button"
                onClick={() => recordAndAdvance(currentSelectedAnswerRef.current)}
                disabled={isSubmitting}
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg font-semibold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white shadow-xs flex items-center justify-center gap-2 text-xs sm:text-sm transition-all cursor-pointer next-question-btn shrink-0"
              >
                <span className="next-question-btn-text text-white">
                  {isSubmitting
                    ? 'Submitting Test...'
                    : currentQuestionIndex < activeTest.questions.length - 1
                    ? 'Next Question'
                    : 'Submit Test'}
                </span>
                <ArrowRight className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        )}

        {/* 3. ASSIGNED TEST CARDS */}
        {!activeTest && !testResult && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Assigned Assessments
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                Evaluations provisioned for your grade. Each assessment must be completed in a single continuous session.
              </p>
            </div>

            {assignedTests.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assignedTests.map((card) => {
                  const assignmentId = card.assignmentId || card._id || card.id;
                  const isCompleted = card.status === 'COMPLETED';
                  const isIncomplete = card.status === 'INCOMPLETE' || card.status === 'LOCKED_INCOMPLETE';

                  // Compute availability using client local time
                  const now = new Date();
                  const pad = (n: number) => String(n).padStart(2, '0');
                  const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

                  const hasStart = card.startDate && card.startDate !== 'Today';
                  const isoStart = hasStart ? toISODate(card.startDate) : null;
                  const startStr = isoStart ? `${isoStart}T${to24Hour(card.startTime || '00:00')}` : null;
                  const hasEnd = card.endDate && card.endDate !== 'Open';
                  const isoEnd = hasEnd ? toISODate(card.endDate) : null;
                  const endStr = isoEnd ? `${isoEnd}T${to24Hour(card.endTime || '23:59')}` : null;

                  const isUpcoming = startStr ? nowStr < startStr : (card.isUpcoming ?? false);
                  const isExpired = endStr ? nowStr > endStr : (card.isExpired ?? false);
                  const canStart = card.status === 'NOT_STARTED' && !isUpcoming && !isExpired && !card.isPaused;

                  return (
                    <div
                      key={assignmentId}
                      className="p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-medium">
                          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 font-semibold">
                              {card.totalQuestions} Questions
                            </span>
                            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                            <span
                              className={`font-semibold ${
                                isCompleted
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : isIncomplete
                                  ? 'text-rose-700 dark:text-rose-400'
                                  : card.isPaused
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : isExpired
                                  ? 'text-slate-500 dark:text-slate-500'
                                  : isUpcoming
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-indigo-700 dark:text-indigo-400'
                              }`}
                            >
                              {isCompleted
                                ? 'Completed'
                                : isIncomplete
                                ? 'Incomplete'
                                : card.isPaused
                                ? 'Paused'
                                : isExpired
                                ? 'Expired'
                                : isUpcoming
                                ? 'Upcoming'
                                : 'Ready to Start'}
                            </span>
                          </div>
                        </div>

                        <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white leading-snug">
                          {card.publishName}
                        </h3>

                        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-mono">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>Window: {formatAvailabilityWindow(card.startDate, card.startTime, card.endDate, card.endTime)}</span>
                        </div>
                      </div>

                      {/* Action status */}
                      <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        {isCompleted && (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>Completed. Answers recorded.</span>
                          </div>
                        )}

                        {isIncomplete && (
                          <div className="flex flex-col gap-0.5 text-xs text-rose-700 dark:text-rose-400 font-medium">
                            <div className="flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5 shrink-0" />
                              <span>Ended early. Attempt closed.</span>
                            </div>
                            {card.exitType && (card.exitType === 'EXIT' || card.exitType === 'LOGOUT') && (
                              <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 ml-5">
                                Reason: {card.exitType}
                              </span>
                            )}
                          </div>
                        )}

                        {!isCompleted && !isIncomplete && card.isPaused && (
                          <div className="w-full py-2 px-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs text-center font-medium">
                            Temporarily Paused by Administrator
                          </div>
                        )}

                        {!isCompleted && !isIncomplete && !card.isPaused && card.status === 'NOT_STARTED' && (
                          <div className="space-y-2 w-full">
                            {isUpcoming && (
                              <div className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 shrink-0" />
                                <span>Assessment opens at the scheduled start time.</span>
                              </div>
                            )}
                            {isExpired && (
                              <div className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-1.5">
                                <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                                <span>Assessment window has closed.</span>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => handleStartTest(assignmentId)}
                              disabled={!canStart}
                              className="w-full py-2.5 px-4 rounded-lg font-semibold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 text-white text-xs sm:text-sm transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed"
                            >
                              {isUpcoming
                                ? 'Upcoming Assessment'
                                : isExpired
                                ? 'Assessment Closed'
                                : 'Start Assessment'}
                            </button>
                          </div>
                        )}

                        {!isCompleted && !isIncomplete && !card.isPaused && card.status === 'IN_PROGRESS' && (
                          card.canResume ? (
                            <button
                              type="button"
                              onClick={() => handleStartTest(assignmentId)}
                              className="w-full py-2.5 px-4 rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2"
                            >
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              <span>Resume Assessment</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-medium">
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              <span>Assessment currently in progress.</span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xs student-no-tests-empty-card">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <Calendar className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-base text-slate-900 dark:text-white">No Assessments Scheduled</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  There are no active tests assigned to your roster at this time. Please check back when a new testing window opens.
                </p>
              </div>
            )}
          </div>
        )}

        {/* In-app Exit / Abandon Confirmation Modal */}
        {showExitConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 dark:bg-black/80 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
              <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto border border-rose-200 dark:border-rose-800/60 shadow-2xs">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div className="text-center space-y-1.5">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Exit Test?</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  You can only take this test once. If you exit now, your test will end immediately and be marked as <strong className="text-rose-600 dark:text-rose-400">Incomplete</strong>. You will not be able to restart it.
                </p>
              </div>
              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExitConfirmModal(false)}
                  className="flex-1 py-2 px-3 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-medium text-xs transition-colors cursor-pointer shadow-xs"
                >
                  Continue Test
                </button>
                <button
                  type="button"
                  onClick={executeAbandonTest}
                  className="flex-1 py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors shadow-xs cursor-pointer"
                >
                  Yes, Exit Test
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
