import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { hmac256, maskPhone, randomOtp, safeEqual } from '../common/crypto';
import { bufToUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { ENV, type Env } from '../config/env';
import { SmsProvider } from '../sms/sms.provider';

export type OtpPurpose = 'login' | 'step_up';

export interface IssuedOtp {
  challengeId: string;
  expiresInSec: number;
  resendAfterSec: number;
}

export interface VerifiedOtp {
  phone: string;
  userId: string | null;
}

@Injectable()
export class OtpService {
  private readonly log = new Logger('Otp');

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly sms: SmsProvider,
    private readonly limiter: RateLimitService,
    @Inject(ENV) private readonly env: Env
  ) {}

  private mac(challengeId: string, code: string): Buffer {
    return hmac256(this.env.OTP_PEPPER, `${challengeId}:${code}`);
  }

  /**
   * صدور OTP. پاسخ به شمارهٔ ثبت‌شده/ثبت‌نشده یکسان است (هیچ lookup کاربر در مسیر login).
   * ارسال پیامک همگام با timeout (SMS_TIMEOUT_MS)؛ خطا ⇒ AUTH_OTP_SEND_FAILED و challenge باطل می‌شود.
   */
  async issue(phone: string, purpose: OtpPurpose, userId: string | null, ip: string): Promise<IssuedOtp> {
    const now = this.clock.now();

    // cooldown ارسال مجدد
    const since = new Date(now.getTime() - this.env.OTP_RESEND_AFTER_SEC * 1000);
    const recent = (await this.ds.query('SELECT created_at FROM otp_challenges WHERE phone = ? AND purpose = ? AND consumed_at IS NULL AND created_at > ? ORDER BY created_at DESC LIMIT 1', [phone, purpose, since])) as {
      created_at: Date;
    }[];
    if (recent[0]) {
      const wait = Math.ceil((recent[0].created_at.getTime() + this.env.OTP_RESEND_AFTER_SEC * 1000 - now.getTime()) / 1000);
      throw new AppError('RATE_LIMITED', { details: { retryAfterSec: Math.max(1, wait) } });
    }

    // سقف بودجهٔ روزانهٔ پیامک (ضد SMS-pumping/هزینه)
    const day = now.toISOString().slice(0, 10);
    const budget = await this.limiter.hit('durable', `sms:budget:${day}`, this.env.SMS_DAILY_BUDGET, 86_400);
    if (!budget.allowed) {
      this.log.error('daily SMS budget exhausted');
      throw new AppError('AUTH_OTP_SEND_FAILED');
    }

    const id = uuidv7(now.getTime());
    const code = randomOtp();
    await this.ds.query('INSERT INTO otp_challenges (id, phone, purpose, user_id, code_hmac, attempts, expires_at, ip, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)', [
      uuidToBuf(id),
      phone,
      purpose,
      userId ? uuidToBuf(userId) : null,
      this.mac(id, code),
      new Date(now.getTime() + this.env.OTP_TTL_SEC * 1000),
      ip.slice(0, 45),
      now
    ]);

    try {
      await this.sms.sendOtp({ phone, code });
    } catch (e) {
      await this.ds.query('UPDATE otp_challenges SET consumed_at = ? WHERE id = ?', [now, uuidToBuf(id)]);
      this.log.warn({ phone: maskPhone(phone), err: e instanceof Error ? e.message : 'unknown' }, 'sms failed');
      throw new AppError('AUTH_OTP_SEND_FAILED');
    }
    return { challengeId: id, expiresInSec: this.env.OTP_TTL_SEC, resendAfterSec: this.env.OTP_RESEND_AFTER_SEC };
  }

  /**
   * تأیید OTP. شمارش تلاش با UPDATE شرطی اتمی (race-safe بین instanceها)؛ مصرف تک‌بار با UPDATE شرطی.
   * مهاجم با درخواست موازی نمی‌تواند بیش از OTP_MAX_ATTEMPTS حدس بزند.
   */
  async verify(challengeId: string, code: string, purpose: OtpPurpose, expectUserId?: string): Promise<VerifiedOtp> {
    const now = this.clock.now();
    const idBuf = uuidToBuf(challengeId);

    const inc = (await this.ds.query(
      'UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > ? AND attempts < ?',
      [idBuf, purpose, now, this.env.OTP_MAX_ATTEMPTS]
    )) as { affectedRows?: number };

    const rows = (await this.ds.query('SELECT phone, user_id, code_hmac, attempts, expires_at, consumed_at FROM otp_challenges WHERE id = ? AND purpose = ?', [idBuf, purpose])) as {
      phone: string;
      user_id: Buffer | null;
      code_hmac: Buffer;
      attempts: number;
      expires_at: Date;
      consumed_at: Date | null;
    }[];
    const row = rows[0];

    if (!(inc.affectedRows && row)) {
      if (!row || row.consumed_at) throw new AppError('AUTH_OTP_INVALID');
      if (row.expires_at.getTime() <= now.getTime()) throw new AppError('AUTH_OTP_EXPIRED');
      throw new AppError('AUTH_OTP_EXHAUSTED');
    }

    const ownerId = row.user_id ? bufToUuid(row.user_id) : null;
    if (expectUserId && ownerId !== expectUserId) throw new AppError('AUTH_OTP_INVALID');

    if (!safeEqual(this.mac(challengeId, code), row.code_hmac)) {
      const left = this.env.OTP_MAX_ATTEMPTS - row.attempts;
      if (left <= 0) throw new AppError('AUTH_OTP_EXHAUSTED');
      throw new AppError('AUTH_OTP_INVALID', { details: { attemptsLeft: left } });
    }

    const used = (await this.ds.query('UPDATE otp_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL', [now, idBuf])) as { affectedRows?: number };
    if (!used.affectedRows) throw new AppError('AUTH_OTP_INVALID');
    return { phone: row.phone, userId: ownerId };
  }
}
