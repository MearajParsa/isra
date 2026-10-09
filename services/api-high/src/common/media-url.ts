import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { Clock } from './clock';
import { hmac256, randomToken, safeEqualStr } from './crypto';
import { endpoint, fullPath } from './ep';

/** docs-v2/31 §۴: اعتبار URL امضاشده (ثانیه) */
export const MEDIA_URL_TTL_SEC = 600;
/** تحمل اختلاف ساعت برای exp آینده (امضای معتبر هرگز بیش از TTL جلوتر صادر نمی‌شود) */
const SKEW_SEC = 60;
const SIG_RE = /^[A-Za-z0-9_-]{43}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** مسیر H-117 برای یک آیتم (بدون query) */
export function contentPath(sessionId: string, galleryId: string, itemId: string): string {
  return fullPath(endpoint('H-117')).replace(':id', encodeURIComponent(sessionId)).replace(':galleryId', encodeURIComponent(galleryId)).replace(':itemId', encodeURIComponent(itemId));
}

/**
 * URL امضاشدهٔ محتوای رسانه (auth `bearerOrSignedUrl`): مرورگر در `<img>`/`<audio>` هدر Authorization نمی‌فرستد.
 * sig = base64url(HMAC-SHA256(MEDIA_URL_SECRET, `METHOD|path|exp|u`)) — path بدون query؛ userId (`u`) درون امضا مقید است.
 * امضا فقط جایگزین **احراز** است؛ مجوز کاربر `u` در guard دوباره از DB بررسی می‌شود.
 * production بدون MEDIA_URL_SECRET اصلاً بالا نمی‌آید (env fail-fast)؛ توسعه/تست ⇒ کلید تصادفی per فرایند.
 */
@Injectable()
export class MediaUrlSigner {
  private readonly key: string;

  constructor(
    @Inject(ENV) env: Env,
    private readonly clock: Clock
  ) {
    this.key = env.MEDIA_URL_SECRET ?? randomToken(32);
  }

  private sig(method: string, path: string, exp: number, userId: string): string {
    return hmac256(this.key, `${method.toUpperCase()}|${path}|${exp}|${userId}`).toString('base64url');
  }

  /** مسیر نسبی امضاشده: `{path}?exp=…&u=…&sig=…` */
  sign(path: string, userId: string, method = 'GET'): string {
    const exp = Math.floor(this.clock.now().getTime() / 1000) + MEDIA_URL_TTL_SEC;
    return `${path}?exp=${exp}&u=${encodeURIComponent(userId)}&sig=${this.sig(method, path, exp, userId)}`;
  }

  /** امضای معتبر و منقضی‌نشده ⇒ userId؛ وگرنه null (مقایسهٔ زمان‌ثابت؛ ورودی بدشکل پیش از HMAC رد می‌شود) */
  verify(method: string, path: string, q: { exp?: unknown; u?: unknown; sig?: unknown }): string | null {
    const { exp, u, sig } = q;
    if (typeof exp !== 'string' || typeof u !== 'string' || typeof sig !== 'string') return null;
    if (!/^\d{1,12}$/.test(exp) || !ID_RE.test(u) || !SIG_RE.test(sig)) return null;
    const e = Number(exp);
    const now = Math.floor(this.clock.now().getTime() / 1000);
    const valid = safeEqualStr(sig, this.sig(method, path, e, u));
    if (!valid || e < now || e > now + MEDIA_URL_TTL_SEC + SKEW_SEC) return null;
    return u.toLowerCase();
  }
}
