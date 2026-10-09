import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { HEADERS, type EndpointDef, type RateLimit } from '@isra/api-types';
import { JwtVerifier } from '../../auth/jwt-verifier';
import { ENV, type Env } from '../../config/env';
import { ALWAYS_STEP_UP, hasPanelAccess, isDeveloper, stepUpRequired, type StepUpPolicy, type UserAccess } from '../../domain/access/policy';
import { RbacService } from '../../domain/rbac.service';
import { INTERNAL_KEY } from '../../internal/internal-auth';
import { AppError } from '../app-error';
import { EP_KEY, endpoint } from '../ep';
import { MediaUrlSigner } from '../media-url';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import type { IsraRequest } from '../request-context';

const GLOBAL_IP_LIMIT: RateLimit = { limit: 600, windowSec: 60, key: 'ip' };
/** با پرچم رمز موقت (`mcp`) فقط این endpointها مجازند (docs-v2/26) */
const MCP_ALLOWED = new Set(['H-00', 'H-02', 'H-04']);
const EMPTY_POLICY: StepUpPolicy = { permDefault: new Map(), roleRules: new Map() };
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/** مجوز endpoint: `permission` یا هر یک از `permissionAny` (۱.۷.۰)؛ خروجی = مجوزی که کاربر با آن عبور کرده (برای step-up) */
export function grantingPermission(def: Pick<EndpointDef, 'permission' | 'permissionAny'>, perms: readonly string[]): { ok: boolean; via?: string } {
  const all = [def.permission, ...(def.permissionAny ?? [])].filter((p): p is string => !!p);
  if (all.length === 0) return { ok: true };
  const via = all.find((p) => perms.includes(p));
  return via ? { ok: true, via } : { ok: false };
}

/**
 * guard سراسری: سقف IP → احراز JWT (JWKS محلی) یا URL امضاشده (`bearerOrSignedUrl`) → نقش/مجوز از DB این سرویس → step-up (JWT از low)
 * → rate-limit → اعتبارسنجی zod (و بدنهٔ خام `rawBody`).
 * ۱.۷.۰: ورود به پنل = نقش tier=high یا دست‌کم یک مجوز `system.*`؛ مجوز endpoint = `permission` یا هر یک از `permissionAny`.
 */
