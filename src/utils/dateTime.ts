/**
 * Date and Time utilities for 12-hour AM/PM and DD-MM-YYYY consistency
 */

/**
 * Converts any time string (24-hour "HH:mm" or existing 12-hour "hh:mm AM/PM")
 * into normalized 12-hour format "hh:mm AM/PM" with 2-digit padded hour.
 * Examples:
 * - "00:00" -> "12:00 AM"
 * - "00:01" -> "12:01 AM"
 * - "10:30" -> "10:30 AM"
 * - "11:59" -> "11:59 AM"
 * - "12:00" -> "12:00 PM"
 * - "12:01" -> "12:01 PM"
 * - "14:45" -> "02:45 PM"
 * - "23:59" -> "11:59 PM"
 * - "10:30 AM" -> "10:30 AM"
 * - "02:45 PM" -> "02:45 PM"
 */
export function to12Hour(timeStr?: string | null): string {
  if (!timeStr) return '12:00 AM';
  const trimmed = String(timeStr).trim();
  if (!trimmed) return '12:00 AM';

  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return trimmed;

  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const existingAmpm = match[3]?.toUpperCase();

  if (existingAmpm === 'AM' || existingAmpm === 'PM') {
    let normHours = hours;
    if (normHours === 0) normHours = 12;
    if (normHours > 12) {
      normHours = normHours % 12;
      if (normHours === 0) normHours = 12;
    }
    return `${String(normHours).padStart(2, '0')}:${minutes} ${existingAmpm}`;
  }

  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

/**
 * Converts any time string (12-hour "hh:mm AM/PM" or 24-hour "HH:mm")
 * into normalized 24-hour format "HH:mm" for accurate ISO comparison.
 * Examples:
 * - "12:00 AM" -> "00:00"
 * - "12:01 AM" -> "00:01"
 * - "10:30 AM" -> "10:30"
 * - "11:59 AM" -> "11:59"
 * - "12:00 PM" -> "12:00"
 * - "12:01 PM" -> "12:01"
 * - "02:45 PM" -> "14:45"
 * - "11:59 PM" -> "23:59"
 * - "00:00"    -> "00:00"
 * - "23:59"    -> "23:59"
 */
export function to24Hour(timeStr?: string | null): string {
  if (!timeStr) return '00:00';
  const trimmed = String(timeStr).trim();
  if (!trimmed) return '00:00';

  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!ampmMatch) return trimmed;

  let hours = parseInt(ampmMatch[1], 10);
  const minutes = ampmMatch[2];
  const ampm = ampmMatch[3]?.toUpperCase();

  if (ampm === 'PM') {
    if (hours < 12) hours += 12;
  } else if (ampm === 'AM') {
    if (hours === 12) hours = 0;
  }
  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

/**
 * Normalizes any date string (YYYY-MM-DD or DD-MM-YYYY) into ISO "YYYY-MM-DD"
 */
export function toISODate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const trimmed = String(dateStr).trim();
  const ymdMatch = trimmed.match(/^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  return trimmed;
}

/**
 * Returns current local date in "YYYY-MM-DD" format
 */
export function getLocalTodayDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns a future local date (default 7 days ahead) in "YYYY-MM-DD" format
 */
export function getLocalFutureDate(daysAhead: number = 7): string {
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns current local time in 12-hour AM/PM format (e.g. "11:11 AM")
 */
export function getLocalCurrentTime12H(): string {
  const d = new Date();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

/**
 * Format date string into "DD-MM-YYYY"
 * Handles "YYYY-MM-DD", "DD-MM-YYYY", etc.
 */
export function formatDateDDMMYYYY(dateStr?: string | null): string {
  if (!dateStr) return '';
  const trimmed = String(dateStr).trim();
  const ymdMatch = trimmed.match(/^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${day}-${month}-${year}`;
  }
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${day}-${month}-${year}`;
  }
  return trimmed;
}

/**
 * Format date and time into "DD-MM-YYYY hh:mm AM/PM"
 */
export function formatDateTime12H(dateStr?: string | null, timeStr?: string | null): string {
  const d = formatDateDDMMYYYY(dateStr);
  const t = to12Hour(timeStr);
  if (d && t) return `${d} ${t}`;
  if (d) return d;
  if (t) return t;
  return '';
}

/**
 * Format Test Availability Window:
 * e.g. "05-10-2026 10:00 AM → 12-10-2026 11:59 PM"
 */
export function formatAvailabilityWindow(
  startDate?: string | null,
  startTime?: string | null,
  endDate?: string | null,
  endTime?: string | null
): string {
  const sDate = formatDateDDMMYYYY(startDate);
  const sTime = to12Hour(startTime);
  const eDate = formatDateDDMMYYYY(endDate);
  const eTime = to12Hour(endTime);

  const startPart = [sDate, sTime].filter(Boolean).join(' ');
  const endPart = [eDate, eTime].filter(Boolean).join(' ');

  if (startPart && endPart) {
    return `${startPart} → ${endPart}`;
  }
  if (startPart) return startPart;
  if (endPart) return endPart;
  return 'Not configured';
}

/**
 * Deconstructs any time string into 12-hour components:
 * { hour: "01"-"12", minute: "00"-"59", period: "AM" | "PM" }
 */
export function parse12HourComponents(timeStr?: string | null): {
  hour: string;
  minute: string;
  period: 'AM' | 'PM';
} {
  const normalized = to12Hour(timeStr);
  const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    return {
      hour: match[1].padStart(2, '0'),
      minute: match[2],
      period: match[3].toUpperCase() as 'AM' | 'PM',
    };
  }
  return {
    hour: '12',
    minute: '00',
    period: 'AM',
  };
}

/**
 * Checks if currentISO time is strictly in the future compared to startISO,
 * accounting for a small grace window (default 2 minutes) to prevent false-rejections
 * from sub-minute clock skew or immediate-start boundary clicks.
 */
export function isScheduledForFuture(currentISO?: string | null, startISO?: string | null, graceMinutes = 2): boolean {
  if (!currentISO || !startISO) return false;
  const matchCurr = String(currentISO).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  const matchStart = String(startISO).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!matchCurr || !matchStart) return currentISO < startISO;
  const currMs = Date.UTC(Number(matchCurr[1]), Number(matchCurr[2]) - 1, Number(matchCurr[3]), Number(matchCurr[4]), Number(matchCurr[5]));
  const startMs = Date.UTC(Number(matchStart[1]), Number(matchStart[2]) - 1, Number(matchStart[3]), Number(matchStart[4]), Number(matchStart[5]));
  return currMs < (startMs - graceMinutes * 60 * 1000);
}

/**
 * Checks if currentISO time is strictly expired compared to endISO,
 * with optional grace window (default 1 minute).
 */
export function isAssessmentExpired(currentISO?: string | null, endISO?: string | null, graceMinutes = 1): boolean {
  if (!currentISO || !endISO) return false;
  const matchCurr = String(currentISO).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  const matchEnd = String(endISO).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!matchCurr || !matchEnd) return currentISO > endISO;
  const currMs = Date.UTC(Number(matchCurr[1]), Number(matchCurr[2]) - 1, Number(matchCurr[3]), Number(matchCurr[4]), Number(matchCurr[5]));
  const endMs = Date.UTC(Number(matchEnd[1]), Number(matchEnd[2]) - 1, Number(matchEnd[3]), Number(matchEnd[4]), Number(matchEnd[5]));
  return currMs > (endMs + graceMinutes * 60 * 1000);
}
