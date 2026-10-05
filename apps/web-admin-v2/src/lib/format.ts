/**
 * Persian Formatting & Normalization Utilities
 */

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/**
 * Converts Latin / Arabic digits in a string or number to Persian digits
 */
export function toPersianDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  const str = String(input);
  return str.replace(/[0-9]/g, (w) => PERSIAN_DIGITS[+w] || w);
}

/**
 * Normalizes Persian and Arabic digits in user input to English (Latin) digits
 */
export function normalizeToLatinDigits(input: string): string {
  if (!input) return '';
  let res = input;
  for (let i = 0; i < 10; i++) {
    res = res.replace(new RegExp(PERSIAN_DIGITS[i]!, 'g'), String(i));
    res = res.replace(new RegExp(ARABIC_DIGITS[i]!, 'g'), String(i));
  }
  return res.trim();
}

/**
 * Formats a number with thousands separators in Persian
 */
export function formatNumber(num: number | string | null | undefined): string {
  if (num === null || num === undefined || isNaN(Number(num))) return '۰';
  return new Intl.NumberFormat('fa-IR').format(Number(num));
}

/**
 * Validates whether string is a valid Iranian mobile number
 */
export function isValidIranPhone(phone: string): boolean {
  const normalized = normalizeToLatinDigits(phone);
  return /^09\d{9}$/.test(normalized);
}

/**
 * Formats phone number for display: 0912 345 6789
 */
export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '—';
  const clean = normalizeToLatinDigits(phone);
  if (clean.length === 11 && clean.startsWith('09')) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7)}`;
  }
  return clean;
}

/**
 * Masks phone number for security: 0912***1234
 */
export function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '—';
  const clean = normalizeToLatinDigits(phone);
  if (clean.length === 11) {
    return `${clean.slice(0, 4)}***${clean.slice(7)}`;
  }
  return clean;
}

/**
 * Formats relative time in natural Persian
 */
export function formatRelativeTime(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return '—';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 45) return 'هم‌اکنون';
  if (diffSec < 90) return 'یک دقیقه پیش';
  if (diffSec < 3600) return `${toPersianDigits(Math.floor(diffSec / 60))} دقیقه پیش`;
  if (diffSec < 7200) return 'یک ساعت پیش';
  if (diffSec < 86400) return `${toPersianDigits(Math.floor(diffSec / 3600))} ساعت پیش`;
  if (diffSec < 172800) return 'دیروز';
  if (diffSec < 604800) return `${toPersianDigits(Math.floor(diffSec / 86400))} روز پیش`;
  
  // Older dates fallback to short Jalali date
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone: 'Asia/Tehran',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * Formats byte size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '۰ بایت';
  const k = 1024;
  const sizes = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${toPersianDigits(parseFloat((bytes / Math.pow(k, i)).toFixed(1)))} ${sizes[i]}`;
}
