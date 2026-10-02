import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { safeEqualStr } from '../common/crypto';
import type { IsraRequest } from '../common/request-context';
import { ENV, type Env } from '../config/env';

const MAX_FAILS = 10;
const WINDOW_MS = 60_000;

/**
 * احراز سرویس‌به‌سرویس: secret مشترک با مقایسهٔ زمان‌ثابت.
 * روی هاست‌های بدون شبکهٔ خصوصی (cPanel) این مسیرها روی دامنهٔ عمومی هم قابل دسترسی‌اند؛ پس:
 *  - secret باید ≥۳۲ نویسه و تصادفی باشد (env fail-fast)
 *  - تلاش ناموفق per IP محدود می‌شود (۱۰ در دقیقه ⇒ 429) تا حدس‌زدن ممکن نباشد
 *  - اختیاری: `INTERNAL_ALLOWED_IPS` فقط IPهای مجاز را می‌پذیرد (مثلاً IP خود سرور)
 */
@Injectable()
export class InternalGuard implements CanActivate {
  private readonly fails = new Map<string, { n: number; start: number }>();

  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(c: ExecutionContext): boolean {
    const req = c.switchToHttp().getRequest<IsraRequest>();
    const ip = (req.ip ?? '').replace(/^::ffff:/, '');
    const allow = this.env.INTERNAL_ALLOWED_IPS;
    if (allow.length && !allow.includes(ip)) throw new AppError('AUTH_FORBIDDEN');

    const now = Date.now();
    const f = this.fails.get(ip);
    if (f && now - f.start < WINDOW_MS && f.n >= MAX_FAILS) throw new AppError('RATE_LIMITED', { details: { retryAfterSec: Math.ceil((f.start + WINDOW_MS - now) / 1000) } });

    const t = req.header('x-internal-token');
    if (!t || t.length > 256 || !safeEqualStr(t, this.env.INTERNAL_SHARED_SECRET)) {
      if (this.fails.size > 10_000) this.fails.clear();
      this.fails.set(ip, f && now - f.start < WINDOW_MS ? { n: f.n + 1, start: f.start } : { n: 1, start: now });
      throw new AppError('AUTH_REQUIRED');
    }
    return true;
  }
}
