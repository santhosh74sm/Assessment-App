import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Clock,
  ArrowRight,
  ArrowLeft,
  X,
  Trophy,
  AlertTriangle,
} from 'lucide-react';
import { FlameMiniGameCanvas } from './FlameMiniGameCanvas.tsx';

export interface AssessmentPreviewQuestion {
  id?: string;
  questionId?: string;
  groupId?: string;
  groupName?: string;
  difficulty?: string;
  content: string;
  points?: number | null;
  timeSeconds?: number | null;
  timeAllowedSeconds?: number | null;
  options?: string[];
  answerType?: 'single' | 'multiple';
  isRanking?: boolean;
  isRankingQuestion?: boolean;
  rankingQuestion?: boolean;
  questionType?: string;
  enableWrittenExplanation?: boolean;
  defaultInput?: boolean;
  metadata?: any;
  pairs?: { left: string; right: string }[];
  images?: any[];
  imageLayout?: 'single_top' | 'comparison' | 'options_grid' | 'auto';
  isQuestionDeleted?: boolean;
}

export interface StudentAssessmentPreviewModalProps {
  title: string;
  subtitle?: string;
  questions: AssessmentPreviewQuestion[];
  onClose: () => void;
}

export function StudentAssessmentPreviewModal({
  title,
  subtitle,
  questions,
  onClose,
}: StudentAssessmentPreviewModalProps) {
  // Exclude deleted questions so previews only ever display remaining valid questions
  const activeQuestions = useMemo(
    () => (Array.isArray(questions) ? questions.filter((q) => !q.isQuestionDeleted) : []),
    [questions]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  // Store temporary preview answers in purely local component state
  const [previewAnswers, setPreviewAnswers] = useState<Record<number, any>>({});
  const [previewExplanations, setPreviewExplanations] = useState<Record<number, string>>({});
  const [currentSelectedAnswer, setCurrentSelectedAnswer] = useState<any | null>(null);
  const [currentWrittenExplanation, setCurrentWrittenExplanation] = useState<string>('');
  const [isCompleted, setIsCompleted] = useState(false);

  const currentSelectedAnswerRef = useRef<any | null>(null);
  const currentWrittenExplanationRef = useRef<string>('');

  // Close preview immediately when Escape key is pressed without asking for confirmation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Per-question timer state (simulated locally)
  const currentQ = activeQuestions[currentIndex];
  const initialTime =
    currentQ?.timeAllowedSeconds != null && currentQ.timeAllowedSeconds > 0
      ? currentQ.timeAllowedSeconds
      : currentQ?.timeSeconds != null && currentQ.timeSeconds > 0
      ? currentQ.timeSeconds
      : 0;

  const [timeRemaining, setTimeRemaining] = useState<number>(initialTime);
  const timerIntervalRef = useRef<any>(null);

  // Sync refs and update inputs when currentIndex changes
  useEffect(() => {
    if (!currentQ) return;
    const isCurRanking = Boolean(
      currentQ?.isRanking ||
      currentQ?.isRankingQuestion ||
      currentQ?.rankingQuestion ||
      String(currentQ?.questionType || '').toLowerCase() === 'ranking'
    );
    const existingAns =
      previewAnswers[currentIndex] !== undefined
        ? previewAnswers[currentIndex]
        : isCurRanking
        ? (Array.isArray(currentQ?.options) ? currentQ.options.map((opt: string, i: number) => ({ id: `stmt-${i}`, text: opt, rank: i + 1 })) : [])
        : currentQ?.answerType === 'multiple'
        ? []
        : null;
    const existingExp = previewExplanations[currentIndex] || '';

    setCurrentSelectedAnswer(existingAns);
    currentSelectedAnswerRef.current = existingAns;
    setCurrentWrittenExplanation(existingExp);
    currentWrittenExplanationRef.current = existingExp;

    const qTime =
      currentQ.timeAllowedSeconds != null && currentQ.timeAllowedSeconds > 0
        ? currentQ.timeAllowedSeconds
        : currentQ.timeSeconds != null && currentQ.timeSeconds > 0
        ? currentQ.timeSeconds
        : 0;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (qTime > 0) {
      setTimeRemaining(qTime);
      timerIntervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }
            // Auto-advance to next question when timer expires
            setTimeout(() => {
              handleAdvance(true);
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
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [currentIndex, activeQuestions]);

  const handleAdvance = (_autoAdvanced = false) => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    const currentAnswer = currentSelectedAnswerRef.current;
    const currentExplanation = currentWrittenExplanationRef.current;

    setPreviewAnswers((prev) => ({
      ...prev,
      [currentIndex]: currentAnswer,
    }));
    setPreviewExplanations((prev) => ({
      ...prev,
      [currentIndex]: currentExplanation,
    }));

    if (currentIndex < activeQuestions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setIsCompleted(true);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      // Save current question's state locally before navigating back
      setPreviewAnswers((prev) => ({
        ...prev,
        [currentIndex]: currentSelectedAnswerRef.current,
      }));
      setPreviewExplanations((prev) => ({
        ...prev,
        [currentIndex]: currentWrittenExplanationRef.current,
      }));
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleResetPreview = () => {
    setPreviewAnswers({});
    setPreviewExplanations({});
    setIsCompleted(false);
    setCurrentIndex(0);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Student Assessment Preview"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 dark:bg-black/80 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl shadow-xl flex flex-col my-4 max-h-[94vh] overflow-hidden text-slate-900 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="bg-white dark:bg-slate-900 px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/80">
              Preview Mode
            </span>
            <span className="text-xs text-slate-600 dark:text-slate-400 font-medium truncate max-w-xs sm:max-w-md">
              Student experience simulation
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close Preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {activeQuestions.length === 0 ? (
            <div className="p-8 sm:p-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4 my-6 shadow-xs">
              <div className="w-12 h-12 mx-auto rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-800/60">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                No questions available to preview
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                No active questions remain for this assessment. Any previously attached questions may have been removed or deleted from the Question Bank.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 font-semibold text-xs text-white shadow-xs transition-colors cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>
          ) : isCompleted ? (
            /* Completed Preview Screen */
            <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center shadow-xs space-y-4 my-6">
              <div className="w-12 h-12 mx-auto rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-800/60">
                <Trophy className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Preview Completed
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                You have reached the end of the student preview for <strong>{title}</strong>. In the real student portal, the student's attempt would now be submitted.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleResetPreview}
                  className="px-4 py-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer border border-slate-300 dark:border-slate-700 shadow-xs"
                >
                  Restart Preview
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 font-semibold text-xs text-white shadow-xs transition-colors cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>
          ) : (
            /* Active Question Screen (Student Experience) */
            <div className="space-y-6">
              {/* Top Game Bar */}
              <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 sm:p-4 rounded-xl shadow-xs">
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-medium block truncate">
                    {title} {subtitle ? `· ${subtitle}` : ''}
                  </span>
                  <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white truncate">
                    Question {currentIndex + 1} of {activeQuestions.length}
                  </h3>
                </div>

                {/* Per-Question Countdown Timer */}
                <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                  {initialTime > 0 && (
                    <div
                      className={`flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-xl font-mono text-xs sm:text-sm font-bold transition-all ${
                        timeRemaining <= 5
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 animate-pulse'
                          : 'bg-slate-100 dark:bg-slate-800 text-amber-700 dark:text-amber-400 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <Clock className="w-4 h-4 shrink-0" />
                      <span>{timeRemaining}s</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-xs font-semibold transition-colors cursor-pointer shrink-0"
                    title="Exit preview"
                  >
                    Exit Preview
                  </button>
                </div>
              </div>

              {/* Flame Puzzle Canvas Mini-Game */}
              <FlameMiniGameCanvas
                content={currentQ.content}
                points={currentQ.points}
                timeRemaining={timeRemaining > 0 ? timeRemaining : undefined}
                options={currentQ.options || []}
                answerType={currentQ.answerType || 'single'}
                isRanking={Boolean(currentQ.isRanking || currentQ.isRankingQuestion || currentQ.rankingQuestion || String(currentQ.questionType || '').toLowerCase() === 'ranking')}
                isRankingQuestion={Boolean(currentQ.isRanking || currentQ.isRankingQuestion || currentQ.rankingQuestion || String(currentQ.questionType || '').toLowerCase() === 'ranking')}
                questionType={currentQ.questionType || (Boolean(currentQ.isRanking || currentQ.isRankingQuestion || currentQ.rankingQuestion || String(currentQ.questionType || '').toLowerCase() === 'ranking') ? 'Ranking' : undefined)}
                defaultInput={currentQ.defaultInput !== undefined ? Boolean(currentQ.defaultInput) : true}
                pairs={currentQ.metadata?.pairs || currentQ.pairs || []}
                images={Array.isArray(currentQ.images) && currentQ.images.length > 0 ? currentQ.images : (currentQ.metadata?.images || [])}
                imageLayout={currentQ.imageLayout || currentQ.metadata?.imageLayout || 'auto'}
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

              {/* Navigation Controls */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  {currentIndex > 0 && (
                    <button
                      type="button"
                      onClick={handlePrevious}
                      className="px-4 py-2.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold transition-colors cursor-pointer flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 shadow-xs"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Previous Question</span>
                    </button>
                  )}
                  <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                    Question {currentIndex + 1} of {activeQuestions.length}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleAdvance(false)}
                  className="next-question-btn w-full sm:w-auto px-5 py-2.5 rounded-lg font-semibold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-xs flex items-center justify-center gap-2 text-xs sm:text-sm transition-all cursor-pointer shrink-0"
                >
                  <span className="next-question-btn-text text-white">
                    {currentIndex < activeQuestions.length - 1 ? 'Next Question' : 'Finish Preview'}
                  </span>
                  <ArrowRight className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
