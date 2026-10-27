import { useState, useEffect, useRef, useMemo } from 'react';
import {
  History,
  ChevronDown,
  CheckCircle,
  XCircle,
  Calendar,
  Building2,
  Users,
  Search,
  Filter,
  Layers,
  Hash,
  Check,
  X,
  Target,
  Edit,
  Pause,
  Play,
  Trash2,
  AlertTriangle,
  Eye,
  HelpCircle,
} from 'lucide-react';
import { formatAvailabilityWindow } from '../utils/dateTime.ts';
import { getAuthHeaders } from '../utils/csrf.ts';
import { StudentAssessmentPreviewModal } from './StudentAssessmentPreviewModal.tsx';

interface PublishHistorySectionProps {
  token: string;
  schools?: any[];
  historyList: any[];
  selectedHistoryDetail: any | null;
  onSelectHistory: (publishId: string) => Promise<void>;
  onEditAssessment?: (publishId: string) => void;
  onRefreshHistory?: () => Promise<void>;
}

// -------------------------------------------------------------
// Date / Time Formatting Helpers
// -------------------------------------------------------------
// Format actual published timestamp into "DD-MM-YYYY hh:mm A" (e.g. "28-09-2026 10:30 AM")
function formatPublishDateTime(dateVal?: string | Date | null): string {
  if (!dateVal) return 'N/A';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursStr = String(hours).padStart(2, '0');
  return `${day}-${month}-${year} ${hoursStr}:${minutes} ${ampm}`;
}

