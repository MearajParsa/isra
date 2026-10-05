/**
 * Jalali (Persian) Date & Calendar Utility
 * Exact astronomical-arithmetic conversion between Gregorian and Solar Hijri (Jalali)
 * All calculations respect Asia/Tehran timezone and Persian business week (Saturday -> Friday)
 */

export interface JalaliDate {
  jy: number; // Jalali Year (e.g. 1405)
  jm: number; // Jalali Month (1..12)
  jd: number; // Jalali Day (1..31)
}

export interface GregorianDate {
  gy: number;
  gm: number;
  gd: number;
}

export const PERSIAN_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

export const PERSIAN_WEEKDAY_NAMES = [
  { short: 'ش', full: 'شنبه', index: 0 },
  { short: 'ی', full: 'یک‌شنبه', index: 1 },
  { short: 'د', full: 'دوشنبه', index: 2 },
  { short: 'س', full: 'سه‌شنبه', index: 3 },
  { short: 'چ', full: 'چهارشنبه', index: 4 },
  { short: 'پ', full: 'پنج‌شنبه', index: 5 },
  { short: 'ج', full: 'جمعه', index: 6 },
] as const;

/**
 * Checks if a Jalali year is leap (کبیسه)
 */
export function isJalaliLeapYear(jy: number): boolean {
  return [1, 5, 9, 13, 17, 22, 26, 30].includes(jy % 33);
}

/**
 * Returns total days in a given Jalali month
 */
export function getDaysInJalaliMonth(jy: number, jm: number): number {
  if (jm >= 1 && jm <= 6) return 31;
  if (jm >= 7 && jm <= 11) return 30;
  return isJalaliLeapYear(jy) ? 30 : 29;
}

/**
 * Converts Gregorian date to Jalali
 */
export function gregorianToJalali(gy: number, gm: number, gd: number): JalaliDate {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1]!;
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm: number;
  let jd: number;
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }
  return { jy, jm, jd };
}

/**
 * Converts Jalali date to Gregorian
 */
export function jalaliToGregorian(jy: number, jm: number, jd: number): GregorianDate {
  let jyNorm = jy + 1595;
  let days = -355668 + 365 * jyNorm + Math.floor(jyNorm / 33) * 8 + Math.floor(((jyNorm % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 0; gm < 13; gm++) {
    const v = sal_a[gm]!;
    if (gd <= v) break;
    gd -= v;
  }
  return { gy, gm, gd };
}

/**
 * Format a Date or ISO string into a Jalali representation
 */
export function formatJalaliDate(dateInput: Date | string | null | undefined, format: 'short' | 'medium' | 'full' | 'time' = 'medium'): string {
  if (!dateInput) return '—';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '—';

  // Format with Intl Persian calendar in Tehran timezone
  try {
    if (format === 'time') {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        timeZone: 'Asia/Tehran',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    }

    if (format === 'short') {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        timeZone: 'Asia/Tehran',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    }

    if (format === 'full') {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        timeZone: 'Asia/Tehran',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    }

    // Default medium: e.g. "۱۴ آبان ۱۴۰۴، ۱۰:۳۰"
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    const j = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
  }
}

/**
 * Pad numbers with leading zero
 */
export function padZero(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

/**
 * Formats a Gregorian Date to API format "YYYY-MM-DD"
 */
export function toApiDateString(date: Date): string {
  const y = date.getFullYear();
  const m = padZero(date.getMonth() + 1);
  const d = padZero(date.getDate());
  return `${y}-${m}-${d}`;
}

/**
 * Returns start and end of business week (Saturday to Friday) containing given date
 */
export function getPersianWeekRange(refDate = new Date()): { from: Date; to: Date } {
  const date = new Date(refDate);
  // Saturday in JS getDay() is 6. Sunday is 0.
  // Persian week day offset: Sat=0, Sun=1, Mon=2, Tue=3, Wed=4, Thu=5, Fri=6
  const jsDay = date.getDay();
  const diffToSaturday = (jsDay + 1) % 7;

  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - diffToSaturday);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  return { from: startOfWeek, to: endOfWeek };
}
