import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, errors, jwtVerify } from 'jose';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { ENV, type Env } from '../config/env';
import { KeysService } from './keys.service';

export interface AccessClaims {
  userId: string;
  sessionId: string;
  deviceId: string;
  roles: string[];
  grants: string[];
  permVer: number;
  /** رمز موقت مدیر ⇒ claim `mcp: true` (mid/high همهٔ/بیشتر مسیرها را رد می‌کنند) */
  mustChangePassword?: boolean;
}

export interface VerifiedAccess {
  userId: string;
  sessionId: string;
  deviceId?: string;
  permVer: number;
  /** claimهای امضاشدهٔ `roles`/`perms` (مجوز مؤثر نقش‌های اختصاص‌یافته؛ docs-v2/31 §۱) */
  roles: string[];
  perms: string[];
}

const claimList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** صدور و اعتبارسنجی access JWT (RS256 pin‌شده؛ iss/aud/exp/clock-skew) */
@Injectable()
export class TokenService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly keys: KeysService,
    private readonly clock: Clock
  ) {}

  async signAccess(c: AccessClaims): Promise<{ token: string; expiresIn: number }> {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const exp = iat + this.env.ACCESS_TTL_SEC;
    const token = await new SignJWT({ sid: c.sessionId, fid: c.sessionId, lvl: 'low', roles: c.roles, perms: c.grants, pv: c.permVer, did: c.deviceId, ...(c.mustChangePassword ? { mcp: true } : {}) })
      .setProtectedHeader({ alg: 'RS256', kid: this.keys.kid, typ: 'JWT' })
      .setSubject(c.userId)
      .setIssuer(this.env.JWT_ISSUER)
      .setAudience(this.env.JWT_AUDIENCE)
      .setIssuedAt(iat)
      .setNotBefore(iat)
      .setExpirationTime(exp)
      .setJti(randomUUID())
      .sign(this.keys.privateKey);
    return { token, expiresIn: this.env.ACCESS_TTL_SEC };
  }

  async verifyAccess(token: string): Promise<VerifiedAccess> {
    try {
      const { payload } = await jwtVerify(token, this.keys.publicKey, {
        algorithms: ['RS256'],
        issuer: this.env.JWT_ISSUER,
        audience: this.env.JWT_AUDIENCE,
        clockTolerance: 30,
        currentDate: this.clock.now()
      });
      // توکن step-up (lvl=stepup) هرگز به‌عنوان access پذیرفته نمی‌شود
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || payload.lvl !== 'low') throw new AppError('AUTH_TOKEN_INVALID');
      return { userId: payload.sub, sessionId: payload.sid, deviceId: typeof payload.did === 'string' ? payload.did : undefined, permVer: typeof payload.pv === 'number' ? payload.pv : 1, roles: claimList(payload.roles), perms: claimList(payload.perms) };
    } catch (e) {
      if (e instanceof AppError) throw e;
      if (e instanceof errors.JWTExpired) throw new AppError('AUTH_TOKEN_EXPIRED');
      throw new AppError('AUTH_TOKEN_INVALID');
    }
  }

  /** step-up: JWT کوتاه‌عمر (۵ دقیقه) متصل به نشست؛ high آن را محلی با JWKS تأیید می‌کند (بدون hop به low) */
  async signStepUp(userId: string, sessionId: string, ttlSec: number): Promise<string> {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    return new SignJWT({ sid: sessionId, lvl: 'stepup' })
      .setProtectedHeader({ alg: 'RS256', kid: this.keys.kid, typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(this.env.JWT_ISSUER)
      .setAudience(this.env.JWT_AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(iat + ttlSec)
      .setJti(randomUUID())
      .sign(this.keys.privateKey);
  }

  /** @returns true اگر توکن معتبر و برای همین کاربر و همین نشست باشد */
  async verifyStepUp(token: string, userId: string, sessionId: string): Promise<boolean> {
    try {
      const { payload } = await jwtVerify(token, this.keys.publicKey, { algorithms: ['RS256'], issuer: this.env.JWT_ISSUER, audience: this.env.JWT_AUDIENCE, clockTolerance: 5, currentDate: this.clock.now() });
      return payload.lvl === 'stepup' && payload.sub === userId && payload.sid === sessionId;
    } catch {
      return false;
    }
  }
}
