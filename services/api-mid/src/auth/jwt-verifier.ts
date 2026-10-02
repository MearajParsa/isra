import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { ENV, type Env } from '../config/env';

export interface Principal {
  userId: string;
  roles: string[];
  perms: string[];
  expiresAt: number;
}

/**
 * اعتبارسنجی محلی access JWT با JWKS سرویس low (RS256 pin‌شده؛ iss/aud/exp).
 * بدون hop به low در هر درخواست (قفل): kid ناشناخته ⇒ JWKS دوباره خوانده می‌شود (با cooldown) و کلید چرخشی پذیرفته می‌شود.
 * نشست revoke‌شده تا انقضای access (≤۱۵ دقیقه) در mid معتبر می‌ماند — پذیرفته‌شده در قفل‌ها.
 */
@Injectable()
export class JwtVerifier {
  private readonly jwks;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly clock: Clock
  ) {
    this.jwks = createRemoteJWKSet(new URL(env.LOW_JWKS_URL), { timeoutDuration: env.JWKS_TIMEOUT_MS, cooldownDuration: 15_000, cacheMaxAge: 10 * 60_000 });
  }

  async verify(token: string): Promise<Principal> {
    if (token.length > 4096) throw new AppError('AUTH_TOKEN_INVALID');
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        algorithms: ['RS256'],
        issuer: this.env.JWT_ISSUER,
        audience: this.env.JWT_AUDIENCE,
        clockTolerance: 30,
        currentDate: this.clock.now()
      });
      if (typeof payload.sub !== 'string' || payload.lvl !== 'low') throw new AppError('AUTH_TOKEN_INVALID');
      const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
      return { userId: payload.sub, roles: strs(payload.roles), perms: strs(payload.perms), expiresAt: (payload.exp ?? 0) * 1000 };
    } catch (e) {
      if (e instanceof AppError) throw e;
      if (e instanceof errors.JWTExpired) throw new AppError('AUTH_TOKEN_EXPIRED');
      // JWKS در دسترس نیست ⇒ ۵۰۳ (نه ۴۰۱ تا کلاینت بی‌دلیل خارج نشود)
      if (e instanceof errors.JWKSTimeout || (e instanceof Error && /fetch|ECONN|network/i.test(e.message) && !(e instanceof errors.JOSEError))) throw new AppError('SERVICE_UNAVAILABLE');
      throw new AppError('AUTH_TOKEN_INVALID');
    }
  }
}

/**
 * مجوز سطح کاربر `session.create`: high مجوز مؤثر هر کاربر (grant مستقیم ∪ مجوزهای نقش‌های سیستم، با احترام به ماتریس)
 * را در claim `perms` می‌گذارد؛ نام نقش به‌تنهایی کافی نیست (ماتریس قابل ویرایش است).
 */
export const canCreateSession = (p: Pick<Principal, 'perms'>): boolean => p.perms.includes('session.create');
