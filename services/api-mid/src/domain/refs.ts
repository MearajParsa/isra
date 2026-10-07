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