@Injectable()
export class EndpointGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtVerifier,
    private readonly rbac: RbacService,
    private readonly limiter: RateLimitService,
    private readonly media: MediaUrlSigner,
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
    if (!token && def.auth === 'bearerOrSignedUrl') return this.authorizeSigned(def, req);
    if (!token) throw new AppError('AUTH_REQUIRED');
    const who = await this.jwt.verifyAccess(token);
    const a = await this.rbac.access(who.userId);
    req.user = { userId: who.userId, sessionId: who.sessionId, roles: a.roles, perms: a.permissions, mcp: who.mcp, stepUpVerified: false };

    // docs-v2/30 §۳ امنیت ۶: وضعیت دایرکتوری از همان query کش‌شدهٔ دسترسی (بدون round-trip اضافه)
    if (a.status === 'disabled' || a.status === 'deleted') throw new AppError('AUTH_ACCOUNT_DISABLED');

    if (!hasPanelAccess(a)) throw new AppError('AUTH_FORBIDDEN', { message: 'دسترسی به پنل مدیریت ندارید.' });
    if (who.mcp && !MCP_ALLOWED.has(def.id)) throw new AppError('AUTH_PASSWORD_CHANGE_REQUIRED');
    const g = grantingPermission(def, a.permissions);
    if (!g.ok) throw new AppError('AUTH_FORBIDDEN');
    if (def.stepUp) {
      // قاعدهٔ docs-v2/27 §4: developer هرگز؛ بدون permission ⇒ لازم؛ وگرنه از سیاست منابع همان مجوزی که کاربر با آن عبور کرده (کش حافظه)
      const policy = !who.mcp && isDeveloper(a) && !ALWAYS_STEP_UP.has(def.id) ? EMPTY_POLICY : await this.rbac.policy();
      if (!stepUpRequired(a, policy, { id: def.id, permission: g.via }, who.mcp)) {
        // معاف از step-up: low برای H-04 «تأییدشده» می‌خواهد؛ معافیت (developer) همان اثر را دارد
        req.user.stepUpVerified = true;
      } else {
        const t = req.header(HEADERS.stepUp);
        req.user.stepUpVerified = !!t && (await this.jwt.verifyStepUp(t, who));
        if (!req.user.stepUpVerified && !this.mustChangeException(def, who.mcp, req)) throw new AppError('AUTH_STEP_UP_REQUIRED');
      }
    }
  }

  /**
   * `bearerOrSignedUrl` بدون Bearer (docs-v2/31 §۴): امضای `exp`/`u`/`sig` روی `METHOD|path|exp|u` (زمان‌ثابت)؛ نامعتبر/منقضی ⇒ AUTH_REQUIRED.
   * امضا فقط احراز است: دسترسی کاربر `u` **تازه از DB** (بدون کش per کاربر) دوباره بررسی می‌شود — وضعیت، ورود به پنل و مجوز endpoint.
   */
  private async authorizeSigned(def: EndpointDef, req: IsraRequest) {
    const userId = this.media.verify(req.method, req.path, req.query as Record<string, unknown>);
    if (!userId) throw new AppError('AUTH_REQUIRED');
    const a: UserAccess | undefined = (await this.rbac.accessMany([userId])).get(userId);
    if (!a) throw new AppError('AUTH_REQUIRED');
    req.user = { userId, sessionId: '', roles: a.roles, perms: a.permissions, mcp: false, stepUpVerified: false };
    if (a.status === 'disabled' || a.status === 'deleted') throw new AppError('AUTH_ACCOUNT_DISABLED');
    if (!hasPanelAccess(a) || !grantingPermission(def, a.permissions).ok) throw new AppError('AUTH_FORBIDDEN');
    if (def.stepUp) throw new AppError('AUTH_STEP_UP_REQUIRED');
  }

  /**
   * تنها استثنای step-up (H-04، docs-v2/26): کاربری که با رمز موقت وارد شده (`mcp`) هنوز نمی‌تواند step-up بگیرد
   * (step-up به رمز/OTP نیاز دارد و همهٔ مسیرها جز تغییر رمز بسته‌اند)؛ پس به‌جای step-up، `currentPassword` (رمز موقت)
   * پذیرفته می‌شود و low آن را با argon2 تطبیق می‌دهد (غلط ⇒ AUTH_INVALID_CREDENTIALS).
   * شرط سخت‌گیرانه: فقط H-04 + توکن دارای `mcp` + `currentPassword` رشتهٔ غیرخالی. هر حالت دیگر ⇒ step-up الزامی.
   */
  private mustChangeException(def: EndpointDef, mcp: boolean, req: IsraRequest): boolean {
    if (def.id !== 'H-04' || !mcp) return false;
    const cur = (req.body as { currentPassword?: unknown } | undefined)?.currentPassword;
    return typeof cur === 'string' && cur.length > 0;
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
    if (def.rawBody) this.rawBody(def.rawBody, req);
    const body = def.body ? def.body.parse((req.body as unknown) ?? {}) : {};
    const query = def.query ? def.query.parse(req.query) : {};
    const params = def.params ? def.params.parse(req.params) : {};
    req.input = { body, query, params };
  }

  /**
   * بدنهٔ خام باینری (۱.۷.۰، H-115): نوع از allowlist قرارداد (وگرنه UNSUPPORTED_MEDIA_TYPE)؛ Content-Length الزامی و ≤ maxBytes
   * (بیشتر ⇒ PAYLOAD_TOO_LARGE) — پیش از خواندن حتی یک بایت؛ بدنه بعداً بدون بافر stream می‌شود.
   */
  private rawBody(spec: NonNullable<EndpointDef['rawBody']>, req: IsraRequest) {
    const type = (req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (!spec.contentTypes.includes(type)) throw new AppError('UNSUPPORTED_MEDIA_TYPE');
    const raw = req.header('content-length');
    if (!raw || !/^\d{1,12}$/.test(raw) || Number(raw) < 1) throw new AppError('VALIDATION_FAILED', { message: 'طول بدنه (Content-Length) لازم است.', details: { fields: { 'Content-Length': 'لازم است.' } } });
    if (Number(raw) > spec.maxBytes) throw new AppError('PAYLOAD_TOO_LARGE', { details: { maxBytes: spec.maxBytes } });
  }
}
