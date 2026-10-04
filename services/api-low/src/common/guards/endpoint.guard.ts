import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { HEADERS, type EndpointDef, type RateLimit } from '@isra/api-types';
import { AuthService } from '../../auth/auth.service';
import { readRefreshCookie } from '../../auth/cookie';
import { SessionService } from '../../auth/session.service';
import { SessionStatusCache } from '../../auth/session-status.cache';
import { FlagsService } from '../../system/flags.service';
import { TokenService } from '../../auth/token.service';
import { ENV, type Env } from '../../config/env';
import { INTERNAL_KEY } from '../../internal/internal-auth';
import { AppError } from '../app-error';
import { EP_KEY, endpoint } from '../ep';
import { normalizePhone, withNormalizedPhone } from '../phone';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { type IsraRequest, isWebClient } from '../request-context';

/** مسیرهای حساس به brute-force/هزینه: شمارندهٔ durable (دقیق بین instanceها)؛ بقیه in-memory */
const DURABLE_TAG = 'احراز هویت';
const DURABLE_IDS = new Set(['L-06', 'L-07', 'L-13']);
const GLOBAL_IP_LIMIT: RateLimit = { limit: 600, windowSec: 60, key: 'ip' };
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/**
 * یک guard سراسری، تنها نقطهٔ سیاست امنیتی هر endpoint از روی تعریف قرارداد:
 *   CSRF (cookie) → احراز (Bearer/JWT RS256 + نشست فعال) → step-up → rate-limit → اعتبارسنجی zod (body/query/params)
 * خروجی اعتبارسنجی در `req.input`.
 */