// -------------------------------------------------------------
// School Multi-Select Filter Component for Drill-Down
// -------------------------------------------------------------
function DrillDownSchoolMultiSelect({
  availableSchools,
  selectedSchoolNames,
  onChange,
}: {
  availableSchools: Array<{ id: string; name: string }>;
  selectedSchoolNames: string[];
  onChange: (schoolNames: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAllSchoolsSelected =
    selectedSchoolNames.includes('ALL') ||
    selectedSchoolNames.includes('All Schools') ||
    (availableSchools.length > 0 && selectedSchoolNames.length === availableSchools.length);

  const toggleSchool = (schoolName: string) => {
    if (isAllSchoolsSelected) {
      onChange([schoolName]);
    } else if (selectedSchoolNames.includes(schoolName)) {
      const next = selectedSchoolNames.filter((name) => name !== schoolName);
      onChange(next.length === 0 ? ['ALL'] : next);
    } else {
      const next = [...selectedSchoolNames, schoolName];
      if (availableSchools.length > 0 && next.length === availableSchools.length) {
        onChange(['ALL']);
      } else {
        onChange(next);
      }
    }
  };

  const toggleAllSchools = () => {
    onChange(['ALL']);
  };

  const handleSelectAll = () => {
    onChange(['ALL']);
  };

  const handleClear = () => {
    onChange([]);
  };

  const filteredSchools = availableSchools.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 rounded-lg border text-left flex items-center justify-between transition-colors outline-none text-xs cursor-pointer shadow-2xs ${
          isOpen
            ? 'bg-white dark:bg-slate-800 border-indigo-500 ring-2 ring-indigo-500/20'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
        }`}
      >
        <div className="flex items-center gap-2 truncate pr-2">
          <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          {availableSchools.length === 0 ? (
            <span className="text-slate-400 dark:text-slate-500">No schools found</span>
          ) : isAllSchoolsSelected ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-slate-900 dark:text-white font-semibold">All Schools</span>
              <span className="text-[11px] text-indigo-600 dark:text-indigo-300 font-mono">
                ({availableSchools.length})
              </span>
            </div>
          ) : selectedSchoolNames.length === 0 ? (
            <span className="text-amber-600 dark:text-amber-400 font-medium">None Selected</span>
          ) : selectedSchoolNames.length === 1 ? (
            <span className="text-slate-900 dark:text-white font-medium truncate">{selectedSchoolNames[0]}</span>
          ) : (
            <span className="text-slate-900 dark:text-white font-medium">
              {selectedSchoolNames.length} Schools Selected
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isAllSchoolsSelected && availableSchools.length > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold">
              All
            </span>
          ) : selectedSchoolNames.length > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold">
              {selectedSchoolNames.length}
            </span>
          ) : null}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
              isOpen ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 p-2.5 space-y-2 animate-in fade-in-50 zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              Filter School ({isAllSchoolsSelected ? `All (${availableSchools.length})` : `${selectedSchoolNames.length}/${availableSchools.length}`})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-300 dark:text-slate-600">&bull;</span>
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:underline font-medium cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {availableSchools.length > 3 && (
            <input
              type="text"
              placeholder="Search school name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900"
            />
          )}

          <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
            {(!search || 'all schools'.includes(search.toLowerCase())) && availableSchools.length > 0 && (
              <div
                onClick={toggleAllSchools}
                className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                  isAllSchoolsSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-500/80 text-indigo-950 dark:text-white font-medium'
                    : 'bg-transparent border border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
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
                  {availableSchools.length} Schools
                </span>
              </div>
            )}

            {filteredSchools.map((s) => {
              const isSelected = !isAllSchoolsSelected && selectedSchoolNames.includes(s.name);
              return (
                <div
                  key={s.id || s.name}
                  onClick={() => toggleSchool(s.name)}
                  className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-500/80 text-indigo-950 dark:text-white font-medium'
                      : 'bg-transparent border border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 pointer-events-none"
                    />
                    <span className="truncate font-medium">{s.name}</span>
                  </div>
                </div>
              );
            })}
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
// Class Multi-Select Filter Component for Drill-Down
// -------------------------------------------------------------
function DrillDownClassMultiSelect({
  availableClasses,
  selectedClasses,
  onChange,
}: {
  availableClasses: string[];
  selectedClasses: string[];
  onChange: (classes: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAllClassesSelected =
    selectedClasses.includes('ALL') ||
    selectedClasses.includes('All Classes') ||
    (availableClasses.length > 0 && selectedClasses.length === availableClasses.length);

  const toggleClass = (cls: string) => {
    if (isAllClassesSelected) {
      onChange([cls]);
    } else if (selectedClasses.includes(cls)) {
      const next = selectedClasses.filter((c) => c !== cls);
      onChange(next.length === 0 ? ['ALL'] : next);
    } else {
      const next = [...selectedClasses, cls];
      if (availableClasses.length > 0 && next.length === availableClasses.length) {
        onChange(['ALL']);
      } else {
        onChange(next);
      }
    }
  };

  const toggleAllClasses = () => {
    onChange(['ALL']);
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
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 rounded-lg border text-left flex items-center justify-between transition-colors outline-none text-xs cursor-pointer shadow-2xs ${
          isOpen
            ? 'bg-white dark:bg-slate-800 border-indigo-500 ring-2 ring-indigo-500/20'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
        }`}
      >
        <div className="flex items-center gap-2 truncate pr-2">
          <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          {availableClasses.length === 0 ? (
            <span className="text-slate-400 dark:text-slate-500">No classes found</span>
          ) : isAllClassesSelected ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-slate-900 dark:text-white font-semibold">All Classes</span>
              <span className="text-[11px] text-indigo-600 dark:text-indigo-300 font-mono">
                ({availableClasses.length})
              </span>
            </div>
          ) : selectedClasses.length === 0 ? (
            <span className="text-amber-600 dark:text-amber-400 font-medium">None Selected</span>
          ) : selectedClasses.length === 1 ? (
            <span className="text-slate-900 dark:text-white font-medium">{selectedClasses[0]}</span>
          ) : (
            <span className="text-slate-900 dark:text-white font-medium">
              {selectedClasses.length} Classes Selected
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isAllClassesSelected && availableClasses.length > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold">
              All
            </span>
          ) : selectedClasses.length > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold">
              {selectedClasses.length}
            </span>
          ) : null}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
              isOpen ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 p-2.5 space-y-2 animate-in fade-in-50 zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              Filter Class ({isAllClassesSelected ? `All (${availableClasses.length})` : `${selectedClasses.length}/${availableClasses.length}`})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-300 dark:text-slate-600">&bull;</span>
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:underline font-medium cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
            {availableClasses.length > 0 && (
              <div
                onClick={toggleAllClasses}
                className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                  isAllClassesSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-500/80 text-indigo-950 dark:text-white font-medium'
                    : 'bg-transparent border border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
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
                  {availableClasses.length} Classes
                </span>
              </div>
            )}

            {availableClasses.map((cls) => {
              const isSelected = !isAllClassesSelected && selectedClasses.includes(cls);
              return (
                <div
                  key={cls}
                  onClick={() => toggleClass(cls)}
                  className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-500/80 text-indigo-950 dark:text-white font-medium'
                      : 'bg-transparent border border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 pointer-events-none"
                    />
                    <span className="truncate font-medium">{cls}</span>
                  </div>
                </div>
              );
            })}
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
// Section Multi-Select Filter Component for Drill-Down
// -------------------------------------------------------------
function DrillDownSectionMultiSelect({
  availableSections,
  selectedSections,
  onChange,
}: {
  availableSections: string[];
  selectedSections: string[];
  onChange: (sections: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAllSectionsSelected =
    selectedSections.includes('ALL') ||
    selectedSections.includes('All Sections') ||
    (availableSections.length > 0 && selectedSections.length === availableSections.length);

  const toggleSection = (sec: string) => {
    if (isAllSectionsSelected) {
      onChange([sec]);
    } else if (selectedSections.includes(sec)) {
      const next = selectedSections.filter((s) => s !== sec);
      onChange(next.length === 0 ? ['ALL'] : next);
    } else {
      const next = [...selectedSections, sec];
      if (availableSections.length > 0 && next.length === availableSections.length) {
        onChange(['ALL']);
      } else {
        onChange(next);
      }
    }
  };

  const toggleAllSections = () => {
    onChange(['ALL']);
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
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 rounded-lg border text-left flex items-center justify-between transition-colors outline-none text-xs cursor-pointer shadow-2xs ${
          isOpen
            ? 'bg-white dark:bg-slate-800 border-indigo-500 ring-2 ring-indigo-500/20'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
        }`}
      >
        <div className="flex items-center gap-2 truncate pr-2">
          <Hash className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          {availableSections.length === 0 ? (
            <span className="text-slate-400 dark:text-slate-500">No sections found</span>
          ) : isAllSectionsSelected ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-slate-900 dark:text-white font-semibold">All Sections</span>
              <span className="text-[11px] text-indigo-600 dark:text-indigo-300 font-mono">
                ({availableSections.length})
              </span>
            </div>
          ) : selectedSections.length === 0 ? (
            <span className="text-amber-600 dark:text-amber-400 font-medium">None Selected</span>
          ) : selectedSections.length === 1 ? (
            <span className="text-slate-900 dark:text-white font-medium">Sec {selectedSections[0]}</span>
          ) : (
            <span className="text-slate-900 dark:text-white font-medium">
              {selectedSections.length} Sections Selected
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isAllSectionsSelected && availableSections.length > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold">
              All
            </span>
          ) : selectedSections.length > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold">
              {selectedSections.length}
            </span>
          ) : null}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
              isOpen ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 p-2.5 space-y-2 animate-in fade-in-50 zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              Filter Section ({isAllSectionsSelected ? `All (${availableSections.length})` : `${selectedSections.length}/${availableSections.length}`})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-300 dark:text-slate-600">&bull;</span>
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:underline font-medium cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
            {availableSections.length > 0 && (
              <div
                onClick={toggleAllSections}
                className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                  isAllSectionsSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-500/80 text-indigo-950 dark:text-white font-medium'
                    : 'bg-transparent border border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
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

            {availableSections.map((sec) => {
              const isSelected = !isAllSectionsSelected && selectedSections.includes(sec);
              return (
                <div
                  key={sec}
                  onClick={() => toggleSection(sec)}
                  className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-500/80 text-indigo-950 dark:text-white font-medium'
                      : 'bg-transparent border border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 pointer-events-none"
                    />
                    <span className="truncate font-medium">Section {sec}</span>
                  </div>
                </div>
              );
            })}
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
// Student Multi-Select Filter Component for Drill-Down
// -------------------------------------------------------------
function DrillDownStudentMultiSelect({
  availableStudents,
  selectedStudentIds,
  onChange,
}: {
  availableStudents: any[];
  selectedStudentIds: string[];
  onChange: (studentIds: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAllStudentsSelected =
    selectedStudentIds.includes('ALL') ||
    selectedStudentIds.includes('All Students') ||
    (availableStudents.length > 0 && selectedStudentIds.length === availableStudents.length);

  const toggleStudent = (stuId: string) => {
    if (isAllStudentsSelected) {
      onChange([stuId]);
    } else if (selectedStudentIds.includes(stuId)) {
      const next = selectedStudentIds.filter((id) => id !== stuId);
      onChange(next.length === 0 ? ['ALL'] : next);
    } else {
      const next = [...selectedStudentIds, stuId];
      if (availableStudents.length > 0 && next.length === availableStudents.length) {
        onChange(['ALL']);
      } else {
        onChange(next);
      }
    }
  };

  const toggleAllStudents = () => {
    onChange(['ALL']);
  };

  const handleSelectAll = () => {
    onChange(['ALL']);
  };

  const handleClear = () => {
    onChange([]);
  };

  const filteredStudents = availableStudents.filter((stu) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (stu.studentName || '').toLowerCase().includes(q) ||
      (stu.uniqueStudentId || stu.studentId || '').toLowerCase().includes(q) ||
      (stu.schoolAdmissionNumber || '').toLowerCase().includes(q) ||
      (stu.className || '').toLowerCase().includes(q) ||
      (stu.section || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 rounded-lg border text-left flex items-center justify-between transition-colors outline-none text-xs cursor-pointer shadow-2xs ${
          isOpen
            ? 'bg-white dark:bg-slate-800 border-indigo-500 ring-2 ring-indigo-500/20'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
        }`}
      >
        <div className="flex items-center gap-2 truncate pr-2">
          <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          {availableStudents.length === 0 ? (
            <span className="text-slate-400 dark:text-slate-500">No students found</span>
          ) : isAllStudentsSelected ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-slate-900 dark:text-white font-semibold">All Students</span>
              <span className="text-[11px] text-indigo-600 dark:text-indigo-300 font-mono">
                ({availableStudents.length})
              </span>
            </div>
          ) : selectedStudentIds.length === 0 ? (
            <span className="text-amber-600 dark:text-amber-400 font-medium">None Selected</span>
          ) : selectedStudentIds.length === 1 ? (
            <span className="text-slate-900 dark:text-white font-medium truncate">
              {availableStudents.find((s) => {
                const ids = [s.uniqueStudentId, s.studentId, s.id, s._id].filter(Boolean);
                return ids.includes(selectedStudentIds[0]);
              })?.studentName || '1 Student'}
            </span>
          ) : (
            <span className="text-slate-900 dark:text-white font-medium">
              {selectedStudentIds.length} Students Selected
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isAllStudentsSelected && availableStudents.length > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold">
              All
            </span>
          ) : selectedStudentIds.length > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold">
              {selectedStudentIds.length}
            </span>
          ) : null}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
              isOpen ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 p-2.5 space-y-2 animate-in fade-in-50 zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              Filter Student ({isAllStudentsSelected ? `All (${availableStudents.length})` : `${selectedStudentIds.length}/${availableStudents.length}`})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-300 dark:text-slate-600">&bull;</span>
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:underline font-medium cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search student name, ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-700 dark:hover:text-white p-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
            {(!search || 'all students'.includes(search.toLowerCase())) && availableStudents.length > 0 && (
              <div
                onClick={toggleAllStudents}
                className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                  isAllStudentsSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-500/80 text-indigo-950 dark:text-white font-medium'
                    : 'bg-transparent border border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
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
                {search ? 'No matching students' : 'No students available'}
              </div>
            ) : (
              filteredStudents.map((stu) => {
                const stuKey = stu.uniqueStudentId || stu.studentId || stu.id || stu._id;
                const studentIds = [stu.uniqueStudentId, stu.studentId, stu.id, stu._id, stuKey].filter(Boolean);
                const isSelected =
                  !isAllStudentsSelected &&
                  studentIds.some((id) => selectedStudentIds.includes(id));
                return (
                  <div
                    key={stuKey}
                    onClick={() => toggleStudent(stuKey)}
                    className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-500/80 text-indigo-950 dark:text-white font-medium'
                        : 'bg-transparent border border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
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
                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{stu.uniqueStudentId || stu.studentId}</span>
                          {stu.schoolAdmissionNumber && (
                            <span>&bull; Adm: {stu.schoolAdmissionNumber}</span>
                          )}
                          {stu.className && (
                            <span>&bull; {stu.className}{stu.section ? ` - ${stu.section}` : ''}</span>
                          )}
                          {stu.schoolName && (
                            <span>&bull; {stu.schoolName}</span>
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
// Loading Skeleton Component for Inline Drill-Down
// -------------------------------------------------------------
function HistoricalAuditLoadingSkeleton({
  publishName,
  publishMode,
}: {
  publishName?: string;
  publishMode?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Loading assessment details for ${publishName || 'assessment'}`}
      className="border-t border-indigo-200 dark:border-indigo-500/30 bg-slate-50/50 dark:bg-slate-950/80 p-4 sm:p-6 space-y-5 sm:space-y-6 drilldown-panel-container"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 gap-2">
        <div className="space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-semibold block">
            Test Details
          </span>
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <h3 className="font-semibold text-sm sm:text-base text-slate-800 dark:text-slate-200">
              Loading assessment details...
            </h3>
          </div>
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500 font-mono hidden sm:inline">
          Fetching targets & student roster
        </span>
      </div>

      {/* Shimmer Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 p-3.5 sm:p-4 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-2xs">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 animate-pulse">
            <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
          </div>
        ))}
      </div>

      {/* Step 1: Targets Skeleton */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-3.5 w-44 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="p-3.5 sm:p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5 shadow-2xs animate-pulse"
            >
              <div className="flex justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
              </div>
              <div className="space-y-2 pt-1">
                <div className="h-3 w-3/4 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-3 w-2/3 bg-slate-200 dark:bg-slate-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step 2: Questions Skeleton */}
      <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800 animate-pulse">
        <div className="h-3.5 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5 shadow-2xs">
          <div className="h-4 w-40 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-3 w-56 bg-slate-200 dark:bg-slate-800 rounded" />
        </div>
      </div>

      {/* Step 3: Filters & Roster Skeleton */}
      <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800 animate-pulse">
        <div className="h-3.5 w-36 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          ))}
        </div>

        {/* Tab shimmers */}
        <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-xl mt-3" />

        {/* Student row shimmers */}
        <div className="space-y-2 pt-1">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 shadow-2xs"
            >
              <div className="flex justify-between">
                <div className="h-4 w-36 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
              </div>
              <div className="h-3 w-48 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Error View Component for Inline Drill-Down
// -------------------------------------------------------------
function HistoricalAuditErrorView({
  publishName,
  errorMessage,
  onRetry,
  onClose,
}: {
  publishName?: string;
  errorMessage?: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="alert"
      className="border-t border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 p-4 sm:p-6 space-y-4 drilldown-panel-container"
    >
      <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
              Unable to load details for {publishName || 'assessment'}
            </h4>
            <p className="text-xs text-rose-700 dark:text-rose-300">
              {errorMessage || 'A network error or unexpected response occurred while loading the test data.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-2xs cursor-pointer transition-colors flex items-center gap-1.5"
          >
            <span>Retry Loading Details</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Expanded Drill-Down Component
// -------------------------------------------------------------
function HistoricalAuditDrillDown({
  detail,
  schools = [],
  onClose,
}: {
  detail: any;
  schools?: any[];
  onClose: () => void;
}) {
  const [drillDownTab, setDrillDownTab] = useState<'all' | 'completed' | 'not_completed'>('all');
  const [showQuestionsPreview, setShowQuestionsPreview] = useState(false);

  // Filter States: School -> Class -> Section -> Student
  const [selectedSchoolNames, setSelectedSchoolNames] = useState<string[]>(['ALL']);
  const [selectedClasses, setSelectedClasses] = useState<string[]>(['ALL']);
  const [selectedSections, setSelectedSections] = useState<string[]>(['ALL']);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(['ALL']);

  // All students assigned to this published assessment
  const allAssignedStudents: any[] = useMemo(() => {
    return Array.isArray(detail?.studentsStatus) ? detail.studentsStatus : [];
  }, [detail?.studentsStatus]);

  // Grouped question summary breakdown: Group -> Difficulty -> Count
  const questionSummaryData = useMemo(() => {
    if (Array.isArray(detail?.questionSummary) && detail.questionSummary.length > 0) {
      return [...detail.questionSummary].sort((a: any, b: any) =>
        String(a.groupName || '').localeCompare(String(b.groupName || ''), undefined, { sensitivity: 'base' })
      );
    }
    if (Array.isArray(detail?.questions) && detail.questions.length > 0) {
      const map = new Map<string, { diffMap: Map<string, number>; isGroupDeleted: boolean }>();
      for (const q of detail.questions) {
        if (q.isQuestionDeleted) continue;
        const g = (q.groupName || 'General').trim();
        const d = (q.difficulty || 'Medium').trim();
        if (!map.has(g)) map.set(g, { diffMap: new Map(), isGroupDeleted: false });
        const entry = map.get(g)!;
        if (q.isGroupDeleted) entry.isGroupDeleted = true;
        entry.diffMap.set(d, (entry.diffMap.get(d) || 0) + 1);
      }
      const standardOrder = ['Easy', 'Medium', 'Hard'];
      return Array.from(map.entries())
        .sort(([gA], [gB]) => gA.localeCompare(gB, undefined, { sensitivity: 'base' }))
        .map(([g, entry]) => {
          const diffKeys = Array.from(entry.diffMap.keys());
          const sortedKeys = [
            ...standardOrder.filter((d) => diffKeys.includes(d)),
            ...diffKeys.filter((d) => !standardOrder.includes(d)),
          ];
          return {
            groupName: g,
            isGroupDeleted: entry.isGroupDeleted,
            difficulties: sortedKeys.map((d) => ({
              difficulty: d,
              count: entry.diffMap.get(d) || 0,
            })),
          };
        });
    }
    return [];
  }, [detail]);

  const totalHistoricalQuestionsCount = useMemo(() => {
    if (Array.isArray(detail?.questions) && detail.questions.length > 0) {
      const activeCount = detail.questions.filter((q: any) => !q.isQuestionDeleted).length;
      return activeCount;
    }
    if (detail?.totalQuestionsCount != null && detail.totalQuestionsCount > 0) {
      return detail.totalQuestionsCount;
    }
    if (questionSummaryData.length > 0) {
      return questionSummaryData.reduce(
        (acc: number, g: any) =>
          acc + g.difficulties.reduce((dAcc: number, d: any) => dAcc + d.count, 0),
        0
      );
    }
    return detail?.assignedQuestionsCount || 0;
  }, [detail, questionSummaryData]);

  // Normalized student-style preview questions for StudentAssessmentPreviewModal
  const previewStudentQuestions = useMemo(() => {
    const rawQuestions = Array.isArray(detail?.questions) ? detail.questions : [];
    return rawQuestions
      .filter((q: any) => !q.isQuestionDeleted)
      .map((q: any) => {
        const isRanking = Boolean(
          q.isRanking ||
          q.isRankingQuestion ||
          q.rankingQuestion ||
          String(q.questionType || '').toLowerCase() === 'ranking'
        );
        return {
          id: q.id || q._id || q.questionId,
          questionId: q.questionId || q.id || q._id,
          groupName: q.groupName,
          difficulty: q.difficulty,
          content: q.content,
          points: q.points != null ? Number(q.points) : null,
          timeSeconds: q.timeAllowedSeconds ?? q.timeSeconds,
          timeAllowedSeconds: q.timeAllowedSeconds ?? q.timeSeconds,
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
          images: Array.isArray(q.images) && q.images.length > 0 ? q.images : (q.metadata?.images || []),
          imageLayout: q.imageLayout || q.metadata?.imageLayout || 'auto',
          isQuestionDeleted: false,
        };
      });
  }, [detail?.questions]);

  // Target Configuration(s) stored for this publish
  const targetsList: any[] = useMemo(() => {
    if (Array.isArray(detail?.targets) && detail.targets.length > 0) {
      return detail.targets;
    }
    if (detail?.target) {
      return [detail.target];
    }
    return [
      {
        schoolNames: detail?.schoolNames || (detail?.schoolName ? [detail.schoolName] : []),
        schoolIds: detail?.schoolIds || (detail?.schoolId ? [detail.schoolId] : []),
        classes: detail?.classes || ['All Classes'],
        sections: detail?.sections || [],
        assignedCount: detail?.totalRecipients || allAssignedStudents.length,
      },
    ];
  }, [detail, allAssignedStudents.length]);

  // School lookup helper
  const schoolMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of schools) {
      map.set(s.id, s.name);
      if (s._id) map.set(s._id.toString(), s.name);
    }
    return map;
  }, [schools]);

  // 1. Available Schools from assigned students (or target metadata fallback if roster is empty)
  const availableSchools = useMemo(() => {
    const schoolSet = new Map<string, string>();
    for (const st of allAssignedStudents) {
      const name = st.schoolName || (st.schoolId ? schoolMap.get(st.schoolId) : '') || detail?.schoolName || 'School';
      const id = st.schoolId || name;
      schoolSet.set(name, id);
    }
    if (schoolSet.size === 0) {
      if (Array.isArray(detail?.schoolNames) && detail.schoolNames.length > 0) {
        for (const name of detail.schoolNames) {
          schoolSet.set(name, name);
        }
      } else if (detail?.schoolName) {
        schoolSet.set(detail.schoolName, detail.schoolId || detail.schoolName);
      }
    }
    return Array.from(schoolSet.entries()).map(([name, id]) => ({ id, name }));
  }, [allAssignedStudents, detail?.schoolName, detail?.schoolNames, detail?.schoolId, schoolMap]);

  // Step 1: Filter students by School
  const isAllSchools =
    selectedSchoolNames.includes('ALL') ||
    selectedSchoolNames.includes('All Schools') ||
    (availableSchools.length > 0 && selectedSchoolNames.length === availableSchools.length);

  const studentsAfterSchool = useMemo(() => {
    if (isAllSchools) return allAssignedStudents;
    if (selectedSchoolNames.length === 0) return [];
    return allAssignedStudents.filter((st) => {
      const name = st.schoolName || (st.schoolId ? schoolMap.get(st.schoolId) : '') || detail?.schoolName || '';
      return selectedSchoolNames.includes(name) || (st.schoolId && selectedSchoolNames.includes(st.schoolId));
    });
  }, [allAssignedStudents, isAllSchools, selectedSchoolNames, schoolMap, detail?.schoolName]);

  // 2. Available Classes dynamically narrowed by selected School(s)
  const availableClasses = useMemo(() => {
    const classes = Array.from(
      new Set(
        studentsAfterSchool
          .map((s) => s.className)
          .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
          .map((c) => c.trim())
      )
    );
    return classes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [studentsAfterSchool]);

  // Auto-clean selectedClasses when availableClasses changes
  useEffect(() => {
    const isAll =
      selectedClasses.includes('ALL') ||
      selectedClasses.includes('All Classes');
    if (!isAll && selectedClasses.length > 0) {
      const valid = selectedClasses.filter((c) => availableClasses.includes(c));
      if (valid.length === 0) {
        setSelectedClasses(['ALL']);
      } else if (valid.length !== selectedClasses.length) {
        setSelectedClasses(valid);
      }
    }
  }, [availableClasses, selectedClasses]);

  // Step 2: Filter students by Class
  const isAllClasses =
    selectedClasses.includes('ALL') ||
    selectedClasses.includes('All Classes') ||
    (availableClasses.length > 0 && selectedClasses.length === availableClasses.length);

  const studentsAfterClass = useMemo(() => {
    if (isAllClasses) return studentsAfterSchool;
    if (selectedClasses.length === 0) return [];
    return studentsAfterSchool.filter((st) => selectedClasses.includes(st.className));
  }, [studentsAfterSchool, isAllClasses, selectedClasses]);

  // 3. Available Sections dynamically narrowed by selected School(s) + Class(es)
  const availableSections = useMemo(() => {
    const sections = Array.from(
      new Set(
        studentsAfterClass
          .map((s) => s.section)
          .filter((sec): sec is string => typeof sec === 'string' && sec.trim().length > 0)
          .map((sec) => sec.trim().toUpperCase())
      )
    );
    return sections.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [studentsAfterClass]);

  // Auto-clean selectedSections when availableSections changes
  useEffect(() => {
    const isAll =
      selectedSections.includes('ALL') ||
      selectedSections.includes('All Sections');
    if (!isAll && selectedSections.length > 0) {
      const valid = selectedSections.filter((s) => availableSections.includes(s));
      if (valid.length === 0) {
        setSelectedSections(['ALL']);
      } else if (valid.length !== selectedSections.length) {
        setSelectedSections(valid);
      }
    }
  }, [availableSections, selectedSections]);

  // Step 3: Filter students by Section
  const isAllSections =
    selectedSections.includes('ALL') ||
    selectedSections.includes('All Sections') ||
    (availableSections.length > 0 && selectedSections.length === availableSections.length);

  const studentsAfterSection = useMemo(() => {
    if (isAllSections) return studentsAfterClass;
    if (selectedSections.length === 0) return [];
    return studentsAfterClass.filter((st) =>
      selectedSections.some((sec) => sec.toUpperCase() === (st.section || '').toUpperCase())
    );
  }, [studentsAfterClass, isAllSections, selectedSections]);

  // 4. Available Students dynamically narrowed by School + Class + Section
  const availableStudents = useMemo(() => {
    return [...studentsAfterSection].sort((a, b) =>
      (a.studentName || '').localeCompare(b.studentName || '', undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [studentsAfterSection]);

  // Auto-clean selectedStudentIds when availableStudents changes
  useEffect(() => {
    const isAll =
      selectedStudentIds.includes('ALL') ||
      selectedStudentIds.includes('All Students');
    if (!isAll && selectedStudentIds.length > 0) {
      const availIds = new Set(
        availableStudents.flatMap((s) => [s.uniqueStudentId, s.studentId, s.id, s._id].filter(Boolean))
      );
      const valid = selectedStudentIds.filter((id) => availIds.has(id));
      if (valid.length === 0) {
        setSelectedStudentIds(['ALL']);
      } else if (valid.length !== selectedStudentIds.length) {
        setSelectedStudentIds(valid);
      }
    }
  }, [availableStudents, selectedStudentIds]);

  // Step 4: Filter students by Student
  const isAllStudents =
    selectedStudentIds.includes('ALL') ||
    selectedStudentIds.includes('All Students') ||
    (availableStudents.length > 0 && selectedStudentIds.length === availableStudents.length);

  const studentsFinal = useMemo(() => {
    if (isAllStudents) return studentsAfterSection;
    if (selectedStudentIds.length === 0) return [];
    return studentsAfterSection.filter((st) => {
      const ids = [st.uniqueStudentId, st.studentId, st.id, st._id].filter(Boolean);
      return ids.some((id) => selectedStudentIds.includes(id));
    });
  }, [studentsAfterSection, isAllStudents, selectedStudentIds]);

  // Status breakdown of the filtered students
  const filteredCompleted = useMemo(() => {
    return studentsFinal.filter((s) => s.status === 'COMPLETED');
  }, [studentsFinal]);

  const filteredIncomplete = useMemo(() => {
    return studentsFinal.filter((s) => s.status !== 'COMPLETED');
  }, [studentsFinal]);

  const [studentPage, setStudentPage] = useState(1);
  const studentPageSize = 25;

  // Final list displayed based on active status tab
  const displayedStudents = useMemo(() => {
    const list =
      drillDownTab === 'completed'
        ? filteredCompleted
        : drillDownTab === 'not_completed'
        ? filteredIncomplete
        : studentsFinal;

    return [...list].sort((a, b) =>
      (a.studentName || '').localeCompare(b.studentName || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    );
  }, [drillDownTab, filteredCompleted, filteredIncomplete, studentsFinal]);

  // Reset pagination when status tab or filters change
  useEffect(() => {
    setStudentPage(1);
  }, [drillDownTab, selectedSchoolNames, selectedClasses, selectedSections, selectedStudentIds]);

  const totalStudentPages = Math.max(1, Math.ceil(displayedStudents.length / studentPageSize));
  const safeStudentPage = Math.min(studentPage, totalStudentPages);
  const paginatedDisplayedStudents = useMemo(() => {
    const startIdx = (safeStudentPage - 1) * studentPageSize;
    return displayedStudents.slice(startIdx, startIdx + studentPageSize);
  }, [displayedStudents, safeStudentPage, studentPageSize]);

  const publishDateTimeDisplay = formatPublishDateTime(detail?.publishedAt || detail?.updatedAt || detail?.createdAt);
  const availabilityWindowDisplay = formatAvailabilityWindow(
    detail?.startDate || detail?.date,
    detail?.startTime || detail?.time,
    detail?.endDate,
    detail?.endTime
  );

  return (
    <div
      id={`drilldown-${detail?.publishId || 'panel'}`}
      className="border-t border-indigo-200 dark:border-indigo-500/30 bg-slate-50/50 dark:bg-slate-950/80 p-4 sm:p-6 space-y-5 sm:space-y-6 drilldown-panel-container"
    >
      {/* Top Header of Drill-Down */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 gap-2">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-semibold block">
            Test Details
          </span>
          <h3 className="font-semibold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-500" />
            Test Information & Students
          </h3>
        </div>
        <button
          type="button"
          aria-label="Close Test Details"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onClose();
            }
          }}
          className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer shrink-0"
        >
          Close &uarr;
        </button>
      </div>

      {/* Published & Test Availability Window & Status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 p-3.5 sm:p-4 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-xs font-mono shadow-2xs">
        <div className="space-y-1">
          <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Published:
          </span>
          <div className="text-slate-900 dark:text-white font-semibold flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="break-words">{publishDateTimeDisplay}</span>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Available:
          </span>
          <div className="text-slate-900 dark:text-white font-semibold flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="break-words">{availabilityWindowDisplay}</span>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Status:
          </span>
          <div className="flex items-center gap-1.5 pt-0.5">
            {detail.status === 'PAUSED' || detail.isPaused ? (
              <span className="px-2 py-0.5 rounded-md font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800 text-[11px] uppercase tracking-wide inline-flex items-center gap-1">
                <Pause className="w-3 h-3" />
                PAUSED
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-md font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800 text-[11px] uppercase tracking-wide inline-flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                ACTIVE
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* STEP 1: TARGET SELECTION INFORMATION FIRST              */}
      {/* ======================================================== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            Who Can Take This Test ({targetsList.length} {targetsList.length === 1 ? 'Group' : 'Groups'})
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {targetsList.map((tgt, tIdx) => {
            // 1. School Display
            // If target contains All Schools -> display "All Schools"
            // If target contains multiple schools -> display comma-separated (e.g. "abc, san")
            let schoolDisplay = 'All Schools';
            const isTargetAllSchools =
              tgt.isAllSchools === true ||
              (Array.isArray(tgt.schoolIds) && tgt.schoolIds.includes('ALL')) ||
              (Array.isArray(tgt.schoolNames) && tgt.schoolNames.includes('All Schools')) ||
              (!tgt.schoolIds && !tgt.schoolNames);

            if (!isTargetAllSchools) {
              if (Array.isArray(tgt.schoolNames) && tgt.schoolNames.length > 0) {
                schoolDisplay = tgt.schoolNames.join(', ');
              } else if (Array.isArray(tgt.schoolIds) && tgt.schoolIds.length > 0) {
                schoolDisplay = tgt.schoolIds
                  .map((id: string) => schoolMap.get(id) || id)
                  .join(', ');
              } else if (tgt.schoolName) {
                schoolDisplay = tgt.schoolName;
              }
            }

            // 2. Class Display
            // If target contains All Classes -> display "All Classes"
            // If target contains multiple classes -> display comma-separated (e.g. "Class 5, Class 7")
            let classDisplay = 'All Classes';
            if (Array.isArray(tgt.classes) && tgt.classes.length > 0) {
              const cleanClasses = tgt.classes.filter(
                (c: string) => c && c.toUpperCase() !== 'ALL' && c.toLowerCase() !== 'all classes'
              );
              if (cleanClasses.length > 0) {
                classDisplay = cleanClasses.join(', ');
              }
            } else if (tgt.className && tgt.className.toLowerCase() !== 'all classes') {
              classDisplay = tgt.className;
            }

            // 3. Section Display
            // If target contains All Sections -> display "All Sections"
            // If target contains multiple sections -> display comma-separated (e.g. "A, B")
            let sectionDisplay = 'All Sections';
            if (Array.isArray(tgt.sections) && tgt.sections.length > 0) {
              const cleanSections = tgt.sections.filter(
                (s: string) => s && s.toUpperCase() !== 'ALL' && s.toLowerCase() !== 'all sections'
              );
              if (cleanSections.length > 0) {
                sectionDisplay = cleanSections.join(', ');
              }
            }

            // 4. Student Count for this Target
            let targetStudentCount = tgt.assignedCount;
            if (targetStudentCount == null) {
              if (
                targetsList.length === 1 &&
                allAssignedStudents.length === 0 &&
                detail?.totalRecipients != null &&
                detail.totalRecipients > 0
              ) {
                targetStudentCount = detail.totalRecipients;
              } else {
                // Calculate matching students from allAssignedStudents
                targetStudentCount = allAssignedStudents.filter((st: any) => {
                  const matchSchool =
                    isTargetAllSchools ||
                    !tgt.schoolIds ||
                    tgt.schoolIds.length === 0 ||
                    tgt.schoolIds.includes(st.schoolId) ||
                    (Array.isArray(tgt.schoolNames) && tgt.schoolNames.includes(st.schoolName));

                  const matchClass =
                    classDisplay === 'All Classes' ||
                    (Array.isArray(tgt.classes) &&
                      tgt.classes.some((c: string) => c.toLowerCase() === (st.className || '').toLowerCase())) ||
                    (tgt.className && tgt.className.toLowerCase() === (st.className || '').toLowerCase());

                  const matchSection =
                    sectionDisplay === 'All Sections' ||
                    (Array.isArray(tgt.sections) &&
                      tgt.sections.some((sec: string) => sec.toUpperCase() === (st.section || '').toUpperCase()));

                  const matchStudent =
                    !tgt.studentIds ||
                    tgt.studentIds.length === 0 ||
                    tgt.studentIds.includes('ALL') ||
                    tgt.studentIds.includes(st.studentId) ||
                    tgt.studentIds.includes(st.uniqueStudentId);

                  return matchSchool && matchClass && matchSection && matchStudent;
                }).length;
              }
            }

            return (
              <div
                key={tgt.id || tgt._id || tIdx}
                className="p-3.5 sm:p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5 shadow-2xs"
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold font-mono">
                    Target {tIdx + 1}
                  </span>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 font-semibold">
                    {targetStudentCount} {targetStudentCount === 1 ? 'Student' : 'Students'}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex items-baseline gap-2">
                    <span className="text-slate-500 dark:text-slate-400 font-sans font-medium w-16 shrink-0">School:</span>
                    <span className="text-slate-900 dark:text-white font-semibold break-words flex-1 min-w-0">{schoolDisplay}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-slate-500 dark:text-slate-400 font-sans font-medium w-16 shrink-0">Class:</span>
                    <span className="text-slate-900 dark:text-white font-semibold break-words flex-1 min-w-0">{classDisplay}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-slate-500 dark:text-slate-400 font-sans font-medium w-16 shrink-0">Section:</span>
                    <span className="text-slate-900 dark:text-white font-semibold break-words flex-1 min-w-0">{sectionDisplay}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-slate-500 dark:text-slate-400 font-sans font-medium w-16 shrink-0">Students:</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold">{targetStudentCount}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* STEP 2: QUESTIONS CONFIGURATION SUMMARY                  */}
      {/* ======================================================== */}
      <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            Questions ({totalHistoricalQuestionsCount} {totalHistoricalQuestionsCount === 1 ? 'Question' : 'Questions'})
          </h4>
          {Array.isArray(detail?.questions) && detail.questions.length > 0 && (
            <button
              type="button"
              onClick={() => setShowQuestionsPreview(true)}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
          )}
        </div>

        {questionSummaryData.length > 0 ? (
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3.5 shadow-2xs">
            <div className="space-y-3">
              {questionSummaryData.map((g: any) => (
                <div
                  key={g.groupName}
                  className="text-xs space-y-1.5 pl-3 border-l-2 border-indigo-600 dark:border-indigo-500/60"
                >
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-slate-900 dark:text-slate-200 text-sm">{g.groupName}</div>
                    {g.isGroupDeleted && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/90 dark:text-rose-300 dark:border-rose-800 text-[10px] font-mono font-medium flex items-center gap-1">
                        ⚠️ Group Deleted
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 pl-2">
                    {g.difficulties.map((d: any) => (
                      <div
                        key={d.difficulty}
                        className="text-xs font-mono text-slate-700 dark:text-slate-300 flex items-center gap-2"
                      >
                        <span
                          className={`px-1.5 py-0.5 rounded font-medium text-[11px] border ${
                            d.difficulty === 'Easy'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800'
                              : d.difficulty === 'Hard'
                              ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800'
                              : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800'
                          }`}
                        >
                          {d.difficulty}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500">&mdash;</span>
                        <span className="text-indigo-600 dark:text-indigo-300 font-semibold">
                          {d.count} {d.count === 1 ? 'Question' : 'Questions'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs font-mono">
                {detail?.publishMode === 'Random Questions' ? (
                  <>
                    <span className="text-slate-500 dark:text-slate-400">
                      Total Eligible Questions: <strong className="text-slate-900 dark:text-white text-sm">{totalHistoricalQuestionsCount}</strong>
                    </span>
                    <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">&bull;</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      Questions Per Student: <strong className="text-indigo-600 dark:text-indigo-300 text-sm">{detail.randomCount || detail.assignedQuestionsCount || '—'}</strong>
                    </span>
                  </>
                ) : (
                  <span className="text-slate-500 dark:text-slate-400">
                    Total Selected Questions: <strong className="text-slate-900 dark:text-white text-sm">{totalHistoricalQuestionsCount}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between shadow-2xs">
            <span>Total Assigned Questions: {detail?.assignedQuestionsCount || 'N/A'}</span>
            {Array.isArray(detail?.questions) && detail.questions.length > 0 && (
              <button
                type="button"
                onClick={() => setShowQuestionsPreview(true)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* STEP 3: MULTI-SELECT FILTERS (School -> Class -> Sec -> Stu) */}
      {/* ======================================================== */}
      <div className="space-y-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            Filter Assigned Roster
          </span>
          {(!isAllSchools || !isAllClasses || !isAllSections || !isAllStudents) && (
            <button
              type="button"
              onClick={() => {
                setSelectedSchoolNames(['ALL']);
                setSelectedClasses(['ALL']);
                setSelectedSections(['ALL']);
                setSelectedStudentIds(['ALL']);
              }}
              className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium underline cursor-pointer"
            >
              Reset All Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
          {/* 1. School Filter */}
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold uppercase text-slate-600 dark:text-slate-400">
              1. School
            </label>
            <DrillDownSchoolMultiSelect
              availableSchools={availableSchools}
              selectedSchoolNames={selectedSchoolNames}
              onChange={setSelectedSchoolNames}
            />
          </div>

          {/* 2. Class Filter */}
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold uppercase text-slate-600 dark:text-slate-400">
              2. Class
            </label>
            <DrillDownClassMultiSelect
              availableClasses={availableClasses}
              selectedClasses={selectedClasses}
              onChange={setSelectedClasses}
            />
          </div>

          {/* 3. Section Filter */}
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold uppercase text-slate-600 dark:text-slate-400">
              3. Section
            </label>
            <DrillDownSectionMultiSelect
              availableSections={availableSections}
              selectedSections={selectedSections}
              onChange={setSelectedSections}
            />
          </div>

          {/* 4. Student Filter */}
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold uppercase text-slate-600 dark:text-slate-400">
              4. Student
            </label>
            <DrillDownStudentMultiSelect
              availableStudents={availableStudents}
              selectedStudentIds={selectedStudentIds}
              onChange={setSelectedStudentIds}
            />
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* STEP 3: STUDENT STATUS LIST                             */}
      {/* ======================================================== */}
      <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
        {/* Roster Status Filter Tabs */}
        <div className="flex flex-col sm:flex-row gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs">
          <button
            type="button"
            onClick={() => setDrillDownTab('all')}
            className={`w-full sm:flex-1 py-2 sm:py-1.5 px-2 rounded-lg font-medium transition-all text-center cursor-pointer ${
              drillDownTab === 'all'
                ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All ({studentsFinal.length})
          </button>
          <button
            type="button"
            onClick={() => setDrillDownTab('completed')}
            className={`w-full sm:flex-1 py-2 sm:py-1.5 px-2 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-center cursor-pointer ${
              drillDownTab === 'completed'
                ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CheckCircle className="w-3 h-3 shrink-0" />
            Completed ({filteredCompleted.length})
          </button>
          <button
            type="button"
            onClick={() => setDrillDownTab('not_completed')}
            className={`w-full sm:flex-1 py-2 sm:py-1.5 px-2 rounded-lg font-medium transition-all flex items-center justify-center gap-1 text-center cursor-pointer ${
              drillDownTab === 'not_completed'
                ? 'bg-rose-600 text-white shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <XCircle className="w-3 h-3 shrink-0" />
            Incomplete / Not Done ({filteredIncomplete.length})
          </button>
        </div>

        {/* Student Cards List */}
        <div className="space-y-2 pr-1 min-h-[80px]">
          {displayedStudents.length === 0 ? (
            <p className="text-xs text-slate-500 italic p-6 text-center bg-slate-100/50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800">
              {drillDownTab === 'completed'
                ? 'No matching students have completed this assessment.'
                : drillDownTab === 'not_completed'
                ? 'No matching students in incomplete or not started status.'
                : 'No students match the current filter selection.'}
            </p>
          ) : (
            <>
              {paginatedDisplayedStudents.map((s: any) => (
                <div
                  key={s.studentId || s.uniqueStudentId || s.id || s._id}
                  className={`p-3 rounded-xl border text-xs space-y-2 transition-all ${
                    s.status === 'COMPLETED'
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40'
                      : s.status === 'INCOMPLETE'
                      ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40'
                      : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/50'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-1 sm:gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 dark:text-white text-sm break-words">{s.studentName}</p>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono break-words block">
                        {s.className} {s.section ? `(${s.section})` : ''} &bull; ID: {s.uniqueStudentId || s.studentId}
                        {s.schoolAdmissionNumber && <span className="text-slate-500 dark:text-slate-400"> &bull; Adm: {s.schoolAdmissionNumber}</span>}
                        {s.schoolName && <span className="text-slate-500 dark:text-slate-400"> &bull; {s.schoolName}</span>}
                      </span>
                    </div>
                    {s.status === 'COMPLETED' && s.scoreOutOf100 != null && (
                      <span className="font-mono text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 text-[11px] shrink-0 self-start sm:self-auto">
                        {s.scoreOutOf100}/100
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    <span className="text-slate-400 dark:text-slate-500">Assessment Name:</span>{' '}
                    <span className="text-slate-800 dark:text-slate-200 font-medium">
                      {s.assessmentName || detail.publishName}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/60 font-mono text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 dark:text-slate-400">Status:</span>
                      <span
                        className={`px-1.5 py-0.5 rounded font-bold uppercase text-[10px] ${
                          s.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800'
                            : s.status === 'INCOMPLETE'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950 dark:text-rose-400 dark:border-rose-800'
                            : s.status === 'IN_PROGRESS'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800'
                            : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>

                    {(s.status === 'INCOMPLETE' || s.status === 'LOCKED_INCOMPLETE') && (s.exitType === 'EXIT' || s.exitType === 'LOGOUT') && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 dark:text-slate-400">Exit Type:</span>
                        <span
                          className={`font-semibold font-mono text-xs ${
                            s.exitType === 'EXIT'
                              ? 'text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 dark:text-amber-400 dark:bg-amber-950/80 dark:border-amber-800 font-bold'
                              : 'text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 dark:text-sky-400 dark:bg-sky-950/80 dark:border-sky-800 font-bold'
                          }`}
                        >
                          {s.exitType}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Student pagination controls */}
              {totalStudentPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs font-mono">
                  <span className="text-slate-500 dark:text-slate-400 text-center sm:text-left">
                    Showing {(safeStudentPage - 1) * studentPageSize + 1}&ndash;{Math.min(safeStudentPage * studentPageSize, displayedStudents.length)} of {displayedStudents.length} students
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={safeStudentPage <= 1}
                      onClick={() => setStudentPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    >
                      &larr; Prev
                    </button>
                    <span className="px-2.5 py-1 text-slate-700 dark:text-slate-300 font-bold bg-slate-100 dark:bg-slate-800/60 rounded-lg">
                      {safeStudentPage} / {totalStudentPages}
                    </span>
                    <button
                      type="button"
                      disabled={safeStudentPage >= totalStudentPages}
                      onClick={() => setStudentPage((p) => Math.min(totalStudentPages, p + 1))}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    >
                      Next &rarr;
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Student-Style Interactive Preview Modal */}
      {showQuestionsPreview && (
        <StudentAssessmentPreviewModal
          title={detail?.publishName || 'Published Assessment'}
          subtitle={
            detail?.publishMode
              ? `${detail.publishMode}${
                  detail.publishMode === 'Selected Questions' &&
                  (detail.shuffle || detail.shuffleQuestions)
                    ? ' · Shuffled'
                    : ''
                }`
              : undefined
          }
          questions={previewStudentQuestions}
          onClose={() => setShowQuestionsPreview(false)}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Main Publish History Section
// -------------------------------------------------------------
export function PublishHistorySection({
  token,
  schools = [],
  historyList,
  selectedHistoryDetail,
  onSelectHistory,
  onEditAssessment,
  onRefreshHistory,
}: PublishHistorySectionProps) {
  const [historySearch, setHistorySearch] = useState('');
  // All assessment cards must be CLOSED by default when visiting/returning to Publish History
  const [selectedPublishId, setSelectedPublishId] = useState<string | null>(null);

  // Loading & Error states for async card detail fetching
  const [loadingPublishId, setLoadingPublishId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<{ publishId: string; message: string } | null>(null);
  const [detailsCache, setDetailsCache] = useState<Record<string, any>>({});
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const activeRequestIdRef = useRef<string | null>(null);

  // Synchronize incoming selectedHistoryDetail prop with local cache
  useEffect(() => {
    if (selectedHistoryDetail && (selectedHistoryDetail.publishId || selectedHistoryDetail.id)) {
      const pid = selectedHistoryDetail.publishId || selectedHistoryDetail.id;
      setDetailsCache((prev) => ({ ...prev, [pid]: selectedHistoryDetail }));
      if (loadingPublishId === pid) {
        setLoadingPublishId(null);
      }
    }
  }, [selectedHistoryDetail, loadingPublishId]);

  // Scroll position stabilization effect:
  // When a card expands or when its async data loads, ensure the browser does NOT
  // auto-scroll or jump down to the bottom of the roster.
  useEffect(() => {
    if (!selectedPublishId) return;

    const cardEl = cardRefs.current.get(selectedPublishId);
    if (!cardEl) return;

    // Check where the card header is positioned relative to viewport
    const rect = cardEl.getBoundingClientRect();

    // If the card header was pushed above the top of the viewport (rect.top < 0),
    // smoothly bring the top of the card header back into view
    if (rect.top < 0) {
      cardEl.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, [selectedPublishId, loadingPublishId]);

  // Management action states
  const [pauseTarget, setPauseTarget] = useState<any | null>(null);
  const [resumeTarget, setResumeTarget] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const fetchCardDetail = async (publishId: string) => {
    activeRequestIdRef.current = publishId;
    setLoadingPublishId(publishId);
    setDetailError(null);

    try {
      const res = await fetch(`/api/publish-history/${encodeURIComponent(publishId)}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to load details (${res.status} ${res.statusText})`);
      }

      const data = await res.json();

      // Ensure response matches currently active requested card
      if (activeRequestIdRef.current === publishId) {
        setDetailsCache((prev) => ({ ...prev, [publishId]: data }));
        setLoadingPublishId(null);
        setDetailError(null);
      } else {
        // Cache anyway for subsequent clicks
        setDetailsCache((prev) => ({ ...prev, [publishId]: data }));
      }

      if (onSelectHistory) {
        onSelectHistory(publishId).catch(() => {});
      }
    } catch (err: any) {
      if (activeRequestIdRef.current === publishId) {
        setLoadingPublishId(null);
        setDetailError({
          publishId,
          message: err.message || 'Unable to load assessment details. Please check your network and try again.',
        });
      }
    }
  };

  const handleItemClick = (publishId: string) => {
    if (selectedPublishId === publishId) {
      // Toggle collapse
      setSelectedPublishId(null);
      setLoadingPublishId(null);
      setDetailError(null);
      activeRequestIdRef.current = null;
      return;
    }

    // Expanding a different card
    setSelectedPublishId(publishId);
    setDetailError(null);

    // If detail is already cached, show immediately
    if (detailsCache[publishId]) {
      setLoadingPublishId(null);
      activeRequestIdRef.current = publishId;
      return;
    }

    // If selectedHistoryDetail matches, cache and show immediately
    if (
      selectedHistoryDetail &&
      (selectedHistoryDetail.publishId === publishId || selectedHistoryDetail.id === publishId)
    ) {
      setDetailsCache((prev) => ({ ...prev, [publishId]: selectedHistoryDetail }));
      setLoadingPublishId(null);
      activeRequestIdRef.current = publishId;
      return;
    }

    // Trigger asynchronous fetch with loading state
    fetchCardDetail(publishId);
  };

  const handleRetry = (publishId: string) => {
    fetchCardDetail(publishId);
  };

  const handleConfirmPause = async () => {
    if (!pauseTarget) return;
    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/publish-history/${pauseTarget.publishId}/pause`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: getAuthHeaders(token),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to pause assessment');
      }
      setActionFeedback({ type: 'success', message: `Assessment '${pauseTarget.publishName}' is now temporarily paused.` });
      setPauseTarget(null);
      if (onRefreshHistory) {
        await onRefreshHistory();
      }
      if (selectedPublishId === pauseTarget.publishId) {
        await onSelectHistory(pauseTarget.publishId);
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || 'Failed to pause assessment' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleConfirmResume = async () => {
    if (!resumeTarget) return;
    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/publish-history/${resumeTarget.publishId}/resume`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: getAuthHeaders(token),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to resume assessment');
      }
      setActionFeedback({ type: 'success', message: `Assessment '${resumeTarget.publishName}' has been resumed.` });
      setResumeTarget(null);
      if (onRefreshHistory) {
        await onRefreshHistory();
      }
      if (selectedPublishId === resumeTarget.publishId) {
        await onSelectHistory(resumeTarget.publishId);
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || 'Failed to resume assessment' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/publish-history/${deleteTarget.publishId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: getAuthHeaders(token),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete assessment');
      }
      setActionFeedback({ type: 'success', message: `Assessment '${deleteTarget.publishName}' deleted successfully.` });
      if (selectedPublishId === deleteTarget.publishId) {
        setSelectedPublishId(null);
      }
      setDeleteTarget(null);
      if (onRefreshHistory) {
        await onRefreshHistory();
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || 'Failed to delete assessment' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const filteredHistory = historyList.filter((hist) => {
    if (!historySearch) return true;
    const q = historySearch.toLowerCase();
    return (
      hist.publishName?.toLowerCase().includes(q) ||
      hist.schoolName?.toLowerCase().includes(q) ||
      hist.publishMode?.toLowerCase().includes(q)
    );
  });

  // Helper to extract school-wise student counts for card summary
  const getSchoolSummaries = (hist: any): Array<{ schoolName: string; count: number }> => {
    if (Array.isArray(hist.schoolCounts) && hist.schoolCounts.length > 0) {
      return hist.schoolCounts;
    }

    if (Array.isArray(hist.studentsStatus) && hist.studentsStatus.length > 0) {
      const countsMap = new Map<string, number>();
      for (const st of hist.studentsStatus) {
        const name = st.schoolName || hist.schoolName || 'School';
        countsMap.set(name, (countsMap.get(name) || 0) + 1);
      }
      return Array.from(countsMap.entries()).map(([schoolName, count]) => ({ schoolName, count }));
    }

    if (Array.isArray(hist.schoolNames) && hist.schoolNames.length > 0) {
      return hist.schoolNames.map((name: string) => ({
        schoolName: name,
        count: Math.round((hist.totalRecipients || 0) / hist.schoolNames.length) || 1,
      }));
    }

    if (hist.schoolName) {
      const splitNames = hist.schoolName
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
      if (splitNames.length > 1) {
        return splitNames.map((name: string) => ({
          schoolName: name,
          count: Math.round((hist.totalRecipients || 0) / splitNames.length) || 1,
        }));
      }
      return [{ schoolName: hist.schoolName, count: hist.totalRecipients || 0 }];
    }

    return [{ schoolName: 'Assigned', count: hist.totalRecipients || 0 }];
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <span className="text-xs font-mono uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">Past Tests</span>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-0.5">Test History</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Records of all published tests with student completion and scores.
        </p>
      </div>

      {/* Action feedback banner */}
      {actionFeedback && (
        <div
          className={`p-4 rounded-xl text-sm font-medium flex items-center justify-between gap-3 ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-500/50 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/90 border border-rose-200 dark:border-rose-500/70 text-rose-800 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-xs underline opacity-80 hover:opacity-100 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter / Search bar */}
      <div className="p-3.5 sm:p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Total Tests:</span>
          <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 font-mono text-xs font-bold border border-indigo-200 dark:border-indigo-800">
            {historyList.length}
          </span>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search test name or school..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
      </div>

      {/* Assessment Cards List with Inline Expandable Drill-Down */}
      <div className="space-y-4 w-full">
        {filteredHistory.length > 0 ? (
          filteredHistory.map((hist) => {
            const isSelected = selectedPublishId === hist.publishId;
            const isPaused = hist.status === 'PAUSED' || hist.isPaused === true;
            const incompleteCount = (hist.totalRecipients || 0) - (hist.completedCount || 0);
            const schoolSummaries = getSchoolSummaries(hist);
            const activeDetail =
              detailsCache[hist.publishId] ||
              (selectedHistoryDetail &&
              (selectedHistoryDetail.publishId === hist.publishId || selectedHistoryDetail.id === hist.publishId)
                ? selectedHistoryDetail
                : null);
            const isLoadingCurrent = loadingPublishId === hist.publishId;
            const hasErrorCurrent = Boolean(detailError && detailError.publishId === hist.publishId);

            return (
              <div
                key={hist.id || hist.publishId}
                ref={(el) => {
                  if (el) cardRefs.current.set(hist.publishId, el);
                  else cardRefs.current.delete(hist.publishId);
                }}
                className={`assessment-card-wrapper rounded-xl border transition-all shadow-2xs ${
                  isSelected
                    ? 'bg-white dark:bg-slate-900 border-indigo-500 dark:border-indigo-500/80 shadow-md ring-1 ring-indigo-500/30 dark:ring-indigo-500/50 overflow-visible'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 overflow-hidden'
                }`}
              >
                {/* Clickable & Keyboard Accessible Card Summary */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isSelected}
                  aria-controls={`drilldown-${hist.publishId}`}
                  onClick={() => handleItemClick(hist.publishId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleItemClick(hist.publishId);
                    }
                  }}
                  className="p-4 sm:p-5 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between transition-colors gap-3.5 sm:gap-4 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-t-xl"
                >
                  <div className="flex items-start justify-between gap-3 w-full sm:w-auto">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <span className="text-[11px] px-2 py-0.5 rounded-md font-mono bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 font-medium">
                          {hist.publishMode}
                        </span>
                        {hist.publishMode === 'Selected Questions' && (hist.shuffle || hist.shuffleQuestions) && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-medium">
                            Shuffled
                          </span>
                        )}
                        {isPaused && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md font-mono bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-semibold uppercase tracking-wide flex items-center gap-1">
                            <Pause className="w-3 h-3" />
                            Paused
                          </span>
                        )}
                      </div>

                      <h4 className="font-semibold text-base text-slate-900 dark:text-white break-words">{hist.publishName}</h4>

                      {/* School-wise assigned student counts */}
                      <div className="space-y-0.5 pt-0.5">
                        {schoolSummaries.map((sc, scIdx) => (
                          <div key={scIdx} className="text-xs font-mono text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{sc.schoolName}</span>
                            <span className="text-slate-400 dark:text-slate-500">&mdash;</span>
                            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{sc.count} Assigned</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Mobile-only stats and chevron at top right of the card */}
                    <div className="sm:hidden flex items-center gap-2.5 shrink-0 text-right font-mono text-xs">
                      <div>
                        <span className="text-emerald-600 dark:text-emerald-400 block font-bold text-[11px]">
                          {hist.completedCount || 0} Done
                        </span>
                        <span className="text-rose-600 dark:text-rose-400 block text-[11px]">
                          {incompleteCount > 0 ? incompleteCount : 0} Left
                        </span>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${
                          isSelected ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {/* Desktop Right Side: Stats + Inline Action Buttons + Chevron */}
                  <div className="hidden sm:flex items-center gap-4 text-xs font-mono shrink-0">
                    <div className="text-right">
                      <span className="text-emerald-600 dark:text-emerald-400 block font-bold">
                        {hist.completedCount || 0} Completed
                      </span>
                      <span className="text-rose-600 dark:text-rose-400 block">
                        {incompleteCount > 0 ? incompleteCount : 0} Incomplete
                      </span>
                    </div>

                    {/* Action Area: Edit, Pause / Resume, Delete */}
                    <div
                      className="flex items-center gap-1.5 pl-3 border-l border-slate-200 dark:border-slate-800"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        title="Edit Test"
                        onClick={() => onEditAssessment && onEditAssessment(hist.publishId)}
                        className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        title={isPaused ? 'Resume Test' : 'Pause Test'}
                        onClick={() => {
                          if (isPaused) {
                            setResumeTarget(hist);
                          } else {
                            setPauseTarget(hist);
                          }
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border cursor-pointer ${
                          isPaused
                            ? 'bg-amber-50 dark:bg-amber-950/80 hover:bg-amber-100 dark:hover:bg-amber-900 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                            : 'bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950 text-slate-700 dark:text-slate-300 hover:text-amber-700 dark:hover:text-amber-400 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                        <span>{isPaused ? 'Resume' : 'Pause'}</span>
                      </button>

                      <button
                        type="button"
                        title="Delete Test"
                        onClick={() => setDeleteTarget(hist)}
                        className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>

                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${
                        isSelected ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
                      }`}
                    />
                  </div>

                  {/* Mobile-only Bottom Action Toolbar (Full width, clean buttons, touch-friendly) */}
                  <div
                    className="sm:hidden flex items-center gap-2 pt-2.5 border-t border-slate-200 dark:border-slate-800/80 w-full"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      title="Edit Test"
                      onClick={() => onEditAssessment && onEditAssessment(hist.publishId)}
                      className="flex-1 py-2 px-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      title={isPaused ? 'Resume Test' : 'Pause Test'}
                      onClick={() => {
                        if (isPaused) {
                          setResumeTarget(hist);
                        } else {
                          setPauseTarget(hist);
                        }
                      }}
                      className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border cursor-pointer ${
                        isPaused
                          ? 'bg-amber-50 dark:bg-amber-950/80 hover:bg-amber-100 dark:hover:bg-amber-900 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                          : 'bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950 text-slate-700 dark:text-slate-300 hover:text-amber-700 dark:hover:text-amber-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                      <span>{isPaused ? 'Resume' : 'Pause'}</span>
                    </button>

                    <button
                      type="button"
                      title="Delete Test"
                      onClick={() => setDeleteTarget(hist)}
                      className="flex-1 py-2 px-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* Inline Expanded Drill-Down Section Directly Below Clicked Card */}
                {isSelected && (
                  <div id={`drilldown-${hist.publishId}`}>
                    {isLoadingCurrent ? (
                      <HistoricalAuditLoadingSkeleton
                        publishName={hist.publishName}
                        publishMode={hist.publishMode}
                      />
                    ) : hasErrorCurrent ? (
                      <HistoricalAuditErrorView
                        publishName={hist.publishName}
                        errorMessage={detailError?.message}
                        onRetry={() => handleRetry(hist.publishId)}
                        onClose={() => setSelectedPublishId(null)}
                      />
                    ) : activeDetail ? (
                      <HistoricalAuditDrillDown
                        detail={activeDetail}
                        schools={schools}
                        onClose={() => setSelectedPublishId(null)}
                      />
                    ) : (
                      <HistoricalAuditLoadingSkeleton
                        publishName={hist.publishName}
                        publishMode={hist.publishMode}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="p-8 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 text-center py-12 shadow-2xs">
            <History className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
            <h4 className="text-base font-semibold text-slate-700 dark:text-slate-300">No published assessments found</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {historyList.length === 0
                ? 'Publish tests from the "Publish Assessment" section to see historical records here.'
                : 'No publish logs match the search query.'}
            </p>
          </div>
        )}
      </div>

      {/* 1. Pause Confirmation Modal */}
      {pauseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-amber-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto border border-amber-200 dark:border-transparent">
              <Pause className="w-6 h-6" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Pause Test</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Are you sure you want to pause{' '}
                <strong className="text-slate-900 dark:text-white font-semibold">{pauseTarget.publishName}</strong>?
              </p>
              <div className="text-xs text-amber-800 dark:text-amber-300/90 bg-amber-50 dark:bg-amber-950/60 p-3 rounded-xl border border-amber-200 dark:border-amber-800/80 leading-relaxed text-left space-y-1">
                <p>&bull; Test status will become <strong>PAUSED</strong>.</p>
                <p>&bull; Students will see <em>"Temporarily Paused"</em> and cannot start or take the test.</p>
                <p>&bull; All student progress and completed answers are kept safe.</p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setPauseTarget(null)}
                className="flex-1 py-2.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={handleConfirmPause}
                className="flex-1 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-2xs cursor-pointer transition-colors disabled:opacity-50"
              >
                {isActionLoading ? 'Pausing...' : 'Pause Test'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Resume Confirmation Modal */}
      {resumeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-emerald-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border border-emerald-200 dark:border-transparent">
              <Play className="w-6 h-6" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Resume Test</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Resume test{' '}
                <strong className="text-slate-900 dark:text-white font-semibold">{resumeTarget.publishName}</strong>?
              </p>
              <div className="text-xs text-emerald-800 dark:text-emerald-300/90 bg-emerald-50 dark:bg-emerald-950/60 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/80 leading-relaxed text-left space-y-1">
                <p>&bull; Test will become <strong>ACTIVE</strong> again.</p>
                <p>&bull; Students can now start or continue taking the test.</p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setResumeTarget(null)}
                className="flex-1 py-2.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={handleConfirmResume}
                className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs cursor-pointer transition-colors disabled:opacity-50"
              >
                {isActionLoading ? 'Resuming...' : 'Resume Test'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-rose-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto border border-rose-200 dark:border-transparent">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Delete Test</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Are you sure you want to delete{' '}
                <strong className="text-rose-600 dark:text-rose-300 font-semibold">{deleteTarget.publishName}</strong>?
              </p>
              <div className="text-xs text-rose-800 dark:text-rose-300/90 bg-rose-50 dark:bg-rose-950/60 p-3 rounded-xl border border-rose-200 dark:border-rose-800/80 leading-relaxed text-left space-y-1">
                <p>&bull; Deletes only this test and student records for it.</p>
                <p>&bull; Schools, students, and questions in the Question Bank will not be affected.</p>
                <p className="text-rose-600 dark:text-rose-400 font-semibold">&bull; This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-2xs cursor-pointer transition-colors disabled:opacity-50"
              >
                {isActionLoading ? 'Deleting...' : 'Yes, Delete Test'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
