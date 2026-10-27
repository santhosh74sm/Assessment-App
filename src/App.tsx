/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { Layers, Shield, User, Lock, Eye, EyeOff, AlertCircle, ArrowRight, Sun, Moon, Monitor, CheckCircle2, Compass, Home } from 'lucide-react';
import { ThemeProvider, useTheme } from './context/ThemeContext';

// Lazy-loaded dashboards for code splitting & initial bundle optimization (PERF-LOW-01)
const SuperAdminDashboard = lazy(() =>
  import('./components/SuperAdminDashboard.tsx').then((m) => ({ default: m.SuperAdminDashboard }))
);
const SchoolAdminDashboard = lazy(() =>
  import('./components/SchoolAdminDashboard.tsx').then((m) => ({ default: m.SchoolAdminDashboard }))
);
const StudentPortal = lazy(() =>
  import('./components/StudentPortal.tsx').then((m) => ({ default: m.StudentPortal }))
);
const ForcePasswordModal = lazy(() =>
  import('./components/ForcePasswordModal.tsx').then((m) => ({ default: m.ForcePasswordModal }))
);

function DashboardLoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-900 dark:text-white">
      <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs mb-3">
        <Layers className="w-5 h-5 animate-pulse text-white" />
      </div>
      <p className="text-xs font-medium text-slate-600 dark:text-slate-400 font-mono tracking-wider">
        Loading workspace...
      </p>
    </div>
  );
}

function isValidFrontendRoute(pathname: string): boolean {
  if (!pathname) return true;
  // Normalize consecutive slashes (e.g. "//..." or "///...")
  const normalized = pathname.replace(/\/+/g, '/').toLowerCase();
  return normalized === '/' || normalized === '/index.html';
}

