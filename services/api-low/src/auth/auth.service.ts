import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ClientId } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { sha256 } from '../common/crypto';
import { uuidToBuf, uuidv7, bufToUuid } from '../common/ids';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { ENV, type Env } from '../config/env';
import { FlagsService } from '../system/flags.service';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import type { SessionStatus } from './session-status.cache';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

const STEP_UP_TTL_SEC = 300;

export interface AuthContext {
  client: ClientId | null;
  ip: string;
}

export interface AuthOutput {
  accessToken: string;
  tokenType: 'Bearer';
  accessExpiresIn: number;
  sessionId: string;
  user: { id: string; phone: string; isNewUser: boolean; profileComplete: boolean; hasPassword: boolean };
  /** خام؛ کنترلر برای وب در cookie می‌گذارد و برای سایر کلاینت‌ها در body */
  refreshToken: string;
}

interface UserRow {
  id: Buffer;
  phone: string;
  status: string;
  first_name: string | null;
  last_name: string | null;
  has_pw: number | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly passwords: PasswordService,
    private readonly limiter: RateLimitService,
    private readonly tokens: TokenService,
    private readonly flags: FlagsService,
    @Inject(ENV) private readonly env: Env
  ) {}

  requestOtp(phone: string, ctx: AuthContext) {
    return this.otp.issue(phone, 'login', null, ctx.ip);
  }

  async verifyOtp(b: { challengeId: string; code: string; deviceId: string; deviceLabel: string }, ctx: AuthContext): Promise<AuthOutput> {
    const v = await this.otp.verify(b.challengeId, b.code, 'login');
    const { user, isNew } = await this.findOrCreateUser(v.phone);
    if (user.status !== 'active') throw new AppError('AUTH_FORBIDDEN');
    return this.open(user, isNew, b, ctx, true);
  }

  async loginPassword(b: { phone: string; password: string; deviceId: string; deviceLabel: string }, ctx: AuthContext): Promise<AuthOutput> {
    // سقف توزیع‌شده روی خود شماره (علاوه بر ip+phone و ip در guard): ۲۰ تلاش/۱۵ دقیقه
    const lim = await this.limiter.hit('durable', `pw:ph:${b.phone}`, 20, 900);
    if (!lim.allowed) throw new AppError('RATE_LIMITED', { details: { retryAfterSec: lim.resetSec } });

    const rows = (await this.ds.query(
      `SELECT u.id, u.phone, u.status, p.first_name, p.last_name, c.password_hash AS pw
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id LEFT JOIN user_credentials c ON c.user_id = u.id WHERE u.phone = ?`,
      [b.phone]
    )) as (UserRow & { pw: string | null })[];
    const u = rows[0];
    const ok = u?.pw && u.status === 'active' ? await this.passwords.verify(u.pw, b.password) : (await this.passwords.burn(b.password), false);
    if (!u || !ok) throw new AppError('AUTH_INVALID_CREDENTIALS');
    return this.open({ ...u, has_pw: 1 }, false, b, ctx, false);
  }

  private async open(u: UserRow, isNew: boolean, dev: { deviceId: string; deviceLabel: string }, ctx: AuthContext, viaOtp: boolean): Promise<AuthOutput> {
    const userId = bufToUuid(u.id);
    const s = await this.sessions.create({ userId, deviceId: dev.deviceId, deviceLabel: dev.deviceLabel, client: ctx.client, ip: ctx.ip, viaOtp });
    const a = await this.sessions.issueAccess(userId, s.sessionId, dev.deviceId);
    return {
      accessToken: a.token,
      tokenType: 'Bearer',
      accessExpiresIn: a.expiresIn,
      sessionId: s.sessionId,
      refreshToken: s.refreshToken,
      user: { id: userId, phone: u.phone, isNewUser: isNew, profileComplete: !!(u.first_name && u.last_name), hasPassword: !!u.has_pw }
    };
  }

  private async findOrCreateUser(phone: string): Promise<{ user: UserRow; isNew: boolean }> {
    const sel = () =>
      this.ds.query(
        `SELECT u.id, u.phone, u.status, p.first_name, p.last_name, (c.user_id IS NOT NULL) AS has_pw
           FROM users u LEFT JOIN profiles p ON p.user_id = u.id LEFT JOIN user_credentials c ON c.user_id = u.id WHERE u.phone = ?`,
        [phone]
      ) as Promise<UserRow[]>;
    const existing = (await sel())[0];
    if (existing) return { user: existing, isNew: false };
    if (!(await this.flags.get()).registrationOpen) throw new AppError('AUTH_FORBIDDEN', { message: 'ثبت‌نام کاربر جدید موقتاً بسته است.' });

    const now = this.clock.now();
    const id = uuidv7(now.getTime());
    let created = false;
    await this.ds.transaction(async (m) => {
      const r = (await m.query('INSERT IGNORE INTO users (id, phone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [uuidToBuf(id), phone, 'active', now, now])) as { affectedRows?: number };
      if (r.affectedRows) {
        created = true;
        await m.query("INSERT INTO profiles (user_id, first_name, last_name, updated_at) VALUES (?, '', '', ?)", [uuidToBuf(id), now]);
        await m.query('INSERT INTO outbox_events (id, type, payload, created_at, attempts, next_attempt_at) VALUES (?, ?, ?, ?, 0, ?)', [
          uuidToBuf(uuidv7(now.getTime())),
          'user.registered',
          JSON.stringify({ userId: id, phone, firstName: '', lastName: '', createdAt: now.toISOString() }),
          now,
          now
        ]);
      }
    });
    const user = (await sel())[0];
    if (!user) throw new AppError('INTERNAL_ERROR');
    return { user, isNew: created };
  }

  async refresh(raw: string, client: ClientId | null) {
    const r = await this.sessions.rotate(raw, client);
    const a = await this.sessions.issueAccess(r.userId, r.sessionId, r.deviceId);
    return { accessToken: a.token, tokenType: 'Bearer' as const, accessExpiresIn: a.expiresIn, refreshToken: r.refreshToken };
  }

  /** idempotent: نشست با access یا با refresh شناسایی می‌شود؛ هر دو نبود ⇒ بی‌اثر */
  async logout(sessionId: string | undefined, rawRefresh: string | undefined): Promise<void> {
    if (sessionId) {
      await this.sessions.revoke(sessionId);
      return;
    }
    if (!rawRefresh) return;
    const rows = (await this.ds.query('SELECT session_id FROM refresh_tokens WHERE token_hash = ?', [sha256(rawRefresh)])) as { session_id: Buffer }[];
    if (rows[0]) await this.sessions.revoke(bufToUuid(rows[0].session_id));
  }

  async stepUpRequest(userId: string, ctx: AuthContext) {
    const rows = (await this.ds.query('SELECT phone FROM users WHERE id = ?', [uuidToBuf(userId)])) as { phone: string }[];
    if (!rows[0]) throw new AppError('AUTH_TOKEN_INVALID');
    return this.otp.issue(rows[0].phone, 'step_up', userId, ctx.ip);
  }

  async stepUpVerify(userId: string, sessionId: string, b: { challengeId: string; code: string }) {
    await this.otp.verify(b.challengeId, b.code, 'step_up', userId);
    return { stepUpToken: await this.tokens.signStepUp(userId, sessionId, STEP_UP_TTL_SEC), expiresInSec: STEP_UP_TTL_SEC };
  }

  /** L-13 و موارد مشابه: OTP تازه‌تر از ۵ دقیقه روی همین نشست یا توکن step-up معتبر متصل به همین نشست */
  async assertStepUp(sessionId: string, status: SessionStatus, token: string | undefined): Promise<void> {
    const now = this.clock.now().getTime();
    if (status.otpAt && now - status.otpAt.getTime() <= STEP_UP_TTL_SEC * 1000) return;
    if (token && token.length <= 1024 && (await this.tokens.verifyStepUp(token, status.userId, sessionId))) return;
    throw new AppError('AUTH_STEP_UP_REQUIRED');
  }
}
