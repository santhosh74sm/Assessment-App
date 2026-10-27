// Utility for CSRF token retrieval and request header synchronization

let inMemoryCsrfToken: string | null = null;

/**
 * Set and synchronize the CSRF token in memory and in document.cookie.
 */
export function setCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
  if (typeof document !== 'undefined' && token) {
    const current = getCookieCsrfToken();
    if (!current || current !== token) {
      document.cookie = `puzzles_csrf_token=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
    }
  }
}

/**
 * Read the CSRF token directly from document.cookie (Double-Submit pattern).
 */
export function getCookieCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)puzzles_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Get the active CSRF token, prioritizing document.cookie and falling back to in-memory.
 */
export function getCsrfToken(): string | null {
  const cookieVal = getCookieCsrfToken();
  if (cookieVal) {
    inMemoryCsrfToken = cookieVal;
    return cookieVal;
  }
  return inMemoryCsrfToken;
}

/**
 * Construct standard headers for API requests including Content-Type,
 * Authorization (if token provided), and X-CSRF-Token (if available).
 */
export function getAuthHeaders(
  token?: string | null,
  extraHeaders?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const csrf = getCsrfToken();
  if (csrf) {
    headers['X-CSRF-Token'] = csrf;
  }

  return headers;
}