@Injectable()
export class EndpointGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly status: SessionStatusCache,
    private readonly sessions: SessionService,
    private readonly auth: AuthService,
    private readonly limiter: RateLimitService,
    private readonly flags: FlagsService,
    @Inject(ENV) private readonly env: Env
  ) {}

  async canActivate(c: ExecutionContext): Promise<boolean> {
    const id = this.reflector.get<string | undefined>(EP_KEY, c.getHandler());
    if (!id) {
      // fail-closed: مسیر بدون تعریف قرارداد فقط برای کنترلر internal مجاز است (احراز با InternalGuard)
      if (this.reflector.getAllAndOverride<boolean | undefined>(INTERNAL_KEY, [c.getHandler(), c.getClass()])) return true;
      throw new AppError('AUTH_FORBIDDEN');
    }
    const def = endpoint(id);
    const req = c.switchToHttp().getRequest<IsraRequest>();
    const res = c.switchToHttp().getResponse<Response>();

    // سقف سراسری per-IP پیش از هر کار گران (حتی توکن‌های نامعتبر/درخواست‌های ناموفق شمرده می‌شوند)
    await this.globalLimit(def, req);
    await this.maintenance(def);
    this.checkContentType(def, req);
    this.checkCsrf(def, req);
    await this.authenticate(def, req);
    await this.rateLimit(def, req, res);
    this.validate(def, req);
    return true;
  }

  private checkContentType(def: EndpointDef, req: IsraRequest) {
    if (!BODY_METHODS.has(req.method)) return;
    const len = Number(req.header('content-length') ?? 0);
    if (def.body && len > 0 && !req.is('application/json')) throw new AppError('UNSUPPORTED_MEDIA_TYPE');
  }

  /**
   * CSRF برای مسیرهای cookie‌محور: cookie فقط وقتی پذیرفته می‌شود که Origin دقیقاً در allowlist باشد
   * (SameSite=Lax + این بررسی)؛ کلاینت غیر وب cookie ندارد.
   */
  private checkCsrf(def: EndpointDef, req: IsraRequest) {
    if (def.auth !== 'refreshCookie' && def.auth !== 'bearerOrCookie') return;
    if (!readRefreshCookie(req, req.ctx.client, this.env.COOKIE_SECURE)) return;
    const origin = req.header('origin');
    if (!isWebClient(req.ctx.client) || !origin || !this.env.CORS_ORIGINS.includes(origin)) throw new AppError('AUTH_FORBIDDEN', { message: 'درخواست از مبدأ مجاز نیست.' });
  }

  private async authenticate(def: EndpointDef, req: IsraRequest) {
    if (def.auth === 'none' || def.auth === 'refreshCookie') return;
    const header = req.header('authorization');
    const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    const optional = def.auth === 'bearerOrCookie';

    if (!bearer) {
      if (optional) return;
      throw new AppError('AUTH_REQUIRED');
    }
    if (bearer.length > 4096) throw new AppError('AUTH_TOKEN_INVALID');

    let v;
    try {
      v = await this.tokens.verifyAccess(bearer);
    } catch (e) {
      if (optional) return; // logout باید با access منقضی هم idempotent کار کند
      throw e;
    }
    const st = await this.status.get(v.sessionId);
    if (!st || st.revoked || st.userId !== v.userId) {
      if (optional) return;
      throw new AppError('AUTH_TOKEN_INVALID');
    }
    req.user = { userId: v.userId, sessionId: v.sessionId, deviceId: v.deviceId };
    this.sessions.touch(v.sessionId);

    if (def.stepUp) await this.auth.assertStepUp(v.sessionId, st, req.header(HEADERS.stepUp));
  }

  private keyOf(kind: RateLimit['key'], req: IsraRequest): string | null {
    const ip = req.ctx.ip;
    const phoneRaw = (req.body as { phone?: unknown } | undefined)?.phone;
    const phone = normalizePhone(phoneRaw);
    const ph = typeof phone === 'string' && /^09\d{9}$/.test(phone) ? phone : null;
    const user = req.user?.userId ?? null;
    switch (kind) {
      case 'ip':
        return `ip:${ip}`;
      case 'phone':
        return ph ? `ph:${ph}` : null;
      case 'user':
        return user ? `u:${user}` : null;
      case 'ip+phone':
        return ph ? `ip:${ip}|ph:${ph}` : null;
      case 'user+ip':
        return user ? `u:${user}|ip:${ip}` : null;
    }
  }

  /** maintenance_mode (از high): همهٔ مسیرها ۵۰۳ مگر auth (ادمین باید بتواند وارد شود و خاموش کند)، JWKS و health */
  private async maintenance(def: EndpointDef) {
    if (def.internalOnly || def.id.startsWith('L-0') || def.id === 'L-90') return;
    if ((await this.flags.get()).maintenanceMode) throw new AppError('SERVICE_UNAVAILABLE', { message: 'سامانه برای نگهداری موقتاً در دسترس نیست. کمی بعد برگردید.', details: { reason: 'maintenance', retryAfterSec: 60 } });
  }

  private async globalLimit(def: EndpointDef, req: IsraRequest) {
    if (def.internalOnly) return;
    const g = await this.limiter.hit('memory', `g:${req.ctx.ip}`, GLOBAL_IP_LIMIT.limit, GLOBAL_IP_LIMIT.windowSec);
    if (!g.allowed) throw new AppError('RATE_LIMITED', { details: { retryAfterSec: g.resetSec } });
  }

  private async rateLimit(def: EndpointDef, req: IsraRequest, res: Response) {
    const limits = def.rateLimit ? (Array.isArray(def.rateLimit) ? def.rateLimit : [def.rateLimit]) : [];
    const scope = def.tags.includes(DURABLE_TAG) || DURABLE_IDS.has(def.id) ? 'durable' : 'memory';


    let tightest: { limit: number; remaining: number; resetSec: number } | null = null;
    for (const l of limits) {
      const k = this.keyOf(l.key, req);
      if (!k) continue;
      const r = await this.limiter.hit(scope, `${def.id}:${k}`.slice(0, 120), l.limit, l.windowSec);
      if (!r.allowed) {
        this.setHeaders(res, r);
        throw new AppError('RATE_LIMITED', { details: { retryAfterSec: r.resetSec } });
      }
      if (!tightest || r.remaining < tightest.remaining) tightest = r;
    }
    if (tightest) this.setHeaders(res, tightest);
  }

  private setHeaders(res: Response, r: { limit: number; remaining: number; resetSec: number }) {
    res.setHeader(HEADERS.rateLimitLimit, String(r.limit));
    res.setHeader(HEADERS.rateLimitRemaining, String(r.remaining));
    res.setHeader(HEADERS.rateLimitReset, String(r.resetSec));
  }

  private validate(def: EndpointDef, req: IsraRequest) {
    let body: unknown = {};
    if (def.body) {
      body = def.body.parse(withNormalizedPhone(req.body) ?? {});
    }
    const query = def.query ? def.query.parse(req.query) : {};
    const params = def.params ? def.params.parse(req.params) : {};
    req.input = { body, query, params };
  }
}
