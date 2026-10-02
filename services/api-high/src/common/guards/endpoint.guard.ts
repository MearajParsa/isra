import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { HEADERS, type EndpointDef, type RateLimit } from '@isra/api-types';
import { JwtVerifier } from '../../auth/jwt-verifier';
import { ENV, type Env } from '../../config/env';
import { RbacService } from '../../domain/rbac.service';
import { AppError } from '../app-error';
import { EP_KEY, endpoint } from '../ep';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import type { IsraRequest } from '../request-context';

const GLOBAL_IP_LIMIT: RateLimit = { limit: 600, windowSec: 60, key: 'ip' };
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/**
 * guard سراسری: سقف IP → احراز JWT (JWKS محلی) → نقش/مجوز از DB این سرویس → step-up (JWT از low) → rate-limit → اعتبارسنجی zod.
 * همهٔ endpointها نیازمند دست‌کم یک نقش سیستمی‌اند؛ مجوز مشخص‌شدهٔ endpoint (`permission`) از مجوزهای مؤثر کاربر چک می‌شود.
 */
@Injectable()
export class EndpointGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtVerifier,
    private readonly rbac: RbacService,
    private readonly limiter: RateLimitService,
    @Inject(ENV) readonly env: Env
  ) {}

  async canActivate(c: ExecutionContext): Promise<boolean> {
    const id = this.reflector.get<string | undefined>(EP_KEY, c.getHandler());
    if (!id) return true;
    const def = endpoint(id);
    const req = c.switchToHttp().getRequest<IsraRequest>();
    const res = c.switchToHttp().getResponse<Response>();

    if (!def.internalOnly) {
      const g = await this.limiter.hit('memory', `g:${req.ctx.ip}`, GLOBAL_IP_LIMIT.limit, GLOBAL_IP_LIMIT.windowSec);
      if (!g.allowed) throw new AppError('RATE_LIMITED', { details: { retryAfterSec: g.resetSec } });
    }
    if (BODY_METHODS.has(req.method) && def.body && Number(req.header('content-length') ?? 0) > 0 && !req.is('application/json')) throw new AppError('UNSUPPORTED_MEDIA_TYPE');

    await this.authorize(def, req);
    await this.rateLimit(def, req, res);
    this.validate(def, req);
    return true;
  }

  private async authorize(def: EndpointDef, req: IsraRequest) {
    if (def.auth === 'none') return;
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!token) throw new AppError('AUTH_REQUIRED');
    const who = await this.jwt.verifyAccess(token);
    const a = await this.rbac.access(who.userId);
    req.user = { userId: who.userId, sessionId: who.sessionId, roles: a.roles, perms: a.permissions };

    if (a.roles.length === 0) throw new AppError('AUTH_FORBIDDEN', { message: 'دسترسی به پنل مدیریت ندارید.' });
    if (def.permission && !a.permissions.includes(def.permission as never)) throw new AppError('AUTH_FORBIDDEN');
    if (def.stepUp) {
      const t = req.header(HEADERS.stepUp);
      if (!t || !(await this.jwt.verifyStepUp(t, who))) throw new AppError('AUTH_STEP_UP_REQUIRED');
    }
  }

  private async rateLimit(def: EndpointDef, req: IsraRequest, res: Response) {
    const limits = def.rateLimit ? (Array.isArray(def.rateLimit) ? def.rateLimit : [def.rateLimit]) : [];
    let tightest: { limit: number; remaining: number; resetSec: number } | null = null;
    for (const l of limits) {
      const key = l.key === 'user' && req.user ? `u:${req.user.userId}` : `ip:${req.ctx.ip}`;
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
