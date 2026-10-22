import React, { useState, useEffect, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  Layers,
  Send,
  History,
  Sparkles,
} from 'lucide-react';
import { ProfileMenu } from './ProfileMenu.tsx';
import type { PublishAssessmentFormState } from './PublishAssessmentSection.tsx';
import { to12Hour, getLocalTodayDate, getLocalCurrentTime12H, getLocalFutureDate } from '../utils/dateTime.ts';

// Code splitting for large workspace sub-sections (PERF-LOW-01)
const SchoolsSection = lazy(() =>
  import('./SchoolsSection.tsx').then((m) => ({ default: m.SchoolsSection }))
);
const QuestionBankSection = lazy(() =>
  import('./QuestionBankSection.tsx').then((m) => ({ default: m.QuestionBankSection }))
);
const PublishAssessmentSection = lazy(() =>
  import('./PublishAssessmentSection.tsx').then((m) => ({ default: m.PublishAssessmentSection }))
);
const PublishHistorySection = lazy(() =>
  import('./PublishHistorySection.tsx').then((m) => ({ default: m.PublishHistorySection }))
);

function SectionLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-slate-400">
      <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center animate-pulse mb-3">
        <Sparkles className="w-4 h-4 animate-spin text-indigo-400" style={{ animationDuration: '3s' }} />
      </div>
      <p className="text-xs font-medium">Loading section...</p>
    </div>
  );
}

interface SuperAdminDashboardProps {
  token: string;
  currentUser?: any;
  onLogout?: () => void;
}

export type SuperAdminNavTab =
  | 'schools'
  | 'question_bank'
  | 'publish'
  | 'history';

