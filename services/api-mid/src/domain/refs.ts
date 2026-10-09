import { createHash } from 'node:crypto';
import { bufToUuid, uuidToBuf } from '../common/ids';

/** فضای نام ثابت UUIDv5 برای ref‌های قطعی mid (docs-v2/30 §۱.۲) — تغییرش refهای قبلی را بی‌اعتبار می‌کند */
const NS = uuidToBuf('8f2b7c4e-1d3a-5e6f-9a0b-7c1d2e3f4a5b');

/** UUIDv5 (RFC 4122، SHA-1) از یک نام در فضای نام mid */
export function uuidv5(name: string): string {
  const h = createHash('sha1').update(NS).update(name, 'utf8').digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x50;
  b[8] = (b[8]! & 0x3f) | 0x80;
  return bufToUuid(b);
}

/**
 * ref قطعی امتیاز حضور: نخستین اعطا `attendance:{occ}:{user}`؛ ثبت دوباره پس از لغو ⇒ `attendance:{occ}:{user}:{n}` (n ≥ ۲).
 * یکتایی دفتر (user_id, reason, ref_id) ⇒ هر ref حداکثر یک +۵ و یک attendance_reversal ⇒ خالص per نوبت ≤ +۵.
 */
export const attendanceRef = (occurrenceId: string, userId: string, n = 1): string =>
  uuidv5(n <= 1 ? `attendance:${occurrenceId}:${userId}` : `attendance:${occurrenceId}:${userId}:${n}`);

/** شناسهٔ نشان‌های قدیمی (fallback پیش از رسیدن کاتالوگ high) از کلید — قطعی تا مهاجرت/نگاشت دوباره ممکن باشد */
export const legacyBadgeId = (key: string): string => uuidv5(`badge:${key}`);

/**
 * ۱.۷.۰ (docs-v2/31 §۳): معیارهای ثابت قبلی (صوت/لحن/تجوید، سقف ۱۰) با شناسه‌های **ثابت seed high**
 * (هماهنگ با api-high: کاتالوگ نسخهٔ ۱). snapshot ارزیابی‌های قدیمی و کاتالوگ پیش‌فرض mid (پیش از نخستین رویداد
 * evaluation.criteria.changed) همین شناسه‌ها را دارند.
 */
const LEGACY_CRITERION_IDS: Readonly<Record<string, string>> = {
  voice: '00000000-0000-7000-8000-000000000001',
  tone: '00000000-0000-7000-8000-000000000002',
  tajweed: '00000000-0000-7000-8000-000000000003'
};
export const legacyCriterionId = (key: string): string => {
  const id = LEGACY_CRITERION_IDS[key];
  if (!id) throw new Error(`legacy criterion ${key} ناشناخته است`);
  return id;
};
export const LEGACY_CRITERIA = [
  { key: 'voice', title: 'صوت', weight: 40, maxScore: 10, sortOrder: 10 },
  { key: 'tone', title: 'لحن', weight: 30, maxScore: 10, sortOrder: 20 },
  { key: 'tajweed', title: 'تجوید', weight: 30, maxScore: 10, sortOrder: 30 }
] as const;
