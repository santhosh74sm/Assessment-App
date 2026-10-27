import React, { useState, useEffect, useRef } from 'react';
import {
  Layers,
  Shuffle,
  Play,
  HelpCircle,
  Calendar,
  Clock,
  Send,
  Building2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Check,
  Minus,
  AlertTriangle,
  AlertCircle,
  X,
  Users,
  Search,
  Bookmark,
  BookmarkPlus,
  FolderDown,
} from 'lucide-react';
import { Time12HourPicker } from './Time12HourPicker.tsx';
import {
  StudentAssessmentPreviewModal,
  AssessmentPreviewQuestion,
} from './StudentAssessmentPreviewModal.tsx';
import {
  to12Hour,
  to24Hour,
  toISODate,
  getLocalTodayDate,
  getLocalFutureDate,
  getLocalCurrentTime12H,
  formatAvailabilityWindow,
} from '../utils/dateTime.ts';
import { getAuthHeaders } from '../utils/csrf.ts';

export interface TargetItem {
  id: string;
  selectedSchoolIds: string[];
  selectedClasses: string[];
  availableClasses: string[];
  isLoadingClasses: boolean;
  selectedSections: string[];
  availableSections: string[];
  isLoadingSections: boolean;
  selectedStudentIds: string[];
  availableStudents: any[];
  isLoadingStudents: boolean;
}

export interface PublishAssessmentFormState {
  publishName: string;
  publishMode: 'Selected Questions' | 'Random Questions';
  targets: TargetItem[];
  selectedQuestionsForPublish: string[];
  randomSelectedDifficulties?: string[];
  shuffleQuestions: boolean;
  randomCount: number | '';
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  editingPublishId?: string | null;
  expandedGroups?: string[];
  expandedDifficulties?: string[];
  questionPickerSearch?: string;
  questionsSnapshot?: any[];
}

export interface PublishAssessmentSectionProps {
  token: string;
  schools: any[];
  allQuestions: any[];
  onPublishSuccess: () => Promise<void>;
  formState?: PublishAssessmentFormState;
  onFormStateChange?: (state: PublishAssessmentFormState) => void;
  onResetFormState?: () => void;
  editingPublishId?: string | null;
  onCancelEdit?: () => void;
}

// -------------------------------------------------------------
// Tri-State Checkbox Component (Supports Checked, Unchecked, Indeterminate)
// -------------------------------------------------------------
function TriStateCheckbox({
  checked,
  indeterminate,
  onChange,
  disabled,
  title,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (e: React.MouseEvent) => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = Boolean(indeterminate && !checked);
    }
  }, [indeterminate, checked]);

  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel || title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(e);
      }}
      className={`w-4 h-4 rounded flex items-center justify-center transition-colors border shrink-0 cursor-pointer ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      } ${
        checked
          ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
          : indeterminate
          ? 'bg-indigo-600 border-indigo-600 text-white'
          : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-slate-500'
      }`}
    >
      <input
        ref={checkboxRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        readOnly
        className="sr-only"
      />
      {checked && <Check className="w-3 h-3 stroke-[3]" />}
      {!checked && indeterminate && <Minus className="w-3 h-3 stroke-[3]" />}
    </button>
  );
}