export function SuperAdminDashboard({ token, currentUser, onLogout }: SuperAdminDashboardProps) {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<SuperAdminNavTab>('schools');

  // Shared shared data
  const [schools, setSchools] = useState<any[]>([]);
  const [questionGroups, setQuestionGroups] = useState<any[]>([]);
  const [allQuestions, setAllQuestions] = useState<any[]>([]);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [selectedHistoryDetail, setSelectedHistoryDetail] = useState<any | null>(null);

  // Preserve in-progress Publish Assessment state across sidebar page navigation
  const [publishFormState, setPublishFormState] = useState<PublishAssessmentFormState | undefined>(undefined);
  const [editingPublishId, setEditingPublishId] = useState<string | null>(null);

  const headers = React.useMemo(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  const loadSchools = React.useCallback(async () => {
    try {
      const res = await fetch('/api/schools', { headers });
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      const sorted = [...list].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
      );
      setSchools(sorted);
    } catch (e) {
      console.error('Failed to load schools', e);
    }
  }, [headers]);

  const loadQuestionBank = React.useCallback(async () => {
    try {
      const [resGrp, resQ] = await Promise.all([
        fetch('/api/question-groups', { headers }),
        fetch('/api/questions', { headers }),
      ]);
      const dataGrp = await resGrp.json();
      const dataQ = await resQ.json();
      setQuestionGroups(Array.isArray(dataGrp) ? dataGrp : []);
      setAllQuestions(Array.isArray(dataQ) ? dataQ : []);
    } catch (e) {
      console.error('Failed to load question bank', e);
    }
  }, [headers]);

  const loadPublishHistory = React.useCallback(async () => {
    try {
      const res = await fetch('/api/publish-history', { headers });
      const data = await res.json();
      setHistoryList(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load publish history', e);
    }
  }, [headers]);

  const loadHistoryDetail = React.useCallback(async (publishId: string) => {
    try {
      const res = await fetch(`/api/publish-history/${encodeURIComponent(publishId)}`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to load history detail: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      setSelectedHistoryDetail(data);
      return data;
    } catch (e) {
      console.error('Failed to load history detail', e);
      throw e;
    }
  }, [headers]);

  const handleEditAssessment = React.useCallback(async (publishId: string) => {
    try {
      const res = await fetch(`/api/published-tests/${publishId}`, { headers });
      if (!res.ok) {
        throw new Error('Failed to load assessment data for editing');
      }
      const data = await res.json();

      let rawTargets = data.targets;
      if (!Array.isArray(rawTargets) || rawTargets.length === 0) {
        if (data.target) {
          rawTargets = [data.target];
        } else {
          rawTargets = [
            {
              schoolIds: ['ALL'],
              classes: ['ALL'],
              sections: [],
              studentIds: [],
            },
          ];
        }
      }

      const formattedTargets = rawTargets.map((t: any, idx: number) => ({
        id: `target-${idx + 1}-${Date.now()}`,
        selectedSchoolIds: Array.isArray(t.schoolIds) && t.schoolIds.length > 0 ? t.schoolIds : ['ALL'],
        selectedClasses: Array.isArray(t.classes) && t.classes.length > 0 ? t.classes : ['ALL'],
        availableClasses: [],
        isLoadingClasses: false,
        selectedSections: Array.isArray(t.sections) ? t.sections : [],
        availableSections: [],
        isLoadingSections: false,
        selectedStudentIds: Array.isArray(t.studentIds) ? t.studentIds : [],
        availableStudents: [],
        isLoadingStudents: false,
      }));

      setPublishFormState({
        publishName: data.publishName || '',
        publishMode: data.publishMode || 'Selected Questions',
        targets: formattedTargets,
        selectedQuestionsForPublish: data.questionIds || [],
        questionsSnapshot: Array.isArray(data.questionsSnapshot) ? data.questionsSnapshot : [],
        randomSelectedDifficulties: Array.isArray(data.randomSelectedDifficulties) ? data.randomSelectedDifficulties : [],
        shuffleQuestions: Boolean(data.shuffle),
        randomCount: data.randomCount != null && data.randomCount !== '' ? data.randomCount : '',
        startDate: data.startDate || getLocalTodayDate(),
        startTime: data.startTime ? to12Hour(data.startTime) : getLocalCurrentTime12H(),
        endDate: data.endDate || getLocalFutureDate(7),
        endTime: data.endTime ? to12Hour(data.endTime) : '11:59 PM',
        editingPublishId: publishId,
      });

      setEditingPublishId(publishId);
      setActiveTab('publish');
    } catch (e) {
      console.error('Failed to load assessment for editing', e);
    }
  }, [headers]);

  const handleCancelEdit = React.useCallback(() => {
    setEditingPublishId(null);
    setPublishFormState(undefined);
    setActiveTab('history');
  }, []);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const loadAllInitialData = React.useCallback(async () => {
    await Promise.all([
      loadSchools(),
      loadQuestionBank(),
      loadPublishHistory(),
    ]);
  }, [loadSchools, loadQuestionBank, loadPublishHistory]);

  useEffect(() => {
    loadAllInitialData();
  }, []);

  // Fixed Bottom Navigation Card for Mobile Devices - Rendered via Portal directly into document.body
  const mobileBottomNav = (
    <nav 
      aria-label="Mobile Navigation"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
      }}
      className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200/90 dark:border-slate-800/90 shadow-2xl shadow-slate-950/20 px-3 py-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pointer-events-auto"
    >
      <div className="max-w-md mx-auto w-full flex items-center justify-around gap-1">
        {/* 1. Schools & Students */}
        <button
          type="button"
          onClick={() => setActiveTab('schools')}
          className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all cursor-pointer ${
            activeTab === 'schools'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold scale-[1.02]'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
          title="Schools & Students"
        >
          <Building2 className={`w-5 h-5 shrink-0 ${activeTab === 'schools' ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
          <span className="text-[10px] sm:text-xs font-semibold tracking-tight truncate max-w-[76px] mt-1 text-center leading-none">
            Schools
          </span>
        </button>

        {/* 2. Question Bank & Groups */}
        <button
          type="button"
          onClick={() => setActiveTab('question_bank')}
          className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all cursor-pointer ${
            activeTab === 'question_bank'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold scale-[1.02]'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
          title="Question Bank & Groups"
        >
          <Layers className={`w-5 h-5 shrink-0 ${activeTab === 'question_bank' ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
          <span className="text-[10px] sm:text-xs font-semibold tracking-tight truncate max-w-[76px] mt-1 text-center leading-none">
            Questions
          </span>
        </button>

        {/* 3. Publish Assessment */}
        <button
          type="button"
          onClick={() => setActiveTab('publish')}
          className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all cursor-pointer ${
            activeTab === 'publish'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold scale-[1.02]'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
          title="Publish Assessment"
        >
          <Send className={`w-5 h-5 shrink-0 ${activeTab === 'publish' ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
          <span className="text-[10px] sm:text-xs font-semibold tracking-tight truncate max-w-[76px] mt-1 text-center leading-none">
            Publish
          </span>
        </button>

        {/* 4. Test History */}
        <button
          type="button"
          onClick={() => {
            setSelectedHistoryDetail(null);
            setActiveTab('history');
          }}
          className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all cursor-pointer ${
            activeTab === 'history'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold scale-[1.02]'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
          title="Test History"
        >
          <History className={`w-5 h-5 shrink-0 ${activeTab === 'history' ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
          <span className="text-[10px] sm:text-xs font-semibold tracking-tight truncate max-w-[76px] mt-1 text-center leading-none">
            History
          </span>
        </button>
      </div>
    </nav>
  );

  return (
    <>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row font-sans">
      {/* Sidebar Navigation - Strictly the 5 specified items */}
      <aside className="w-full md:w-64 bg-white dark:bg-slate-900 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 p-4 shrink-0 flex flex-col justify-between">
        <div>
          {/* Brand Header */}
          <div className="flex items-center justify-between px-3 py-2 md:py-3 md:border-b border-slate-200 dark:border-slate-800 md:mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-sm tracking-tight leading-tight text-slate-900 dark:text-white truncate">
                  Puzzles Admin
                </h1>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">Platform Console</p>
              </div>
            </div>

            {/* Mobile-only Top Profile Button */}
            <div className="md:hidden shrink-0">
              <ProfileMenu 
                user={currentUser || { username: 'Super Admin', role: 'super_admin' }} 
                onLogout={onLogout || (() => {})} 
              />
            </div>
          </div>

          {/* Strictly 4 Navigation Items - Desktop only */}
          <nav className="hidden md:block space-y-1">
            {/* 1. Schools & Students */}
            <button
              type="button"
              onClick={() => setActiveTab('schools')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'schools'
                  ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-400 font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <Building2 className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span className="truncate">Schools & Students</span>
            </button>

            {/* 2. Question Bank & Groups */}
            <button
              type="button"
              onClick={() => setActiveTab('question_bank')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'question_bank'
                  ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-400 font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <Layers className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span className="truncate">Question Bank & Groups</span>
            </button>

            {/* 3. Publish Assessment */}
            <button
              type="button"
              onClick={() => setActiveTab('publish')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'publish'
                  ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-400 font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <Send className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span className="truncate">Publish Assessment</span>
            </button>

            {/* 4. Test History */}
            <button
              type="button"
              onClick={() => {
                setSelectedHistoryDetail(null);
                setActiveTab('history');
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'history'
                  ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-400 font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <History className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span className="truncate">Test History</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5 hidden md:block">
          <p className="font-semibold text-slate-700 dark:text-slate-300">Super Administrator</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Assessment Management</p>
        </div>
      </aside>

      {/* Main Workspace Column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Main Authenticated Header with Breadcrumbs & Profile Menu */}
        <header className="hidden md:flex h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 items-center justify-between shrink-0 z-30">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Platform</span>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <h2 className="font-semibold text-slate-900 dark:text-white tracking-tight">
              {activeTab === 'schools' && 'Schools & Students Management'}
              {activeTab === 'question_bank' && 'Question Bank & Adaptive Groups'}
              {activeTab === 'publish' && 'Publish Assessment'}
              {activeTab === 'history' && 'Assessment History & Analytics'}
            </h2>
          </div>
          <div className="hidden md:block">
            <ProfileMenu 
              user={currentUser || { username: 'Super Admin', role: 'super_admin' }} 
              onLogout={onLogout || (() => {})} 
            />
          </div>
        </header>

        {/* Main Content Area - Renders ONLY the selected section */}
        <main
          className="test-history-scroll-container flex-1 p-4 sm:p-6 md:p-8 pb-20 md:pb-8 overflow-y-auto bg-slate-50 dark:bg-slate-950"
          style={{ overflowAnchor: 'none' }}
        >
          <Suspense fallback={<SectionLoadingFallback />}>
            {activeTab === 'schools' && (
              <SchoolsSection
                token={token}
                schools={schools}
                onRefreshSchools={loadSchools}
              />
            )}

            {activeTab === 'question_bank' && (
              <QuestionBankSection
                token={token}
                questionGroups={questionGroups}
                allQuestions={allQuestions}
                onRefreshData={loadQuestionBank}
              />
            )}

            {activeTab === 'publish' && (
              <PublishAssessmentSection
                token={token}
                schools={schools}
                allQuestions={allQuestions}
                formState={publishFormState}
                onFormStateChange={setPublishFormState}
                editingPublishId={editingPublishId}
                onCancelEdit={handleCancelEdit}
                onResetFormState={() => {
                  setEditingPublishId(null);
                  setPublishFormState(undefined);
                }}
                onPublishSuccess={async () => {
                  setEditingPublishId(null);
                  setPublishFormState(undefined);
                  await loadPublishHistory();
                  setActiveTab('history');
                }}
              />
            )}

            {activeTab === 'history' && (
              <PublishHistorySection
                token={token}
                schools={schools}
                historyList={historyList}
                selectedHistoryDetail={selectedHistoryDetail}
                onSelectHistory={loadHistoryDetail}
                onEditAssessment={handleEditAssessment}
                onRefreshHistory={loadPublishHistory}
              />
            )}
          </Suspense>
        </main>
      </div>
    </div>

    {/* Portaled Mobile Bottom Navigation: Attached directly to document.body so it NEVER scrolls with page content */}
    {mounted && typeof document !== 'undefined'
      ? createPortal(mobileBottomNav, document.body)
      : mobileBottomNav}
  </>
  );
}
