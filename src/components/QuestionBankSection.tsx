import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  PlusCircle,
  Eye,
  Edit,
  HelpCircle,
  Search,
  CheckCircle,
  Clock,
  Award,
  Trash2,
  AlertTriangle,
  ShieldCheck,
  X,
  Image as ImageIcon,
  Upload,
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
  RefreshCw,
  Maximize2,
} from 'lucide-react';

interface QuestionBankSectionProps {
  token: string;
  questionGroups: any[];
  allQuestions: any[];
  onRefreshData: () => Promise<void>;
}

// -------------------------------------------------------------
// Read-Only Question Detail Card Component (Shows complete details)
// -------------------------------------------------------------
function ReadOnlyQuestionDetailCard({
  question,
  index,
  groupName,
  onEdit,
  onDelete,
}: {
  question: any;
  index?: number;
  groupName?: string;
  onEdit?: (question: any) => void;
  onDelete?: (question: any) => void;
}) {
  const q = question;
  const effectiveGroup = q.groupName || groupName || 'General';
  const effectiveDifficulty = q.difficulty || 'Medium';

  // Question Type display: Single Selection, Multiple Selection, Type
  const isMultiple = q.answerType === 'multiple';
  const typeDisplay = isMultiple
    ? 'Multiple Selection'
    : q.answerType === 'single'
    ? 'Single Selection'
    : (q.questionType || 'Single Selection');

  const hasSpecificType =
    q.questionType &&
    q.questionType !== 'single' &&
    q.questionType !== 'multiple' &&
    q.questionType !== typeDisplay;

  // Options
  const hasOptions = Array.isArray(q.options) && q.options.length > 0;

  // Correct Answer
  const hasCorrectAnswer =
    (q.correctAnswer != null && String(q.correctAnswer).trim() !== '') ||
    (Array.isArray(q.correctAnswers) && q.correctAnswers.length > 0);

  const correctAnswerDisplay = hasCorrectAnswer
    ? Array.isArray(q.correctAnswers) && q.correctAnswers.length > 0
      ? q.correctAnswers.join(', ')
      : typeof q.correctAnswer === 'object' && q.correctAnswer !== null
      ? JSON.stringify(q.correctAnswer)
      : String(q.correctAnswer)
    : null;

  return (
    <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3.5 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
      {/* Top Meta Header: Question #, Group, Difficulty, Type, Points, Time Limit */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {index != null && (
            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold font-mono text-[11px]">
              Q{index + 1}
            </span>
          )}
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {effectiveGroup}
          </span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
          <span
            className={`font-semibold ${
              effectiveDifficulty === 'Easy'
                ? 'text-emerald-700 dark:text-emerald-400'
                : effectiveDifficulty === 'Hard'
                ? 'text-rose-700 dark:text-rose-400'
                : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            {effectiveDifficulty}
          </span>
          {Boolean(q.isRanking || q.isRankingQuestion || q.questionType === 'Ranking' || q.questionType === 'ranking') ? (
            <>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-purple-700 dark:text-purple-400 font-semibold">
                Ranking Question
              </span>
            </>
          ) : hasOptions ? (
            <>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-slate-600 dark:text-slate-400">
                {typeDisplay}
                {hasSpecificType ? ` (${q.questionType})` : ''}
              </span>
            </>
          ) : null}
          {Boolean(q.enableWrittenExplanation) && (
            <>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-indigo-700 dark:text-indigo-400 font-medium">
                Written Explanation Enabled
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
          {q.points != null && q.points > 0 ? (
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <Award className="w-3.5 h-3.5" />
              {q.points} pts
            </span>
          ) : null}

          {q.timeSeconds != null && q.timeSeconds > 0 ? (
            <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              {q.timeSeconds}s
            </span>
          ) : null}

          {(onEdit || onDelete) && (
            <div className="flex items-center gap-1.5 ml-auto sm:ml-2">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(q)}
                  className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 text-xs font-sans font-medium transition-colors shadow-2xs cursor-pointer"
                  title="Edit question"
                >
                  <Edit className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Edit</span>
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(q)}
                  className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:border-rose-200 dark:hover:border-rose-900 flex items-center gap-1 text-xs font-sans font-medium transition-colors shadow-2xs cursor-pointer"
                  title="Delete question"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Question Text */}
      <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
          Question Text
        </span>
        <p className="text-slate-900 dark:text-slate-100 font-medium text-sm sm:text-base leading-relaxed">
          {q.content}
        </p>
      </div>

      {/* Pictorial Illustrations (if present) */}
      {Array.isArray(q.images) && q.images.length > 0 && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            Pictorial Illustrations ({q.images.length})
          </span>
          <div className="flex flex-wrap gap-2.5">
            {q.images.map((img: any, iIdx: number) => (
              <div
                key={img.id || iIdx}
                className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 shadow-2xs"
              >
                <div className="w-14 h-14 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center overflow-hidden shrink-0">
                  <img
                    src={img.url}
                    alt={img.label || 'Illustration'}
                    className="max-h-full max-w-full object-contain"
                    loading="lazy"
                  />
                </div>
                <div className="pr-1 text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block font-mono text-[11px]">
                    {img.label || `Picture ${String.fromCharCode(65 + iIdx)}`}
                  </span>
                  {img.caption && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate block max-w-[140px]">
                      {img.caption}
                    </span>
                  )}
                  <a
                    href={img.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 mt-0.5 font-medium"
                  >
                    <Maximize2 className="w-2.5 h-2.5" /> Full size
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Answer Choices / Options */}
      {hasOptions && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5">
            {Boolean(q.isRanking || q.isRankingQuestion || q.questionType === 'Ranking' || q.questionType === 'ranking')
              ? 'Statements / Items to Rank (Priority 1 to N)'
              : 'Answer Choices / Options'}
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {q.options.map((opt: string, optIdx: number) => (
              <div
                key={optIdx}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 text-slate-800 dark:text-slate-200 text-xs flex items-center gap-2.5"
              >
                <span className="w-5 h-5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center text-[10px] shrink-0 font-mono">
                  {Boolean(q.isRanking || q.isRankingQuestion || q.questionType === 'Ranking' || q.questionType === 'ranking')
                    ? optIdx + 1
                    : String.fromCharCode(65 + optIdx)}
                </span>
                <span className="truncate">{opt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Correct Answer */}
      <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
          Correct Answer
        </span>
        {hasCorrectAnswer ? (
          <div className="px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 font-semibold">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{correctAnswerDisplay}</span>
          </div>
        ) : (
          <span className="text-xs text-slate-500 dark:text-slate-400 italic px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 inline-block font-mono">
            {Boolean(q.isRanking || q.isRankingQuestion || q.questionType === 'Ranking' || q.questionType === 'ranking')
              ? 'Subjective / Assessor Scored'
              : 'Not Applicable'}
          </span>
        )}
      </div>
    </div>
  );
}

export function QuestionBankSection({
  token,
  questionGroups,
  allQuestions,
  onRefreshData,
}: QuestionBankSectionProps) {
  // Question groups sorted A to Z by name (matches the displayed dropdown options)
  const sortedQuestionGroups = useMemo(() => {
    return [...questionGroups].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base', numeric: true })
    );
  }, [questionGroups]);

  // New Question Group
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [isSubmittingGroup, setIsSubmittingGroup] = useState(false);

  // Edit Question Group (Group Name only)
  const [editingGroup, setEditingGroup] = useState<any | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [isUpdatingGroup, setIsUpdatingGroup] = useState(false);
  const [editGroupError, setEditGroupError] = useState<string | null>(null);

  // Group View Modal
  const [viewGroupModal, setViewGroupModal] = useState<any | null>(null);
  const [modalSearch, setModalSearch] = useState('');

  // Single Question View Modal (Read Only)
  const [viewSingleQuestion, setViewSingleQuestion] = useState<any | null>(null);

  // Delete Question Group Confirmation State
  const [deletingGroup, setDeletingGroup] = useState<any | null>(null);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);

  // Delete Question Confirmation State
  const [deletingQuestion, setDeletingQuestion] = useState<any | null>(null);
  const [isDeletingQuestion, setIsDeletingQuestion] = useState(false);

  // Question editing state
  const [editingQuestionItem, setEditingQuestionItem] = useState<any | null>(null);

  // New / Edit Question form
  const [questionForm, setQuestionForm] = useState<{
    groupId: string;
    difficulty: string;
    content: string;
    timeSeconds: string;
    points: string;
    options: string;
    multipleSelection: boolean;
    isRanking: boolean;
    enableWrittenExplanation: boolean;
    correctAnswer: string;
    images: any[];
    imageLayout: 'single_top' | 'comparison' | 'options_grid' | 'auto';
  }>({
    groupId: sortedQuestionGroups.length > 0 ? sortedQuestionGroups[0].id : '',
    difficulty: 'Easy',
    content: '',
    timeSeconds: '',
    points: '',
    options: '',
    multipleSelection: false,
    isRanking: false,
    enableWrittenExplanation: false,
    correctAnswer: '',
    images: [],
    imageLayout: 'auto',
  });
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);

  // Image Upload & Preview states
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewZoomImage, setPreviewZoomImage] = useState<any | null>(null);

  // Ensure the Group dropdown defaults to the first available group in the displayed dropdown options.
  // Handles asynchronous data loading, page refreshes, and group removals while preserving active user selection.
  useEffect(() => {
    if (editingQuestionItem) return;

    if (sortedQuestionGroups.length === 0) {
      if (questionForm.groupId !== '') {
        setQuestionForm((prev) => ({ ...prev, groupId: '' }));
      }
      return;
    }

    const currentGroupStillExists = sortedQuestionGroups.some(
      (g) => g.id === questionForm.groupId
    );

    if (!questionForm.groupId || !currentGroupStillExists) {
      setQuestionForm((prev) => ({ ...prev, groupId: sortedQuestionGroups[0].id }));
    }
  }, [sortedQuestionGroups, editingQuestionItem, questionForm.groupId]);

  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const handleDeleteQuestion = async () => {
    if (!deletingQuestion) return;
    const qId = deletingQuestion.id || deletingQuestion._id;
    if (!qId) return;

    setIsDeletingQuestion(true);
    setFeedbackMessage(null);
    try {
      const res = await fetch(`/api/questions/${qId}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackMessage({
          type: 'success',
          text: `Question deleted successfully. Past test results will not be affected.`,
        });
        setDeletingQuestion(null);
        if (editingQuestionItem && (editingQuestionItem.id === qId || editingQuestionItem._id === qId)) {
          setEditingQuestionItem(null);
          setQuestionForm({
            groupId: sortedQuestionGroups.length > 0 ? sortedQuestionGroups[0].id : '',
            difficulty: 'Easy',
            content: '',
            timeSeconds: '',
            points: '',
            options: '',
            multipleSelection: false,
            isRanking: false,
            enableWrittenExplanation: false,
            correctAnswer: '',
            images: [],
            imageLayout: 'auto',
          });
        }
        // Refresh question bank and group counts without closing viewGroupModal
        await onRefreshData();
      } else {
        setFeedbackMessage({
          type: 'error',
          text: data.error || 'Unable to delete question. Please try again.',
        });
      }
    } catch (e: any) {
      setFeedbackMessage({
        type: 'error',
        text: e.message || 'Something went wrong. Please try again.',
      });
    } finally {
      setIsDeletingQuestion(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!deletingGroup) return;
    const gId = deletingGroup.id || deletingGroup._id;
    if (!gId) return;

    setIsDeletingGroup(true);
    setFeedbackMessage(null);
    try {
      const res = await fetch(`/api/question-groups/${gId}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackMessage({
          type: 'success',
          text: `Question group "${deletingGroup.name}" and ${data.deletedQuestionsCount ?? 0} question(s) deleted successfully. Past test results will not be affected.`,
        });
        setDeletingGroup(null);
        if (viewGroupModal && (viewGroupModal.id === gId || viewGroupModal._id === gId)) {
          setViewGroupModal(null);
          setModalSearch('');
        }
        await onRefreshData();
      } else {
        setFeedbackMessage({
          type: 'error',
          text: data.error || 'Unable to delete question group. Please try again.',
        });
      }
    } catch (e: any) {
      setFeedbackMessage({
        type: 'error',
        text: e.message || 'Something went wrong. Please try again.',
      });
    } finally {
      setIsDeletingGroup(false);
    }
  };

  const handleUpdateGroupName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup) return;
    const gId = editingGroup.id || editingGroup._id;
    if (!gId) return;

    if (!editGroupName.trim()) {
      setEditGroupError('Question Group Name cannot be empty.');
      return;
    }

    setIsUpdatingGroup(true);
    setEditGroupError(null);
    try {
      const res = await fetch(`/api/question-groups/${gId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ name: editGroupName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackMessage({
          type: 'success',
          text: `Question group renamed to "${data.group?.name || editGroupName.trim()}" successfully.`,
        });
        setEditingGroup(null);
        setEditGroupName('');
        if (viewGroupModal && (viewGroupModal.id === gId || viewGroupModal._id === gId)) {
          setViewGroupModal((prev: any) => (prev ? { ...prev, name: data.group?.name || editGroupName.trim() } : null));
        }
        await onRefreshData();
      } else {
        setEditGroupError(data.error || 'Failed to update question group name.');
      }
    } catch (err: any) {
      setEditGroupError(err.message || 'Something went wrong while updating question group.');
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setIsSubmittingGroup(true);
    setFeedbackMessage(null);
    try {
      const res = await fetch('/api/question-groups', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: newGroupName.trim(), description: newGroupDesc.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewGroupName('');
        setNewGroupDesc('');
        setFeedbackMessage({ type: 'success', text: `Question group "${data.name}" created successfully.` });
        await onRefreshData();
      } else {
        setFeedbackMessage({ type: 'error', text: data.error || 'Unable to create question group. Please try again.' });
      }
    } catch (e: any) {
      setFeedbackMessage({ type: 'error', text: e.message || 'Unable to create question group. Please try again.' });
    } finally {
      setIsSubmittingGroup(false);
    }
  };

  const handleStartEditQuestion = (q: any) => {
    setEditingQuestionItem(q);
    setFeedbackMessage(null);

    let optsStr = '';
    if (Array.isArray(q.options)) {
      optsStr = q.options.join(', ');
    } else if (typeof q.options === 'string') {
      optsStr = q.options;
    }

    let corrAnsStr = '';
    if (Array.isArray(q.correctAnswers) && q.correctAnswers.length > 0) {
      corrAnsStr = q.correctAnswers.join(', ');
    } else if (Array.isArray(q.correctAnswer)) {
      corrAnsStr = q.correctAnswer.join(', ');
    } else if (q.correctAnswer != null && String(q.correctAnswer).trim() !== '') {
      corrAnsStr = typeof q.correctAnswer === 'object' ? JSON.stringify(q.correctAnswer) : String(q.correctAnswer);
    }

    const isMultiple = q.answerType === 'multiple' || Boolean(q.multipleSelection);
    const isRanking = Boolean(
      q.isRanking ||
      q.isRankingQuestion ||
      String(q.questionType || '').toLowerCase() === 'ranking'
    );

    setQuestionForm({
      groupId: q.groupId || (sortedQuestionGroups.length > 0 ? sortedQuestionGroups[0].id : ''),
      difficulty: q.difficulty || 'Easy',
      content: q.content || '',
      timeSeconds: q.timeSeconds != null ? String(q.timeSeconds) : (q.timeAllowedSeconds != null ? String(q.timeAllowedSeconds) : ''),
      points: q.points != null ? String(q.points) : '',
      options: optsStr,
      multipleSelection: isMultiple,
      isRanking,
      enableWrittenExplanation: Boolean(q.enableWrittenExplanation),
      correctAnswer: corrAnsStr,
      images: Array.isArray(q.images) ? q.images : [],
      imageLayout: q.imageLayout || 'auto',
    });

    const formElem = document.getElementById('question-form-container');
    if (formElem) {
      formElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleEditFromModal = (q: any) => {
    setViewGroupModal(null);
    setModalSearch('');
    handleStartEditQuestion(q);
  };

  const handleCancelEditQuestion = () => {
    setEditingQuestionItem(null);
    setQuestionForm({
      groupId: sortedQuestionGroups.length > 0 ? sortedQuestionGroups[0].id : '',
      difficulty: 'Easy',
      content: '',
      timeSeconds: '',
      points: '',
      options: '',
      multipleSelection: false,
      isRanking: false,
      enableWrittenExplanation: false,
      correctAnswer: '',
      images: [],
      imageLayout: 'auto',
    });
  };

  // Image Management Handlers
  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingImages(true);
    setUploadError(null);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('images', files[i]);
    }
    try {
      const res = await fetch('/api/uploads/images', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const contentType = res.headers.get('content-type') || '';
      let data: any = null;
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }

      if (res.ok && data && Array.isArray(data.images)) {
        const currentCount = questionForm.images?.length || 0;
        const newImgs = data.images.map((img: any, idx: number) => ({
          ...img,
          order: currentCount + idx,
        }));
        const combined = [...(questionForm.images || []), ...newImgs];
        setQuestionForm((prev) => ({
          ...prev,
          images: combined,
          imageLayout: prev.imageLayout || 'auto',
        }));
      } else {
        const fallbackMsg = res.status === 413
          ? 'File too large. Maximum file size is 5 MB.'
          : res.statusText
          ? `Upload failed (${res.status} ${res.statusText})`
          : `Upload failed with status ${res.status}`;
        setUploadError(data?.error || fallbackMsg);
      }
    } catch (err: any) {
      setUploadError(err.message || 'Image upload failed. Please check network connection.');
    } finally {
      setIsUploadingImages(false);
      e.target.value = '';
    }
  };

  const handleReplaceImage = async (index: number, file: File) => {
    setIsUploadingImages(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await fetch('/api/uploads/image', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const contentType = res.headers.get('content-type') || '';
      let data: any = null;
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }

      if (res.ok && data && data.image) {
        const current = [...(questionForm.images || [])];
        current[index] = {
          ...data.image,
          label: current[index]?.label || data.image.label,
          role: current[index]?.role || data.image.role,
          order: index,
        };
        setQuestionForm((prev) => ({ ...prev, images: current }));
      } else {
        const fallbackMsg = res.status === 413
          ? 'File too large. Maximum file size is 5 MB.'
          : res.statusText
          ? `Replacement failed (${res.status} ${res.statusText})`
          : `Replacement failed with status ${res.status}`;
        setUploadError(data?.error || fallbackMsg);
      }
    } catch (err: any) {
      setUploadError(err.message || 'Replacement upload failed.');
    } finally {
      setIsUploadingImages(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    const list = (questionForm.images || []).filter((_, idx) => idx !== index);
    const reordered = list.map((item, idx) => ({ ...item, order: idx }));
    setQuestionForm((prev) => ({ ...prev, images: reordered }));
  };

  const handleMoveImage = (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    const list = [...(questionForm.images || [])];
    if (targetIndex < 0 || targetIndex >= list.length) return;
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;
    const reordered = list.map((item, idx) => ({ ...item, order: idx }));
    setQuestionForm((prev) => ({ ...prev, images: reordered }));
  };

  const handleUpdateImageLabel = (index: number, label: string) => {
    const list = [...(questionForm.images || [])];
    if (list[index]) {
      list[index] = { ...list[index], label };
      setQuestionForm((prev) => ({ ...prev, images: list }));
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionForm.groupId) {
      setFeedbackMessage({ type: 'error', text: 'Please select a question group.' });
      return;
    }
    const opts = questionForm.options
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    setIsSubmittingQuestion(true);
    setFeedbackMessage(null);
    try {
      if (editingQuestionItem) {
        // Edit Mode: PUT /api/questions/:id
        const qId = editingQuestionItem.id || editingQuestionItem._id;
        const res = await fetch(`/api/questions/${qId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            groupId: questionForm.groupId,
            difficulty: questionForm.difficulty,
            content: questionForm.content.trim(),
            timeSeconds: questionForm.timeSeconds ? Number(questionForm.timeSeconds) : null,
            points: questionForm.points ? Number(questionForm.points) : null,
            correctAnswer: questionForm.correctAnswer.trim() ? questionForm.correctAnswer.trim() : null,
            options: opts,
            answerType: questionForm.multipleSelection ? 'multiple' : 'single',
            isRanking: questionForm.isRanking,
            isRankingQuestion: questionForm.isRanking,
            questionType: questionForm.isRanking ? 'Ranking' : (questionForm.multipleSelection ? 'Multiple Selection' : 'Single Selection'),
            enableWrittenExplanation: questionForm.enableWrittenExplanation,
            images: questionForm.images,
            imageLayout: questionForm.imageLayout || 'auto',
          }),
        });
        const data = await res.json();
        if (res.ok) {
          handleCancelEditQuestion();
          setFeedbackMessage({ type: 'success', text: 'Question updated successfully.' });
          await onRefreshData();
        } else {
          setFeedbackMessage({ type: 'error', text: data.error || 'Unable to update question. Please try again.' });
        }
      } else {
        // Add Mode: POST /api/questions
        const res = await fetch('/api/questions', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            groupId: questionForm.groupId,
            difficulty: questionForm.difficulty,
            content: questionForm.content.trim(),
            timeSeconds: questionForm.timeSeconds ? Number(questionForm.timeSeconds) : null,
            points: questionForm.points ? Number(questionForm.points) : null,
            correctAnswer: questionForm.correctAnswer.trim() ? questionForm.correctAnswer.trim() : null,
            options: opts,
            answerType: questionForm.multipleSelection ? 'multiple' : 'single',
            isRanking: questionForm.isRanking,
            isRankingQuestion: questionForm.isRanking,
            questionType: questionForm.isRanking ? 'Ranking' : (questionForm.multipleSelection ? 'Multiple Selection' : 'Single Selection'),
            enableWrittenExplanation: questionForm.enableWrittenExplanation,
            images: questionForm.images,
            imageLayout: questionForm.imageLayout || 'auto',
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setQuestionForm((prev) => ({
            ...prev,
            content: '',
            timeSeconds: '',
            points: '',
            options: '',
            multipleSelection: false,
            isRanking: false,
            enableWrittenExplanation: false,
            correctAnswer: '',
            images: [],
            imageLayout: 'auto',
          }));
          setFeedbackMessage({ type: 'success', text: 'Question saved successfully.' });
          await onRefreshData();
        } else {
          setFeedbackMessage({ type: 'error', text: data.error || 'Unable to save question. Please try again.' });
        }
      }
    } catch (e: any) {
      setFeedbackMessage({ type: 'error', text: e.message || 'Unable to save question. Please try again.' });
    } finally {
      setIsSubmittingQuestion(false);
    }
  };

  // Pre-calculate single-pass difficulty breakdown per group
  const groupBreakdownsMap = React.useMemo(() => {
    const map = new Map<string, { Easy: any[]; Medium: any[]; Hard: any[] }>();

    for (const q of allQuestions) {
      const gId = (q.groupId || '').toString().trim();
      const gName = (q.groupName || '').toString().trim().toLowerCase();
      const diff = (q.difficulty || '').trim().toLowerCase();
      const normalizedDiff: 'Easy' | 'Medium' | 'Hard' =
        diff === 'easy' ? 'Easy' : diff === 'hard' ? 'Hard' : 'Medium';

      const keys = [gId, gName].filter(Boolean);
      for (const k of keys) {
        if (!map.has(k)) {
          map.set(k, { Easy: [], Medium: [], Hard: [] });
        }
        map.get(k)![normalizedDiff].push(q);
      }
    }

    return map;
  }, [allQuestions]);

  const getGroupBreakdown = React.useCallback(
    (grp: any) => {
      const grpIdStr = (grp.id || grp._id || '').toString().trim();
      const grpNameLower = (grp.name || '').trim().toLowerCase();

      const bucket =
        (grpIdStr && groupBreakdownsMap.get(grpIdStr)) ||
        (grpNameLower && groupBreakdownsMap.get(grpNameLower)) || { Easy: [], Medium: [], Hard: [] };

      const getDifficultyTier = (level: 'Easy' | 'Medium' | 'Hard') => {
        const questions = bucket[level];
        const fallbackTier = grp.breakdown?.[level];
        const fallbackQuestions = fallbackTier?.questions || [];
        const fallbackCount =
          fallbackTier?.count ??
          (level === 'Easy' ? grp.easyCount : level === 'Medium' ? grp.mediumCount : grp.hardCount);

        return {
          count: questions.length > 0 ? questions.length : fallbackCount || 0,
          questions: questions.length > 0 ? questions : fallbackQuestions,
        };
      };

      const easyTier = getDifficultyTier('Easy');
      const mediumTier = getDifficultyTier('Medium');
      const hardTier = getDifficultyTier('Hard');

      return {
        Easy: easyTier,
        Medium: mediumTier,
        Hard: hardTier,
        total: easyTier.count + mediumTier.count + hardTier.count,
      };
    },
    [groupBreakdownsMap]
  );

  // Dynamically derive the view group data and questions from the latest allQuestions and questionGroups
  const activeViewGroup = useMemo(() => {
    if (!viewGroupModal) return null;
    const gId = (viewGroupModal.id || viewGroupModal._id || '').toString().trim();
    const gName = (viewGroupModal.name || '').trim().toLowerCase();
    const currentGrp =
      questionGroups.find(
        (g) => (g.id || g._id || '').toString().trim() === gId || (g.name || '').trim().toLowerCase() === gName
      ) || viewGroupModal;

    const breakdown = getGroupBreakdown(currentGrp);
    return {
      ...currentGrp,
      breakdown,
    };
  }, [viewGroupModal, questionGroups, getGroupBreakdown]);

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase text-indigo-600 dark:text-indigo-400 font-semibold tracking-wider">
            Curriculum & Questions
          </span>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-0.5">
            Question Bank & Groups
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
            Organize questions into subject groups (such as Creativity, Thinking, Reasoning, Aptitude), calibrate difficulty tiers (Easy, Medium, Hard), attach pictorial images via AWS S3, and maintain answer keys.
          </p>
        </div>
      </div>

      {feedbackMessage && (
        <div
          role={feedbackMessage.type === 'error' ? 'alert' : 'status'}
          aria-live={feedbackMessage.type === 'error' ? 'assertive' : 'polite'}
          className={`p-4 rounded-xl text-sm font-medium flex items-center justify-between shadow-2xs ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-500/50 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-500/50 text-rose-800 dark:text-rose-300'
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-xs underline opacity-80 hover:opacity-100 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Row: Create Group & Create Question */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create Group */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
          <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Add Question Group
          </h3>
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5 tracking-wider">
                Group Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Aptitude, Creativity, Thinking"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5 tracking-wider">
                Description
              </label>
              <textarea
                rows={3}
                placeholder="Short description of this question group"
                value={newGroupDesc}
                onChange={(e) => setNewGroupDesc(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmittingGroup}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              {isSubmittingGroup ? 'Creating Group...' : '+ Create Group'}
            </button>
          </form>
        </div>

        {/* Create / Edit Question */}
        <div id="question-form-container" className="lg:col-span-2 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              {editingQuestionItem ? (
                <>
                  <Edit className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Edit Question
                </>
              ) : (
                <>
                  <PlusCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Add Question
                </>
              )}
            </h3>
            {editingQuestionItem && (
              <span className="text-xs px-2.5 py-1 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono font-medium">
                Editing Question
              </span>
            )}
          </div>
          <form onSubmit={handleCreateQuestion} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5 tracking-wider">
                Group
              </label>
              <select
                value={
                  questionForm.groupId && sortedQuestionGroups.some((g) => g.id === questionForm.groupId)
                    ? questionForm.groupId
                    : (sortedQuestionGroups[0]?.id || '')
                }
                onChange={(e) => setQuestionForm({ ...questionForm, groupId: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-colors"
              >
                {sortedQuestionGroups.length === 0 ? (
                  <option value="">No question groups</option>
                ) : (
                  sortedQuestionGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5 tracking-wider">
                Difficulty
              </label>
              <select
                value={questionForm.difficulty}
                onChange={(e) => setQuestionForm({ ...questionForm, difficulty: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-colors"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard (Final Level)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5 tracking-wider">
                Time Limit <span className="text-slate-400 normal-case">(Seconds, Optional)</span>
              </label>
              <input
                type="number"
                min={1}
                placeholder="e.g. 30"
                value={questionForm.timeSeconds}
                onChange={(e) => setQuestionForm({ ...questionForm, timeSeconds: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-colors font-mono"
              />
            </div>

            <div className="sm:col-span-2 md:col-span-3">
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5 tracking-wider">
                Question Text
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Decode the hidden word puzzle from emojis: ☀️ + 👓 = ?"
                value={questionForm.content}
                onChange={(e) => setQuestionForm({ ...questionForm, content: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5 tracking-wider">
                Points <span className="text-slate-400 normal-case">(Optional)</span>
              </label>
              <input
                type="number"
                min={1}
                placeholder="e.g. 10"
                value={questionForm.points}
                onChange={(e) => setQuestionForm({ ...questionForm, points: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-colors font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5 tracking-wider">
                Correct Answer <span className="text-slate-400 normal-case">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Sunglasses"
                value={questionForm.correctAnswer}
                onChange={(e) => setQuestionForm({ ...questionForm, correctAnswer: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5 tracking-wider">
                Answer Choices <span className="text-slate-400 normal-case">(Comma-separated)</span>
              </label>
              <input
                type="text"
                placeholder="Sunglasses, Sunlight, Hot Day, Beach"
                value={questionForm.options}
                onChange={(e) => setQuestionForm({ ...questionForm, options: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-colors"
              />
              <div className="flex flex-col sm:flex-row flex-wrap gap-3 mt-2.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={questionForm.multipleSelection}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setQuestionForm({
                        ...questionForm,
                        multipleSelection: checked,
                        ...(checked ? { isRanking: false } : {}),
                      });
                    }}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Multiple Selection
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={questionForm.isRanking}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setQuestionForm({
                        ...questionForm,
                        isRanking: checked,
                        ...(checked ? { multipleSelection: false } : {}),
                      });
                    }}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Ranking Question
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={questionForm.enableWrittenExplanation}
                    onChange={(e) => setQuestionForm({ ...questionForm, enableWrittenExplanation: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Enable Written Explanation
                  </span>
                </label>
              </div>
              {questionForm.isRanking && (
                <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-1.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 rounded-md p-2">
                  <span className="font-semibold">Ranking Question Active:</span> Comma-separated options will be rendered as reorderable items for students. No conventional MCQ correct answer is required. Scoring is evaluated by assessors or against expected response criteria.
                </p>
              )}
            </div>

            {/* Pictorial Images Management Section */}
            <div className="sm:col-span-2 md:col-span-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 tracking-wider">
                    Pictorial Images & Layout (AWS S3)
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Upload main question diagram, side-by-side comparison images, or picture choices.
                  </p>
                </div>
              </div>

              {uploadError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between">
                  <span>{uploadError}</span>
                  <button
                    type="button"
                    onClick={() => setUploadError(null)}
                    className="underline text-[11px] cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Upload trigger button and drop info */}
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors shadow-2xs">
                  {isUploadingImages ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                      <span>Uploading to S3...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>+ Upload Image(s)</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    multiple
                    disabled={isUploadingImages}
                    onChange={handleUploadImages}
                    className="hidden"
                  />
                </label>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  PNG, JPG, WebP, SVG up to 5MB. Stored securely on AWS S3.
                </span>
              </div>

              {/* Images preview strip */}
              {questionForm.images && questionForm.images.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
                  {questionForm.images.map((img: any, idx: number) => {
                    const presetLabels = [
                      'Main Image',
                      'Picture A',
                      'Picture B',
                      'Picture C',
                      'Picture D',
                      'Option A',
                      'Option B',
                      'Option C',
                      'Option D',
                    ];
                    return (
                      <div
                        key={img.id || img.key || idx}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between space-y-2 group"
                      >
                        {/* Image Preview thumbnail */}
                        <div className="relative aspect-4/3 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                          <img
                            src={img.url}
                            alt={img.label || `Image ${idx + 1}`}
                            className="w-full h-full object-contain p-1"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setPreviewZoomImage(img)}
                            className="absolute top-1.5 right-1.5 p-1 rounded-md bg-slate-900/70 hover:bg-slate-900 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-xs"
                            title="Zoom / Preview full image"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                          <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/60 text-white font-semibold">
                            #{idx + 1}
                          </span>
                        </div>

                        {/* Label selection */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">
                            Label
                          </label>
                          <select
                            value={img.label || ''}
                            onChange={(e) => handleUpdateImageLabel(idx, e.target.value)}
                            className="w-full px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                          >
                            {presetLabels.map((lbl) => (
                              <option key={lbl} value={lbl}>
                                {lbl}
                              </option>
                            ))}
                            {!presetLabels.includes(img.label) && img.label && (
                              <option value={img.label}>{img.label}</option>
                            )}
                          </select>
                        </div>

                        {/* Controls: Reorder Left / Right, Replace, Delete */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveImage(idx, 'left')}
                              disabled={idx === 0}
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-30 cursor-pointer"
                              title="Move Left"
                            >
                              <ArrowLeftIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveImage(idx, 'right')}
                              disabled={idx === questionForm.images.length - 1}
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-30 cursor-pointer"
                              title="Move Right"
                            >
                              <ArrowRightIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <label
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 cursor-pointer"
                              title="Replace Image"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    handleReplaceImage(idx, e.target.files[0]);
                                  }
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(idx)}
                              className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-600 dark:text-rose-400 cursor-pointer"
                              title="Remove Image"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="sm:col-span-2 md:col-span-3 flex items-center justify-end gap-3 pt-2">
              {editingQuestionItem && (
                <button
                  type="button"
                  onClick={handleCancelEditQuestion}
                  disabled={isSubmittingQuestion}
                  className="px-5 py-2.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-sm transition-colors border border-slate-200 dark:border-slate-700 shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmittingQuestion || questionGroups.length === 0}
                className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingQuestion
                  ? 'Saving...'
                  : editingQuestionItem
                  ? 'Save Question'
                  : '+ Save Question'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Question Groups Breakdown (View Mode) */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
          <div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Question Groups Summary</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Total collection breakdown across active groups</p>
          </div>
          <span className="text-sm font-semibold font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-md border border-slate-200 dark:border-slate-700 tabular-nums">
            Total Questions: {allQuestions.length}
          </span>
        </div>
        {sortedQuestionGroups.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {sortedQuestionGroups.map((grp) => {
              const breakdown = getGroupBreakdown(grp);
              return (
                <div
                  key={grp.id || grp._id}
                  className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{grp.name}</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{grp.description || 'No description'}</p>

                    <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                      <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                        <span className="text-[11px] text-emerald-700 dark:text-emerald-400 block font-semibold">Easy</span>
                        <span className="text-sm font-bold font-mono text-slate-900 dark:text-white tabular-nums">{breakdown.Easy.count}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                        <span className="text-[11px] text-amber-700 dark:text-amber-400 block font-semibold">Medium</span>
                        <span className="text-sm font-bold font-mono text-slate-900 dark:text-white tabular-nums">{breakdown.Medium.count}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                        <span className="text-[11px] text-rose-700 dark:text-rose-400 block font-semibold">Hard</span>
                        <span className="text-sm font-bold font-mono text-slate-900 dark:text-white tabular-nums">{breakdown.Hard.count}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setViewGroupModal(grp);
                        setModalSearch('');
                      }}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 flex items-center justify-center gap-1 transition-colors flex-1 font-medium cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingGroup(grp);
                        setEditGroupName(grp.name);
                        setEditGroupError(null);
                      }}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white flex items-center justify-center gap-1 transition-colors font-medium cursor-pointer"
                      title={`Edit group ${grp.name}`}
                    >
                      <Edit className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingGroup({ ...grp, breakdown })}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:border-rose-200 dark:hover:border-rose-900 flex items-center justify-center gap-1 transition-colors font-medium cursor-pointer"
                      title={`Delete group ${grp.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center py-12">
            <Layers className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
            <h4 className="text-base font-semibold text-slate-800 dark:text-slate-300">No question groups yet</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Use the form above to create your first question group.
            </p>
          </div>
        )}
      </div>

      {/* Read-Only Question Group View Modal */}
      {viewGroupModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => {
            setViewGroupModal(null);
            setModalSearch('');
          }}
        >
          <div
            className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl max-h-[90vh] flex flex-col my-8 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                    Question Group Review
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                    Total: {activeViewGroup?.breakdown?.total ?? 0} Questions
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>{activeViewGroup?.name} Group</span>
                  {activeViewGroup?.description && (
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400 font-sans line-clamp-1">
                      &mdash; {activeViewGroup.description}
                    </span>
                  )}
                </h3>
              </div>

              {/* Compact Search Field & Close Button */}
              <div className="flex items-center gap-2 self-stretch sm:self-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search questions..."
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                    className="w-full pl-8 pr-8 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-colors"
                  />
                  {modalSearch && (
                    <button
                      type="button"
                      onClick={() => setModalSearch('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs cursor-pointer"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setViewGroupModal(null);
                    setModalSearch('');
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 transition-colors cursor-pointer shrink-0"
                  title="Close Review"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body: Grouped by Difficulty */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-6">
              {(() => {
                const searchLower = modalSearch.trim().toLowerCase();
                const filterQuestion = (q: any) => {
                  if (!searchLower) return true;
                  const inContent = q.content && q.content.toLowerCase().includes(searchLower);
                  const inOptions = Array.isArray(q.options) && q.options.some((opt: string) => opt.toLowerCase().includes(searchLower));
                  const inAns = q.correctAnswer != null && String(q.correctAnswer).toLowerCase().includes(searchLower);
                  return inContent || inOptions || inAns;
                };

                const easyList = (activeViewGroup?.breakdown?.Easy?.questions || []).filter(filterQuestion);
                const mediumList = (activeViewGroup?.breakdown?.Medium?.questions || []).filter(filterQuestion);
                const hardList = (activeViewGroup?.breakdown?.Hard?.questions || []).filter(filterQuestion);
                const totalFiltered = easyList.length + mediumList.length + hardList.length;

                if (searchLower && totalFiltered === 0) {
                  return (
                    <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-center py-12 space-y-2">
                      <HelpCircle className="w-10 h-10 text-slate-400 dark:text-slate-500 mx-auto mb-1" />
                      <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200">No questions found</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                        No questions in "{activeViewGroup?.name}" match your search query "{modalSearch}".
                      </p>
                      <button
                        type="button"
                        onClick={() => setModalSearch('')}
                        className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer shadow-2xs font-medium"
                      >
                        Clear search
                      </button>
                    </div>
                  );
                }

                return (['Easy', 'Medium', 'Hard'] as const).map((diff) => {
                  const questions = diff === 'Easy' ? easyList : diff === 'Medium' ? mediumList : hardList;
                  const totalInTier = (activeViewGroup?.breakdown?.[diff]?.questions || []).length;
                  return (
                    <div key={diff} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-semibold px-2.5 py-0.5 rounded font-mono ${
                            diff === 'Easy'
                              ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : diff === 'Hard'
                              ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                              : 'bg-amber-50 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                          }`}
                        >
                          {diff} Tier
                        </span>
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                          ({questions.length}{searchLower ? ` of ${totalInTier}` : ''} {questions.length === 1 ? 'Question' : 'Questions'})
                        </span>
                      </div>

                      {questions.length > 0 ? (
                        <div className="space-y-3 pl-2 border-l-2 border-slate-200 dark:border-slate-800">
                          {questions.map((q: any, qIdx: number) => (
                            <ReadOnlyQuestionDetailCard
                              key={q.id || q._id || qIdx}
                              question={q}
                              index={qIdx}
                              groupName={activeViewGroup?.name}
                              onEdit={handleEditFromModal}
                              onDelete={(questionToDelete) => setDeletingQuestion(questionToDelete)}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic pl-3 border-l-2 border-slate-200 dark:border-slate-800 py-1">
                          {searchLower
                            ? `No ${diff.toLowerCase()} questions match your search.`
                            : `No questions in this difficulty level yet.`}
                        </p>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Click Edit or Delete on any question to manage it.
              </span>
              <button
                type="button"
                onClick={() => {
                  setViewGroupModal(null);
                  setModalSearch('');
                }}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                Close Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Read-Only Single Question View Modal */}
      {viewSingleQuestion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => setViewSingleQuestion(null)}
        >
          <div
            className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl max-h-[90vh] flex flex-col my-8 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="space-y-0.5">
                <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                  Question Review
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Question Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewSingleQuestion(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 transition-colors cursor-pointer"
                title="Close Review"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto pr-1">
              <ReadOnlyQuestionDetailCard
                question={viewSingleQuestion}
                groupName={viewSingleQuestion.groupName}
              />
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Review is read-only. Questions cannot be edited from this view.
              </span>
              <button
                type="button"
                onClick={() => setViewSingleQuestion(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                Close Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Question Confirmation Dialog */}
      {deletingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-500/50 flex items-center justify-center shrink-0 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <span className="text-xs font-mono uppercase text-rose-600 dark:text-rose-400 tracking-wider font-semibold">
                  Delete Question
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">Delete this Question?</h3>
              </div>
              <button
                onClick={() => !isDeletingQuestion && setDeletingQuestion(null)}
                disabled={isDeletingQuestion}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-lg font-bold disabled:opacity-40 cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Question Item Summary */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 space-y-2.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-semibold">
                  {deletingQuestion.groupName || 'Unassigned Group'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-mono font-bold ${
                    deletingQuestion.difficulty === 'Easy'
                      ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                      : deletingQuestion.difficulty === 'Medium'
                      ? 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                      : 'bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                  }`}
                >
                  {deletingQuestion.difficulty}
                </span>
                {deletingQuestion.points != null && (
                  <span className="text-slate-600 dark:text-slate-400 font-mono text-xs tabular-nums">
                    {deletingQuestion.points} pts
                  </span>
                )}
                {deletingQuestion.timeSeconds != null && (
                  <span className="text-slate-600 dark:text-slate-400 font-mono text-xs tabular-nums">
                    {deletingQuestion.timeSeconds}s
                  </span>
                )}
              </div>

              <p className="text-sm font-medium text-slate-900 dark:text-white border-l-2 border-indigo-500 pl-2.5 py-0.5">
                "{deletingQuestion.content}"
              </p>

              {deletingQuestion.options && deletingQuestion.options.length > 0 && (
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  <span className="text-slate-500 font-semibold">Options:</span>{' '}
                  {deletingQuestion.options.join(', ')}
                </div>
              )}

              {deletingQuestion.correctAnswer != null && String(deletingQuestion.correctAnswer).trim() !== '' && (
                <div className="text-xs text-emerald-700 dark:text-emerald-400">
                  <span className="text-slate-500 font-semibold">Correct Answer:</span>{' '}
                  {typeof deletingQuestion.correctAnswer === 'object'
                    ? JSON.stringify(deletingQuestion.correctAnswer)
                    : String(deletingQuestion.correctAnswer)}
                </div>
              )}
            </div>

            {/* Safety & Warning Information */}
            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div>
                  <strong className="font-semibold text-amber-950 dark:text-amber-200">Delete Question:</strong> This question will be permanently removed and cannot be used in future tests.
                </div>
              </div>

              <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/40 text-indigo-900 dark:text-indigo-300 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <strong className="font-semibold text-indigo-950 dark:text-indigo-200">Past Tests Safe:</strong> Any tests already created, student attempts, and past reports that used this question will stay saved.
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingQuestion(null)}
                disabled={isDeletingQuestion}
                className="px-4 py-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs transition-colors border border-slate-200 dark:border-slate-700 shadow-2xs disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteQuestion}
                disabled={isDeletingQuestion}
                className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {isDeletingQuestion ? (
                  <>Deleting Question...</>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Yes, Delete Question
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Question Group Confirmation Dialog */}
      {deletingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-500/50 flex items-center justify-center shrink-0 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <span className="text-xs font-mono uppercase text-rose-600 dark:text-rose-400 tracking-wider font-semibold">
                  Delete Question Group
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  Delete "{deletingGroup.name}"?
                </h3>
              </div>
              <button
                onClick={() => !isDeletingGroup && setDeletingGroup(null)}
                disabled={isDeletingGroup}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-lg font-bold disabled:opacity-40 cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Clear Warning */}
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This will permanently delete this group and <strong className="text-rose-600 dark:text-rose-400 font-semibold">ALL questions</strong> inside this group.
            </p>

            {/* Group Summary Card */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[280px]">
                  {deletingGroup.name}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700/90 text-slate-700 dark:text-slate-300 font-medium font-mono tabular-nums">
                  {deletingGroup.breakdown?.total ?? deletingGroup.questionCount ?? 0} question(s) inside
                </span>
              </div>
              {deletingGroup.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{deletingGroup.description}</p>
              )}

              {/* Difficulty Breakdown Preview */}
              <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-emerald-700 dark:text-emerald-400 block font-semibold">Easy</span>
                  <span className="text-sm font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                    {deletingGroup.breakdown?.Easy?.count ?? deletingGroup.easyCount ?? 0}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-amber-700 dark:text-amber-400 block font-semibold">Medium</span>
                  <span className="text-sm font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                    {deletingGroup.breakdown?.Medium?.count ?? deletingGroup.mediumCount ?? 0}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-rose-700 dark:text-rose-400 block font-semibold">Hard</span>
                  <span className="text-sm font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                    {deletingGroup.breakdown?.Hard?.count ?? deletingGroup.hardCount ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Safety & Warning Information */}
            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div>
                  <strong className="font-semibold text-amber-950 dark:text-amber-200">Cascade Delete:</strong> All questions belonging to "{deletingGroup.name}" will be permanently deleted from the Question Bank.
                </div>
              </div>

              <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/40 text-indigo-900 dark:text-indigo-300 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <strong className="font-semibold text-indigo-950 dark:text-indigo-200">Past Tests Safe:</strong> Existing published tests, completed student attempts, and historical reports remain intact.
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingGroup(null)}
                disabled={isDeletingGroup}
                className="px-4 py-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs transition-colors border border-slate-200 dark:border-slate-700 shadow-2xs disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteGroup}
                disabled={isDeletingGroup}
                className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {isDeletingGroup ? (
                  <>Deleting Group...</>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Question Group Modal (Group Name Only) */}
      {editingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/80 flex items-center justify-center">
                  <Edit className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Edit Question Group</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Update Question Group Name</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isUpdatingGroup) {
                    setEditingGroup(null);
                    setEditGroupError(null);
                  }
                }}
                disabled={isUpdatingGroup}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-lg font-bold disabled:opacity-40 cursor-pointer"
              >
                &times;
              </button>
            </div>

            {editGroupError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/50 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{editGroupError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateGroupName} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Question Group Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  placeholder="Enter new question group name"
                  disabled={isUpdatingGroup}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none disabled:opacity-50 transition-colors"
                  autoFocus
                />
              </div>

              {/* Read-only info / Notice */}
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                {editingGroup.description && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-500 shrink-0">Description:</span>
                    <span className="text-slate-700 dark:text-slate-300 text-right line-clamp-1">{editingGroup.description}</span>
                  </div>
                )}
                <p className="text-[11px] text-indigo-700 dark:text-indigo-300/80 pt-1">
                  Note: Only the group name will be updated. Questions, difficulty counts, and descriptions remain unchanged.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingGroup(null);
                    setEditGroupError(null);
                  }}
                  disabled={isUpdatingGroup}
                  className="px-4 py-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs transition-colors border border-slate-200 dark:border-slate-700 shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingGroup || !editGroupName.trim()}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {isUpdatingGroup ? (
                    'Saving...'
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Preview Lightbox Modal */}
      {previewZoomImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in"
          onClick={() => setPreviewZoomImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/90">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  {previewZoomImage.label || 'Illustration'}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {previewZoomImage.originalName || previewZoomImage.key}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewZoomImage(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-black/40 overflow-auto max-h-[calc(90vh-80px)]">
              <img
                src={previewZoomImage.url}
                alt={previewZoomImage.label || 'Full preview'}
                className="max-h-[75vh] w-auto object-contain rounded-lg shadow-md"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
