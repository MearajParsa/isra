import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { maskPhone } from '../common/crypto';
import { SmsProvider, type SmsMessage } from './sms.provider';

/**
 * Faraz SMS (pattern/OTP). ⚠ قالب درخواست بر اساس API عمومی IPPanel/Faraz است و باید با مستندات حساب واقعی
 * تأیید شود (آدرس/فیلدها از env قابل تنظیم‌اند). کد کامل هرگز لاگ نمی‌شود.
 */
@Injectable()
export class FarazSmsProvider extends SmsProvider {
  private readonly log = new Logger('Faraz');
  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async sendOtp({ phone, code }: SmsMessage): Promise<void> {
    const res = await fetch(`${this.env.FARAZ_BASE_URL}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: this.env.FARAZ_API_KEY ?? '' },
      body: JSON.stringify({
        sending_type: 'pattern',
        from_number: this.env.FARAZ_SENDER,
        code: this.env.FARAZ_PATTERN_CODE,
        recipients: [`98${phone.slice(1)}`],
        params: { code }
      }),
      signal: AbortSignal.timeout(this.env.SMS_TIMEOUT_MS)
    });
    if (!res.ok) {
      this.log.warn({ status: res.status, phone: maskPhone(phone) }, 'faraz send failed');
      throw new Error(`faraz http ${res.status}`);
    }
  }
}
