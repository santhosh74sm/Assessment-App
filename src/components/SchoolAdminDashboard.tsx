import { School, ShieldCheck, CheckCircle2, User } from 'lucide-react';
import { ProfileMenu } from './ProfileMenu';

interface SchoolAdminDashboardProps {
  user: any;
  onLogout: () => void;
}

export function SchoolAdminDashboard({ user, onLogout }: SchoolAdminDashboardProps) {
  const schoolName = user.schoolName || 'Assigned Institution';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased">
      {/* Top Navbar */}
      <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs font-bold shrink-0">
            <School className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white tracking-tight">
              School Administration Portal
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              Academic Institution Console
            </p>
          </div>
        </div>

        <ProfileMenu user={user} onLogout={onLogout} />
      </header>

      {/* Main Educational Workspace */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 sm:p-6 md:p-8 space-y-6">
        {/* School Hero Banner */}
        <div className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center shadow-xs shrink-0">
              <School className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-medium mb-1">
                <span>Educational Institution</span>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verified School
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {schoolName}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Authorized administrative portal for student assessment tracking and school participation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-mono">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-600 dark:text-slate-400">Admin:</span>
            <span className="font-semibold text-slate-900 dark:text-white">{user.username}</span>
          </div>
        </div>

        {/* 3-Column Scope & Institutional Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Status</span>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Active
              </span>
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Enrolled & Active</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              School credentials and students are synchronized with the central assessment system.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Security</span>
              <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Isolated
              </span>
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Tenant Isolation</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Assessment results and student rosters are cryptographically isolated to this school.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">System Role</span>
              <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">school_admin</span>
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">School Administrator</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Central Super Admins schedule assessments and publish scores directly for your students.
            </p>
          </div>
        </div>

        {/* Quiet Notice */}
        <div className="p-4 rounded-xl bg-slate-100/90 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            For student registration updates or custom assessment schedule requests, please coordinate with your platform Super Administrator.
          </p>
        </div>
      </main>
    </div>
  );
}