// -------------------------------------------------------------
// School Multi-Select Dropdown Component
// -------------------------------------------------------------
function SchoolMultiSelectDropdown({
  schools,
  selectedSchoolIds,
  onChange,
  disabled,
}: {
  schools: any[];
  selectedSchoolIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const isAllSchoolsSelected = selectedSchoolIds.includes('ALL');

  const sortedSchools = [...schools].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
  );

  const filteredSchools = sortedSchools.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.code && s.code.toLowerCase().includes(search.toLowerCase()))
  );

  const selectedSchools = sortedSchools.filter((s) => selectedSchoolIds.includes(s.id));

  const toggleSchool = (id: string) => {
    if (isAllSchoolsSelected) {
      // User is clicking a specific school while "All Schools" is active:
      // Deselect "All Schools" and select this specific school
      onChange([id]);
      return;
    }
    if (selectedSchoolIds.includes(id)) {
      onChange(selectedSchoolIds.filter((sid) => sid !== id));
    } else {
      onChange([...selectedSchoolIds, id]);
    }
  };

  const toggleAllSchools = () => {
    if (isAllSchoolsSelected) {
      onChange([]);
    } else {
      onChange(['ALL']);
    }
  };

  const handleSelectAll = () => {
    onChange(['ALL']);
  };

  const handleClear = () => {
    onChange([]);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Dropdown Trigger Button */}
      <button
        type="button"
        disabled={disabled || schools.length === 0}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3.5 py-2.5 rounded-lg border text-left flex items-center justify-between transition-colors outline-none text-sm ${
          isOpen
            ? 'bg-white dark:bg-slate-800 border-indigo-500 ring-2 ring-indigo-500/20'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
        } ${disabled || schools.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} shadow-2xs`}
      >
        <div className="flex items-center gap-2 truncate pr-2">
          <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          {schools.length === 0 ? (
            <span className="text-slate-400 dark:text-slate-500">No schools available</span>
          ) : isAllSchoolsSelected ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-slate-900 dark:text-white font-semibold">All Schools</span>
              <span className="text-xs text-indigo-700 dark:text-indigo-300 font-mono">
                ({schools.length} Schools)
              </span>
            </div>
          ) : selectedSchoolIds.length === 0 ? (
            <span className="text-slate-400">Select School(s)...</span>
          ) : selectedSchoolIds.length === 1 ? (
            <span className="text-slate-900 dark:text-white font-medium truncate">
              {selectedSchools[0]?.name}
              {selectedSchools[0]?.code && (
                <span className="ml-1.5 text-[11px] font-mono text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                  {selectedSchools[0].code}
                </span>
              )}
            </span>
          ) : (
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-slate-900 dark:text-white font-semibold">
                {selectedSchoolIds.length} Schools Selected
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                ({selectedSchools.map((s) => s.code || s.name).slice(0, 2).join(', ')}
                {selectedSchoolIds.length > 2 ? ` +${selectedSchoolIds.length - 2}` : ''})
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isAllSchoolsSelected ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold">
              All
            </span>
          ) : selectedSchoolIds.length > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold">
              {selectedSchoolIds.length}
            </span>
          ) : null}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        </div>
      </button>

      {/* Dropdown Menu Popover */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-40 p-2.5 space-y-2 animate-in fade-in-50 zoom-in-95 duration-100">
          {/* Quick Actions & Header */}
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              Choose Schools ({isAllSchoolsSelected ? `All (${schools.length})` : `${selectedSchoolIds.length}/${schools.length}`})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold underline cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-300 dark:text-slate-600">&bull;</span>
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 font-medium underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Search Filter if schools > 3 */}
          {schools.length > 3 && (
            <input
              type="text"
              placeholder="Search school name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-indigo-500"
            />
          )}

          {/* Scrollable School List */}
          <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
            {/* "All Schools" option */}
            {(!search || 'all schools'.includes(search.toLowerCase())) && (
              <div
                onClick={toggleAllSchools}
                className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                  isAllSchoolsSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-500/80 text-indigo-900 dark:text-white font-medium'
                    : 'bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <input
                    type="checkbox"
                    checked={isAllSchoolsSelected}
                    readOnly
                    className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 pointer-events-none"
                  />
                  <span className="font-semibold text-slate-900 dark:text-white">All Schools</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0 ml-2">
                  {schools.length} Schools
                </span>
              </div>
            )}

            {filteredSchools.length === 0 && search ? (
              <div className="p-3 text-center text-xs text-slate-500">
                No matching schools found
              </div>
            ) : (
              filteredSchools.map((s) => {
                const isSelected = !isAllSchoolsSelected && selectedSchoolIds.includes(s.id);
                return (
                  <div
                    key={s.id}
                    onClick={() => toggleSchool(s.id)}
                    className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-500/80 text-indigo-900 dark:text-white font-medium'
                        : 'bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 pointer-events-none"
                      />
                      <span className="truncate">{s.name}</span>
                    </div>
                    {s.code && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-slate-200 dark:border-slate-700 shrink-0 ml-2">
                        {s.code}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Done Button */}
          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer shadow-2xs"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Class Multi-Select Dropdown Component
// -------------------------------------------------------------
function ClassMultiSelectDropdown({
  availableClasses = [],
  selectedClasses,
  onChange,
  disabled,
  isLoading,
}: {
  availableClasses?: string[];
  selectedClasses: string[];
  onChange: (classes: string[]) => void;
  disabled?: boolean;
  isLoading?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const isAllClassesSelected =
    selectedClasses.length === 0 ||
    selectedClasses.includes('ALL') ||
    selectedClasses.includes('All Classes') ||
    (availableClasses.length > 0 && selectedClasses.length === availableClasses.length);

  const toggleClass = (cls: string) => {
    if (isAllClassesSelected) {
      // User is clicking a specific class while "All Classes" is active:
      // Deselect "All Classes" and select this specific class
      onChange([cls]);
      return;
    }
    if (selectedClasses.includes(cls)) {
      const next = selectedClasses.filter((c) => c !== cls);
      onChange(next);
    } else {
      const next = [...selectedClasses, cls];
      onChange(next);
    }
  };

  const toggleAllClasses = () => {
    if (isAllClassesSelected) {
      onChange([]);
    } else {
      onChange(['ALL']);
    }
  };

  const handleSelectAll = () => {
    onChange(['ALL']);
  };

  const handleClear = () => {
    onChange([]);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled || isLoading}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3.5 py-2.5 rounded-lg border text-left flex items-center justify-between transition-colors outline-none text-sm ${
          isOpen
            ? 'bg-white dark:bg-slate-800 border-indigo-500 ring-2 ring-indigo-500/20'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
        } ${disabled || isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} shadow-2xs`}
      >
        <div className="flex items-center gap-2 truncate pr-2">
          <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          {isLoading ? (
            <span className="text-slate-400 dark:text-slate-500">Loading classes...</span>
          ) : availableClasses.length === 0 ? (
            <span className="text-slate-400 dark:text-slate-500">No classes with students found</span>
          ) : isAllClassesSelected ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-slate-900 dark:text-white font-semibold">All Classes</span>
              <span className="text-xs text-indigo-700 dark:text-indigo-300 font-mono">
                ({availableClasses.length} {availableClasses.length === 1 ? 'Class' : 'Classes'})
              </span>
            </div>
          ) : selectedClasses.length === 0 ? (
            <span className="text-slate-400">Select Class(es)...</span>
          ) : selectedClasses.length === 1 ? (
            <span className="text-slate-900 dark:text-white font-medium truncate">
              {selectedClasses[0]}
            </span>
          ) : (
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-slate-900 dark:text-white font-semibold">
                {selectedClasses.length} Classes Selected
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                ({selectedClasses.slice(0, 3).join(', ')}
                {selectedClasses.length > 3 ? ` +${selectedClasses.length - 3}` : ''})
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isLoading ? (
            <div className="w-3.5 h-3.5 border-2 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin" />
          ) : isAllClassesSelected && availableClasses.length > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold">
              All
            </span>
          ) : selectedClasses.length > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold">
              {selectedClasses.length}
            </span>
          ) : null}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        </div>
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-40 p-2.5 space-y-2 animate-in fade-in-50 zoom-in-95 duration-100">
          {/* Header & Quick Actions */}
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              Choose Classes ({isAllClassesSelected ? `All (${availableClasses.length})` : `${selectedClasses.length}/${availableClasses.length}`})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold underline cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-300 dark:text-slate-600">&bull;</span>
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 font-medium underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Scrollable Class Checkboxes */}
          <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
            {/* "All Classes" option */}
            {availableClasses.length > 0 && (
              <div
                onClick={toggleAllClasses}
                className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                  isAllClassesSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-500/80 text-indigo-900 dark:text-white font-medium'
                    : 'bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <input
                    type="checkbox"
                    checked={isAllClassesSelected}
                    readOnly
                    className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 pointer-events-none"
                  />
                  <span className="font-semibold text-slate-900 dark:text-white">All Classes</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0 ml-2">
                  {availableClasses.length} {availableClasses.length === 1 ? 'Class' : 'Classes'}
                </span>
              </div>
            )}

            {/* Individual Classes */}
            {availableClasses.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-500">
                No classes found with registered students
              </div>
            ) : (
              availableClasses.map((cls) => {
                const isSelected = !isAllClassesSelected && selectedClasses.includes(cls);
                return (
                  <div
                    key={cls}
                    onClick={() => toggleClass(cls)}
                    className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-500/80 text-indigo-900 dark:text-white font-medium'
                        : 'bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 pointer-events-none"
                      />
                      <span className="truncate">{cls}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Done Button */}
          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer shadow-2xs"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Section Multi-Select Dropdown Component
// -------------------------------------------------------------
function SectionMultiSelectDropdown({
  availableSections,
  selectedSections,
  onChange,
  disabled,
  isLoading,
}: {
  availableSections: string[];
  selectedSections: string[];
  onChange: (sections: string[]) => void;
  disabled?: boolean;
  isLoading?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const isAllSectionsSelected =
    selectedSections.length === 0 ||
    selectedSections.includes('ALL') ||
    selectedSections.includes('All Sections') ||
    (availableSections.length > 0 && selectedSections.length === availableSections.length);

  const toggleSection = (sec: string) => {
    if (isAllSectionsSelected) {
      onChange([sec]);
      return;
    }
    if (selectedSections.includes(sec)) {
      const next = selectedSections.filter((s) => s !== sec);
      onChange(next);
    } else {
      const next = [...selectedSections, sec];
      onChange(next);
    }
  };

  const toggleAllSections = () => {
    if (isAllSectionsSelected) {
      onChange([]);
    } else {
      onChange(['ALL']);
    }
  };

  const handleSelectAll = () => {
    onChange(['ALL']);
  };

  const handleClear = () => {
    onChange([]);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        disabled={disabled || isLoading}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3.5 py-2.5 rounded-lg border text-left flex items-center justify-between transition-colors outline-none text-sm ${
          isOpen
            ? 'bg-white dark:bg-slate-800 border-indigo-500 ring-2 ring-indigo-500/20'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
        } ${disabled || isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} shadow-2xs`}
      >
        <div className="flex items-center gap-2 truncate pr-2">
          <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          {isLoading ? (
            <span className="text-slate-400 dark:text-slate-500">Loading sections...</span>
          ) : availableSections.length === 0 ? (
            <span className="text-slate-400 dark:text-slate-500">No sections available</span>
          ) : isAllSectionsSelected ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-slate-900 dark:text-white font-semibold">All Sections</span>
              <span className="text-xs text-indigo-700 dark:text-indigo-300 font-mono">
                ({availableSections.length > 0 ? availableSections.map((s) => `Sec ${s}`).join(', ') : 'All'})
              </span>
            </div>
          ) : selectedSections.length === 0 ? (
            <span className="text-slate-400">Select Section(s)...</span>
          ) : selectedSections.length === 1 ? (
            <span className="text-slate-900 dark:text-white font-medium truncate">
              Sec {selectedSections[0]}
            </span>
          ) : (
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-slate-900 dark:text-white font-semibold">
                {selectedSections.length} Sections Selected
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                ({selectedSections.map((s) => `Sec ${s}`).slice(0, 3).join(', ')}
                {selectedSections.length > 3 ? ` +${selectedSections.length - 3}` : ''})
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isLoading ? (
            <div className="w-3.5 h-3.5 border-2 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin" />
          ) : isAllSectionsSelected && availableSections.length > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold">
              All
            </span>
          ) : selectedSections.length > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold">
              {selectedSections.length}
            </span>
          ) : null}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        </div>
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-40 p-2.5 space-y-2 animate-in fade-in-50 zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              Choose Sections ({isAllSectionsSelected ? `All (${availableSections.length})` : `${selectedSections.length}/${availableSections.length}`})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold underline cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-300 dark:text-slate-600">&bull;</span>
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 font-medium underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
            {/* "All Sections" option */}
            {availableSections.length > 0 && (
              <div
                onClick={toggleAllSections}
                className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                  isAllSectionsSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-500/80 text-indigo-900 dark:text-white font-medium'
                    : 'bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <input
                    type="checkbox"
                    checked={isAllSectionsSelected}
                    readOnly
                    className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 pointer-events-none"
                  />
                  <span className="font-semibold text-slate-900 dark:text-white">All Sections</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0 ml-2">
                  {availableSections.length} Sections
                </span>
              </div>
            )}

            {availableSections.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-500">
                No sections found for selected School(s) & Class(es)
              </div>
            ) : (
              availableSections.map((sec) => {
                const isSelected = !isAllSectionsSelected && selectedSections.includes(sec);
                return (
                  <div
                    key={sec}
                    onClick={() => toggleSection(sec)}
                    className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-500/80 text-indigo-900 dark:text-white font-medium'
                        : 'bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 pointer-events-none"
                      />
                      <span className="truncate">Section {sec}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer shadow-2xs"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Student Multi-Select Dropdown Component
// -------------------------------------------------------------
function StudentMultiSelectDropdown({
  availableStudents,
  selectedStudentIds,
  onChange,
  disabled,
  isLoading,
}: {
  availableStudents: any[];
  selectedStudentIds: string[];
  onChange: (studentIds: string[]) => void;
  disabled?: boolean;
  isLoading?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const isAllStudentsSelected =
    selectedStudentIds.length === 0 ||
    selectedStudentIds.includes('ALL') ||
    selectedStudentIds.includes('All Students') ||
    (availableStudents.length > 0 && selectedStudentIds.length === availableStudents.length);

  const toggleStudent = (stuKey: string) => {
    if (isAllStudentsSelected) {
      onChange([stuKey]);
      return;
    }
    if (selectedStudentIds.includes(stuKey)) {
      const next = selectedStudentIds.filter((id) => id !== stuKey);
      onChange(next);
    } else {
      const next = [...selectedStudentIds, stuKey];
      onChange(next);
    }
  };

  const toggleAllStudents = () => {
    if (isAllStudentsSelected) {
      onChange([]);
    } else {
      onChange(['ALL']);
    }
  };

  const handleSelectAll = () => {
    onChange(['ALL']);
  };

  const handleClear = () => {
    onChange([]);
  };

  // Search filter across Student Name, Admission Number, App ID / Username, Class, Section
  const filteredStudents = availableStudents.filter((stu) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (stu.studentName && stu.studentName.toLowerCase().includes(q)) ||
      (stu.schoolAdmissionNumber && stu.schoolAdmissionNumber.toLowerCase().includes(q)) ||
      (stu.uniqueStudentId && stu.uniqueStudentId.toLowerCase().includes(q)) ||
      (stu.username && stu.username.toLowerCase().includes(q)) ||
      (stu.className && stu.className.toLowerCase().includes(q)) ||
      (stu.section && stu.section.toLowerCase().includes(q))
    );
  });

  const selectedStudents = availableStudents.filter(
    (s) =>
      selectedStudentIds.includes(s.uniqueStudentId) ||
      selectedStudentIds.includes(s.id) ||
      selectedStudentIds.includes(s._id)
  );

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        disabled={disabled || isLoading}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3.5 py-2.5 rounded-lg border text-left flex items-center justify-between transition-colors outline-none text-sm ${
          isOpen
            ? 'bg-white dark:bg-slate-800 border-indigo-500 ring-2 ring-indigo-500/20'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
        } ${disabled || isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} shadow-2xs`}
      >
        <div className="flex items-center gap-2 truncate pr-2">
          <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          {isLoading ? (
            <span className="text-slate-400 dark:text-slate-500">Loading students...</span>
          ) : availableStudents.length === 0 ? (
            <span className="text-slate-400 dark:text-slate-500">No students found</span>
          ) : isAllStudentsSelected ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-slate-900 dark:text-white font-semibold">All Students</span>
              <span className="text-xs text-indigo-700 dark:text-indigo-300 font-mono">
                ({availableStudents.length} Students)
              </span>
            </div>
          ) : selectedStudentIds.length === 0 ? (
            <span className="text-slate-400">Select Student(s)...</span>
          ) : selectedStudentIds.length === 1 ? (
            <span className="text-slate-900 dark:text-white font-medium truncate">
              {selectedStudents[0]?.studentName || selectedStudentIds[0]}
              {selectedStudents[0]?.uniqueStudentId && (
                <span className="ml-1.5 text-[11px] font-mono text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                  {selectedStudents[0].uniqueStudentId}
                </span>
              )}
            </span>
          ) : (
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-slate-900 dark:text-white font-semibold">
                {selectedStudentIds.length} Students Selected
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                ({selectedStudents.map((s) => s.studentName).slice(0, 2).join(', ')}
                {selectedStudentIds.length > 2 ? ` +${selectedStudentIds.length - 2}` : ''})
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isLoading ? (
            <div className="w-3.5 h-3.5 border-2 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin" />
          ) : isAllStudentsSelected && availableStudents.length > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold">
              All
            </span>
          ) : selectedStudentIds.length > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold">
              {selectedStudentIds.length}
            </span>
          ) : null}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        </div>
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-40 p-2.5 space-y-2 animate-in fade-in-50 zoom-in-95 duration-100 min-w-[280px]">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              Choose Students ({isAllStudentsSelected ? `All (${availableStudents.length})` : `${selectedStudentIds.length}/${availableStudents.length}`})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold underline cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-300 dark:text-slate-600">&bull;</span>
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 font-medium underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Search bar inside student filter */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              autoFocus
              placeholder="Search name, admission #, App ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
            {/* "All Students" option */}
            {(!search || 'all students'.includes(search.toLowerCase())) && availableStudents.length > 0 && (
              <div
                onClick={toggleAllStudents}
                className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                  isAllStudentsSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-500/80 text-indigo-900 dark:text-white font-medium'
                    : 'bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <input
                    type="checkbox"
                    checked={isAllStudentsSelected}
                    readOnly
                    className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 pointer-events-none"
                  />
                  <span className="font-semibold text-slate-900 dark:text-white">All Students</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0 ml-2">
                  {availableStudents.length} Students
                </span>
              </div>
            )}

            {filteredStudents.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-500">
                {search ? 'No matching students found' : 'No students found for this target selection'}
              </div>
            ) : (
              filteredStudents.map((stu) => {
                const stuKey = stu.uniqueStudentId || stu.id || stu._id;
                const isSelected =
                  !isAllStudentsSelected &&
                  (selectedStudentIds.includes(stu.uniqueStudentId) ||
                    selectedStudentIds.includes(stu.id) ||
                    selectedStudentIds.includes(stu._id));
                return (
                  <div
                    key={stuKey}
                    onClick={() => toggleStudent(stu.uniqueStudentId || stu.id)}
                    className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-500/80 text-indigo-900 dark:text-white font-medium'
                        : 'bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 pointer-events-none"
                      />
                      <div className="truncate">
                        <span className="truncate font-medium text-slate-900 dark:text-white">{stu.studentName}</span>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                          <span className="text-indigo-600 dark:text-indigo-400">ID: {stu.uniqueStudentId}</span>
                          {stu.className && (
                            <span>&bull; {stu.className}{stu.section ? ` - ${stu.section}` : ''}</span>
                          )}
                          {stu.schoolAdmissionNumber && (
                            <span>&bull; Adm: {stu.schoolAdmissionNumber}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer shadow-2xs"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Target Card Component (Individual Target Configuration)
// -------------------------------------------------------------
function TargetCard({
  target,
  index,
  totalTargets: _totalTargets,
  schools,
  token,
  onUpdate,
  onRemove,
}: {
  target: TargetItem;
  index: number;
  totalTargets: number;
  schools: any[];
  token: string;
  onUpdate: (updates: Partial<TargetItem>) => void;
  onRemove: () => void;
}) {
  const {
    selectedSchoolIds,
    selectedClasses,
    availableClasses = [],
    isLoadingClasses = false,
    selectedSections,
    availableSections,
    isLoadingSections,
    selectedStudentIds = [],
    availableStudents = [],
    isLoadingStudents = false,
  } = target;

  // 1. Whenever selectedSchoolIds changes, fetch dynamic classes with actual students from MongoDB Atlas
  useEffect(() => {
    let isCancelled = false;

    const effectiveSchoolIds = selectedSchoolIds.includes('ALL')
      ? schools.map((s) => s.id)
      : selectedSchoolIds;

    if (effectiveSchoolIds.length === 0) {
      onUpdate({ availableClasses: [], selectedClasses: [], isLoadingClasses: false });
      return;
    }

    const fetchClasses = async () => {
      onUpdate({ isLoadingClasses: true });
      try {
        const queryParams = new URLSearchParams();
        queryParams.set('schoolIds', effectiveSchoolIds.join(','));

        const res = await fetch(`/api/target-classes?${queryParams.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          const list: string[] = Array.isArray(data) ? data : data.classes || [];
          if (!isCancelled) {
            const validSelected = selectedClasses.filter(
              (cls) => cls === 'ALL' || cls === 'All Classes' || list.includes(cls)
            );
            const isSelectedSame =
              validSelected.length === selectedClasses.length &&
              validSelected.every((v, i) => v === selectedClasses[i]);
            onUpdate({
              availableClasses: list,
              ...(isSelectedSame ? {} : { selectedClasses: validSelected }),
              isLoadingClasses: false,
            });
          }
        } else {
          if (!isCancelled) {
            onUpdate({ availableClasses: [], selectedClasses: [], isLoadingClasses: false });
          }
        }
      } catch (err) {
        if (!isCancelled) {
          onUpdate({ availableClasses: [], selectedClasses: [], isLoadingClasses: false });
        }
      }
    };

    fetchClasses();

    return () => {
      isCancelled = true;
    };
  }, [
    selectedSchoolIds.join(','),
    token,
    schools.map((s) => s.id).join(','),
  ]);

  // 2. Whenever selectedSchoolIds or selectedClasses changes, fetch dynamic sections from MongoDB Atlas
  useEffect(() => {
    let isCancelled = false;

    const effectiveSchoolIds = selectedSchoolIds.includes('ALL')
      ? schools.map((s) => s.id)
      : selectedSchoolIds;

    if (effectiveSchoolIds.length === 0) {
      onUpdate({ availableSections: [], selectedSections: [], isLoadingSections: false });
      return;
    }

    const fetchSections = async () => {
      onUpdate({ isLoadingSections: true });
      try {
        const queryParams = new URLSearchParams();
        queryParams.set('schoolIds', effectiveSchoolIds.join(','));

        const isAll =
          selectedClasses.length === 0 ||
          selectedClasses.includes('ALL') ||
          selectedClasses.includes('All Classes');

        if (!isAll && selectedClasses.length > 0) {
          queryParams.set('classes', selectedClasses.join(','));
        }

        const res = await fetch(`/api/target-sections?${queryParams.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          const list: string[] = Array.isArray(data) ? data : data.sections || [];
          if (!isCancelled) {
            const validSelected = selectedSections.filter((sec) => sec === 'ALL' || list.includes(sec));
            const isSelectedSame =
              validSelected.length === selectedSections.length &&
              validSelected.every((v, i) => v === selectedSections[i]);
            onUpdate({
              availableSections: list,
              ...(isSelectedSame ? {} : { selectedSections: validSelected }),
              isLoadingSections: false,
            });
          }
        } else {
          if (!isCancelled) {
            onUpdate({ availableSections: [], selectedSections: [], isLoadingSections: false });
          }
        }
      } catch (err) {
        if (!isCancelled) {
          onUpdate({ availableSections: [], selectedSections: [], isLoadingSections: false });
        }
      }
    };

    fetchSections();

    return () => {
      isCancelled = true;
    };
  }, [
    selectedSchoolIds.join(','),
    selectedClasses.join(','),
    token,
    schools.map((s) => s.id).join(','),
  ]);

  // 2. Whenever selectedSchoolIds, selectedClasses, or selectedSections changes, fetch dynamic students from MongoDB Atlas
  useEffect(() => {
    let isCancelled = false;

    const effectiveSchoolIds = selectedSchoolIds.includes('ALL')
      ? schools.map((s) => s.id)
      : selectedSchoolIds;

    if (effectiveSchoolIds.length === 0) {
      onUpdate({ availableStudents: [], selectedStudentIds: [], isLoadingStudents: false });
      return;
    }

    const fetchStudents = async () => {
      onUpdate({ isLoadingStudents: true });
      try {
        const queryParams = new URLSearchParams();
        queryParams.set('schoolIds', effectiveSchoolIds.join(','));

        const isAllCls =
          selectedClasses.length === 0 ||
          selectedClasses.includes('ALL') ||
          selectedClasses.includes('All Classes');

        if (!isAllCls && selectedClasses.length > 0) {
          queryParams.set('classes', selectedClasses.join(','));
        }

        const isAllSec =
          selectedSections.length === 0 ||
          selectedSections.includes('ALL') ||
          selectedSections.includes('All Sections');

        if (!isAllSec && selectedSections.length > 0) {
          queryParams.set('sections', selectedSections.join(','));
        }

        const res = await fetch(`/api/target-students?${queryParams.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          const list: any[] = Array.isArray(data) ? data : data.students || [];
          if (!isCancelled) {
            const validStudentKeys = new Set(
              list.flatMap((s) => [s.uniqueStudentId, s.id, s._id].filter(Boolean))
            );
            const validSelected = (selectedStudentIds || []).filter(
              (id) => id === 'ALL' || validStudentKeys.has(id)
            );
            const isSelectedSame =
              validSelected.length === (selectedStudentIds || []).length &&
              validSelected.every((v, i) => v === selectedStudentIds[i]);
            onUpdate({
              availableStudents: list,
              ...(isSelectedSame ? {} : { selectedStudentIds: validSelected }),
              isLoadingStudents: false,
            });
          }
        } else {
          if (!isCancelled) {
            onUpdate({ availableStudents: [], selectedStudentIds: [], isLoadingStudents: false });
          }
        }
      } catch (err) {
        if (!isCancelled) {
          onUpdate({ availableStudents: [], selectedStudentIds: [], isLoadingStudents: false });
        }
      }
    };

    fetchStudents();

    return () => {
      isCancelled = true;
    };
  }, [
    selectedSchoolIds.join(','),
    selectedClasses.join(','),
    selectedSections.join(','),
    token,
    schools.map((s) => s.id).join(','),
  ]);

  const isAllClasses =
    selectedClasses.length === 0 ||
    selectedClasses.includes('ALL') ||
    selectedClasses.includes('All Classes') ||
    (availableClasses.length > 0 && selectedClasses.length === availableClasses.length);

  const classesText = isAllClasses
    ? availableClasses.length > 0
      ? `All Classes (${availableClasses.length})`
      : 'All Classes'
    : selectedClasses.length === 1
    ? selectedClasses[0]
    : selectedClasses.join(' + ');

  const isAllSections =
    selectedSections.length === 0 ||
    selectedSections.includes('ALL') ||
    selectedSections.includes('All Sections');

  const sectionsText = isAllSections
    ? 'All Sections'
    : selectedSections.length === 1
    ? `Sec ${selectedSections[0]}`
    : `Sec ${selectedSections.join(', ')}`;

  const isAllStudents =
    selectedStudentIds.length === 0 ||
    selectedStudentIds.includes('ALL') ||
    selectedStudentIds.includes('All Students');

  const studentsText = isAllStudents
    ? 'All Students'
    : selectedStudentIds.length === 1
    ? '1 Student'
    : `${selectedStudentIds.length} Students`;

  return (
    <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
      {/* Target Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold font-mono">
            Target Group {index + 1}
          </span>
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {selectedSchoolIds.length === 0
              ? 'No school selected'
              : selectedSchoolIds.includes('ALL')
              ? `All Schools (${schools.length}) • ${classesText} • ${sectionsText} • ${studentsText}`
              : `${selectedSchoolIds.length} school(s) • ${classesText} • ${sectionsText} • ${studentsText}`}
          </span>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-700 hover:border-rose-200 text-rose-600 dark:text-rose-400 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove
        </button>
      </div>

      {/* Target Controls Grid: School -> Class -> Section -> Student */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {/* 1. School Selection -> Multi-Select Dropdown */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            1. School(s) *
          </label>
          <SchoolMultiSelectDropdown
            schools={schools}
            selectedSchoolIds={selectedSchoolIds}
            onChange={(ids) => onUpdate({ selectedSchoolIds: ids })}
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {selectedSchoolIds.length === 0
              ? 'Select one or more schools from dropdown'
              : selectedSchoolIds.includes('ALL')
              ? `All ${schools.length} schools included`
              : `${selectedSchoolIds.length} schools selected`}
          </p>
        </div>

        {/* 2. Class Selection -> Multi-Select Dropdown */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            2. Class(es)
          </label>
          <ClassMultiSelectDropdown
            availableClasses={availableClasses}
            selectedClasses={selectedClasses}
            onChange={(classes) => onUpdate({ selectedClasses: classes })}
            disabled={selectedSchoolIds.length === 0}
            isLoading={isLoadingClasses}
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {isLoadingClasses
              ? 'Loading classes...'
              : availableClasses.length === 0
              ? 'No classes with students found'
              : isAllClasses
              ? `All classes included (${availableClasses.length > 0 ? availableClasses.join(', ') : 'All'})`
              : selectedClasses.length === 1
              ? `Filtered to ${selectedClasses[0]}`
              : `Selected: ${selectedClasses.join(' + ')}`}
          </p>
        </div>

        {/* 3. Section Selection -> Multi-Select Dropdown */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            3. Section(s)
          </label>
          <SectionMultiSelectDropdown
            availableSections={availableSections}
            selectedSections={selectedSections}
            onChange={(sections) => onUpdate({ selectedSections: sections })}
            disabled={selectedSchoolIds.length === 0}
            isLoading={isLoadingSections}
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {isLoadingSections
              ? 'Loading sections...'
              : availableSections.length === 0
              ? 'No sections found'
              : isAllSections
              ? `All sections included (${availableSections.length > 0 ? availableSections.map((s) => `Sec ${s}`).join(', ') : 'All'})`
              : selectedSections.length === 1
              ? `Filtered to Sec ${selectedSections[0]}`
              : `Selected: ${selectedSections.map((s) => `Sec ${s}`).join(' + ')}`}
          </p>
        </div>

        {/* 4. Student Selection -> Multi-Select Dropdown */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            4. Student(s)
          </label>
          <StudentMultiSelectDropdown
            availableStudents={availableStudents}
            selectedStudentIds={selectedStudentIds}
            onChange={(studentIds) => onUpdate({ selectedStudentIds: studentIds })}
            disabled={selectedSchoolIds.length === 0}
            isLoading={isLoadingStudents}
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {isLoadingStudents
              ? 'Loading students...'
              : availableStudents.length === 0
              ? 'No students found'
              : isAllStudents
              ? `All ${availableStudents.length} student(s) included`
              : selectedStudentIds.length === 1
              ? `Filtered to 1 student`
              : `Selected: ${selectedStudentIds.length} students`}
          </p>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Main Publish Assessment Section
// -------------------------------------------------------------
export function PublishAssessmentSection({
  token,
  schools,
  allQuestions,
  onPublishSuccess,
  formState,
  onFormStateChange,
  onResetFormState,
  editingPublishId,
  onCancelEdit,
}: PublishAssessmentSectionProps) {
  const currentEditId = editingPublishId || formState?.editingPublishId || null;
  const isEditMode = Boolean(currentEditId);

  const [publishName, setPublishName] = useState(formState?.publishName ?? '');
  const [publishMode, setPublishMode] = useState<'Selected Questions' | 'Random Questions'>(
    formState?.publishMode ?? 'Selected Questions'
  );

  // Multi-target list state
  const [targets, setTargets] = useState<TargetItem[]>(
    formState?.targets ?? [
      {
        id: 'target-1',
        selectedSchoolIds: ['ALL'],
        selectedClasses: ['ALL'],
        availableClasses: [],
        isLoadingClasses: false,
        selectedSections: [],
        availableSections: [],
        isLoadingSections: false,
        selectedStudentIds: [],
        availableStudents: [],
        isLoadingStudents: false,
      },
    ]
  );

  const [selectedQuestionsForPublish, setSelectedQuestionsForPublish] = useState<string[]>(
    formState?.selectedQuestionsForPublish ?? []
  );
  const [questionsSnapshot, setQuestionsSnapshot] = useState<any[]>(
    formState?.questionsSnapshot ?? []
  );
  const [shuffleQuestions, setShuffleQuestions] = useState(formState?.shuffleQuestions ?? false);
  const [randomCount, setRandomCount] = useState<number | ''>(
    formState?.randomCount != null && formState.randomCount !== '' ? formState.randomCount : ''
  );
  const [startDate, setStartDate] = useState(
    () => formState?.startDate ?? getLocalTodayDate()
  );
  const [startTime, setStartTime] = useState(
    () => formState?.startTime ? to12Hour(formState.startTime) : getLocalCurrentTime12H()
  );
  const [endDate, setEndDate] = useState(
    () => formState?.endDate ?? getLocalFutureDate(7)
  );
  const [endTime, setEndTime] = useState(
    () => formState?.endTime ? to12Hour(formState.endTime) : '11:59 PM'
  );
  
  // Feedback notification state (strictly typed for semantic green success vs red error)
  const [publishFeedback, setPublishFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const publishRequestRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const showSuccessFeedback = (message: string) => {
    setPublishFeedback({ type: 'success', message });
  };

  const showErrorFeedback = (message: string) => {
    setPublishFeedback({ type: 'error', message });
  };

  // Question Picker Hierarchical State (Group -> Difficulty -> Questions)
  const [questionPickerSearch, setQuestionPickerSearch] = useState(formState?.questionPickerSearch ?? '');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => (formState?.expandedGroups ? new Set(formState.expandedGroups) : new Set())
  );
  const [expandedDifficulties, setExpandedDifficulties] = useState<Set<string>>(
    () => (formState?.expandedDifficulties ? new Set(formState.expandedDifficulties) : new Set())
  );

  // Random Questions mode selected difficulties (stores `${groupName}::${diffName}`)
  const [randomSelectedDifficulties, setRandomSelectedDifficulties] = useState<Set<string>>(
    () => (formState?.randomSelectedDifficulties ? new Set(formState.randomSelectedDifficulties) : new Set<string>())
  );

  // When formState or editingPublishId changes from external trigger (e.g. from clicking Edit), update all local states
  const prevEditIdRef = useRef<string | null | undefined>(editingPublishId);
  useEffect(() => {
    if (editingPublishId && editingPublishId !== prevEditIdRef.current) {
      prevEditIdRef.current = editingPublishId;
      if (formState) {
        setPublishName(formState.publishName ?? '');
        setPublishMode(formState.publishMode ?? 'Selected Questions');
        if (formState.targets && formState.targets.length > 0) {
          setTargets(formState.targets);
        }
        setSelectedQuestionsForPublish(formState.selectedQuestionsForPublish ?? []);
        if (formState.questionsSnapshot) {
          setQuestionsSnapshot(formState.questionsSnapshot);
        }
        setShuffleQuestions(formState.shuffleQuestions ?? false);
        setRandomCount(formState.randomCount != null && formState.randomCount !== '' ? formState.randomCount : '');
        setStartDate(formState.startDate ?? getLocalTodayDate());
        setStartTime(formState.startTime ? to12Hour(formState.startTime) : getLocalCurrentTime12H());
        setEndDate(formState.endDate ?? getLocalFutureDate(7));
        setEndTime(formState.endTime ? to12Hour(formState.endTime) : '11:59 PM');
        if (formState.randomSelectedDifficulties) {
          setRandomSelectedDifficulties(new Set(formState.randomSelectedDifficulties));
        }
      }
    }
  }, [editingPublishId, formState]);

  // High-performance O(1) set for question selection lookups
  const selectedQuestionsSet = React.useMemo(
    () => new Set(selectedQuestionsForPublish),
    [selectedQuestionsForPublish]
  );

  // Sync state back to parent container with debouncing so rapid clicks/typing don't thrash parent renders
  useEffect(() => {
    if (!onFormStateChange) return;

    const timer = setTimeout(() => {
      onFormStateChange({
        publishName,
        publishMode,
        targets,
        selectedQuestionsForPublish,
        randomSelectedDifficulties: Array.from(randomSelectedDifficulties),
        shuffleQuestions,
        randomCount,
        startDate,
        startTime,
        endDate,
        endTime,
        editingPublishId: currentEditId,
        expandedGroups: Array.from(expandedGroups),
        expandedDifficulties: Array.from(expandedDifficulties),
        questionPickerSearch,
      });
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [
    publishName,
    publishMode,
    targets,
    selectedQuestionsForPublish,
    randomSelectedDifficulties,
    shuffleQuestions,
    randomCount,
    startDate,
    startTime,
    endDate,
    endTime,
    currentEditId,
    expandedGroups,
    expandedDifficulties,
    questionPickerSearch,
    onFormStateChange,
  ]);

  // In-section preview modal
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Template management state
  const [savedTemplates, setSavedTemplates] = useState<any[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templateFetchError, setTemplateFetchError] = useState<string | null>(null);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateNameInput, setTemplateNameInput] = useState('');
  const [saveTemplateError, setSaveTemplateError] = useState<string | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [showSavedTemplatesModal, setShowSavedTemplatesModal] = useState(false);
  const [showOverwriteAlert, setShowOverwriteAlert] = useState(false);
  const [pendingTemplateToLoad, setPendingTemplateToLoad] = useState<any | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateToDelete, setTemplateToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false);

  // Dynamically group allQuestions into Group -> Difficulty -> Questions hierarchy
  const groupsHierarchy = React.useMemo(() => {
    const groupMap = new Map<
      string,
      {
        groupName: string;
        groupId: string;
        difficultyMap: Map<string, any[]>;
        allQuestions: any[];
      }
    >();

    for (const q of allQuestions) {
      const gName = (q.groupName || 'General').trim();
      const gId = q.groupId ? String(q.groupId) : gName;
      if (!groupMap.has(gName)) {
        groupMap.set(gName, {
          groupName: gName,
          groupId: gId,
          difficultyMap: new Map<string, any[]>(),
          allQuestions: [],
        });
      }
      const gEntry = groupMap.get(gName)!;
      gEntry.allQuestions.push(q);

      const rawDiff = (q.difficulty || 'Medium').trim();
      const normalizedDiff =
        rawDiff.charAt(0).toUpperCase() + rawDiff.slice(1).toLowerCase();
      const diffKey = ['Easy', 'Medium', 'Hard'].includes(normalizedDiff)
        ? normalizedDiff
        : rawDiff;

      if (!gEntry.difficultyMap.has(diffKey)) {
        gEntry.difficultyMap.set(diffKey, []);
      }
      gEntry.difficultyMap.get(diffKey)!.push(q);
    }

    const standardOrder = ['Easy', 'Medium', 'Hard'];

    return Array.from(groupMap.values())
      .sort((a, b) => a.groupName.localeCompare(b.groupName, undefined, { sensitivity: 'base' }))
      .map((g) => {
        const presentDiffs = Array.from(g.difficultyMap.keys());
        const sortedDiffKeys = [
          ...standardOrder.filter((d) => presentDiffs.includes(d)),
          ...presentDiffs.filter((d) => !standardOrder.includes(d)),
        ];

        const difficulties = sortedDiffKeys.map((diffName) => ({
          difficulty: diffName,
          questions: g.difficultyMap.get(diffName) || [],
        }));

        return {
          groupName: g.groupName,
          groupId: g.groupId,
          difficulties,
          allGroupQuestions: g.allQuestions,
        };
      });
  }, [allQuestions]);

  // Synchronize randomSelectedDifficulties if in edit mode or formState has initial question IDs
  useEffect(() => {
    if (
      publishMode === 'Random Questions' &&
      randomSelectedDifficulties.size === 0 &&
      selectedQuestionsForPublish.length > 0 &&
      allQuestions.length > 0
    ) {
      const inferred = new Set<string>();
      for (const qId of selectedQuestionsForPublish) {
        const q = allQuestions.find((item) => item.id === qId);
        if (q) {
          const g = (q.groupName || 'General').trim();
          const d = (q.difficulty || 'Medium').trim();
          const norm = d.charAt(0).toUpperCase() + d.slice(1).toLowerCase();
          inferred.add(`${g}::${norm}`);
        }
      }
      if (inferred.size > 0) {
        setRandomSelectedDifficulties(inferred);
      }
    }
  }, [publishMode, selectedQuestionsForPublish, allQuestions]);

  // Calculate eligible question pool for Random Questions mode strictly from selected difficulties
  const randomEligibleQuestions = React.useMemo(() => {
    if (randomSelectedDifficulties.size === 0) return [];
    return allQuestions.filter((q) => {
      const gName = (q.groupName || 'General').trim();
      const rawDiff = (q.difficulty || 'Medium').trim();
      const normalizedDiff = rawDiff.charAt(0).toUpperCase() + rawDiff.slice(1).toLowerCase();
      const diffKey = ['Easy', 'Medium', 'Hard'].includes(normalizedDiff) ? normalizedDiff : rawDiff;
      return (
        randomSelectedDifficulties.has(`${gName}::${diffKey}`) ||
        randomSelectedDifficulties.has(`${gName}::${rawDiff}`)
      );
    });
  }, [allQuestions, randomSelectedDifficulties]);

  const randomEligiblePoolCount = randomEligibleQuestions.length;

  // Prune any deleted question IDs from selectedQuestionsForPublish when Question Bank updates
  useEffect(() => {
    if (Array.isArray(allQuestions)) {
      const liveIds = new Set(allQuestions.map((q) => String(q.id || q._id)));
      setSelectedQuestionsForPublish((prev) => {
        const filtered = prev.filter((id) => liveIds.has(String(id)));
        return filtered.length !== prev.length ? filtered : prev;
      });
    }
  }, [allQuestions]);

  // Questions prepared for student-style preview based on current publish mode and shuffle
  const previewQuestionsList: AssessmentPreviewQuestion[] = React.useMemo(() => {
    if (publishMode === 'Selected Questions') {
      const qMap = new Map<string, any>();
      for (const q of allQuestions) {
        if (q.id) qMap.set(String(q.id), q);
        if (q._id) qMap.set(String(q._id), q);
      }

      let ordered: AssessmentPreviewQuestion[] = selectedQuestionsForPublish
        .map((id) => {
          const liveQ = qMap.get(String(id));
          if (liveQ) {
            const isRanking = Boolean(
              liveQ.isRanking ||
              liveQ.isRankingQuestion ||
              liveQ.rankingQuestion ||
              String(liveQ.questionType || '').toLowerCase() === 'ranking'
            );
            return {
              id: String(liveQ.id || liveQ._id),
              questionId: String(liveQ.id || liveQ._id),
              groupName: liveQ.groupName,
              difficulty: liveQ.difficulty,
              content: liveQ.content,
              points: liveQ.points != null ? Number(liveQ.points) : null,
              timeSeconds: liveQ.timeSeconds,
              timeAllowedSeconds: liveQ.timeSeconds,
              options: liveQ.options || [],
              answerType: liveQ.answerType || 'single',
              isRanking,
              isRankingQuestion: isRanking,
              rankingQuestion: isRanking,
              questionType: isRanking ? 'Ranking' : (liveQ.questionType || (liveQ.answerType === 'multiple' ? 'Multiple Selection' : 'Single Selection')),
              enableWrittenExplanation: Boolean(
                liveQ.enableWrittenExplanation !== undefined
                  ? liveQ.enableWrittenExplanation
                  : liveQ.metadata?.enableWrittenExplanation
              ),
              defaultInput: liveQ.defaultInput !== undefined ? Boolean(liveQ.defaultInput) : (liveQ.metadata?.defaultInput !== undefined ? Boolean(liveQ.metadata.defaultInput) : true),
              metadata: liveQ.metadata || {},
              pairs: liveQ.pairs || liveQ.metadata?.pairs || [],
              images: liveQ.images || [],
              imageLayout: liveQ.imageLayout || 'auto',
              isQuestionDeleted: false,
            };
          }
          // Permanently deleted questions MUST NOT appear in Publish Test Preview
          return null;
        })
        .filter(Boolean) as AssessmentPreviewQuestion[];

      if (shuffleQuestions) {
        ordered = [...ordered];
        for (let i = ordered.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
        }
      }

      return ordered;
    } else {
      // Random Questions mode: preview a representative sample from eligible pool
      let pool = [...randomEligibleQuestions];
      // Shuffle pool to simulate random draw
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const targetCount =
        randomCount !== '' && Number(randomCount) > 0
          ? Math.min(Number(randomCount), pool.length)
          : Math.min(5, pool.length);
      const sampled = pool.slice(0, targetCount);

      return sampled.map((q) => {
        const isRanking = Boolean(
          q.isRanking ||
          q.isRankingQuestion ||
          q.rankingQuestion ||
          String(q.questionType || '').toLowerCase() === 'ranking'
        );
        return {
          id: String(q.id || q._id),
          questionId: String(q.id || q._id),
          groupName: q.groupName,
          difficulty: q.difficulty,
          content: q.content,
          points: q.points != null ? Number(q.points) : null,
          timeSeconds: q.timeSeconds,
          timeAllowedSeconds: q.timeSeconds,
          options: q.options || [],
          answerType: q.answerType || 'single',
          isRanking,
          isRankingQuestion: isRanking,
          rankingQuestion: isRanking,
          questionType: isRanking ? 'Ranking' : (q.questionType || (q.answerType === 'multiple' ? 'Multiple Selection' : 'Single Selection')),
          enableWrittenExplanation: Boolean(
            q.enableWrittenExplanation !== undefined
              ? q.enableWrittenExplanation
              : q.metadata?.enableWrittenExplanation
          ),
          defaultInput: q.defaultInput !== undefined ? Boolean(q.defaultInput) : (q.metadata?.defaultInput !== undefined ? Boolean(q.metadata.defaultInput) : true),
          metadata: q.metadata || {},
          pairs: q.pairs || q.metadata?.pairs || [],
          images: q.images || [],
          imageLayout: q.imageLayout || 'auto',
          isQuestionDeleted: false,
        };
      });
    }
  }, [
    publishMode,
    allQuestions,
    selectedQuestionsForPublish,
    questionsSnapshot,
    isEditMode,
    shuffleQuestions,
    randomEligibleQuestions,
    randomCount,
  ]);

  // Immediate validation warning for Random Questions mode
  const randomValidationWarning = React.useMemo(() => {
    if (publishMode !== 'Random Questions') return null;
    if (randomEligiblePoolCount === 0) {
      return '0 eligible questions are available. Select at least one Group and Difficulty.';
    }
    if (randomCount === '' || randomCount == null) {
      return null;
    }
    const count = Number(randomCount);
    if (isNaN(count) || count <= 0) {
      return 'Number of questions per student must be at least 1.';
    }
    if (count > randomEligiblePoolCount) {
      return `Only ${randomEligiblePoolCount} eligible questions are available. You cannot assign ${count} questions per student.`;
    }
    return null;
  }, [publishMode, randomEligiblePoolCount, randomCount]);

  // Random Questions mode hierarchy selection helpers
  const isRandomAllGroupsChecked = React.useMemo(() => {
    const allDiffKeys = groupsHierarchy.flatMap((g) =>
      g.difficulties.map((d) => `${g.groupName}::${d.difficulty}`)
    );
    return allDiffKeys.length > 0 && allDiffKeys.every((k) => randomSelectedDifficulties.has(k));
  }, [groupsHierarchy, randomSelectedDifficulties]);

  const isRandomAllGroupsIndeterminate = React.useMemo(() => {
    if (isRandomAllGroupsChecked) return false;
    const allDiffKeys = groupsHierarchy.flatMap((g) =>
      g.difficulties.map((d) => `${g.groupName}::${d.difficulty}`)
    );
    return allDiffKeys.some((k) => randomSelectedDifficulties.has(k));
  }, [groupsHierarchy, randomSelectedDifficulties, isRandomAllGroupsChecked]);

  const handleToggleRandomAllGroups = () => {
    const allDiffKeys = groupsHierarchy.flatMap((g) =>
      g.difficulties.map((d) => `${g.groupName}::${d.difficulty}`)
    );
    if (isRandomAllGroupsChecked) {
      setRandomSelectedDifficulties(new Set());
    } else {
      setRandomSelectedDifficulties(new Set(allDiffKeys));
    }
  };

  const handleToggleRandomGroup = (group: any) => {
    const groupDiffKeys = group.difficulties.map((d: any) => `${group.groupName}::${d.difficulty}`);
    const isGroupAllSelected =
      groupDiffKeys.length > 0 && groupDiffKeys.every((k: string) => randomSelectedDifficulties.has(k));

    setRandomSelectedDifficulties((prev) => {
      const next = new Set(prev);
      if (isGroupAllSelected) {
        groupDiffKeys.forEach((k: string) => next.delete(k));
      } else {
        groupDiffKeys.forEach((k: string) => next.add(k));
      }
      return next;
    });
  };

  const handleToggleRandomDifficulty = (diffKey: string) => {
    setRandomSelectedDifficulties((prev) => {
      const next = new Set(prev);
      if (next.has(diffKey)) {
        next.delete(diffKey);
      } else {
        next.add(diffKey);
      }
      return next;
    });
  };

  // Structured summaries for Selected and Random modes
  const selectedSummaryData = React.useMemo(() => {
    const result: Array<{
      groupName: string;
      difficulties: Array<{ difficulty: string; count: number }>;
    }> = [];

    groupsHierarchy.forEach((g) => {
      const diffs: Array<{ difficulty: string; count: number }> = [];
      g.difficulties.forEach((d) => {
        const count = d.questions.filter((q) => selectedQuestionsSet.has(q.id)).length;
        if (count > 0) {
          diffs.push({ difficulty: d.difficulty, count });
        }
      });
      if (diffs.length > 0) {
        result.push({ groupName: g.groupName, difficulties: diffs });
      }
    });

    return result;
  }, [groupsHierarchy, selectedQuestionsSet]);

  const randomSummaryData = React.useMemo(() => {
    const result: Array<{
      groupName: string;
      difficulties: Array<{ difficulty: string; count: number }>;
    }> = [];

    groupsHierarchy.forEach((g) => {
      const diffs: Array<{ difficulty: string; count: number }> = [];
      g.difficulties.forEach((d) => {
        const diffKey = `${g.groupName}::${d.difficulty}`;
        if (randomSelectedDifficulties.has(diffKey)) {
          diffs.push({ difficulty: d.difficulty, count: d.questions.length });
        }
      });
      if (diffs.length > 0) {
        result.push({ groupName: g.groupName, difficulties: diffs });
      }
    });

    return result;
  }, [groupsHierarchy, randomSelectedDifficulties]);

  // Expand all groups and difficulties on initial question load
  useEffect(() => {
    if (groupsHierarchy.length > 0) {
      setExpandedGroups((prev) => {
        if (prev.size === 0) {
          return new Set(groupsHierarchy.map((g) => g.groupName));
        }
        return prev;
      });
      setExpandedDifficulties((prev) => {
        if (prev.size === 0) {
          const initialDiffs = new Set<string>();
          groupsHierarchy.forEach((g) => {
            g.difficulties.forEach((d) => {
              initialDiffs.add(`${g.groupName}::${d.difficulty}`);
            });
          });
          return initialDiffs;
        }
        return prev;
      });
    }
  }, [groupsHierarchy]);

  // When search query is active, auto-expand matching groups and difficulties
  useEffect(() => {
    if (questionPickerSearch.trim()) {
      setExpandedGroups(new Set(groupsHierarchy.map((g) => g.groupName)));
      const matchingDiffs = new Set<string>();
      groupsHierarchy.forEach((g) => {
        g.difficulties.forEach((d) => {
          matchingDiffs.add(`${g.groupName}::${d.difficulty}`);
        });
      });
      setExpandedDifficulties(matchingDiffs);
    }
  }, [questionPickerSearch, groupsHierarchy]);

  const toggleGroupExpand = (gName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(gName)) {
        next.delete(gName);
      } else {
        next.add(gName);
      }
      return next;
    });
  };

  const toggleDifficultyExpand = (key: string) => {
    setExpandedDifficulties((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setExpandedGroups(new Set(groupsHierarchy.map((g) => g.groupName)));
    const allDiffKeys = new Set<string>();
    groupsHierarchy.forEach((g) => {
      g.difficulties.forEach((d) => {
        allDiffKeys.add(`${g.groupName}::${d.difficulty}`);
      });
    });
    setExpandedDifficulties(allDiffKeys);
  };

  const handleCollapseAll = () => {
    setExpandedGroups(new Set());
    setExpandedDifficulties(new Set());
  };

  // Search filtered hierarchy
  const filteredGroupsHierarchy = React.useMemo(() => {
    const term = questionPickerSearch.trim().toLowerCase();
    if (!term) return groupsHierarchy;

    return groupsHierarchy
      .map((g) => {
        const matchesGroup = g.groupName.toLowerCase().includes(term);

        const filteredDiffs = g.difficulties
          .map((d) => {
            const matchesDiff = d.difficulty.toLowerCase().includes(term);
            const filteredQs = d.questions.filter(
              (q) =>
                matchesGroup ||
                matchesDiff ||
                (q.content && q.content.toLowerCase().includes(term))
            );
            return {
              ...d,
              questions: filteredQs,
            };
          })
          .filter((d) => d.questions.length > 0);

        const allMatchingQs = filteredDiffs.flatMap((d) => d.questions);

        return {
          ...g,
          difficulties: filteredDiffs,
          allGroupQuestions: allMatchingQs,
        };
      })
      .filter((g) => g.allGroupQuestions.length > 0);
  }, [groupsHierarchy, questionPickerSearch]);

  const allVisibleQuestionIds = React.useMemo(() => {
    return filteredGroupsHierarchy.flatMap((g) => g.allGroupQuestions.map((q) => q.id));
  }, [filteredGroupsHierarchy]);

  const isAllGroupsChecked =
    allVisibleQuestionIds.length > 0 &&
    allVisibleQuestionIds.every((id) => selectedQuestionsSet.has(id));

  const isAllGroupsIndeterminate =
    !isAllGroupsChecked &&
    allVisibleQuestionIds.some((id) => selectedQuestionsSet.has(id));

  const handleToggleAllGroups = () => {
    if (isAllGroupsChecked) {
      const toRemove = new Set(allVisibleQuestionIds);
      setSelectedQuestionsForPublish((prev) => prev.filter((id) => !toRemove.has(id)));
    } else {
      const newSelected = new Set([...selectedQuestionsForPublish, ...allVisibleQuestionIds]);
      setSelectedQuestionsForPublish(Array.from(newSelected));
    }
  };

  const handleToggleGroup = (groupQuestions: any[]) => {
    const groupQIds = groupQuestions.map((q) => q.id);
    const isGroupAllSelected =
      groupQIds.length > 0 && groupQIds.every((id) => selectedQuestionsSet.has(id));

    if (isGroupAllSelected) {
      const toRemove = new Set(groupQIds);
      setSelectedQuestionsForPublish((prev) => prev.filter((id) => !toRemove.has(id)));
    } else {
      const newSelected = new Set([...selectedQuestionsForPublish, ...groupQIds]);
      setSelectedQuestionsForPublish(Array.from(newSelected));
    }
  };

  const handleToggleDifficulty = (diffQuestions: any[]) => {
    const diffQIds = diffQuestions.map((q) => q.id);
    const isDiffAllSelected =
      diffQIds.length > 0 && diffQIds.every((id) => selectedQuestionsSet.has(id));

    if (isDiffAllSelected) {
      const toRemove = new Set(diffQIds);
      setSelectedQuestionsForPublish((prev) => prev.filter((id) => !toRemove.has(id)));
    } else {
      const newSelected = new Set([...selectedQuestionsForPublish, ...diffQIds]);
      setSelectedQuestionsForPublish(Array.from(newSelected));
    }
  };

  const handleToggleQuestion = (qId: string) => {
    if (selectedQuestionsSet.has(qId)) {
      setSelectedQuestionsForPublish((prev) => prev.filter((id) => id !== qId));
    } else {
      setSelectedQuestionsForPublish((prev) => [...prev, qId]);
    }
  };

  const getHeaders = () => getAuthHeaders(token);
  const headers = getHeaders();

  const fetchSavedTemplates = async (retryCount = 0) => {
    if (!token) return;
    setIsLoadingTemplates(true);
    setTemplateFetchError(null);
    try {
      const res = await fetch('/api/templates', {
        credentials: 'same-origin',
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSavedTemplates(data);
          setTemplateFetchError(null);
        }
      } else if ((res.status === 401 || res.status >= 500) && retryCount < 2) {
        setTimeout(() => {
          fetchSavedTemplates(retryCount + 1);
        }, 800);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setTemplateFetchError(errJson.error || 'Unable to load saved tests.');
      }
    } catch (err: any) {
      if (retryCount < 2) {
        setTimeout(() => {
          fetchSavedTemplates(retryCount + 1);
        }, 1000);
      } else {
        setTemplateFetchError('Unable to connect to server. Please check your connection.');
      }
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchSavedTemplates();
    }
  }, [token]);

  const handleOpenSaveTemplateModal = () => {
    if (publishMode === 'Selected Questions' && selectedQuestionsForPublish.length === 0) {
      showErrorFeedback('Please select at least 1 question before saving.');
      return;
    }
    if (publishMode === 'Random Questions' && randomSelectedDifficulties.size === 0) {
      showErrorFeedback('Please select at least 1 Question Group and Difficulty before saving.');
      return;
    }
    setTemplateNameInput('');
    setSaveTemplateError(null);
    setShowSaveTemplateModal(true);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = templateNameInput.trim();
    if (!trimmed) {
      setSaveTemplateError('Please enter a name for this saved test.');
      return;
    }

    const exists = savedTemplates.some(
      (t) => t.name && t.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setSaveTemplateError(`A saved test named '${trimmed}' already exists. Please choose a different name.`);
      return;
    }

    setIsSavingTemplate(true);
    setSaveTemplateError(null);

    try {
      const cleanTargets = targets.map((t, idx) => ({
        id: t.id || `target-${Date.now()}-${idx}`,
        selectedSchoolIds: Array.isArray(t.selectedSchoolIds) ? t.selectedSchoolIds : ['ALL'],
        selectedClasses: Array.isArray(t.selectedClasses) ? t.selectedClasses : ['ALL'],
        selectedSections: Array.isArray(t.selectedSections) ? t.selectedSections : [],
        selectedStudentIds: Array.isArray(t.selectedStudentIds) ? t.selectedStudentIds : [],
      }));

      const qIdsToSend =
        publishMode === 'Selected Questions'
          ? selectedQuestionsForPublish
          : randomEligibleQuestions.map((q) => q.id);

      const res = await fetch('/api/templates', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: trimmed,
          publishMode,
          selectedQuestionIds: qIdsToSend,
          randomSelectedDifficulties:
            publishMode === 'Random Questions' ? Array.from(randomSelectedDifficulties) : [],
          shuffleQuestions: publishMode === 'Selected Questions' ? shuffleQuestions : false,
          randomCount: randomCount !== '' ? Number(randomCount) : undefined,
          targets: cleanTargets,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setShowSaveTemplateModal(false);
        setTemplateNameInput('');
        showSuccessFeedback(`Saved test '${trimmed}' saved successfully!`);
        await fetchSavedTemplates();
      } else {
        setSaveTemplateError(data.error || 'Unable to save test. Please try again.');
      }
    } catch (err: any) {
      setSaveTemplateError(err.message || 'Unable to save test. Please check your connection and try again.');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const hasCurrentSelections = () => {
    if (publishName.trim() !== '') return true;
    if (publishMode === 'Selected Questions' && selectedQuestionsForPublish.length > 0) return true;
    if (publishMode === 'Random Questions' && randomSelectedDifficulties.size > 0) return true;
    if (targets.length > 1) return true;
    if (targets.length === 1) {
      const t = targets[0];
      const isDefaultSchool = t.selectedSchoolIds.length === 1 && t.selectedSchoolIds[0] === 'ALL';
      const isDefaultClass = t.selectedClasses.length === 1 && t.selectedClasses[0] === 'ALL';
      const isDefaultSec = !t.selectedSections || t.selectedSections.length === 0;
      const isDefaultStu = !t.selectedStudentIds || t.selectedStudentIds.length === 0;
      if (!isDefaultSchool || !isDefaultClass || !isDefaultSec || !isDefaultStu) {
        return true;
      }
    }
    return false;
  };

  const handleSelectTemplate = (tpl: any) => {
    if (hasCurrentSelections()) {
      setPendingTemplateToLoad(tpl);
      setShowOverwriteAlert(true);
    } else {
      applyTemplate(tpl);
    }
  };

  const applyTemplate = (tpl: any) => {
    const rawTargets = Array.isArray(tpl.targets) && tpl.targets.length > 0
      ? tpl.targets
      : [
          {
            selectedSchoolIds: ['ALL'],
            selectedClasses: ['ALL'],
            selectedSections: [],
            selectedStudentIds: [],
          },
        ];

    const clonedTargets: TargetItem[] = rawTargets.map((t: any, idx: number) => ({
      id: `target-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      selectedSchoolIds: Array.isArray(t.selectedSchoolIds) ? [...t.selectedSchoolIds] : ['ALL'],
      selectedClasses: Array.isArray(t.selectedClasses) ? [...t.selectedClasses] : ['ALL'],
      availableClasses: [],
      isLoadingClasses: false,
      selectedSections: Array.isArray(t.selectedSections) ? [...t.selectedSections] : [],
      availableSections: [],
      isLoadingSections: false,
      selectedStudentIds: Array.isArray(t.selectedStudentIds) ? [...t.selectedStudentIds] : [],
      availableStudents: [],
      isLoadingStudents: false,
    }));

    const targetMode = tpl.publishMode || 'Selected Questions';
    setPublishMode(targetMode);

    if (targetMode === 'Selected Questions') {
      const validQIds = Array.isArray(tpl.selectedQuestionIds)
        ? tpl.selectedQuestionIds.filter((id: string) => allQuestions.some((q) => q.id === id))
        : [];
      setSelectedQuestionsForPublish(validQIds);
      setShuffleQuestions(Boolean(tpl.shuffleQuestions));
      setRandomSelectedDifficulties(new Set());
      setRandomCount('');
    } else {
      setRandomCount(tpl.randomCount != null && tpl.randomCount !== '' ? Number(tpl.randomCount) : '');
      if (Array.isArray(tpl.randomSelectedDifficulties) && tpl.randomSelectedDifficulties.length > 0) {
        setRandomSelectedDifficulties(new Set(tpl.randomSelectedDifficulties));
      } else if (Array.isArray(tpl.selectedQuestionIds) && tpl.selectedQuestionIds.length > 0) {
        // Legacy template migration: infer group::difficulty from saved question IDs
        const inferred = new Set<string>();
        for (const qId of tpl.selectedQuestionIds) {
          const q = allQuestions.find((item) => item.id === qId);
          if (q) {
            const g = (q.groupName || 'General').trim();
            const d = (q.difficulty || 'Medium').trim();
            const norm = d.charAt(0).toUpperCase() + d.slice(1).toLowerCase();
            inferred.add(`${g}::${norm}`);
          }
        }
        setRandomSelectedDifficulties(inferred);
      } else {
        setRandomSelectedDifficulties(new Set());
      }
      setSelectedQuestionsForPublish([]);
    }

    setTargets(clonedTargets);

    // Keep publishName empty and dates at fresh defaults
    setPublishName('');

    setShowSavedTemplatesModal(false);
    setShowOverwriteAlert(false);
    setPendingTemplateToLoad(null);
    showSuccessFeedback(`Saved test '${tpl.name}' loaded successfully.`);
  };

  const handleConfirmDeleteTemplate = async () => {
    if (!templateToDelete) return;
    const { id: templateId, name: templateName } = templateToDelete;
    setIsDeletingTemplate(true);

    try {
      const res = await fetch(`/api/templates/${templateId}`, {
        method: 'DELETE',
        headers,
      });

      if (res.ok) {
        setSavedTemplates((prev) => prev.filter((t) => (t.id || t._id) !== templateId));
        setTemplateToDelete(null);
        showSuccessFeedback(`Saved test '${templateName}' deleted successfully.`);
        await fetchSavedTemplates();
      } else {
        const data = await res.json();
        showErrorFeedback(data.error || 'Unable to delete saved test. Please try again.');
      }
    } catch (err: any) {
      showErrorFeedback(err.message || 'Unable to delete saved test. Please try again.');
    } finally {
      setIsDeletingTemplate(false);
    }
  };

  const resolveTargetSchoolIds = (ids: string[]) => {
    if (ids.includes('ALL')) {
      return schools.map((s) => s.id);
    }
    return ids;
  };

  const handleAddTarget = () => {
    setTargets((prev) => [
      ...prev,
      {
        id: `target-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        selectedSchoolIds: ['ALL'],
        selectedClasses: ['ALL'],
        availableClasses: [],
        isLoadingClasses: false,
        selectedSections: [],
        availableSections: [],
        isLoadingSections: false,
        selectedStudentIds: [],
        availableStudents: [],
        isLoadingStudents: false,
      },
    ]);
  };

  const handleRemoveTarget = (id: string) => {
    setTargets((prev) => prev.filter((t) => t.id !== id));
  };

  const handleUpdateTarget = (index: number, updates: Partial<TargetItem>) => {
    setTargets((prev) => {
      if (!prev[index]) return prev;
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const handleClearAllTargets = () => {
    setTargets([]);
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublishFeedback(null);

    if (targets.length === 0) {
      showErrorFeedback('Please choose at least one group of students before publishing.');
      return;
    }

    if (!publishName.trim()) {
      showErrorFeedback('Please enter a Test Name (e.g. Class 7 Reasoning Test - September)');
      return;
    }

    // Validate that each target has at least one school selected
    for (let i = 0; i < targets.length; i++) {
      const resolvedIds = resolveTargetSchoolIds(targets[i].selectedSchoolIds);
      if (resolvedIds.length === 0) {
        showErrorFeedback(`Group ${i + 1}: Please select at least one school.`);
        return;
      }
    }

    // Client-side exact duplicate target check
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        const t1 = targets[i];
        const t2 = targets[j];
        const s1 = [...resolveTargetSchoolIds(t1.selectedSchoolIds)].sort().join(',');
        const s2 = [...resolveTargetSchoolIds(t2.selectedSchoolIds)].sort().join(',');
        const c1 = [...t1.selectedClasses].map((c) => c.toLowerCase()).sort().join(',');
        const c2 = [...t2.selectedClasses].map((c) => c.toLowerCase()).sort().join(',');
        const sec1 = [...t1.selectedSections].sort().join(',');
        const sec2 = [...t2.selectedSections].sort().join(',');
        const stu1 = [...(t1.selectedStudentIds || [])].sort().join(',');
        const stu2 = [...(t2.selectedStudentIds || [])].sort().join(',');

        if (s1 === s2 && c1 === c2 && sec1 === sec2 && stu1 === stu2) {
          showErrorFeedback(
            `Duplicate Group: Group ${i + 1} and Group ${j + 1} have the same school, class, section, and student selections. Please remove or change one of them.`
          );
          return;
        }
      }
    }

    if (publishMode === 'Selected Questions' && selectedQuestionsForPublish.length === 0) {
      showErrorFeedback('Please select at least 1 question from the Question Bank.');
      return;
    }

    if (publishMode === 'Random Questions') {
      if (randomEligiblePoolCount === 0) {
        showErrorFeedback('No matching questions available. Please select at least one Group and Difficulty.');
        return;
      }
      if (randomCount === '' || randomCount == null || isNaN(Number(randomCount)) || Number(randomCount) <= 0) {
        showErrorFeedback('Please enter the number of questions per student.');
        return;
      }
      if (randomValidationWarning) {
        showErrorFeedback(randomValidationWarning);
        return;
      }
    }

    if (startDate && endDate && startDate !== 'Today' && endDate !== 'Open') {
      const startISO = `${toISODate(startDate)}T${to24Hour(startTime || '00:00')}`;
      const endISO = `${toISODate(endDate)}T${to24Hour(endTime || '23:59')}`;
      if (endISO <= startISO) {
        showErrorFeedback('End Date & Time must be after Start Date & Time.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const normalizedTargetsForApi = targets.map((t) => {
        const isAllCls =
          t.selectedClasses.length === 0 ||
          t.selectedClasses.includes('ALL') ||
          t.selectedClasses.includes('All Classes');

        const isAllSec =
          t.selectedSections.length === 0 ||
          t.selectedSections.includes('ALL') ||
          t.selectedSections.includes('All Sections');

        const isAllStu =
          !t.selectedStudentIds ||
          t.selectedStudentIds.length === 0 ||
          t.selectedStudentIds.includes('ALL') ||
          t.selectedStudentIds.includes('All Students');

        return {
          schoolIds: resolveTargetSchoolIds(t.selectedSchoolIds),
          classes: isAllCls ? [] : t.selectedClasses,
          className: isAllCls ? '' : t.selectedClasses.join(', '),
          sections: isAllSec ? [] : t.selectedSections,
          studentIds: isAllStu ? [] : t.selectedStudentIds,
        };
      });

      // 1. Validate targets with backend against actual student records in MongoDB Atlas
      const valRes = await fetch('/api/publish/validate-targets', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          targets: normalizedTargetsForApi,
        }),
      });

      const valData = await valRes.json();
      if (!valRes.ok || !valData.valid) {
        showErrorFeedback(valData.error || 'Unable to verify student groups. Please try again.');
        setIsSubmitting(false);
        return;
      }

      // 2. Publish assessment with validated target configurations
      const allSelectedSchoolIds = Array.from(
        new Set(targets.flatMap((t) => resolveTargetSchoolIds(t.selectedSchoolIds)))
      );
      const allSelectedClasses = Array.from(
        new Set(
          targets.flatMap((t) => {
            const isAll =
              t.selectedClasses.length === 0 ||
              t.selectedClasses.includes('ALL') ||
              t.selectedClasses.includes('All Classes');
            return isAll ? ['All Classes'] : t.selectedClasses;
          })
        )
      );
      const allSelectedSections = Array.from(new Set(targets.flatMap((t) => t.selectedSections)));
      const allSelectedStudentIds = Array.from(
        new Set(
          targets.flatMap((t) => {
            const isAllStu =
              !t.selectedStudentIds ||
              t.selectedStudentIds.length === 0 ||
              t.selectedStudentIds.includes('ALL') ||
              t.selectedStudentIds.includes('All Students');
            return isAllStu ? [] : t.selectedStudentIds;
          })
        )
      );

      const url = isEditMode ? `/api/publish/${currentEditId}` : '/api/publish';
      const method = isEditMode ? 'PUT' : 'POST';
      const publishPayload = {
        publishName: publishName.trim(),
        publishMode,
        targets: normalizedTargetsForApi,
        // Aggregated target for backward compatibility
        target: {
          schoolId: allSelectedSchoolIds[0] || '',
          schoolIds: allSelectedSchoolIds,
          classes: allSelectedClasses,
          sections: allSelectedSections,
          studentIds: allSelectedStudentIds,
        },
        startDate,
        startTime: to12Hour(startTime),
        endDate,
        endTime: to12Hour(endTime),
        selectedQuestionIds:
          publishMode === 'Random Questions'
            ? randomEligibleQuestions.map((q) => q.id)
            : selectedQuestionsForPublish,
        randomCount: Number(randomCount),
        shuffle: shuffleQuestions,
      };
      const requestFingerprint = JSON.stringify(publishPayload);
      if (!isEditMode && publishRequestRef.current?.fingerprint !== requestFingerprint) {
        publishRequestRef.current = { fingerprint: requestFingerprint, key: crypto.randomUUID() };
      }

      const res = await fetch(url, {
        method,
        headers: !isEditMode
          ? { ...headers, 'Idempotency-Key': publishRequestRef.current!.key }
          : headers,
        body: JSON.stringify(publishPayload),
      });

      const data = await res.json();
      if (res.ok) {
        if (isEditMode) {
          showSuccessFeedback(`Successfully updated assessment '${publishName}'!`);
          if (onResetFormState) {
            onResetFormState();
          }
          await onPublishSuccess();
          if (onCancelEdit) {
            onCancelEdit();
          }
        } else {
          publishRequestRef.current = null;
          showSuccessFeedback(`Successfully published to ${data.assignedStudentCount ?? data.totalAssignedStudents} students!`);
          setPublishName('');
          setSelectedQuestionsForPublish([]);
          setStartDate(getLocalTodayDate());
          setStartTime(getLocalCurrentTime12H());
          setEndDate(getLocalFutureDate(7));
          setEndTime('11:59 PM');
          setTargets([
            {
              id: `target-${Date.now()}`,
              selectedSchoolIds: ['ALL'],
              selectedClasses: ['ALL'],
              availableClasses: [],
              isLoadingClasses: false,
              selectedSections: [],
              availableSections: [],
              isLoadingSections: false,
              selectedStudentIds: [],
              availableStudents: [],
              isLoadingStudents: false,
            },
          ]);
          if (onResetFormState) {
            onResetFormState();
          }
          await onPublishSuccess();
        }
      } else {
        showErrorFeedback(data.error || (isEditMode ? 'Failed to update assessment' : 'Failed to publish test'));
      }
    } catch (err: any) {
      showErrorFeedback(err.message || (isEditMode ? 'Network error updating assessment' : 'Network error publishing test'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header with Save Template & Saved Templates Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase text-indigo-600 dark:text-indigo-400 font-semibold tracking-wider">
              {isEditMode ? 'Edit Assessment' : 'Create & Publish Assessment'}
            </span>
            {isEditMode && (
              <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-bold uppercase tracking-wide">
                Edit Mode
              </span>
            )}
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            {isEditMode ? 'Edit Test' : 'Publish Test'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {isEditMode
              ? `Editing test '${publishName}'. Update who can take the test, questions, or dates, then click "Update Test" to save changes.`
              : `Choose between Selected Questions or Random Questions, choose who can take this test, and set test dates and times.`}
          </p>
        </div>

        {/* Top-Right Area Controls: Saved Templates & Save Template */}
        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          {/* Saved Templates Button */}
          <button
            type="button"
            onClick={() => {
              fetchSavedTemplates();
              setShowSavedTemplatesModal(true);
            }}
            className="px-3.5 py-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
            title="Saved Tests"
          >
            <Bookmark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Saved Tests</span>
            {savedTemplates.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-mono font-bold border border-indigo-200 dark:border-indigo-800">
                {savedTemplates.length}
              </span>
            )}
          </button>

          {/* Save Template round/icon button */}
          <button
            type="button"
            onClick={handleOpenSaveTemplateModal}
            className="w-8.5 h-8.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors cursor-pointer group relative flex items-center justify-center"
            title="Save Test"
            aria-label="Save Test"
          >
            <BookmarkPlus className="w-4 h-4" />
            <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg border border-slate-700 transition-opacity group-hover:opacity-100 z-30">
              Save Test
            </span>
          </button>
        </div>
      </div>

      {publishFeedback && (
        <div
          className={`p-4 rounded-xl text-sm font-medium flex items-start justify-between gap-3 ${
            publishFeedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {publishFeedback.type === 'success' ? (
              <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            )}
            <span className="whitespace-pre-line leading-relaxed">{publishFeedback.message}</span>
          </div>
          <button onClick={() => setPublishFeedback(null)} className="text-xs font-semibold underline opacity-80 hover:opacity-100 shrink-0 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={handlePublish} className="space-y-6">
        {/* Publish Name */}
        <div className="p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-2xs">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Test Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="e.g. Class 7 Reasoning & Thinking Test - September"
            value={publishName}
            onChange={(e) => setPublishName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm font-medium transition-colors"
          />
        </div>

        {/* Mode Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setPublishMode('Selected Questions')}
            className={`p-5 rounded-xl border text-left transition-colors cursor-pointer shadow-2xs ${
              publishMode === 'Selected Questions'
                ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500 dark:border-indigo-500 ring-2 ring-indigo-500/20'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`font-bold text-base ${
                publishMode === 'Selected Questions'
                  ? 'text-indigo-900 dark:text-indigo-300'
                  : 'text-slate-900 dark:text-white'
              }`}>
                Selected Questions
              </span>
              <Layers className={`w-5 h-5 ${
                publishMode === 'Selected Questions'
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-400'
              }`} />
            </div>
            <p className={`text-xs leading-relaxed ${
              publishMode === 'Selected Questions'
                ? 'text-indigo-950/80 dark:text-slate-300'
                : 'text-slate-500 dark:text-slate-400'
            }`}>
              Choose specific questions from the Question Bank. You can shuffle question order and preview questions.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setPublishMode('Random Questions')}
            className={`p-5 rounded-xl border text-left transition-colors cursor-pointer shadow-2xs ${
              publishMode === 'Random Questions'
                ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500 dark:border-indigo-500 ring-2 ring-indigo-500/20'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`font-bold text-base ${
                publishMode === 'Random Questions'
                  ? 'text-indigo-900 dark:text-indigo-300'
                  : 'text-slate-900 dark:text-white'
              }`}>
                Random Questions
              </span>
              <Shuffle className={`w-5 h-5 ${
                publishMode === 'Random Questions'
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-400'
              }`} />
            </div>
            <p className={`text-xs leading-relaxed ${
              publishMode === 'Random Questions'
                ? 'text-indigo-950/80 dark:text-slate-300'
                : 'text-slate-500 dark:text-slate-400'
            }`}>
              Automatically picks questions based on each student's past performance and prevents repeat questions.
            </p>
          </button>
        </div>

        {/* Target Configuration: Multiple Targets with Multi-Select Dropdowns */}
        <div className="p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Target Students & Schools
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Choose schools, classes, sections, or individual students who can take this test.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClearAllTargets}
              className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-700 hover:border-rose-200 text-slate-600 dark:text-slate-400 hover:text-rose-600 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear All
            </button>
          </div>

          {/* List of independent targets */}
          {targets.length === 0 ? (
            <div className="p-8 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center bg-slate-50/50 dark:bg-slate-950/40 space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No groups added yet. Click <strong>+ Add Target Group</strong> below to choose who can take this test.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {targets.map((target, idx) => (
                <TargetCard
                  key={target.id}
                  target={target}
                  index={idx}
                  totalTargets={targets.length}
                  schools={schools}
                  token={token}
                  onUpdate={(updates) => handleUpdateTarget(idx, updates)}
                  onRemove={() => handleRemoveTarget(target.id)}
                />
              ))}
            </div>
          )}

          {/* Secondary Add Target action */}
          <div className="pt-2 flex justify-start">
            <button
              type="button"
              onClick={handleAddTarget}
              className="px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              + Add Target Group
            </button>
          </div>
        </div>

        {/* Availability Window */}
        <div className="p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-2xs">
          <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Test Dates & Times
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">Start Time (12-Hour AM/PM)</label>
              <Time12HourPicker
                id="publish-start-time"
                value={startTime}
                onChange={setStartTime}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">End Time (12-Hour AM/PM)</label>
              <Time12HourPicker
                id="publish-end-time"
                value={endTime}
                onChange={setEndTime}
              />
            </div>
          </div>

          {/* Formatted live availability preview */}
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 text-xs font-mono text-slate-700 dark:text-slate-300">
            <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>
              Available Window: <strong className="text-slate-900 dark:text-white font-semibold">{formatAvailabilityWindow(startDate, startTime, endDate, endTime)}</strong>
            </span>
          </div>
        </div>

        {/* Selected Questions vs Random Questions Configuration */}
        {publishMode === 'Selected Questions' ? (
          <div className="p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-2xs">
            {/* Header: Title, Selected Count, Shuffle Toggle & Preview Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Choose Questions</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Selected: <strong className="text-indigo-600 dark:text-indigo-400 font-semibold">{selectedQuestionsForPublish.length}</strong> questions
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={shuffleQuestions}
                    onChange={(e) => setShuffleQuestions(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 cursor-pointer"
                  />
                  <span>Shuffle Questions</span>
                </label>

                <button
                  type="button"
                  disabled={selectedQuestionsForPublish.length === 0}
                  onClick={() => setShowPreviewModal(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 flex items-center gap-1.5 text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
                >
                  <Play className="w-3.5 h-3.5" />
                  Preview Test ({selectedQuestionsForPublish.length})
                </button>
              </div>
            </div>

            {/* Search Bar + Expand / Collapse Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search questions..."
                  value={questionPickerSearch}
                  onChange={(e) => setQuestionPickerSearch(e.target.value)}
                  className="w-full pl-10 pr-8 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
                />
                {questionPickerSearch && (
                  <button
                    type="button"
                    onClick={() => setQuestionPickerSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs cursor-pointer"
                  >
                    &times;
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs shrink-0">
                <button
                  type="button"
                  onClick={handleExpandAll}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors text-[11px] font-medium cursor-pointer shadow-2xs"
                >
                  Expand All
                </button>
                <button
                  type="button"
                  onClick={handleCollapseAll}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors text-[11px] font-medium cursor-pointer shadow-2xs"
                >
                  Collapse All
                </button>
              </div>
            </div>

            {/* Select All Groups Header Bar */}
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-900 dark:text-white select-none">
                <TriStateCheckbox
                  checked={isAllGroupsChecked}
                  indeterminate={isAllGroupsIndeterminate}
                  onChange={handleToggleAllGroups}
                  title="Select / Deselect All Groups"
                />
                <span>Select All Groups</span>
                {allVisibleQuestionIds.length > 0 && (
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-normal">
                    ({allVisibleQuestionIds.length} Questions Available)
                  </span>
                )}
              </label>
              <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                {selectedQuestionsForPublish.length} Selected
              </span>
            </div>

            {/* Hierarchical Group -> Difficulty -> Questions Tree */}
            <div className="space-y-3">
              {filteredGroupsHierarchy.length > 0 ? (
                filteredGroupsHierarchy.map((group) => {
                  const isGroupExpanded = expandedGroups.has(group.groupName);
                  const groupQIds = group.allGroupQuestions.map((q) => q.id);
                  const selectedInGroupCount = groupQIds.filter((id) =>
                    selectedQuestionsSet.has(id)
                  ).length;
                  const isGroupChecked =
                    groupQIds.length > 0 && selectedInGroupCount === groupQIds.length;
                  const isGroupIndeterminate =
                    selectedInGroupCount > 0 && selectedInGroupCount < groupQIds.length;

                  return (
                    <div
                      key={group.groupName}
                      className="rounded-lg bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-2xs"
                    >
                      {/* Group Header */}
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700/50 transition-colors">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          {/* Expand/Collapse Toggle */}
                          <button
                            type="button"
                            onClick={() => toggleGroupExpand(group.groupName)}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                            title={isGroupExpanded ? 'Collapse Group' : 'Expand Group'}
                          >
                            {isGroupExpanded ? (
                              <ChevronDown className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            )}
                          </button>

                          {/* Group Checkbox */}
                          <TriStateCheckbox
                            checked={isGroupChecked}
                            indeterminate={isGroupIndeterminate}
                            onChange={() => handleToggleGroup(group.allGroupQuestions)}
                            title={`Select All in ${group.groupName}`}
                          />

                          {/* Group Name & Count */}
                          <span
                            onClick={() => toggleGroupExpand(group.groupName)}
                            className="font-bold text-sm text-slate-900 dark:text-white cursor-pointer truncate hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
                          >
                            {group.groupName}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {selectedInGroupCount} / {groupQIds.length} Selected
                          </span>
                        </div>
                      </div>

                      {/* Group Difficulties Container */}
                      {isGroupExpanded && (
                        <div className="p-3 space-y-2.5 bg-slate-50/50 dark:bg-slate-900/40">
                          {group.difficulties.map((diff) => {
                            const diffKey = `${group.groupName}::${diff.difficulty}`;
                            const isDiffExpanded = expandedDifficulties.has(diffKey);
                            const diffQIds = diff.questions.map((q) => q.id);
                            const selectedInDiffCount = diffQIds.filter((id) =>
                              selectedQuestionsSet.has(id)
                            ).length;
                            const isDiffChecked =
                              diffQIds.length > 0 && selectedInDiffCount === diffQIds.length;
                            const isDiffIndeterminate =
                              selectedInDiffCount > 0 && selectedInDiffCount < diffQIds.length;

                            const diffBadgeClass =
                              diff.difficulty === 'Easy'
                                ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                : diff.difficulty === 'Hard'
                                ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                : 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';

                            return (
                              <div
                                key={diffKey}
                                className="rounded-lg bg-white dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/40 overflow-hidden ml-2 sm:ml-4 shadow-2xs"
                              >
                                {/* Difficulty Header */}
                                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800/70 flex items-center justify-between gap-2.5 transition-colors">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => toggleDifficultyExpand(diffKey)}
                                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                                      title={isDiffExpanded ? 'Collapse Difficulty' : 'Expand Difficulty'}
                                    >
                                      {isDiffExpanded ? (
                                        <ChevronDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                      )}
                                    </button>

                                    <TriStateCheckbox
                                      checked={isDiffChecked}
                                      indeterminate={isDiffIndeterminate}
                                      onChange={() => handleToggleDifficulty(diff.questions)}
                                      title={`Select All ${diff.difficulty} in ${group.groupName}`}
                                    />

                                    <span
                                      onClick={() => toggleDifficultyExpand(diffKey)}
                                      className={`text-xs font-semibold px-2 py-0.5 rounded border cursor-pointer font-mono ${diffBadgeClass}`}
                                    >
                                      {diff.difficulty}
                                    </span>
                                  </div>

                                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                                    {selectedInDiffCount} / {diffQIds.length} Selected
                                  </span>
                                </div>

                                {/* Individual Questions List (Selected Questions Mode Only) */}
                                {isDiffExpanded && (
                                  <div className="p-2.5 space-y-1.5 bg-slate-50/50 dark:bg-slate-950/30 ml-3 border-t border-slate-200 dark:border-slate-700/30">
                                    {diff.questions.map((q) => {
                                      const isQuestionSelected = selectedQuestionsSet.has(q.id);

                                      return (
                                        <div
                                          key={q.id}
                                          onClick={() => handleToggleQuestion(q.id)}
                                          className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                                            isQuestionSelected
                                              ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-500/80 text-slate-900 dark:text-white ring-1 ring-indigo-500/30'
                                              : 'bg-white dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                          }`}
                                        >
                                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                            <input
                                              type="checkbox"
                                              checked={isQuestionSelected}
                                              onChange={() => handleToggleQuestion(q.id)}
                                              onClick={(e) => e.stopPropagation()}
                                              className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 cursor-pointer"
                                            />
                                            <span className="font-medium truncate">{q.content}</span>
                                          </div>

                                          <div className="flex items-center gap-2 shrink-0 font-mono text-[10px]">
                                            {q.timeSeconds != null && q.timeSeconds > 0 && (
                                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                                                {q.timeSeconds}s
                                              </span>
                                            )}
                                            {q.points != null && q.points > 0 && (
                                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold">
                                                {q.points} pts
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-center py-8">
                  <HelpCircle className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-300">
                    {questionPickerSearch ? 'No matching questions found' : 'No questions available'}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    {questionPickerSearch
                      ? `No questions found matching "${questionPickerSearch}". Try a different keyword.`
                      : 'No questions added to the Question Bank yet.'}
                  </p>
                </div>
              )}
            </div>

            {/* Question Selection Configuration Summary */}
            {selectedSummaryData.length > 0 && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/60 pb-2">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                    Question Selection Configuration
                  </h4>
                  <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                    Total Selected Questions: <strong className="text-slate-900 dark:text-white font-semibold">{selectedQuestionsForPublish.length}</strong>
                  </span>
                </div>
                <div className="space-y-2.5">
                  {selectedSummaryData.map((g) => (
                    <div
                      key={g.groupName}
                      className="text-xs space-y-1.5 pl-3 border-l-2 border-indigo-500"
                    >
                      <div className="font-bold text-slate-800 dark:text-slate-200">{g.groupName}</div>
                      <div className="flex flex-wrap gap-2 pl-1">
                        {g.difficulties.map((d) => (
                          <div
                            key={d.difficulty}
                            className="px-2.5 py-1 rounded bg-white dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600/70 text-slate-700 dark:text-slate-300 font-mono text-[11px] flex items-center gap-1.5 shadow-2xs"
                          >
                            <span className="font-semibold text-slate-900 dark:text-white">{d.difficulty}</span>
                            <span className="text-indigo-600 dark:text-indigo-300 font-medium">
                              &mdash; {d.count} {d.count === 1 ? 'Question' : 'Questions'} Selected
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Random Test Settings</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Choose question groups and difficulty levels. The system will automatically select suitable questions for each student.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <div className="text-xs font-mono text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 font-medium">
                  Available Questions: <strong className="text-slate-900 dark:text-white font-bold">{randomEligiblePoolCount}</strong>
                </div>
                <button
                  type="button"
                  disabled={previewQuestionsList.length === 0}
                  onClick={() => setShowPreviewModal(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 flex items-center gap-1.5 text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
                >
                  <Play className="w-3.5 h-3.5" />
                  Preview Test ({previewQuestionsList.length})
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="max-w-xs">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Questions per Student *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={50}
                  placeholder="e.g. 10"
                  value={randomCount === '' ? '' : randomCount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setRandomCount('');
                    } else {
                      const num = parseInt(val, 10);
                      setRandomCount(isNaN(num) ? '' : num);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
                />
              </div>

              {/* Immediate Validation Warning Banner */}
              {randomValidationWarning && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span className="font-medium">{randomValidationWarning}</span>
                </div>
              )}
            </div>

            {/* Hierarchical Group -> Difficulty Selection */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-900 dark:text-white select-none">
                  <TriStateCheckbox
                    checked={isRandomAllGroupsChecked}
                    indeterminate={isRandomAllGroupsIndeterminate}
                    onChange={handleToggleRandomAllGroups}
                    title="Select or deselect all groups and levels"
                  />
                  <span>Select All Groups</span>
                  {allQuestions.length > 0 && (
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-normal">
                      ({allQuestions.length} Total questions in bank)
                    </span>
                  )}
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleExpandAll}
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-medium cursor-pointer shadow-2xs"
                  >
                    Expand All
                  </button>
                  <button
                    type="button"
                    onClick={handleCollapseAll}
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-medium cursor-pointer shadow-2xs"
                  >
                    Collapse All
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {groupsHierarchy.length > 0 ? (
                  groupsHierarchy.map((group) => {
                    const isGroupExpanded = expandedGroups.has(group.groupName);
                    const groupDiffKeys = group.difficulties.map(
                      (d) => `${group.groupName}::${d.difficulty}`
                    );
                    const selectedDiffsCount = groupDiffKeys.filter((k) =>
                      randomSelectedDifficulties.has(k)
                    ).length;
                    const isGroupChecked =
                      groupDiffKeys.length > 0 && selectedDiffsCount === groupDiffKeys.length;
                    const isGroupIndeterminate =
                      selectedDiffsCount > 0 && selectedDiffsCount < groupDiffKeys.length;

                    const eligibleInGroupCount = group.difficulties.reduce((sum, d) => {
                      const k = `${group.groupName}::${d.difficulty}`;
                      return randomSelectedDifficulties.has(k) ? sum + d.questions.length : sum;
                    }, 0);
                    const totalInGroupCount = group.allGroupQuestions.length;

                    return (
                      <div
                        key={group.groupName}
                        className="rounded-lg bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-2xs"
                      >
                        {/* Group Header */}
                        <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-3 transition-colors">
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <button
                              type="button"
                              onClick={() => toggleGroupExpand(group.groupName)}
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                              title={isGroupExpanded ? 'Collapse Group' : 'Expand Group'}
                            >
                              {isGroupExpanded ? (
                                <ChevronDown className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-400" />
                              )}
                            </button>
                            <TriStateCheckbox
                              checked={isGroupChecked}
                              indeterminate={isGroupIndeterminate}
                              onChange={() => handleToggleRandomGroup(group)}
                              title={`Select all difficulties in ${group.groupName}`}
                            />
                            <span
                              onClick={() => toggleGroupExpand(group.groupName)}
                              className="font-bold text-sm text-slate-900 dark:text-white cursor-pointer truncate hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
                            >
                              {group.groupName}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {eligibleInGroupCount > 0 ? (
                              <span className="text-indigo-600 dark:text-indigo-300 font-semibold">
                                {eligibleInGroupCount} / {totalInGroupCount} questions selected
                              </span>
                            ) : (
                              <span>0 / {totalInGroupCount} questions</span>
                            )}
                          </span>
                        </div>

                        {/* Difficulties in Random mode */}
                        {isGroupExpanded && (
                          <div className="p-2.5 space-y-2 bg-slate-50/50 dark:bg-slate-900/40 pl-6 border-t border-slate-200 dark:border-slate-800">
                            {group.difficulties.map((diff) => {
                              const diffKey = `${group.groupName}::${diff.difficulty}`;
                              const isDiffChecked = randomSelectedDifficulties.has(diffKey);

                              const diffBadgeClass =
                                diff.difficulty === 'Easy'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                  : diff.difficulty === 'Hard'
                                  ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                  : 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';

                              return (
                                <div
                                  key={diffKey}
                                  className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${
                                    isDiffChecked
                                      ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-500/50 ring-1 ring-indigo-500/20'
                                      : 'bg-white dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/40'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <TriStateCheckbox
                                      checked={isDiffChecked}
                                      indeterminate={false}
                                      onChange={() => handleToggleRandomDifficulty(diffKey)}
                                      title={`Select ${diff.difficulty} in ${group.groupName}`}
                                    />
                                    <span
                                      onClick={() => handleToggleRandomDifficulty(diffKey)}
                                      className={`text-xs font-semibold px-2 py-0.5 rounded border cursor-pointer font-mono ${diffBadgeClass}`}
                                    >
                                      {diff.difficulty}
                                    </span>
                                  </div>
                                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                    {diff.questions.length} questions available
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-500">No question groups available.</p>
                )}
              </div>
            </div>

            {/* Random Question Configuration Summary */}
            {randomSummaryData.length > 0 && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/60 pb-2">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                    Random Test Summary
                  </h4>
                  <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                    Total Questions Available: <strong className="text-slate-900 dark:text-white font-semibold">{randomEligiblePoolCount}</strong>
                  </span>
                </div>
                <div className="space-y-2.5">
                  {randomSummaryData.map((g) => (
                    <div
                      key={g.groupName}
                      className="text-xs space-y-1.5 pl-3 border-l-2 border-indigo-500"
                    >
                      <div className="font-bold text-slate-800 dark:text-slate-200">{g.groupName}</div>
                      <div className="flex flex-wrap gap-2 pl-1">
                        {g.difficulties.map((d) => (
                          <div
                            key={d.difficulty}
                            className="px-2.5 py-1 rounded bg-white dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600/70 text-slate-700 dark:text-slate-300 font-mono text-[11px] flex items-center gap-1.5 shadow-2xs"
                          >
                            <span className="font-semibold text-slate-900 dark:text-white">{d.difficulty}</span>
                            <span className="text-indigo-600 dark:text-indigo-300 font-medium">({d.count} questions available)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700/60 text-xs">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">Questions Per Student:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-300 font-mono text-sm">
                    {randomCount !== '' ? randomCount : '—'}
                  </span>
                </div>
              </div>
            )}

            <div className="p-3.5 rounded-lg bg-indigo-50/70 dark:bg-slate-850 border border-indigo-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-1">
              <p className="font-semibold text-indigo-700 dark:text-indigo-300">How Random Questions Work:</p>
              <p>&bull; New student &rarr; Starts with Easy questions</p>
              <p>&bull; Score of 70% or more on Easy &rarr; Moves to Medium questions</p>
              <p>&bull; Score of 70% or more on Medium &rarr; Moves to Hard questions</p>
              <p>&bull; Hard is the highest difficulty level</p>
              <p>&bull; Questions used recently will not repeat for the same student</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          {isEditMode && onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="py-3 px-6 rounded-lg font-semibold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors text-sm cursor-pointer border border-slate-200 dark:border-slate-700 shadow-2xs"
            >
              Cancel Edit
            </button>
          )}

          <button
            type="submit"
            disabled={isSubmitting || schools.length === 0}
            className="flex-1 py-3 rounded-lg font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            {isSubmitting
              ? isEditMode
                ? 'Updating Test...'
                : 'Publishing Test...'
              : isEditMode
              ? 'Update Test'
              : 'Publish Test'}
          </button>
        </div>
      </form>

      {/* Student-Style Interactive Preview Modal */}
      {showPreviewModal && (
        <StudentAssessmentPreviewModal
          title={publishName.trim() || 'New Assessment Preview'}
          subtitle={`${publishMode}${
            publishMode === 'Selected Questions' && shuffleQuestions
              ? ' · Shuffled'
              : ''
          }`}
          questions={previewQuestionsList}
          onClose={() => setShowPreviewModal(false)}
        />
      )}
      {/* Save Template Modal */}
      {showSaveTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                  <BookmarkPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Save Test</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Save your current questions and student settings for later use
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSaveTemplateModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Saved Test Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="e.g. Class 7 Reasoning Set"
                  value={templateNameInput}
                  onChange={(e) => {
                    setTemplateNameInput(e.target.value);
                    if (saveTemplateError) setSaveTemplateError(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
                />
              </div>

              {/* Template Configuration Preview */}
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>Test Type:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{publishMode}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>{publishMode === 'Selected Questions' ? 'Selected Questions:' : 'Random Count:'}</span>
                  <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                    {publishMode === 'Selected Questions'
                      ? `${selectedQuestionsForPublish.length} questions`
                      : `${randomCount !== '' ? randomCount : 'Not set'} questions / student`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>Groups:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{targets.length} group(s)</span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>Shuffle Questions:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{shuffleQuestions ? 'Enabled' : 'Disabled'}</span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 text-[11px] text-slate-500 italic">
                  Note: Test name, dates, and times are not saved in this template.
                </div>
              </div>

              {saveTemplateError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <span>{saveTemplateError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSaveTemplateModal(false)}
                  className="px-4 py-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer border border-slate-200 dark:border-slate-700 shadow-2xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingTemplate || !templateNameInput.trim()}
                  className="px-4.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  {isSavingTemplate ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Test</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Saved Templates List / Management Modal */}
      {showSavedTemplatesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-2xl max-h-[85vh] flex flex-col space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                  <Bookmark className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Saved Tests</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Choose a saved test to load questions and groups into the form
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSavedTemplatesModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search filter for templates */}
            {savedTemplates.length > 0 && (
              <div className="relative shrink-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search saved tests..."
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
                />
              </div>
            )}

            {/* Templates List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {isLoadingTemplates ? (
                <div className="py-12 text-center text-slate-500 space-y-2">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs">Loading saved tests...</p>
                </div>
              ) : templateFetchError ? (
                <div className="py-10 text-center space-y-3 p-4 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl">
                  <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                  <p className="text-xs text-rose-700 dark:text-rose-400 font-medium">{templateFetchError}</p>
                  <button
                    type="button"
                    onClick={() => fetchSavedTemplates()}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              ) : savedTemplates.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-3">
                  <Bookmark className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-300">No Saved Tests</p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                      Choose questions and students, then click Save Test to save them for later.
                    </p>
                  </div>
                </div>
              ) : (() => {
                const filtered = savedTemplates.filter((t) =>
                  (t.name || '').toLowerCase().includes(templateSearch.toLowerCase())
                );
                if (filtered.length === 0) {
                  return (
                    <div className="py-8 text-center text-xs text-slate-500">
                      No saved tests match "{templateSearch}"
                    </div>
                  );
                }
                return filtered.map((tpl) => {
                  const tplId = tpl.id || tpl._id;
                  const targetCount = Array.isArray(tpl.targets) ? tpl.targets.length : 0;
                  const qCount = Array.isArray(tpl.selectedQuestionIds) ? tpl.selectedQuestionIds.length : 0;

                  return (
                    <div
                      key={tplId}
                      className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 transition-colors space-y-3 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <span>{tpl.name}</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              {tpl.publishMode}
                            </span>
                          </h4>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
                            <span>
                              {tpl.publishMode === 'Selected Questions'
                                ? `${qCount} Question(s)`
                                : `${tpl.randomCount || 5} Random Questions`}
                            </span>
                            <span>&bull;</span>
                            <span>{targetCount} Group(s)</span>
                            {tpl.shuffleQuestions && (
                              <>
                                <span>&bull;</span>
                                <span className="text-indigo-600 dark:text-indigo-400 font-medium">Shuffle Enabled</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setTemplateToDelete({ id: tplId, name: tpl.name })}
                            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-rose-200 transition-colors cursor-pointer shadow-2xs"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectTemplate(tpl)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                          >
                            <FolderDown className="w-3.5 h-3.5" />
                            <span>Load Test</span>
                          </button>
                        </div>
                      </div>

                      {/* Target configurations summary inside card */}
                      {Array.isArray(tpl.targets) && tpl.targets.length > 0 && (
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                          {tpl.targets.map((tgt: any, idx: number) => {
                            const sch = tgt.selectedSchoolIds?.includes('ALL')
                              ? 'All Schools'
                              : `${tgt.selectedSchoolIds?.length || 0} School(s)`;
                            const cls = tgt.selectedClasses?.includes('ALL')
                              ? 'All Classes'
                              : tgt.selectedClasses?.join(', ') || 'All Classes';
                            const sec = tgt.selectedSections?.length
                              ? `Sec: ${tgt.selectedSections.join(', ')}`
                              : 'All Sections';
                            const stu = tgt.selectedStudentIds?.length
                              ? `${tgt.selectedStudentIds.length} Student(s)`
                              : 'All Students';

                            return (
                              <div key={idx} className="flex items-center gap-2 truncate">
                                <span className="text-indigo-600 dark:text-indigo-400 font-mono font-bold shrink-0">T{idx + 1}:</span>
                                <span className="truncate">{sch} &bull; {cls} &bull; {sec} &bull; {stu}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowSavedTemplatesModal(false)}
                className="px-4 py-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer border border-slate-200 dark:border-slate-700 shadow-2xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Template Confirmation Modal */}
      {templateToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Saved Test?</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Are you sure you want to delete the saved test <strong className="text-slate-900 dark:text-white font-semibold">'{templateToDelete.name}'</strong>? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setTemplateToDelete(null)}
                disabled={isDeletingTemplate}
                className="px-4 py-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer border border-slate-200 dark:border-slate-700 disabled:opacity-50 shadow-2xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTemplate}
                disabled={isDeletingTemplate}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer shadow-2xs flex items-center gap-1.5 disabled:opacity-50 transition-colors"
              >
                {isDeletingTemplate ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Delete Test</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Overwrite Alert Modal */}
      {showOverwriteAlert && pendingTemplateToLoad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Replace Current Choices?</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  You already have choices selected. Loading this test will replace your current questions and student groups. Do you want to continue?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div className="text-slate-500 dark:text-slate-400">Test to load:</div>
              <div className="font-semibold text-slate-900 dark:text-white">{pendingTemplateToLoad.name}</div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowOverwriteAlert(false);
                  setPendingTemplateToLoad(null);
                }}
                className="px-4 py-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer border border-slate-200 dark:border-slate-700 shadow-2xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => applyTemplate(pendingTemplateToLoad)}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
              >
                Load Test
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
