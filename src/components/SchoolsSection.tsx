import React, { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  UserPlus,
  ShieldCheck,
  Search,
  CheckCircle,
  Key,
  GraduationCap,
  Edit,
  Trash2,
  X,
  AlertTriangle,
  Eye,
  KeyRound,
  Copy,
  Check,
} from 'lucide-react';
import { StudentReportDetailView } from './StudentReportDetailView.tsx';

interface SchoolsSectionProps {
  token: string;
  schools: any[];
  onRefreshSchools: () => Promise<void>;
}

export function SchoolsSection({ token, schools, onRefreshSchools }: SchoolsSectionProps) {
  // New school form
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolCode, setNewSchoolCode] = useState('');
  const [isSubmittingSchool, setIsSubmittingSchool] = useState(false);

  // New student form
  const [studentForm, setStudentForm] = useState({
    schoolId: '',
    studentName: '',
    className: '',
    section: '',
    schoolAdmissionNumber: '',
  });
  const [isSubmittingStudent, setIsSubmittingStudent] = useState(false);

  // Results & alerts
  const [createdAdminResult, setCreatedAdminResult] = useState<any | null>(null);
  const [createdStudentResult, setCreatedStudentResult] = useState<any | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Selected school for student list drilldown
  const [activeSchoolId, setActiveSchoolId] = useState<string>(schools.length > 0 ? schools[0].id : '');
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [adminsList, setAdminsList] = useState<any[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [loadingData, setLoadingData] = useState(false);

  // Student Edit state
  const [editingStudent, setEditingStudent] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    studentName: '',
    schoolAdmissionNumber: '',
    className: 'Class 7',
    section: 'A',
  });
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Student Delete confirmation state
  const [deletingStudent, setDeletingStudent] = useState<any | null>(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  // School Admin Delete confirmation state
  const [deletingAdmin, setDeletingAdmin] = useState<any | null>(null);
  const [isSubmittingDeleteAdmin, setIsSubmittingDeleteAdmin] = useState(false);

  // School Workspace Delete confirmation state
  const [deletingSchool, setDeletingSchool] = useState<any | null>(null);
  const [isSubmittingDeleteSchool, setIsSubmittingDeleteSchool] = useState(false);

  // Student Report detail view state
  const [viewingReportStudent, setViewingReportStudent] = useState<any | null>(null);

  // Super Admin Reset Password modal state
  const [resettingUser, setResettingUser] = useState<any | null>(null);
  const [generatedTempPassword, setGeneratedTempPassword] = useState<string | null>(null);
  const [isGeneratingPassword, setIsGeneratingPassword] = useState(false);
  const [copiedTempPassword, setCopiedTempPassword] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);

  // Alphabetically sorted schools (A -> Z, case-insensitive)
  const sortedSchools = [...schools].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
  );

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    if (sortedSchools.length > 0 && !activeSchoolId) {
      setActiveSchoolId(sortedSchools[0].id);
    }
  }, [schools]);

  // Load students & admins for active school
  const loadSchoolDetails = async (schoolId: string) => {
    if (!schoolId) return;
    setLoadingData(true);
    try {
      const [resStudents, resAdmins] = await Promise.all([
        fetch(`/api/students?schoolId=${schoolId}`, { headers }),
        fetch(`/api/schools/${schoolId}/admins`, { headers }),
      ]);
      const dataStu = await resStudents.json();
      const dataAdm = await resAdmins.json();
      const listStu = Array.isArray(dataStu) ? dataStu : [];
      const sortedStu = [...listStu].sort((a, b) =>
        (a.studentName || '').localeCompare(b.studentName || '', undefined, { numeric: true, sensitivity: 'base' })
      );
      setStudentsList(sortedStu);
      setAdminsList(Array.isArray(dataAdm) ? dataAdm : []);
    } catch (err) {
      console.error('Failed to fetch school details', err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (activeSchoolId) {
      setClassFilter('');
      setSectionFilter('');
      loadSchoolDetails(activeSchoolId);
    }
  }, [activeSchoolId]);

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchoolName.trim() || !newSchoolCode.trim()) return;
    setIsSubmittingSchool(true);
    setFeedbackMessage(null);
    try {
      const res = await fetch('/api/schools', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: newSchoolName.trim(), code: newSchoolCode.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewSchoolName('');
        setNewSchoolCode('');
        setFeedbackMessage({ type: 'success', text: `School "${data.name}" added successfully.` });
        await onRefreshSchools();
        setActiveSchoolId(data.id);
        setStudentForm((prev) => ({ ...prev, schoolId: data.id }));
      } else {
        setFeedbackMessage({ type: 'error', text: data.error || 'Unable to add school. Please try again.' });
      }
    } catch (e: any) {
      setFeedbackMessage({ type: 'error', text: e.message || 'Unable to add school. Please try again.' });
    } finally {
      setIsSubmittingSchool(false);
    }
  };

  const handleCreateSchoolAdmin = async (schoolId: string) => {
    try {
      const res = await fetch(`/api/schools/${schoolId}/admins`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        setCreatedAdminResult(data);
        loadSchoolDetails(schoolId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentForm.schoolId) {
      setFeedbackMessage({ type: 'error', text: 'Please select a school.' });
      return;
    }
    if (!studentForm.className) {
      setFeedbackMessage({ type: 'error', text: 'Please select a class.' });
      return;
    }
    if (!studentForm.section.trim()) {
      setFeedbackMessage({ type: 'error', text: 'Please enter a section.' });
      return;
    }
    setIsSubmittingStudent(true);
    setFeedbackMessage(null);
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...studentForm,
          section: studentForm.section.trim().toUpperCase(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreatedStudentResult(data);
        const registeredSchoolId = studentForm.schoolId;
        setStudentForm({
          schoolId: '',
          studentName: '',
          className: '',
          section: '',
          schoolAdmissionNumber: '',
        });
        if (registeredSchoolId === activeSchoolId) {
          loadSchoolDetails(activeSchoolId);
        }
      } else {
        setFeedbackMessage({ type: 'error', text: data.error || 'Unable to add student. Please try again.' });
      }
    } catch (e: any) {
      setFeedbackMessage({ type: 'error', text: e.message || 'Unable to add student. Please try again.' });
    } finally {
      setIsSubmittingStudent(false);
    }
  };

  const handleStartEdit = (student: any) => {
    setEditingStudent(student);
    setEditForm({
      studentName: student.studentName || '',
      schoolAdmissionNumber: student.schoolAdmissionNumber || '',
      className: student.className || 'Class 7',
      section: (student.section || '').toUpperCase(),
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setIsSubmittingEdit(true);
    setFeedbackMessage(null);
    try {
      const studentId = editingStudent.id || editingStudent.uniqueStudentId;
      const res = await fetch(`/api/students/${studentId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          studentName: editForm.studentName.trim(),
          schoolAdmissionNumber: editForm.schoolAdmissionNumber.trim(),
          className: editForm.className.trim(),
          section: editForm.section.trim().toUpperCase(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackMessage({ type: 'success', text: `Student "${data.student?.studentName || editForm.studentName}" updated successfully.` });
        setEditingStudent(null);
        if (data.student && viewingReportStudent && (
          viewingReportStudent.id === studentId ||
          viewingReportStudent._id === studentId ||
          viewingReportStudent.uniqueStudentId === studentId ||
          viewingReportStudent.uniqueStudentId === data.student.uniqueStudentId
        )) {
          setViewingReportStudent((prev: any) => ({ ...prev, ...data.student }));
        }
        if (activeSchoolId) {
          await loadSchoolDetails(activeSchoolId);
        }
      } else {
        setFeedbackMessage({ type: 'error', text: data.error || 'Unable to update student. Please try again.' });
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Unable to update student. Please try again.' });
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingStudent) return;
    setIsSubmittingDelete(true);
    setFeedbackMessage(null);
    try {
      const studentId = deletingStudent.id || deletingStudent.uniqueStudentId;
      const res = await fetch(`/api/students/${studentId}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackMessage({ type: 'success', text: data.message || `Student deleted successfully.` });
        setDeletingStudent(null);
        if (activeSchoolId) {
          await loadSchoolDetails(activeSchoolId);
        }
      } else {
        setFeedbackMessage({ type: 'error', text: data.error || 'Unable to delete student. Please try again.' });
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Unable to delete student. Please try again.' });
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  const handleConfirmDeleteAdmin = async () => {
    if (!deletingAdmin || !activeSchoolId) return;
    setIsSubmittingDeleteAdmin(true);
    setFeedbackMessage(null);
    try {
      const adminId = deletingAdmin.id || deletingAdmin.username;
      const res = await fetch(`/api/schools/${activeSchoolId}/admins/${adminId}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackMessage({ type: 'success', text: data.message || `School admin deleted successfully.` });
        setDeletingAdmin(null);
        await loadSchoolDetails(activeSchoolId);
      } else {
        setFeedbackMessage({ type: 'error', text: data.error || 'Unable to delete school admin. Please try again.' });
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Unable to delete school admin. Please try again.' });
    } finally {
      setIsSubmittingDeleteAdmin(false);
    }
  };

  const handleConfirmDeleteSchool = async () => {
    if (!deletingSchool) return;
    setIsSubmittingDeleteSchool(true);
    setFeedbackMessage(null);
    try {
      const schoolId = deletingSchool.id || deletingSchool._id;
      const res = await fetch(`/api/schools/${schoolId}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackMessage({
          type: 'success',
          text: data.message || `School "${deletingSchool.name}" deleted successfully. Past test records have been saved.`,
        });
        const deletedId = schoolId;
        setDeletingSchool(null);
        await onRefreshSchools();
        if (activeSchoolId === deletedId) {
          const remaining = sortedSchools.filter((s) => s.id !== deletedId);
          setActiveSchoolId(remaining.length > 0 ? remaining[0].id : '');
        }
      } else {
        setFeedbackMessage({ type: 'error', text: data.error || 'Unable to delete school. Please try again.' });
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Unable to delete school. Please try again.' });
    } finally {
      setIsSubmittingDeleteSchool(false);
    }
  };

  const handleOpenResetPassword = async (userObj: any) => {
    setResettingUser(userObj);
    setGeneratedTempPassword(null);
    setResetPasswordError(null);
    setCopiedTempPassword(false);
    setIsGeneratingPassword(true);

    try {
      const res = await fetch('/api/super-admin/reset-password', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId: userObj.id || userObj._id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate temporary password');
      }
      setGeneratedTempPassword(data.temporaryPassword);
      // Refresh list to update status if needed
      await loadSchoolDetails(activeSchoolId);
    } catch (err: any) {
      setResetPasswordError(err.message || 'Unable to generate temporary password');
    } finally {
      setIsGeneratingPassword(false);
    }
  };

  const handleCopyPassword = () => {
    if (!generatedTempPassword) return;
    navigator.clipboard.writeText(generatedTempPassword);
    setCopiedTempPassword(true);
    setTimeout(() => setCopiedTempPassword(false), 2000);
  };

  const [rosterVisibleCount, setRosterVisibleCount] = useState(50);

  // Dynamically load available classes from actual MongoDB Atlas student records
  // Show ONLY the classes that actually have at least one student in the current student data
  const availableRosterClasses = React.useMemo(() => {
    return Array.from(
      new Set(
        studentsList
          .map((s) => s.className)
          .filter((cls): cls is string => typeof cls === 'string' && cls.trim().length > 0)
          .map((cls) => cls.trim())
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [studentsList]);

  // Dynamically load available sections from the actual sections present in the current school's students
  const availableRosterSections = React.useMemo(() => {
    return Array.from(
      new Set(
        (classFilter
          ? studentsList.filter((s) => s.className === classFilter)
          : studentsList
        )
          .map((s) => s.section)
          .filter((sec): sec is string => typeof sec === 'string' && sec.trim().length > 0)
          .map((sec) => sec.trim().toUpperCase())
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [studentsList, classFilter]);

  useEffect(() => {
    if (classFilter && availableRosterClasses.length > 0 && !availableRosterClasses.includes(classFilter)) {
      setClassFilter('');
    }
  }, [availableRosterClasses, classFilter]);

  const filteredStudents = React.useMemo(() => {
    const qLower = studentSearch.trim().toLowerCase();
    const secUpper = sectionFilter.trim().toUpperCase();
    return studentsList
      .filter((s) => {
        const matchesSearch =
          !qLower ||
          (s.studentName && s.studentName.toLowerCase().includes(qLower)) ||
          (s.schoolAdmissionNumber && s.schoolAdmissionNumber.toLowerCase().includes(qLower)) ||
          (s.uniqueStudentId && s.uniqueStudentId.toLowerCase().includes(qLower));
        const matchesClass = !classFilter || s.className === classFilter;
        const matchesSection =
          !sectionFilter ||
          (s.section && s.section.trim().toUpperCase() === secUpper);
        return matchesSearch && matchesClass && matchesSection;
      })
      .sort((a, b) =>
        (a.studentName || '').localeCompare(b.studentName || '', undefined, { numeric: true, sensitivity: 'base' })
      );
  }, [studentsList, studentSearch, classFilter, sectionFilter]);

  const activeSchool = React.useMemo(() => {
    return schools.find((s) => s.id === activeSchoolId);
  }, [schools, activeSchoolId]);

  // If viewing an individual student's report & timeline
  if (viewingReportStudent) {
    return (
      <StudentReportDetailView
        token={token}
        studentId={viewingReportStudent.id || viewingReportStudent._id || viewingReportStudent.uniqueStudentId}
        student={viewingReportStudent}
        schoolName={activeSchool?.name || viewingReportStudent.schoolName}
        onBack={() => setViewingReportStudent(null)}
      />
    );
  }

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Header */}
      <div>
        <span className="text-xs font-mono uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">Schools & Students</span>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-0.5">Schools & Students</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Add schools, create school admin logins, add students, and view student lists.
        </p>
      </div>

      {feedbackMessage && (
        <div
          role={feedbackMessage.type === 'error' ? 'alert' : 'status'}
          aria-live={feedbackMessage.type === 'error' ? 'assertive' : 'polite'}
          className={`p-4 rounded-xl text-sm font-medium flex items-center justify-between ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-500/50 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-500/50 text-rose-800 dark:text-rose-300'
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button onClick={() => setFeedbackMessage(null)} className="text-xs underline opacity-80 hover:opacity-100 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Admin Credential Banner */}
      {createdAdminResult && (
        <div
          role="status"
          aria-live="polite"
          className="p-5 rounded-2xl bg-indigo-50/90 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-500/60 shadow-xs space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-indigo-700 dark:text-indigo-400 font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              School Admin Login Created
            </span>
            <button
              onClick={() => setCreatedAdminResult(null)}
              className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
            >
              &times; Close
            </button>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            School: <strong className="text-slate-900 dark:text-white">{createdAdminResult.schoolName}</strong>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-white dark:bg-slate-900/90 border border-indigo-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 block font-mono">Username</span>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 font-mono select-all">
                {createdAdminResult.username}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-slate-900/90 border border-indigo-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 block font-mono">Temporary Password</span>
              <span className="text-sm font-bold text-amber-700 dark:text-amber-400 font-mono select-all">
                {createdAdminResult.initialPassword}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 italic">
            * The school admin must choose a new password when they first sign in.
          </p>
        </div>
      )}

      {/* Student Credential Banner */}
      {createdStudentResult && (
        <div
          role="status"
          aria-live="polite"
          className="p-5 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-500/60 shadow-xs space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Student Added Successfully
            </span>
            <button
              onClick={() => setCreatedStudentResult(null)}
              className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
            >
              &times; Close
            </button>
          </div>
          <div className="text-sm text-slate-700 dark:text-slate-200">
            Student: <strong className="text-slate-900 dark:text-white">{createdStudentResult.student?.studentName}</strong> (
            {createdStudentResult.student?.className} - {createdStudentResult.student?.section})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-white dark:bg-slate-900/90 border border-emerald-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 block font-mono">Student ID</span>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 font-mono select-all">
                {createdStudentResult.credentials?.username}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-slate-900/90 border border-emerald-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 block font-mono">Temporary Password</span>
              <span className="text-sm font-bold text-amber-700 dark:text-amber-400 font-mono select-all">
                {createdStudentResult.credentials?.initialPassword}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 italic">
            * The student will use this password to sign in and will be asked to choose a new one.
          </p>
        </div>
      )}

      {/* Top Grid: Create School & Active Schools list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create School Form */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Add School
          </h3>
          <form onSubmit={handleCreateSchool} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                School Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Green Valley Public School"
                value={newSchoolName}
                onChange={(e) => setNewSchoolName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                School Short Code
              </label>
              <input
                type="text"
                required
                placeholder="e.g. GVPS"
                value={newSchoolCode}
                onChange={(e) => setNewSchoolCode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none uppercase font-mono"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Short code used at the start of admin and student IDs (e.g. GVPS).</p>
            </div>
            <button
              type="submit"
              disabled={isSubmittingSchool}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isSubmittingSchool ? 'Adding School...' : '+ Add School'}
            </button>
          </form>
        </div>

        {/* Active School Workspaces List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Schools ({schools.length})</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">Select a school to view its students below</span>
          </div>

          {sortedSchools.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[320px] overflow-y-auto pr-1">
              {sortedSchools.map((sch) => {
                const isSelected = activeSchoolId === sch.id;
                return (
                  <div
                    key={sch.id}
                    onClick={() => setActiveSchoolId(sch.id)}
                    className={`p-5 rounded-2xl border flex flex-col justify-between cursor-pointer transition-all ${
                      isSelected
                        ? 'selected-school-card bg-indigo-50 border-indigo-500 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500 dark:bg-indigo-950/40 dark:border-indigo-500'
                        : 'bg-white border-slate-200 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono font-bold dark:bg-indigo-950 dark:text-indigo-400 dark:border-indigo-800/60">
                          {sch.code}
                        </span>
                        {isSelected ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-600 text-white font-medium">
                            Selected
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">School</span>
                        )}
                      </div>
                      <h4 className="font-bold text-base mt-2 text-slate-900 dark:text-white">{sch.name}</h4>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {sch.createdAt ? new Date(sch.createdAt).toLocaleDateString() : 'Active'}
                      </span>
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          title="Add School Admin"
                          onClick={() => handleCreateSchoolAdmin(sch.id)}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-indigo-300 dark:border-slate-700/60 font-medium transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Key className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                          <span>+ Admin</span>
                        </button>
                        <button
                          type="button"
                          title="Delete School"
                          onClick={() => setDeletingSchool(sch)}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-rose-300 hover:border-rose-400 dark:bg-slate-800 dark:hover:bg-rose-600 dark:hover:text-white dark:text-rose-400 dark:border-slate-700/60 font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                          <span className="text-rose-700 dark:text-rose-400 font-semibold">Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 text-center py-12 shadow-xs">
              <Building2 className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
              <h4 className="text-base font-semibold text-slate-800 dark:text-slate-300">No schools added yet</h4>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1 max-w-sm mx-auto">
                Use the form on the left to add your first school.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Student Registration Form */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          Add Student
        </h3>
        <form onSubmit={handleCreateStudent} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
              Select School
            </label>
            <select
              value={studentForm.schoolId}
              onChange={(e) => setStudentForm({ ...studentForm, schoolId: e.target.value })}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
            >
              <option value="">-- Select School --</option>
              {sortedSchools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
              Student Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Sophia Martinez"
              value={studentForm.studentName}
              onChange={(e) => setStudentForm({ ...studentForm, studentName: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
              Admission Number
            </label>
            <input
              type="text"
              required
              placeholder="e.g. ADM-2026-99"
              value={studentForm.schoolAdmissionNumber}
              onChange={(e) =>
                setStudentForm({ ...studentForm, schoolAdmissionNumber: e.target.value })
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
              Class
            </label>
            <select
              value={studentForm.className}
              onChange={(e) => setStudentForm({ ...studentForm, className: e.target.value })}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
            >
              <option value="">-- Select Class --</option>
              <option value="Class 1">Class 1</option>
              <option value="Class 2">Class 2</option>
              <option value="Class 3">Class 3</option>
              <option value="Class 4">Class 4</option>
              <option value="Class 5">Class 5</option>
              <option value="Class 6">Class 6</option>
              <option value="Class 7">Class 7</option>
              <option value="Class 8">Class 8</option>
              <option value="Class 9">Class 9</option>
              <option value="Class 10">Class 10</option>
              <option value="Class 11">Class 11</option>
              <option value="Class 12">Class 12</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
              Section
            </label>
            <input
              type="text"
              required
              placeholder="e.g. A, B, AB"
              value={studentForm.section}
              onChange={(e) =>
                setStudentForm({ ...studentForm, section: e.target.value.toUpperCase() })
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none uppercase font-mono transition-colors"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-4 flex items-end">
            <button
              type="submit"
              disabled={isSubmittingStudent || schools.length === 0}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isSubmittingStudent ? 'Adding Student...' : '+ Add Student'}
            </button>
          </div>
        </form>
      </div>

      {/* School Detail View: School Admins & Registered Students */}
      {activeSchool ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{activeSchool.name}</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                  {activeSchool.code}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {adminsList.length} Admins &bull; {studentsList.length} Students
              </p>
            </div>
            <button
              onClick={() => handleCreateSchoolAdmin(activeSchool.id)}
              className="text-xs px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-all flex items-center gap-1.5 w-fit shadow-xs cursor-pointer"
            >
              <Key className="w-3.5 h-3.5 text-white" />
              + Add School Admin
            </button>
          </div>

          {/* School Admins section */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                School Admins ({adminsList.length})
              </h4>
              <span className="text-xs text-slate-500 dark:text-slate-400">Admin logins for this school</span>
            </div>

            {adminsList.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {adminsList.map((adm) => (
                  <div key={adm.id} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/60 text-xs space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">{adm.username}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[10px]">
                          {adm.passwordResetRequested
                            ? 'Reset Requested'
                            : adm.mustChangePassword
                            ? 'Needs Password Change'
                            : 'Active'}
                        </span>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                        Created: {adm.createdAt ? new Date(adm.createdAt).toLocaleDateString() : 'Recently'}
                      </p>
                      {adm.passwordResetRequested && (
                        <div className="mt-1.5 p-1 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-[10px] text-amber-800 dark:text-amber-300 flex items-center gap-1 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                          <span>Password reset requested</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700/50 flex items-center justify-between gap-1.5">
                      {adm.passwordResetRequested ? (
                        <button
                          type="button"
                          onClick={() => handleOpenResetPassword(adm)}
                          className="px-2 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 hover:text-amber-900 border border-amber-300 dark:bg-amber-950/80 dark:hover:bg-amber-900 dark:text-amber-300 dark:border-amber-700/70 text-xs font-semibold flex items-center gap-1 transition-all shadow-xs cursor-pointer"
                          title="Reset Password"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>Reset Password</span>
                        </button>
                      ) : (
                        <div />
                      )}
                      <button
                        type="button"
                        onClick={() => setDeletingAdmin(adm)}
                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-rose-300 hover:border-rose-400 dark:bg-slate-800 dark:hover:bg-rose-600/30 dark:text-rose-400 dark:border-slate-700 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                        title="Delete School Admin"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                        <span className="text-rose-700 dark:text-rose-400 font-semibold">Delete Admin</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No admin logins created yet. Click "+ Add School Admin" above.</p>
            )}
          </div>

          {/* Students Roster Section with Search & Filter */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Students ({filteredStudents.length} of {studentsList.length})
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">All students in {activeSchool.name}</p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Search by name, ID, or admission..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none w-52"
                  />
                </div>

                <select
                  value={classFilter}
                  onChange={(e) => {
                    setClassFilter(e.target.value);
                    setSectionFilter('');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none cursor-pointer"
                >
                  <option value="">All Classes</option>
                  {availableRosterClasses.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>

                <select
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none cursor-pointer"
                >
                  <option value="">All Sections</option>
                  {availableRosterSections.map((sec) => (
                    <option key={sec} value={sec}>
                      Section {sec}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loadingData ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 font-mono">Loading students...</div>
            ) : filteredStudents.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                        <th className="py-2.5 px-3">Student Name</th>
                        <th className="py-2.5 px-3">Student ID</th>
                        <th className="py-2.5 px-3">Admission Number</th>
                        <th className="py-2.5 px-3">Class & Section</th>
                        <th className="py-2.5 px-3">Password</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {filteredStudents.slice(0, rosterVisibleCount).map((stu) => (
                        <tr key={stu.id || stu.uniqueStudentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-200 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">{stu.studentName}</td>
                          <td className="py-2.5 px-3 font-mono text-indigo-600 dark:text-indigo-400 font-bold">{stu.uniqueStudentId}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">{stu.schoolAdmissionNumber}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 font-mono">
                              {stu.className} - {stu.section}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {stu.passwordResetRequested ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800/80 font-bold inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                                Reset Requested
                              </span>
                            ) : (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                                  stu.mustChangePassword
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800/60'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800/60'
                                }`}
                              >
                                {stu.mustChangePassword ? 'Temporary' : 'Set'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {stu.passwordResetRequested && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenResetPassword(stu)}
                                  className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 hover:text-amber-900 border border-amber-300 dark:bg-amber-950/80 dark:hover:bg-amber-900 dark:text-amber-300 dark:border-amber-700/70 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                                  title="Reset Password"
                                >
                                  <KeyRound className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                  <span>Reset Password</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setViewingReportStudent(stu)}
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 border border-indigo-200 dark:bg-indigo-950/80 dark:hover:bg-indigo-900 dark:text-indigo-300 dark:hover:text-white dark:border-indigo-700/70 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                                title="View Report"
                              >
                                <Eye className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                <span>View Report</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStartEdit(stu)}
                                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-slate-400 dark:bg-slate-800 dark:hover:bg-indigo-600/30 dark:text-slate-300 dark:hover:text-indigo-400 dark:border-slate-700 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                                title="Edit Student"
                                aria-label="Edit Student"
                              >
                                <Edit className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingStudent(stu)}
                                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-300 hover:border-rose-400 dark:bg-slate-800 dark:hover:bg-rose-600/30 dark:text-slate-300 dark:hover:text-rose-400 dark:border-slate-700 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                                title="Delete Student"
                                aria-label="Delete Student"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filteredStudents.length > rosterVisibleCount && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      Showing {rosterVisibleCount} of {filteredStudents.length} students
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRosterVisibleCount((prev) => prev + 50)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold border border-indigo-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-indigo-400 dark:border-slate-700 transition-all cursor-pointer"
                      >
                        + Show More ({filteredStudents.length - rosterVisibleCount} left)
                      </button>
                      <button
                        type="button"
                        onClick={() => setRosterVisibleCount(filteredStudents.length)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white dark:border-slate-700 transition-all cursor-pointer"
                      >
                        Show All
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-8 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 text-center py-8">
                <Users className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
                <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300">No students found</h5>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {studentsList.length === 0
                    ? 'No students added to this school yet. Use the form above to add students.'
                    : 'No students match your search or filter.'}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Edit Student Modal */}
      {editingStudent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-edit-student-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-900 dark:text-white">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-500/20">
                  <Edit className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="modal-edit-student-title" className="font-semibold text-slate-900 dark:text-white text-base">Edit Student</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    Student ID: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{editingStudent.uniqueStudentId}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingStudent(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Student Name
                </label>
                <input
                  type="text"
                  required
                  value={editForm.studentName}
                  onChange={(e) => setEditForm({ ...editForm, studentName: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. John Doe"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Admission Number
                </label>
                <input
                  type="text"
                  required
                  value={editForm.schoolAdmissionNumber}
                  onChange={(e) => setEditForm({ ...editForm, schoolAdmissionNumber: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                  placeholder="e.g. ADM-2026-001"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                    Class
                  </label>
                  <select
                    value={editForm.className}
                    onChange={(e) => setEditForm({ ...editForm, className: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                  >
                    <option value="Class 1">Class 1</option>
                    <option value="Class 2">Class 2</option>
                    <option value="Class 3">Class 3</option>
                    <option value="Class 4">Class 4</option>
                    <option value="Class 5">Class 5</option>
                    <option value="Class 6">Class 6</option>
                    <option value="Class 7">Class 7</option>
                    <option value="Class 8">Class 8</option>
                    <option value="Class 9">Class 9</option>
                    <option value="Class 10">Class 10</option>
                    <option value="Class 11">Class 11</option>
                    <option value="Class 12">Class 12</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                    Section
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. A, B, AB"
                    value={editForm.section}
                    onChange={(e) =>
                      setEditForm({ ...editForm, section: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none uppercase font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-xs font-semibold text-white transition-colors shadow-xs cursor-pointer"
                >
                  {isSubmittingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingStudent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-delete-student-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm"
        >
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/40 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 text-slate-900 dark:text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-200 dark:border-rose-500/20 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 id="modal-delete-student-title" className="text-base font-semibold text-slate-900 dark:text-white">Delete Student</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Please confirm</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to delete this student?
            </p>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div><span className="text-slate-500 dark:text-slate-400">Name:</span> <span className="font-semibold text-slate-900 dark:text-white">{deletingStudent.studentName}</span></div>
              <div><span className="text-slate-500 dark:text-slate-400">Student ID:</span> <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{deletingStudent.uniqueStudentId}</span></div>
              <div><span className="text-slate-500 dark:text-slate-400">Class & Section:</span> <span className="text-slate-800 dark:text-slate-200">{deletingStudent.className} - {deletingStudent.section}</span></div>
              <div><span className="text-slate-500 dark:text-slate-400">Admission Number:</span> <span className="font-mono text-slate-700 dark:text-slate-300">{deletingStudent.schoolAdmissionNumber}</span></div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeletingStudent(null)}
                disabled={isSubmittingDelete}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isSubmittingDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-xs font-semibold text-white transition-colors shadow-xs cursor-pointer"
              >
                {isSubmittingDelete ? 'Deleting...' : 'Yes, Delete Student'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete School Admin Confirmation Modal */}
      {deletingAdmin && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-delete-admin-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm"
        >
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/40 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 text-slate-900 dark:text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-200 dark:border-rose-500/20 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 id="modal-delete-admin-title" className="text-base font-semibold text-slate-900 dark:text-white">Delete School Admin</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Please confirm</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
              Are you sure you want to delete this school admin?
            </p>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Admin Username:</span>{' '}
                <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{deletingAdmin.username}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">School:</span>{' '}
                <span className="text-slate-800 dark:text-slate-200">{activeSchool?.name || deletingAdmin.schoolName}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Role:</span>{' '}
                <span className="font-mono text-slate-700 dark:text-slate-300">school_admin</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              This admin will no longer be able to log in. Students, tests, and records will not be affected.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeletingAdmin(null)}
                disabled={isSubmittingDeleteAdmin}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAdmin}
                disabled={isSubmittingDeleteAdmin}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-xs font-semibold text-white transition-colors shadow-xs cursor-pointer"
              >
                {isSubmittingDeleteAdmin ? 'Deleting...' : 'Yes, Delete School Admin'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete School Workspace Confirmation Modal */}
      {deletingSchool && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-delete-school-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm"
        >
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 text-slate-900 dark:text-white">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-200 dark:border-rose-500/20 shrink-0">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h3 id="modal-delete-school-title" className="text-base font-bold text-slate-900 dark:text-white">Delete School</h3>
                <p className="text-xs text-rose-600 dark:text-rose-400/90 font-medium">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to delete{' '}
              <strong className="text-slate-900 dark:text-white font-semibold">{deletingSchool.name}</strong> ({deletingSchool.code})?
            </p>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
              <div className="font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                The following will be deleted:
              </div>
              <ul className="list-disc list-inside text-slate-700 dark:text-slate-300 space-y-1 pl-1 text-[11px] font-mono">
                <li>School ({deletingSchool.name})</li>
                <li>All admin accounts for this school</li>
                <li>All student accounts and logins for this school</li>
                <li>Unstarted tests for this school</li>
              </ul>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                Completed Test Records:
              </div>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-200/90 leading-relaxed">
                All <strong>completed tests, answers, scores, and past reports</strong> are kept safely for your records.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingSchool(null)}
                disabled={isSubmittingDeleteSchool}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSchool}
                disabled={isSubmittingDeleteSchool}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-xs font-semibold text-white transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isSubmittingDeleteSchool ? 'Deleting School...' : 'Yes, Delete School'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Super Admin Reset Password Modal */}
      {resettingUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-reset-password-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-500/30 shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="modal-reset-password-title" className="text-base font-bold text-slate-900 dark:text-white">Reset Password</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {resettingUser.studentName ? `${resettingUser.studentName} (${resettingUser.uniqueStudentId})` : resettingUser.username}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResettingUser(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isGeneratingPassword ? (
              <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Generating secure temporary password...
              </div>
            ) : resetPasswordError ? (
              <div className="space-y-4">
                <div
                  role="alert"
                  aria-live="assertive"
                  className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs"
                >
                  {resetPasswordError}
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenResetPassword(resettingUser)}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : generatedTempPassword ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Generated Temporary Password
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-3 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 font-mono text-base font-bold text-slate-900 dark:text-white tracking-wider select-all">
                      {generatedTempPassword}
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyPassword}
                      className="px-3.5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer shrink-0"
                      title="Copy temporary password"
                    >
                      {copiedTempPassword ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-300" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  <p>
                    Share this temporary password with the user. The user will be required to create a new password upon logging in.
                  </p>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setResettingUser(null)}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
