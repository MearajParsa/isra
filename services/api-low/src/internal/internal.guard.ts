import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../common/app-error';
import { safeEqualStr } from '../common/crypto';
import type { IsraRequest } from '../common/request-context';
import { ENV, type Env } from '../config/env';
import { ACCEPTED_CALLERS, CALLERS_KEY, HEADER_CALLER, HEADER_TOKEN, type Peer, isPeer, peerSecret } from './internal-auth';

const MAX_FAILS = 10;
const WINDOW_MS = 60_000;

/**
 * احراز سرویس‌به‌سرویس: secret جداگانهٔ هر جفت‌سرویس + هویت فرستنده (`X-Internal-Caller`) با مقایسهٔ زمان‌ثابت.
 * روی هاست‌های بدون شبکهٔ خصوصی (cPanel) این مسیرها روی دامنهٔ عمومی هم قابل دسترسی‌اند؛ پس:
 *  - هر جفت secret مستقل دارد (≥۳۲ نویسه، تصادفی؛ مقدار نمونه در production رد می‌شود)
 *  - تلاش ناموفق per IP محدود می‌شود (۱۰ در دقیقه ⇒ 429) تا حدس‌زدن ممکن نباشد
 *  - ACL مسیر/رویداد per فرستنده (`@InternalCallers`، `assertEventAllowed`)
 *  - اختیاری: `INTERNAL_ALLOWED_IPS` فقط IPهای مجاز را می‌پذیرد (مثلاً IP خود سرور)
 */
@Injectable()
export class InternalGuard implements CanActivate {
  private readonly fails = new Map<string, { n: number; start: number }>();

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly reflector: Reflector
  ) {}

  canActivate(c: ExecutionContext): boolean {
    const req = c.switchToHttp().getRequest<IsraRequest>();
    const ip = (req.ip ?? '').replace(/^::ffff:/, '');
    const allow = this.env.INTERNAL_ALLOWED_IPS;
    if (allow.length && !allow.includes(ip)) throw new AppError('AUTH_FORBIDDEN');

    const now = Date.now();
    const f = this.fails.get(ip);
    if (f && now - f.start < WINDOW_MS && f.n >= MAX_FAILS) throw new AppError('RATE_LIMITED', { details: { retryAfterSec: Math.ceil((f.start + WINDOW_MS - now) / 1000) } });

    const caller = req.header(HEADER_CALLER.toLowerCase());
    const token = req.header(HEADER_TOKEN.toLowerCase());
    const secret = isPeer(caller) && ACCEPTED_CALLERS.includes(caller) ? peerSecret(this.env, caller) : undefined;
    if (!secret || !token || token.length > 256 || !safeEqualStr(token, secret)) {
      if (this.fails.size > 10_000) this.fails.clear();
      this.fails.set(ip, f && now - f.start < WINDOW_MS ? { n: f.n + 1, start: f.start } : { n: 1, start: now });
      throw new AppError('AUTH_REQUIRED');
    }
    req.internalCaller = caller as Peer;

    const only = this.reflector.get<Peer[] | undefined>(CALLERS_KEY, c.getHandler());
    if (only && !only.includes(req.internalCaller)) throw new AppError('AUTH_FORBIDDEN');
    return true;
  }
}
