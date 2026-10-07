import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { HEADERS, type EndpointDef, type RateLimit } from '@isra/api-types';
import { JwtVerifier, canCreateSession } from '../../auth/jwt-verifier';
import { ENV, type Env } from '../../config/env';
import { SettingsService } from '../../domain/settings.service';
import { INTERNAL_KEY } from '../../internal/internal-auth';
import { AppError } from '../app-error';
import { EP_KEY, endpoint } from '../ep';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import type { IsraRequest } from '../request-context';

const GLOBAL_IP_LIMIT: RateLimit = { limit: 600, windowSec: 60, key: 'ip' };
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
/**
 * D1 (docs-v2/30 §۱.۶): android-low فقط برای کارهای قرآن‌آموز مستقیم به mid می‌آید؛ بقیهٔ مسیرهای bearer ⇒ AUTH_FORBIDDEN
 * (ساخت/مدیریت جلسه فقط android-mid/web-main/high). Socket.IO جداگانه مجاز است.
 */
export const ANDROID_LOW_ENDPOINTS: ReadonlySet<string> = new Set(['M-00', 'M-01', 'M-02', 'M-06', 'M-10', 'M-17', 'M-20', 'M-30', 'M-31', 'M-32', 'M-41', 'M-42', 'M-46', 'M-53']);

/**
 * guard سراسری: سقف IP → احراز JWT (JWKS محلی) → مجوز سطح کاربر (`session.create`) → rate-limit → اعتبارسنجی zod.
 * مجوزهای درون‌جلسه (membership/queue/eval) در سرویس‌ها از عضویت واقعی محاسبه می‌شوند (نه از JWT).
 */
@Injectable()
export class EndpointGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtVerifier,
    private readonly limiter: RateLimitService,
    private readonly settings: SettingsService,
    @Inject(ENV) readonly env: Env
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

    if (!def.internalOnly) {
      const g = await this.limiter.hit('memory', `g:${req.ctx.ip}`, GLOBAL_IP_LIMIT.limit, GLOBAL_IP_LIMIT.windowSec);
      if (!g.allowed) throw new AppError('RATE_LIMITED', { details: { retryAfterSec: g.resetSec } });
    }
    if (!def.internalOnly && (await this.settings.get()).maintenance) throw new AppError('SERVICE_UNAVAILABLE', { message: 'سامانه برای نگهداری موقتاً در دسترس نیست. کمی بعد برگردید.', details: { reason: 'maintenance', retryAfterSec: 60 } });
    if (BODY_METHODS.has(req.method) && def.body && Number(req.header('content-length') ?? 0) > 0 && !req.is('application/json')) throw new AppError('UNSUPPORTED_MEDIA_TYPE');

    if (req.ctx.client === 'android-low' && def.auth !== 'none' && !ANDROID_LOW_ENDPOINTS.has(def.id)) throw new AppError('AUTH_FORBIDDEN', { message: 'این عملیات از این اپ در دسترس نیست.' });
    await this.authenticate(def, req);
    await this.rateLimit(def, req, res);
    this.validate(def, req);
    return true;
  }

  private async authenticate(def: EndpointDef, req: IsraRequest) {
    if (def.auth === 'none') return;
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!token) throw new AppError('AUTH_REQUIRED');
    const p = await this.jwt.verify(token);
    req.user = { userId: p.userId, roles: p.roles, perms: p.perms };
    if (def.permission === 'session.create' && !canCreateSession(p)) throw new AppError('AUTH_FORBIDDEN', { message: 'مجوز ساخت جلسه ندارید.' });
  }

  private async rateLimit(def: EndpointDef, req: IsraRequest, res: Response) {
    const limits = def.rateLimit ? (Array.isArray(def.rateLimit) ? def.rateLimit : [def.rateLimit]) : [];
    let tightest: { limit: number; remaining: number; resetSec: number } | null = null;
    for (const l of limits) {
      const key = l.key === 'user' && req.user ? `u:${req.user.userId}` : l.key === 'user+ip' && req.user ? `u:${req.user.userId}|ip:${req.ctx.ip}` : `ip:${req.ctx.ip}`;
      const r = await this.limiter.hit('memory', `${def.id}:${key}`.slice(0, 120), l.limit, l.windowSec);
      if (!r.allowed) {
        this.headers(res, r);
        throw new AppError('RATE_LIMITED', { details: { retryAfterSec: r.resetSec } });
      }
      if (!tightest || r.remaining < tightest.remaining) tightest = r;
    }
    if (tightest) this.headers(res, tightest);
  }

  private headers(res: Response, r: { limit: number; remaining: number; resetSec: number }) {
    res.setHeader(HEADERS.rateLimitLimit, String(r.limit));
    res.setHeader(HEADERS.rateLimitRemaining, String(r.remaining));
    res.setHeader(HEADERS.rateLimitReset, String(r.resetSec));
  }

  private validate(def: EndpointDef, req: IsraRequest) {
    const body = def.body ? def.body.parse((req.body as unknown) ?? {}) : {};
    const query = def.query ? def.query.parse(req.query) : {};
    const params = def.params ? def.params.parse(req.params) : {};
    req.input = { body, query, params };
  }
}
