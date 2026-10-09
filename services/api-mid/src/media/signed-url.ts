import { createHmac } from 'node:crypto';
import { safeEqual } from '../common/crypto';

/** اعتبار نشانی امضاشدهٔ رسانه (docs-v2/31 §۴): ۱۰ دقیقه */
export const SIGNED_URL_TTL_SEC = 600;
/** تحمل اختلاف ساعت برای exp آینده (نشانی با exp بیش از TTL+این مقدار جعلی/نامعتبر است) */
const FUTURE_SKEW_SEC = 60;
const SIG_RE = /^[A-Za-z0-9_-]{43}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** sig = base64url(HMAC-SHA256(secret, `METHOD|path|exp|u`)) — path بدون query */
export function mediaSignature(secret: Buffer, method: string, path: string, exp: number, userId: string): string {
  return createHmac('sha256', secret).update(`${method.toUpperCase()}|${path}|${exp}|${userId}`).digest('base64url');
}

/** مسیر نسبی امضاشده: `{path}?exp=..&u=..&sig=..` */
export function signMediaPath(secret: Buffer, path: string, userId: string, nowSec: number, ttlSec = SIGNED_URL_TTL_SEC): string {
  const exp = nowSec + ttlSec;
  return `${path}?exp=${exp}&u=${encodeURIComponent(userId)}&sig=${mediaSignature(secret, 'GET', path, exp, userId)}`;
}

/**
 * بررسی امضا (مقایسهٔ زمان‌ثابت). نامعتبر/منقضی/بیش از حد آینده ⇒ false.
 * امضا فقط جایگزین احراز است؛ دسترسی کاربر `u` را فراخوان دوباره بررسی می‌کند.
 */
export function verifyMediaSignature(secret: Buffer, method: string, path: string, q: { exp?: unknown; u?: unknown; sig?: unknown }, nowSec: number): string | null {
  const exp = typeof q.exp === 'number' ? q.exp : typeof q.exp === 'string' && /^\d{1,12}$/.test(q.exp) ? Number(q.exp) : NaN;
  const u = q.u;
  const sig = q.sig;
  if (!Number.isSafeInteger(exp) || typeof u !== 'string' || !UUID_RE.test(u) || typeof sig !== 'string' || !SIG_RE.test(sig)) return null;
  const expected = Buffer.from(mediaSignature(secret, method, path, exp, u));
  const ok = safeEqual(Buffer.from(sig), expected);
  if (!ok) return null;
  if (exp <= nowSec || exp > nowSec + SIGNED_URL_TTL_SEC + FUTURE_SKEW_SEC) return null;
  return u.toLowerCase();
}
