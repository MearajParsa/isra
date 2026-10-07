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
  /** کلید cooldown: HMAC شماره (شمارهٔ خام در جدول کمکی ذخیره نمی‌شود) */
  private cooldownKey(phone: string, purpose: OtpPurpose): string {
    return `${purpose}:${hmac256(this.env.OTP_PEPPER, 'cd:' + phone).toString('hex').slice(0, 48)}`;
  }

  /**
   * cooldown اتمیک ارسال مجدد (بین instanceها): upsert ردیف (قفل انحصاری) ⇒ بررسی/به‌روزرسانی در یک تراکنش کوتاه.
   * درخواست هم‌زمان دوم پشت قفل ردیف می‌ماند و مقدار تازه را می‌بیند ⇒ دقیقاً یک ارسال.
   * @returns ثانیهٔ انتظار (۰ = مجاز و ثبت شد)
   */
  private async acquireCooldown(key: string, now: Date): Promise<number> {
    const windowMs = this.env.OTP_RESEND_AFTER_SEC * 1000;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.cooldownTx(key, now, windowMs);
      } catch (e) {
        // قربانی deadlock (نادر) یک‌بار دیگر؛ این بار ردیف هست و پشت قفل منتظر می‌ماند
        const err = e as { driverError?: { errno?: number }; errno?: number };
        if (attempt < 2 && (err?.driverError?.errno ?? err?.errno) === 1213) continue;
        throw e;
      }
    }
  }

  private cooldownTx(key: string, now: Date, windowMs: number): Promise<number> {
    return this.ds.transaction(async (m) => {
      // ON DUPLICATE KEY UPDATE قفل انحصاری می‌گیرد (نه S⇒X مثل INSERT IGNORE که بین درخواست‌های هم‌زمان deadlock می‌ساخت)
      await m.query('INSERT INTO otp_cooldowns (cooldown_key, last_sent_at) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_sent_at = last_sent_at', [key, new Date(0)]);
      const rows = (await m.query('SELECT last_sent_at FROM otp_cooldowns WHERE cooldown_key = ? FOR UPDATE', [key])) as { last_sent_at: Date }[];
      const last = rows[0]?.last_sent_at.getTime() ?? 0;
      if (last + windowMs > now.getTime()) return Math.max(1, Math.ceil((last + windowMs - now.getTime()) / 1000));
      await m.query('UPDATE otp_cooldowns SET last_sent_at = ? WHERE cooldown_key = ?', [now, key]);
      return 0;
    });
  }

  private async releaseCooldown(key: string): Promise<void> {
    await this.ds.query('DELETE FROM otp_cooldowns WHERE cooldown_key = ?', [key]);
  }

  /**
   * صدور OTP. پاسخ به شمارهٔ ثبت‌شده/ثبت‌نشده یکسان است.
   * `deliver=false` (ثبت‌نام بسته + شمارهٔ ناشناس): همهٔ بررسی‌ها و challenge مثل حالت عادی، ولی پیامکی نمی‌رود و بودجه مصرف نمی‌شود.
   * ارسال پیامک همگام با timeout (SMS_TIMEOUT_MS)؛ خطا ⇒ AUTH_OTP_SEND_FAILED، challenge با send_failed_at باطل و cooldown آزاد می‌شود.
   */
  async issue(phone: string, purpose: OtpPurpose, userId: string | null, ip: string, opts: { deliver?: boolean } = {}): Promise<IssuedOtp> {
    const deliver = opts.deliver !== false;
    const now = this.clock.now();
    const cdKey = this.cooldownKey(phone, purpose);

    // cooldown ارسال مجدد (اتمیک)
    const wait = await this.acquireCooldown(cdKey, now);
    if (wait > 0) throw new AppError('RATE_LIMITED', { details: { retryAfterSec: wait } });

    try {
      // سقف روزانهٔ per-شماره و per-IP پیش از بودجهٔ سراسری؛ بدون این، یک مهاجم ناشناس کل بودجه را مصرف و ورود همه را قفل می‌کرد
      const day = now.toISOString().slice(0, 10);
      const perPhone = await this.limiter.hit('durable', `sms:ph:${day}:${hmac256(this.env.OTP_PEPPER, 'ph:' + phone).toString('hex').slice(0, 24)}`, this.env.SMS_PER_PHONE_DAILY, 86_400);
      if (!perPhone.allowed) throw new AppError('RATE_LIMITED', { details: { retryAfterSec: perPhone.resetSec } });
      const perIp = await this.limiter.hit('durable', `sms:ip:${day}:${ip}`, this.env.SMS_PER_IP_DAILY, 86_400);
      if (!perIp.allowed) throw new AppError('RATE_LIMITED', { details: { retryAfterSec: perIp.resetSec } });

      // سقف بودجهٔ روزانهٔ پیامک (ضد SMS-pumping/هزینه) — فقط وقتی واقعاً پیامک می‌رود
      if (deliver) {
        const budget = await this.limiter.hit('durable', `sms:budget:${day}`, this.env.SMS_DAILY_BUDGET, 86_400);
        if (!budget.allowed) {
          this.log.error('daily SMS budget exhausted');
          throw new AppError('AUTH_OTP_SEND_FAILED');
        }
      }
    } catch (e) {
      await this.releaseCooldown(cdKey);
      throw e;
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

    if (deliver) {
      try {
        await this.sms.sendOtp({ phone, code });
      } catch (e) {
        await this.ds.query('UPDATE otp_challenges SET consumed_at = ?, send_failed_at = ? WHERE id = ?', [now, now, uuidToBuf(id)]);
        await this.releaseCooldown(cdKey);
        this.log.warn({ phone: maskPhone(phone), err: e instanceof Error ? e.message : 'unknown' }, 'sms failed');
        throw new AppError('AUTH_OTP_SEND_FAILED');
      }
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
    // کد مصرف شد ⇒ ارسال بعدی (مثلاً ورود دوباره/step-up) منتظر cooldown نماند
    await this.releaseCooldown(this.cooldownKey(row.phone, purpose));
    return { phone: row.phone, userId: ownerId };
  }
}
