import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { ENV, type Env } from '../config/env';

export interface Principal {
  userId: string;
  sessionId: string;
}

/**
 * اعتبارسنجی محلی access JWT و step-up JWT با JWKS سرویس low (RS256 pin، iss/aud/exp).
 * نقش/مجوز سیستمی از JWT خوانده **نمی‌شود**: منبع حقیقت DB همین سرویس است (تغییر نقش فوراً اثر می‌کند).
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

  private async decode(token: string) {
    return jwtVerify(token, this.jwks, { algorithms: ['RS256'], issuer: this.env.JWT_ISSUER, audience: this.env.JWT_AUDIENCE, clockTolerance: 30, currentDate: this.clock.now() });
  }

  async verifyAccess(token: string): Promise<Principal> {
    if (token.length > 4096) throw new AppError('AUTH_TOKEN_INVALID');
    try {
      const { payload } = await this.decode(token);
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || payload.lvl !== 'low') throw new AppError('AUTH_TOKEN_INVALID');
      return { userId: payload.sub, sessionId: payload.sid };
    } catch (e) {
      if (e instanceof AppError) throw e;
      if (e instanceof errors.JWTExpired) throw new AppError('AUTH_TOKEN_EXPIRED');
      if (e instanceof errors.JWKSTimeout || (e instanceof Error && /fetch|ECONN|network/i.test(e.message) && !(e instanceof errors.JOSEError))) throw new AppError('SERVICE_UNAVAILABLE');
      throw new AppError('AUTH_TOKEN_INVALID');
    }
  }

  /** step-up (lvl=stepup) باید برای همین کاربر و همین نشست باشد؛ هر خطا ⇒ false */
  async verifyStepUp(token: string, who: Principal): Promise<boolean> {
    if (token.length > 1024) return false;
    try {
      const { payload } = await this.decode(token);
      return payload.lvl === 'stepup' && payload.sub === who.userId && payload.sid === who.sessionId;
    } catch {
      return false;
    }
  }
}
