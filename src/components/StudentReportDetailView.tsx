import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Building2,
  RotateCcw,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  ListOrdered,
  Image as ImageIcon,
  Maximize2,
  X,
} from 'lucide-react';

export interface StudentReportDetailViewProps {
  token: string;
  studentId: string;
  student?: any;
  schoolName?: string;
  onBack: () => void;
}

// Helper to format published/created date and time as DD-MM-YYYY • hh:mm A in user's local timezone
function formatPublishedDateTime(rawDateVal?: Date | string | null): string {
  if (!rawDateVal) return '—';
  const d = new Date(rawDateVal);
  if (isNaN(d.getTime())) return String(rawDateVal);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = pad(d.getMinutes());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursStr = pad(hours);
  return `${day}-${month}-${year} • ${hoursStr}:${minutes} ${ampm}`;
}

export function StudentReportDetailView({
  token,
  studentId,
  student,
  schoolName,
  onBack,
}: StudentReportDetailViewProps) {
  const [report, setReport] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [previewImageModal, setPreviewImageModal] = useState<any | null>(null);

  useEffect(() => {
    if (!previewImageModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewImageModal(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImageModal]);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const fetchStudentReport = async () => {
    if (!studentId) {
      setLoadError('Student not found.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/reports/students/${encodeURIComponent(studentId)}`, { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Unable to load student report.');
      }
      const data = await res.json();
      setReport(data);
    } catch (err: any) {
      console.error('Failed to load student report', err);
      setLoadError(err.message || 'Unable to load student report. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentReport();
  }, [studentId]);

  const activeStudent = report?.student || student || {};
  const timeline: any[] = report?.timeline || [];

  return (
    <div className="space-y-6 max-w-7xl animate-in fade-in duration-150">
      {/* Top Navigation Bar with Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="px-3.5 py-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-2xs cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Back to Students</span>
          </button>

          <span className="text-slate-300 dark:text-slate-600 text-xs hidden sm:inline">&bull;</span>

          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="text-slate-900 dark:text-white font-medium">{activeStudent.studentName || 'Student'}</span>
            <span className="font-mono text-indigo-600 dark:text-indigo-300">({activeStudent.uniqueStudentId || studentId})</span>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchStudentReport}
          disabled={isLoading}
          className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors self-start sm:self-auto cursor-pointer shadow-2xs"
          title="Refresh Report"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Main Report Card */}
      <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-6">
        {isLoading ? (
          <div className="py-24 text-center space-y-3 font-mono">
            <div className="w-8 h-8 border-3 border-indigo-600 dark:border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Loading student report...
            </p>
          </div>
        ) : loadError ? (
          <div className="p-6 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-600 dark:text-rose-400 mx-auto" />
            <h4 className="text-sm font-bold text-rose-800 dark:text-rose-200">Unable to load student report</h4>
            <p className="text-xs text-rose-700 dark:text-rose-300/80 max-w-md mx-auto">{loadError}</p>
            <button
              type="button"
              onClick={fetchStudentReport}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-2xs"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header Profile Summary */}
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-slate-100 dark:border-slate-800 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {activeStudent.studentName || 'Student Name'}
                  </h3>
                  {activeStudent.className && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700">
                      {activeStudent.className}
                      {activeStudent.section ? ` - Sec ${activeStudent.section}` : ''}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>{activeStudent.schoolName || schoolName || 'School'}</span>
                </p>
              </div>

              {/* Identity & Reference Codes */}
              <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
                <div className="px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400 block text-[11px] font-sans font-medium mb-0.5">Student ID</span>
                  <span className="text-indigo-700 dark:text-indigo-400 font-bold text-sm">
                    {activeStudent.uniqueStudentId || studentId}
                  </span>
                </div>

                <div className="px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400 block text-[11px] font-sans font-medium mb-0.5">Admission Number</span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold text-sm">
                    {activeStudent.schoolAdmissionNumber || '—'}
                  </span>
                </div>

                <div className="px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400 block text-[11px] font-sans font-medium mb-0.5">Tests Taken</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                    {timeline.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Chronological Test History Timeline */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Test History ({timeline.length})</span>
                </h4>
              </div>

              {timeline.length > 0 ? (
                timeline.map((item: any, idx: number) => (
                  <div
                    key={item.assignmentId || idx}
                    className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors shadow-xs"
                  >
                    {/* Test Header */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <h5 className="font-semibold text-base text-slate-900 dark:text-white leading-snug">
                          {(() => {
                            const num = item.assessmentNumber || idx + 1;
                            const baseTitle = item.assessmentName || item.originalPublishName || item.publishName || item.testName || 'Test';
                            return (/^\d+\./.test(baseTitle) || baseTitle.startsWith('Assessment -')) ? baseTitle : `${num}. ${baseTitle}`;
                          })()}
                        </h5>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-mono">
                          <span>{item.publishMode || 'Selected Questions'}</span>
                          <span className="text-slate-300 dark:text-slate-600">&bull;</span>
                          <span>{formatPublishedDateTime(item.publishedCreatedAt || item.createdAt)}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        {/* Status Badge */}
                        <div className="flex items-center gap-1 font-mono text-xs">
                          <span className="text-slate-500 dark:text-slate-400">Status:</span>
                          <span
                            className={`px-2 py-0.5 rounded-md font-semibold uppercase text-[10px] ${
                              item.status === 'COMPLETED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800'
                                : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950 dark:text-rose-400 dark:border-rose-800'
                            }`}
                          >
                            {item.status === 'COMPLETED' ? 'Completed' : 'Incomplete'}
                          </span>
                        </div>

                        {/* Exit Type Badge - Only display for incomplete/locked attempts when an actual EXIT or LOGOUT event occurred */}
                        {(item.status === 'INCOMPLETE' || item.status === 'LOCKED_INCOMPLETE') && (item.exitType === 'EXIT' || item.exitType === 'LOGOUT') && (
                          <div className="flex items-center gap-1 font-mono text-xs">
                            <span className="text-slate-500 dark:text-slate-400">Exit Type:</span>
                            <span
                              className={`font-semibold ${
                                item.exitType === 'EXIT'
                                  ? 'text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 dark:text-amber-400 dark:bg-amber-950/80 dark:border-amber-800 font-bold'
                                  : 'text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 dark:text-sky-400 dark:bg-sky-950/80 dark:border-sky-800 font-bold'
                              }`}
                            >
                              {item.exitType}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Completion / Submission Date & Time (Directly below header before Question Breakdown) */}
                    {item.status === 'COMPLETED' && (
                      <div className="text-xs text-slate-600 dark:text-slate-300 font-mono">
                        <span>Completed: {formatPublishedDateTime(item.completedAt || item.updatedAt || item.createdAt)}</span>
                      </div>
                    )}

                    {/* Question Level Evaluation Breakdown */}
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-700/60 space-y-2">
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                        <span>Question Results:</span>
                      </div>

                      <div className="space-y-2">
                        {item.questions && item.questions.length > 0 ? (
                          item.questions.map((q: any, qIdx: number) => {
                            const isRanking = Boolean(
                              q.isRanking ||
                              q.isRankingQuestion ||
                              String(q.questionType || '').toLowerCase() === 'ranking'
                            );
                            // Normalized ranking statements array
                            const rankingList: { rank: number; text: string }[] = isRanking && Array.isArray(q.studentAnswer)
                              ? q.studentAnswer.map((itemAns: any, sIdx: number) => {
                                  if (typeof itemAns === 'object' && itemAns !== null) {
                                    return {
                                      rank: itemAns.rank ?? sIdx + 1,
                                      text: String(itemAns.text || itemAns.content || itemAns.name || `Item ${sIdx + 1}`),
                                    };
                                  }
                                  return { rank: sIdx + 1, text: String(itemAns) };
                                })
                              : [];

                            return (
                            <div
                              key={qIdx}
                              className="p-4 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs flex flex-col gap-3.5 hover:border-slate-300 dark:hover:border-slate-700/80 transition-colors shadow-2xs"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                <div className="space-y-1.5 flex-1 min-w-0">
                                  {/* Question Group & Difficulty Level & Question Type */}
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                                    <span className="text-slate-500 dark:text-slate-400">
                                      Group: <strong className="text-indigo-600 dark:text-indigo-300 font-sans font-semibold">{q.groupName || 'General'}</strong>
                                    </span>
                                    <span className="text-slate-300 dark:text-slate-600">&bull;</span>
                                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                      Difficulty:
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${
                                          String(q.difficulty || '').toLowerCase() === 'easy'
                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-800/60'
                                            : String(q.difficulty || '').toLowerCase() === 'hard'
                                            ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/80 dark:text-rose-400 dark:border-rose-800/60'
                                            : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/80 dark:text-amber-400 dark:border-amber-800/60'
                                        }`}
                                      >
                                        {q.difficulty || 'Medium'}
                                      </span>
                                    </span>
                                    <span className="text-slate-300 dark:text-slate-600">&bull;</span>
                                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                      Type:
                                      <span className="text-indigo-600 dark:text-indigo-400 font-sans font-semibold">
                                        {isRanking ? 'Ranking Question' : q.questionType || (q.answerType === 'multiple' ? 'Multiple Selection' : 'Single Selection')}
                                      </span>
                                    </span>
                                    {q.points != null && (
                                      <>
                                        <span className="text-slate-300 dark:text-slate-600">&bull;</span>
                                        <span className="text-slate-500 dark:text-slate-400 font-mono">
                                          Max Points: <strong className="text-slate-700 dark:text-slate-300">{q.points}</strong>
                                        </span>
                                      </>
                                    )}
                                  </div>

                                  <div className="flex items-start gap-2">
                                    <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500 font-bold shrink-0 mt-0.5">Q{qIdx + 1} &mdash;</span>
                                    <p className="font-medium text-slate-800 dark:text-slate-200 leading-relaxed text-sm sm:text-base">{q.content}</p>
                                  </div>

                                  {/* Pictorial Question Image Thumbnails */}
                                  {Array.isArray(q.images) && q.images.length > 0 && (
                                    <div className="pl-6 sm:pl-7 pt-1 flex flex-wrap gap-2.5 items-center">
                                      {q.images.map((img: any, iIdx: number) => (
                                        <div
                                          key={img.id || iIdx}
                                          onClick={() => setPreviewImageModal(img)}
                                          className="flex items-center gap-2 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors group"
                                          title="Click to enlarge image"
                                        >
                                          <div className="w-12 h-12 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center overflow-hidden shrink-0">
                                            <img
                                              src={img.url}
                                              alt={img.label || 'Thumbnail'}
                                              className="max-h-full max-w-full object-contain"
                                              loading="lazy"
                                            />
                                          </div>
                                          <div className="pr-1">
                                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block font-mono">
                                              {img.label || `Image ${iIdx + 1}`}
                                            </span>
                                            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5 font-medium">
                                              <Maximize2 className="w-2.5 h-2.5" /> Enlarge
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Ranking Question Display */}
                                  {isRanking && (
                                    <div className="pl-6 sm:pl-7 pt-1 space-y-2">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                                        <ListOrdered className="w-3.5 h-3.5" />
                                        <span>Student's Submitted Ranking (1 = Highest Priority):</span>
                                      </span>
                                      {rankingList.length > 0 ? (
                                        <div className="space-y-1.5 max-w-xl">
                                          {rankingList.map((itemAns, sIdx) => (
                                            <div
                                              key={sIdx}
                                              className="px-3 py-1.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-xs flex items-center gap-2.5"
                                            >
                                              <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold font-mono shrink-0 bg-indigo-600 text-white">
                                                {itemAns.rank}
                                              </span>
                                              <span className="font-medium text-slate-800 dark:text-slate-200 flex-1">{itemAns.text}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-xs text-slate-500 italic">No ranking recorded.</p>
                                      )}
                                    </div>
                                  )}

                                  {/* Standard Options snapshot if not ranking */}
                                  {!isRanking && Array.isArray(q.options) && q.options.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-6 sm:pl-7 pt-1">
                                      {q.options.map((opt: string, optIdx: number) => {
                                        const optLetter = String.fromCharCode(65 + optIdx);
                                        const isStudentChoice = Array.isArray(q.studentAnswer)
                                          ? q.studentAnswer.includes(opt) || q.studentAnswer.includes(optLetter)
                                          : String(q.studentAnswer).trim() === opt || String(q.studentAnswer).trim() === optLetter;
                                        return (
                                          <div
                                            key={optIdx}
                                            className={`px-2.5 py-1 rounded-lg border text-xs flex items-center gap-2 ${
                                              isStudentChoice
                                                ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-500/60 text-indigo-900 dark:text-white font-medium'
                                                : 'bg-slate-100/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/40 text-slate-700 dark:text-slate-300'
                                            }`}
                                          >
                                            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                              isStudentChoice ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                            }`}>
                                              {optLetter}
                                            </span>
                                            <span className="truncate">{opt}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {!isRanking && (
                                    <div className="flex flex-wrap items-center gap-2 text-slate-500 dark:text-slate-400 pl-6 sm:pl-7">
                                      <span>
                                        Student's Answer:{' '}
                                        <strong className="text-slate-900 dark:text-white">
                                          {Array.isArray(q.studentAnswer)
                                            ? (q.studentAnswer.length > 0 ? q.studentAnswer.join(', ') : 'None')
                                            : typeof q.studentAnswer === 'object' && q.studentAnswer !== null
                                            ? JSON.stringify(q.studentAnswer)
                                            : String(q.studentAnswer || 'None')}
                                        </strong>
                                      </span>
                                      {q.correctAnswer != null && String(q.correctAnswer).trim() !== '' && (
                                        <>
                                          <span>&bull;</span>
                                          <span>
                                            Correct Answer:{' '}
                                            <strong className="text-emerald-600 dark:text-emerald-400">
                                              {Array.isArray(q.correctAnswer)
                                                ? q.correctAnswer.join(', ')
                                                : typeof q.correctAnswer === 'object' && q.correctAnswer !== null
                                                ? JSON.stringify(q.correctAnswer)
                                                : String(q.correctAnswer)}
                                            </strong>
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  )}

                                  {/* Expected Response and Scoring Guide if defined */}
                                  {(q.expectedResponse || q.scoringGuide) && (
                                    <div className="pl-6 sm:pl-7 pt-1 text-xs space-y-1.5">
                                      {q.expectedResponse && (
                                        <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                                          <span className="font-semibold text-slate-700 dark:text-slate-300">Expected Response: </span>
                                          <span className="text-slate-600 dark:text-slate-400 font-mono">{typeof q.expectedResponse === 'object' ? JSON.stringify(q.expectedResponse) : String(q.expectedResponse)}</span>
                                        </div>
                                      )}
                                      {q.scoringGuide && (
                                        <div className="p-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-300">
                                          <span className="font-semibold">Scoring Guide: </span>
                                          <span>{typeof q.scoringGuide === 'object' ? JSON.stringify(q.scoringGuide) : String(q.scoringGuide)}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {q.writtenExplanation && (
                                    <div className="text-xs text-slate-700 dark:text-slate-300 pl-6 sm:pl-7 pt-0.5">
                                      <span className="text-slate-500 dark:text-slate-400 font-medium">Written Explanation: </span>
                                      <span className="italic text-slate-800 dark:text-slate-200">"{q.writtenExplanation}"</span>
                                    </div>
                                  )}
                                </div>

                                <div className="flex sm:flex-col items-end gap-2 shrink-0 font-mono self-end sm:self-auto">
                                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {q.timeAllowedSeconds != null && q.timeAllowedSeconds > 0
                                      ? `${q.timeTakenSeconds}s / ${q.timeAllowedSeconds}s`
                                      : `${q.timeTakenSeconds}s`}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded font-bold ${
                                      q.isCorrect || (q.earnedPoints !== undefined && q.earnedPoints !== null && Number(q.earnedPoints) > 0)
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800/60'
                                        : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800/60'
                                    }`}
                                  >
                                    {q.isCorrect || (q.earnedPoints !== undefined && q.earnedPoints !== null && Number(q.earnedPoints) > 0)
                                      ? `+${q.earnedPoints || (q.points != null ? q.points : 0)} pts`
                                      : '0 pts'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            );
                          })
                        ) : (
                          <p className="text-xs text-slate-500 italic p-2">No question details recorded.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 rounded-xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 text-center space-y-2">
                  <HelpCircle className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No tests taken yet</p>
                  <p className="text-xs text-slate-500">
                    This student has not taken any tests yet.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lightbox Modal for Enlargeable Images */}
        {previewImageModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setPreviewImageModal(null)}
          >
            <div
              className="relative max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center gap-3 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between w-full border-b border-slate-100 dark:border-slate-800 pb-3">
                <span className="font-semibold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  {previewImageModal.label || 'Illustration View'}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewImageModal(null)}
                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center justify-center max-h-[70vh] overflow-auto w-full p-2">
                <img
                  src={previewImageModal.url}
                  alt={previewImageModal.label || 'Enlarged Illustration'}
                  className="max-h-[68vh] w-auto max-w-full object-contain rounded-lg shadow-sm"
                />
              </div>

              {previewImageModal.caption && (
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 text-center mt-1">
                  {previewImageModal.caption}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
