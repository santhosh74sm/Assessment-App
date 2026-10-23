import { useEffect, useRef, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Check, ArrowUp, ArrowDown, GripVertical, ListOrdered, Maximize2, X, Image as ImageIcon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface RankingStatementItem {
  id: string;
  text: string;
  originalIndex: number;
}

interface FlameMiniGameProps {
  content: string;
  points?: number | null;
  timeRemaining?: number;
  options?: string[];
  answerType?: 'single' | 'multiple';
  isRanking?: boolean;
  isRankingQuestion?: boolean;
  questionType?: string;
  pairs?: { left: string; right: string }[];
  images?: any[];
  imageLayout?: 'single_top' | 'comparison' | 'options_grid' | 'auto';
  defaultInput?: boolean;
  onAnswerSubmit: (answer: any) => void;
  selectedAnswer: any;
  disabled: boolean;
}

export function FlameMiniGameCanvas({
  content,
  points,
  options = [],
  answerType = 'single',
  isRanking = false,
  isRankingQuestion = false,
  questionType,
  pairs = [],
  images = [],
  imageLayout = 'auto',
  defaultInput = true,
  onAnswerSubmit,
  selectedAnswer,
  disabled,
}: FlameMiniGameProps) {
  let isDark = true;
  try {
    const { effectiveTheme } = useTheme();
    isDark = effectiveTheme === 'dark';
  } catch {
    isDark = typeof document !== 'undefined' ? !document.documentElement.classList.contains('light') : true;
  }

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const isRankingMode = Boolean(
    isRanking ||
    isRankingQuestion ||
    String(questionType || '').toLowerCase() === 'ranking'
  );

  // Zoom / Lightbox modal state for pictorial questions
  const [activeZoomImage, setActiveZoomImage] = useState<any | null>(null);

  useEffect(() => {
    if (!activeZoomImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveZoomImage(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeZoomImage]);

  // Match interaction state
  const [matchState, setMatchState] = useState<Record<string, string>>(
    () => (typeof selectedAnswer === 'object' && selectedAnswer !== null && !Array.isArray(selectedAnswer) ? selectedAnswer : {})
  );
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);

  // Ranking question statements state
  const getInitialRankingItems = useCallback((): RankingStatementItem[] => {
    if (Array.isArray(selectedAnswer) && selectedAnswer.length > 0) {
      return selectedAnswer.map((item: any, idx: number) => {
        if (typeof item === 'object' && item !== null) {
          const text = String(item.text || item.content || item.name || `Item ${idx + 1}`);
          const origIdx = options.findIndex((opt) => opt === text);
          return {
            id: String(item.id || `stmt-${origIdx >= 0 ? origIdx : idx}`),
            text,
            originalIndex: origIdx >= 0 ? origIdx : (item.originalIndex ?? idx),
          };
        }
        const textStr = String(item);
        const origIdx = options.findIndex((opt) => opt === textStr);
        return {
          id: `stmt-${origIdx >= 0 ? origIdx : idx}`,
          text: textStr,
          originalIndex: origIdx >= 0 ? origIdx : idx,
        };
      });
    }

    return (options || []).map((opt, idx) => ({
      id: `stmt-${idx}`,
      text: opt,
      originalIndex: idx,
    }));
  }, [options, selectedAnswer]);

  const [rankingItems, setRankingItems] = useState<RankingStatementItem[]>(getInitialRankingItems);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Sync ranking items when question content or options change
  useEffect(() => {
    if (isRankingMode) {
      const items = getInitialRankingItems();
      setRankingItems(items);
      // If student hasn't yet submitted an answer, send the initial ranking representation
      if (!selectedAnswer || (Array.isArray(selectedAnswer) && selectedAnswer.length === 0)) {
        const payload = items.map((it, idx) => ({
          id: it.id,
          text: it.text,
          rank: idx + 1,
        }));
        onAnswerSubmit(payload);
      }
    }
  }, [content, isRankingMode, options, getInitialRankingItems]);

  const moveRankingItem = (fromIndex: number, toIndex: number) => {
    if (disabled || toIndex < 0 || toIndex >= rankingItems.length) return;
    const updated = [...rankingItems];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    setRankingItems(updated);

    const payload = updated.map((it, idx) => ({
      id: it.id,
      text: it.text,
      rank: idx + 1,
    }));
    onAnswerSubmit(payload);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (disabled) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    moveRankingItem(draggedIndex, targetIndex);
    setDraggedIndex(null);
  };

  // Number grid mini-game state (for Number/3x3 puzzle)
  const [gridCells, setGridCells] = useState<(string | number | null)[]>([
    2, 7, 6,
    9, selectedAnswer || '?', 1,
    4, 3, 8,
  ]);

  // Check user preference for reduced motion
  const checkReducedMotion = () => {
    return typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  };

  // Particle animation loop simulation inside Flame canvas
  // When prefers-reduced-motion: reduce is enabled, display only a static, subtle background grid and stop the particle animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mediaQuery =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    let isReduced = mediaQuery ? mediaQuery.matches : false;
    let animationFrameId: number | null = null;
    let particles: { x: number; y: number; size: number; speedX: number; speedY: number; opacity: number }[] = [];

    const drawGrid = () => {
      // Subtle game grid backdrop
      ctx.strokeStyle = document.documentElement.classList.contains('light')
        ? 'rgba(99, 102, 241, 0.04)'
        : 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      const step = 40;
      for (let x = 0; x < canvas.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    };

    const renderStaticGrid = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawGrid();
    };

    const initParticles = () => {
      particles = [];
      for (let i = 0; i < 24; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 2 + 1,
          speedX: (Math.random() - 0.5) * 0.4,
          speedY: (Math.random() - 0.5) * 0.4,
          opacity: Math.random() * 0.25 + 0.1,
        });
      }
    };

    const renderAnimated = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawGrid();

      // Draw subtle focus particles
      particles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.fillStyle = `rgba(99, 102, 241, ${p.opacity})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(renderAnimated);
    };

    const updateRenderMode = () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      if (isReduced) {
        // When reduced motion is preferred, render static subtle grid and stop particle animation
        renderStaticGrid();
      } else {
        if (particles.length === 0) {
          initParticles();
        }
        renderAnimated();
      }
    };

    updateRenderMode();

    const handleMotionPreferenceChange = (e: MediaQueryListEvent) => {
      isReduced = e.matches;
      updateRenderMode();
    };

    if (mediaQuery) {
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleMotionPreferenceChange);
      } else if ((mediaQuery as any).addListener) {
        (mediaQuery as any).addListener(handleMotionPreferenceChange);
      }
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (mediaQuery) {
        if (mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener('change', handleMotionPreferenceChange);
        } else if ((mediaQuery as any).removeListener) {
          (mediaQuery as any).removeListener(handleMotionPreferenceChange);
        }
      }
    };
  }, [isDark]);

  const handlePairClick = (left: string, right: string) => {
    if (disabled) return;
    const updated = { ...matchState, [left]: right };
    setMatchState(updated);
    onAnswerSubmit(updated);
    if (!checkReducedMotion()) {
      confetti({ particleCount: 20, spread: 40, origin: { y: 0.8 } });
    }
  };

  const handleOptionClick = (opt: string) => {
    if (disabled) return;
    onAnswerSubmit(opt);
    if (!checkReducedMotion()) {
      confetti({ particleCount: 25, spread: 50, origin: { y: 0.8 } });
    }
  };

  const handleMultipleOptionToggle = (opt: string) => {
    if (disabled) return;
    const currentList: string[] = Array.isArray(selectedAnswer)
      ? [...selectedAnswer]
      : typeof selectedAnswer === 'string' && selectedAnswer
      ? [selectedAnswer]
      : [];
    const index = currentList.indexOf(opt);
    let updated: string[];
    if (index > -1) {
      updated = currentList.filter((item) => item !== opt);
    } else {
      updated = [...currentList, opt];
    }
    onAnswerSubmit(updated);
    if (!checkReducedMotion()) {
      confetti({ particleCount: 20, spread: 45, origin: { y: 0.8 } });
    }
  };

  const isMultiple = answerType === 'multiple';
  const selectedList: string[] = Array.isArray(selectedAnswer)
    ? selectedAnswer
    : typeof selectedAnswer === 'string' && selectedAnswer
    ? [selectedAnswer]
    : [];

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-5 sm:p-7 text-slate-900 dark:text-white">
      {/* Background Animated Canvas (Subtle focus field) */}
      <canvas
        ref={canvasRef}
        width={800}
        height={320}
        className="absolute inset-0 w-full h-full pointer-events-none opacity-40"
      />

      {/* Header bar inside puzzle arena */}
      <div className="relative z-10 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3 mb-5">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-indigo-600 dark:text-indigo-400">Assessment Challenge</span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
          <span>
            {isRankingMode
              ? 'Ranking Challenge (Order by Priority)'
              : answerType === 'multiple'
              ? 'Multiple Selection'
              : pairs && pairs.length > 0
              ? 'Match Pairs'
              : 'Single Choice'}
          </span>
        </div>
        {points != null && points > 0 ? (
          <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {points} Points
          </span>
        ) : null}
      </div>

      {/* Main Interactive Gameplay Area */}
      <div className="relative z-10 min-h-[220px] flex flex-col justify-center">
        {/* Match Puzzle if pairs configured */}
        {pairs && pairs.length > 0 ? (
          <div className="space-y-4">
            <div className="text-center py-1">
              <h3 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white mb-2 text-balance leading-relaxed">
                {content}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                Select an item on the left, then pick its corresponding match on the right:
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-6 max-w-xl mx-auto w-full min-w-0">
              <div className="space-y-2.5 min-w-0">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Items</span>
                {pairs.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedLeft(p.left)}
                    disabled={disabled}
                    className={`w-full text-left px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl border text-xs sm:text-sm font-medium transition-colors cursor-pointer min-w-0 break-words ${
                      selectedLeft === p.left
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs ring-2 ring-indigo-500/30'
                        : matchState[p.left]
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-semibold'
                        : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-slate-400 text-slate-800 dark:text-slate-200 shadow-xs'
                    }`}
                  >
                    <div className="flex flex-wrap sm:flex-nowrap justify-between items-center gap-1.5 min-w-0">
                      <span className="min-w-0 break-words flex-1">{p.left}</span>
                      {matchState[p.left] && (
                        <span className="shrink-0 text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-mono font-semibold">Matched</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="space-y-2.5 min-w-0">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Matches</span>
                {pairs.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (selectedLeft) {
                        handlePairClick(selectedLeft, p.right);
                        setSelectedLeft(null);
                      }
                    }}
                    disabled={disabled || !selectedLeft}
                    className={`w-full text-left px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl border text-xs sm:text-sm font-medium transition-colors min-w-0 break-words ${
                      selectedLeft
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 cursor-pointer text-slate-900 dark:text-slate-100'
                        : 'bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <span className="min-w-0 break-words block">{p.right}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Currently mapped status */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center mt-3 max-w-full px-1">
              {Object.entries(matchState).map(([k, v]) => (
                <span key={k} className="text-xs px-2 sm:px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono max-w-full break-words min-w-0">
                  <span className="break-words">{k}</span> &rarr; <strong className="text-indigo-600 dark:text-indigo-400 font-semibold break-words">{v}</strong>
                </span>
              ))}
            </div>
          </div>
        ) : isRankingMode ? (
          /* Ranking / Priority Ordering Question */
          <div className="space-y-5">
            <div className="text-center py-1">
              <h3 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white mb-2 leading-relaxed text-balance">
                {content}
              </h3>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 text-xs text-indigo-800 dark:text-indigo-300 font-medium">
                <ListOrdered className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>
                  Rank statements by priority: <strong>1 = Highest Priority</strong>,{' '}
                  <strong>{rankingItems.length} = Lowest Priority</strong>.
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                Use drag-and-drop or the accessible Up/Down arrow buttons to adjust the order.
              </p>
            </div>

            <div
              role="list"
              aria-label="Statements to rank"
              className="space-y-2.5 max-w-2xl mx-auto w-full"
            >
              {rankingItems.map((item, idx) => {
                const rankNum = idx + 1;
                const isFirst = idx === 0;
                const isLast = idx === rankingItems.length - 1;
                const isDragged = draggedIndex === idx;

                return (
                  <div
                    key={item.id}
                    role="listitem"
                    draggable={!disabled}
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, idx)}
                    className={`flex items-center gap-2.5 sm:gap-3.5 p-3 sm:p-3.5 rounded-xl border transition-all ${
                      isDragged
                        ? 'opacity-40 border-dashed border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
                        : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600/60 shadow-2xs'
                    }`}
                  >
                    {/* Drag Handle */}
                    <div
                      title="Drag to reorder"
                      className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 select-none touch-none shrink-0"
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>

                    {/* Rank Badge */}
                    <div
                      className={`px-2.5 py-1 rounded-md text-xs font-bold font-mono shrink-0 flex items-center justify-center border ${
                        rankNum === 1
                          ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                          : rankNum === 2
                          ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-600'
                          : rankNum === 3
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <span>Rank {rankNum}</span>
                    </div>

                    {/* Statement Content */}
                    <span className="text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100 flex-1 min-w-0 break-words">
                      {item.text}
                    </span>

                    {/* Priority label for top/bottom */}
                    {rankNum === 1 && (
                      <span className="hidden sm:inline-block text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded shrink-0">
                        Highest
                      </span>
                    )}
                    {rankNum === rankingItems.length && rankingItems.length > 2 && (
                      <span className="hidden sm:inline-block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded shrink-0">
                        Lowest
                      </span>
                    )}

                    {/* Up / Down Controls (Accessible & Mobile Friendly) */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveRankingItem(idx, idx - 1)}
                        disabled={disabled || isFirst}
                        aria-label={`Move statement ${rankNum} up`}
                        title="Move up"
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveRankingItem(idx, idx + 1)}
                        disabled={disabled || isLast}
                        aria-label={`Move statement ${rankNum} down`}
                        title="Move down"
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Multiple Choice, Pictorial Questions, or Text Answer */
          <div className="space-y-6">
            <div className="text-center py-1">
              <h3 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white mb-2 leading-relaxed text-balance">
                {content}
              </h3>
            </div>

            {/* Pictorial Prompt Illustrations (Single Hero, Comparison A/B, or Multi-Image Grid) */}
            {(() => {
              const promptImages = (images || [])
                .filter((img: any) => img.role !== 'option' && (img.optionIndex == null || img.optionIndex === ''))
                .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

              if (promptImages.length === 0) return null;

              const isComparison =
                imageLayout === 'comparison' ||
                (imageLayout === 'auto' && promptImages.length === 2);

              const isSingleHero =
                imageLayout === 'single_top' ||
                (imageLayout === 'auto' && promptImages.length === 1);

              return (
                <div className="my-4 max-w-4xl mx-auto">
                  {isComparison ? (
                    /* 2-Column Comparison Layout (Picture A & Picture B) */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {promptImages.map((img: any, idx: number) => {
                        const defaultLabel = idx === 0 ? 'Picture A' : 'Picture B';
                        const displayLabel = img.label || defaultLabel;
                        return (
                          <div
                            key={img.id || idx}
                            className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs hover:border-indigo-400 dark:hover:border-indigo-500/60 transition-colors"
                          >
                            <div className="flex items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200">
                              <span className="flex items-center gap-1.5 font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                                <ImageIcon className="w-3.5 h-3.5" />
                                {displayLabel}
                              </span>
                              <button
                                type="button"
                                onClick={() => setActiveZoomImage(img)}
                                className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                title="Click to enlarge"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div
                              onClick={() => setActiveZoomImage(img)}
                              className="p-3 bg-slate-100/60 dark:bg-slate-950/40 flex items-center justify-center cursor-pointer min-h-[180px] max-h-[300px] overflow-hidden group"
                            >
                              <img
                                src={img.url}
                                alt={displayLabel}
                                className="max-h-[260px] w-auto max-w-full object-contain rounded-md transition-transform duration-200 group-hover:scale-[1.02]"
                                loading="lazy"
                              />
                            </div>
                            {img.caption && (
                              <div className="px-3.5 py-2 text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                                {img.caption}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : isSingleHero ? (
                    /* Single Main Illustration Layout */
                    <div className="max-w-2xl mx-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                      {promptImages[0].label && (
                        <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200">
                          <span className="flex items-center gap-1.5 font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                            <ImageIcon className="w-3.5 h-3.5" />
                            {promptImages[0].label}
                          </span>
                          <button
                            type="button"
                            onClick={() => setActiveZoomImage(promptImages[0])}
                            className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                            title="Click to enlarge"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <div
                        onClick={() => setActiveZoomImage(promptImages[0])}
                        className="p-4 bg-slate-100/60 dark:bg-slate-950/40 flex items-center justify-center cursor-pointer min-h-[200px] max-h-[360px] overflow-hidden group relative"
                      >
                        <img
                          src={promptImages[0].url}
                          alt={promptImages[0].label || 'Illustration'}
                          className="max-h-[320px] w-auto max-w-full object-contain rounded-md transition-transform duration-200 group-hover:scale-[1.01]"
                          loading="lazy"
                        />
                        <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/60 text-white text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 pointer-events-none">
                          <Maximize2 className="w-3 h-3" />
                          <span>Click to enlarge</span>
                        </div>
                      </div>
                      {promptImages[0].caption && (
                        <div className="px-4 py-2 text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 text-center">
                          {promptImages[0].caption}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Multi-Image Grid Layout (3+ Images) */
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {promptImages.map((img: any, idx: number) => (
                        <div
                          key={img.id || idx}
                          className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs hover:border-indigo-400 dark:hover:border-indigo-500/60 transition-colors"
                        >
                          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
                            <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold truncate">
                              {img.label || `Figure ${idx + 1}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveZoomImage(img)}
                              className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                              title="Click to enlarge"
                            >
                              <Maximize2 className="w-3 h-3" />
                            </button>
                          </div>
                          <div
                            onClick={() => setActiveZoomImage(img)}
                            className="p-2 bg-slate-100/60 dark:bg-slate-950/40 flex items-center justify-center cursor-pointer min-h-[140px] max-h-[200px] overflow-hidden group"
                          >
                            <img
                              src={img.url}
                              alt={img.label || `Image ${idx + 1}`}
                              className="max-h-[180px] w-auto max-w-full object-contain rounded transition-transform group-hover:scale-[1.02]"
                              loading="lazy"
                            />
                          </div>
                          {img.caption && (
                            <div className="px-3 py-1.5 text-[11px] text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                              {img.caption}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Answer Options (with optional per-option illustrations) */}
            {options && options.length > 0 ? (
              <div className="space-y-4 max-w-2xl mx-auto">
                {isMultiple && (
                  <div className="flex items-center justify-center">
                    <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                      Select all choices that apply
                    </span>
                  </div>
                )}
                <div
                  role={isMultiple ? 'group' : 'radiogroup'}
                  aria-label={isMultiple ? 'Answer choices - multiple selection' : 'Answer choices - single choice'}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4"
                >
                  {options.map((opt, idx) => {
                    const isSelected = isMultiple ? selectedList.includes(opt) : selectedAnswer === opt;
                    const optLetter = String.fromCharCode(65 + idx);

                    // Check for an option-specific image (e.g. Option A, Option B, Picture A, or optionIndex matching idx)
                    const optionImages = (images || []).filter(
                      (img: any) => img.role === 'option' || (img.optionIndex != null && img.optionIndex !== '')
                    );
                    const optImg = optionImages.find(
                      (img: any) =>
                        img.optionIndex === idx ||
                        (img.label &&
                          (img.label.trim().toLowerCase() === `option ${optLetter.toLowerCase()}` ||
                            img.label.trim().toLowerCase() === `picture ${optLetter.toLowerCase()}` ||
                            img.label.trim().toLowerCase() === optLetter.toLowerCase()))
                    );

                    return (
                      <button
                        key={idx}
                        type="button"
                        role={isMultiple ? 'checkbox' : 'radio'}
                        aria-checked={isSelected}
                        onClick={() => (isMultiple ? handleMultipleOptionToggle(opt) : handleOptionClick(opt))}
                        disabled={disabled}
                        className={`relative flex flex-col items-start gap-2.5 p-3.5 sm:p-4 rounded-xl border text-left font-medium transition-all cursor-pointer shadow-xs min-w-0 ${
                          isSelected
                            ? 'bg-indigo-600 dark:bg-indigo-600 border-indigo-600 text-white selected-answer-option ring-2 ring-indigo-500/20'
                            : 'bg-white hover:bg-slate-50 dark:bg-slate-800/80 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-900 dark:text-slate-100 unselected-answer-option'
                        }`}
                      >
                        {/* Option Picture if present */}
                        {optImg && (
                          <div className="w-full h-32 rounded-lg bg-slate-100 dark:bg-slate-900/60 p-1.5 flex items-center justify-center overflow-hidden border border-slate-200/60 dark:border-slate-700/60 relative group">
                            <img
                              src={optImg.url}
                              alt={`Option ${optLetter}`}
                              className="max-h-full max-w-full object-contain rounded"
                              loading="lazy"
                            />
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveZoomImage(optImg);
                              }}
                              className="absolute top-1.5 right-1.5 p-1 rounded bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
                              title="Enlarge option image"
                            >
                              <Maximize2 className="w-3 h-3" />
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-3 w-full">
                          {isMultiple && (
                            <div
                              aria-hidden="true"
                              className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold shrink-0 transition-all border ${
                                isSelected
                                  ? 'bg-white text-indigo-700 border-white shadow-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400'
                              }`}
                            >
                              {isSelected ? <Check className="w-3.5 h-3.5 text-indigo-700 stroke-[3]" /> : null}
                            </div>
                          )}
                          <span
                            aria-hidden="true"
                            className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold shrink-0 font-mono transition-colors ${
                              isSelected
                                ? 'bg-white text-indigo-700 font-bold shadow-xs'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {optLetter}
                          </span>
                          <span
                            className={`text-sm sm:text-base flex-1 min-w-0 break-words ${
                              isSelected
                                ? 'font-bold text-white'
                                : 'font-medium text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {opt}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : defaultInput !== false ? (
              <div className="max-w-md mx-auto">
                <input
                  type="text"
                  placeholder="Type your answer here..."
                  value={selectedAnswer || ''}
                  onChange={(e) => onAnswerSubmit(e.target.value)}
                  disabled={disabled}
                  className="w-full px-4 py-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
                />
              </div>
            ) : null}
          </div>
        )}

        {/* Lightbox Modal for Enlargeable Images */}
        {activeZoomImage && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setActiveZoomImage(null)}
          >
            <div
              className="relative max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center gap-3 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between w-full border-b border-slate-100 dark:border-slate-800 pb-3">
                <span className="font-semibold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  {activeZoomImage.label || 'Illustration View'}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveZoomImage(null)}
                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center justify-center max-h-[70vh] overflow-auto w-full p-2">
                <img
                  src={activeZoomImage.url}
                  alt={activeZoomImage.label || 'Enlarged Illustration'}
                  className="max-h-[68vh] w-auto max-w-full object-contain rounded-lg shadow-sm"
                />
              </div>

              {activeZoomImage.caption && (
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 text-center mt-1">
                  {activeZoomImage.caption}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