function NotFoundView({ onNavigateHome }: { onNavigateHome: () => void }) {
  const { theme, setTheme } = useTheme();
  const [countdown, setCountdown] = useState(8);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onNavigateHome();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onNavigateHome]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-center items-center p-4 relative antialiased">
      {/* Theme Switcher in Top Right */}
      <div className="absolute top-4 right-4 z-20 flex items-center p-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <button
          type="button"
          onClick={() => setTheme('light')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            theme === 'light'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
          title="Light"
          aria-label="Light theme"
        >
          <Sun className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Light</span>
        </button>
        <button
          type="button"
          onClick={() => setTheme('dark')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            theme === 'dark'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
          title="Dark"
          aria-label="Dark theme"
        >
          <Moon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Dark</span>
        </button>
        <button
          type="button"
          onClick={() => setTheme('system')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            theme === 'system'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
          title="System"
          aria-label="System theme"
        >
          <Monitor className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">System</span>
        </button>
      </div>

      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 flex items-center justify-center mx-auto shadow-xs">
          <Compass className="w-8 h-8 animate-spin" style={{ animationDuration: '12s' }} />
        </div>

        <div className="space-y-2">
          <span className="inline-block px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-400 font-mono text-xs font-bold tracking-wider uppercase">
            Error 404
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Page Not Found
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Sorry, the page you’re looking for could not be found.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <button
            type="button"
            onClick={onNavigateHome}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm transition-all shadow-md hover:shadow-indigo-500/25 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Return to Application Home</span>
          </button>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Automatically redirecting to home in <span className="font-mono font-medium text-slate-600 dark:text-slate-300">{countdown}s</span>...
          </p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)puzzles_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function AppContent() {
  const { theme, setTheme } = useTheme();
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  // SEC-05: In-memory token only (never persisted to localStorage)
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isSessionChecking, setIsSessionChecking] = useState(true);

  // Track browser history changes to handle back/forward navigation accurately
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigateHome = () => {
    window.history.replaceState(null, '', '/');
    setCurrentPath('/');
  };

  // Login & Setup form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginFormKey, setLoginFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);

  // Forgot Password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/setup-status')
      .then((res) => res.json())
      .then((data) => {
        if (!data.hasUsers) {
          setSetupMode(true);
        }
      })
      .catch((err) => console.error('Setup check failed:', err))
      .finally(() => setCheckingSetup(false));
  }, []);

  // SEC-05: Restore session on initial load via HttpOnly cookie and handle refresh
  useEffect(() => {
    // Purge any legacy localStorage token
    try {
      localStorage.removeItem('puzzles_token');
    } catch (_) {}

    // Verify session via secure HttpOnly cookie
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(async (res) => {
        if (res.ok) {
          const fresh = await res.json();
          setCurrentUser(fresh);
          if (fresh.token) setToken(fresh.token);
        } else if (res.status === 401) {
          // Attempt automatic access-token refresh via HttpOnly refresh cookie
          try {
            const refreshRes = await fetch('/api/auth/refresh', {
              method: 'POST',
              credentials: 'same-origin',
            });
            if (refreshRes.ok) {
              const refreshData = await refreshRes.json();
              setCurrentUser(refreshData.user);
              if (refreshData.token) setToken(refreshData.token);
            } else {
              setCurrentUser(null);
              setToken(null);
            }
          } catch (_) {
            setCurrentUser(null);
            setToken(null);
          }
        } else {
          setCurrentUser(null);
          setToken(null);
        }
      })
      .catch(() => {
        setCurrentUser(null);
        setToken(null);
      })
      .finally(() => setIsSessionChecking(false));
  }, []);

  const handleLoginOrSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = setupMode ? '/api/auth/setup-first-admin' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Username or password is incorrect.');
      }

      // SEC-05: In-memory session state only
      setToken(data.token);
      setCurrentUser(data.user);
      try {
        localStorage.removeItem('puzzles_token');
        localStorage.setItem('puzzles_user', JSON.stringify(data.user));
      } catch (_) {}

      // Reset login form fields completely
      setUsername('');
      setPassword('');
      setShowPassword(false);
      setError(null);
      setLoginFormKey((k) => k + 1);
    } catch (err: any) {
      const msg = err.message || '';
      if (
        msg.toLowerCase().includes('authentication') ||
        msg.toLowerCase().includes('credential') ||
        msg.toLowerCase().includes('invalid username') ||
        msg.toLowerCase().includes('failed to fetch')
      ) {
        setError('Username or password is incorrect.');
      } else {
        setError(msg || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setForgotMessage(null);

    const trimmed = forgotUsername.trim();
    if (!trimmed) {
      setForgotError('Please enter your Username or Student ID');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit reset request.');
      }
      setForgotMessage(
        data.message ||
          'Please contact your Super Admin. The Super Admin will provide you with a temporary password. Use the temporary password to log in and create a new password.'
      );
    } catch (err: any) {
      setForgotError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleLogout = async () => {
    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    try {
      if (currentUser?.role === 'student') {
        await fetch('/api/student/logout', {
          method: 'POST',
          credentials: 'same-origin',
          headers,
        });
      }
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers,
      });
    } catch (e) {
      console.error('Logout error', e);
    }

    setToken(null);
    setCurrentUser(null);
    try {
      localStorage.removeItem('puzzles_token');
      localStorage.removeItem('puzzles_user');
    } catch (_) {}

    // Fully reset and clear login form state after logout
    setUsername('');
    setPassword('');
    setShowPassword(false);
    setError(null);
    setLoginFormKey((k) => k + 1);
  };

  const handlePasswordChangeComplete = () => {
    if (currentUser) {
      const updated = { ...currentUser, mustChangePassword: false };
      setCurrentUser(updated);
      try {
        localStorage.setItem('puzzles_user', JSON.stringify(updated));
      } catch (_) {}
    }
  };

  // Unknown/invalid frontend URL guard:
  // Disallows rendering dashboards or the login form on arbitrary, unresolved URL paths.
  if (!isValidFrontendRoute(currentPath)) {
    return <NotFoundView onNavigateHome={handleNavigateHome} />;
  }

  // Initial session check loading state
  if (isSessionChecking && !currentUser) {
    return <DashboardLoadingFallback />;
  }

  // If user is authenticated
  if (currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
        <Suspense fallback={<DashboardLoadingFallback />}>
          {/* Force Password Change Modal if first login */}
          {currentUser.mustChangePassword && (
            <ForcePasswordModal
              username={currentUser.username}
              token={token}
              onSuccess={handlePasswordChangeComplete}
            />
          )}

          {/* Role-based dashboard */}
          {currentUser.role === 'super_admin' && (
            <SuperAdminDashboard token={token || ''} currentUser={currentUser} onLogout={handleLogout} />
          )}

          {currentUser.role === 'school_admin' && (
            <SchoolAdminDashboard user={currentUser} onLogout={handleLogout} />
          )}

          {currentUser.role === 'student' && (
            <StudentPortal token={token || ''} user={currentUser} onLogout={handleLogout} />
          )}
        </Suspense>
      </div>
    );
  }

  // Login Screen
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-center items-center p-4 relative antialiased">
      {/* Theme Switcher in Top Right of Login Page */}
      <div className="absolute top-4 right-4 z-20 flex items-center p-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <button
          type="button"
          onClick={() => setTheme('light')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            theme === 'light'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
          title="Light"
          aria-label="Light theme"
        >
          <Sun className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Light</span>
        </button>
        <button
          type="button"
          onClick={() => setTheme('dark')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            theme === 'dark'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
          title="Dark"
          aria-label="Dark theme"
        >
          <Moon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Dark</span>
        </button>
        <button
          type="button"
          onClick={() => setTheme('system')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            theme === 'system'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
          title="System"
          aria-label="System theme"
        >
          <Monitor className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">System</span>
        </button>
      </div>

      <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-7 sm:p-8 shadow-sm space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            {setupMode ? <Shield className="w-6 h-6" /> : <Layers className="w-6 h-6" />}
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              {setupMode
                ? 'Create Administrator Account'
                : showForgotPassword
                ? 'Reset Your Password'
                : 'School Assessment Portal'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {setupMode
                ? 'Initialize the primary administrator account for your educational workspace.'
                : showForgotPassword
                ? 'Enter your Username or Student ID to initiate a password recovery request.'
                : 'Sign in with your student credentials or administrative account.'}
            </p>
          </div>
        </div>

        {setupMode && (
          <div
            role="status"
            aria-live="polite"
            className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2"
          >
            <Shield className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>First-time setup mode active: Configure your master credentials.</span>
          </div>
        )}

        {showForgotPassword ? (
          /* Forgot Password View */
          <div className="space-y-4">
            {forgotError && (
              <div
                role="alert"
                aria-live="assertive"
                className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{forgotError}</span>
              </div>
            )}

            {forgotMessage ? (
              <div className="space-y-4">
                <div
                  role="status"
                  aria-live="polite"
                  className="p-4 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-left space-y-2"
                >
                  <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-semibold text-xs">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <span>Request Submitted</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {forgotMessage}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setForgotMessage(null);
                    setForgotError(null);
                  }}
                  className="w-full py-2.5 rounded-xl font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs transition-colors cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-4" autoComplete="off">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Username / Student ID
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      value={forgotUsername}
                      onChange={(e) => setForgotUsername(e.target.value)}
                      placeholder="e.g. STU-10B-1574 or admin"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full py-2.5 px-4 rounded-lg font-semibold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <span>{forgotLoading ? 'Submitting request...' : 'Submit Request'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-white" />
                </button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setForgotError(null);
                      setForgotMessage(null);
                    }}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* Normal Sign In Form */
          <>
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <form key={loginFormKey} onSubmit={handleLoginOrSetup} className="space-y-4" autoComplete="off">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {setupMode ? 'Admin Username' : 'Username or Student ID'}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={setupMode ? 'e.g. admin' : 'Username or Student ID'}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={setupMode ? 'Choose a secure password' : 'Enter your password'}
                    className="w-full pl-9 pr-10 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 focus:outline-none cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {!setupMode && (
                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(true);
                      setForgotError(null);
                      setForgotMessage(null);
                      setForgotUsername('');
                    }}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || checkingSetup}
                className="w-full py-2.5 px-4 rounded-lg font-semibold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs sm:text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-xs login-submit-btn"
              >
                <span className="login-submit-text">
                  {loading ? 'Authenticating...' : setupMode ? 'Create Administrator Account' : 'Sign In'}
                </span>
                <ArrowRight className="w-4 h-4 text-white" />
              </button>
            </form>
          </>
        )}
      </div>

      {/* Quiet Footer */}
      <footer className="mt-8 text-center text-xs text-slate-400 dark:text-slate-600 font-mono">
        Educational Puzzles & Assessment Engine &bull; Secure Multi-Role Portal
      </footer>
    </div>
  );
}
