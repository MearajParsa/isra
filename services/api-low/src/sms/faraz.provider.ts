import { Inject, Injectable, Logger } from '@nestjs/common';
import { maskPhone } from '../common/crypto';
import { ENV, type Env } from '../config/env';
import { SmsProvider, type SmsMessage } from './sms.provider';

/**
 * FarazSMS (ایران‌پیامک) — ارسال مبتنی بر الگو (pattern) برای OTP: `POST {base}/ws/v1/sms/pattern`.
 * مستندات: docs.iranpayamak.com (Send Pattern-Based SMS).
 *  - احراز: هدر `Api-Key` (حساس به حروف؛ نه body/query)
 *  - گیرنده 09xxxxxxxxx و خط بدون +98؛ `number_format: english`؛ بدون `schedule` ⇒ ارسال فوری
 *  - نام کلید در `attributes` باید دقیقاً با متغیر الگو در پنل یکی باشد (`FARAZ_CODE_VAR`، پیش‌فرض `code`)
 *  - سقف ۶۰ درخواست/دقیقه (429)؛ `success` فقط یعنی «در صف پذیرفته شد» (تحویل واقعی: GET /ws/v1/send_request/{id}/items)
 * کد OTP و کلید API هرگز لاگ نمی‌شوند.
 */
@Injectable()
export class FarazSmsProvider extends SmsProvider {
  private readonly log = new Logger('Faraz');
  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async sendOtp({ phone, code }: SmsMessage): Promise<void> {
    const res = await fetch(`${this.env.FARAZ_BASE_URL.replace(/\/+$/, '')}/ws/v1/sms/pattern`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Api-Key': this.env.FARAZ_API_KEY ?? '' },
      body: JSON.stringify({
        code: this.env.FARAZ_PATTERN_CODE,
        attributes: { [this.env.FARAZ_CODE_VAR]: code },
        recipient: phone,
        line_number: this.env.FARAZ_SENDER,
        number_format: 'english'
      }),
      signal: AbortSignal.timeout(this.env.SMS_TIMEOUT_MS)
    });

    let status: unknown;
    try {
      status = ((await res.json()) as { status?: unknown } | null)?.status;
    } catch {
      /* بدنهٔ غیر JSON: فقط به کد HTTP تکیه می‌کنیم */
    }
    if (!res.ok || (typeof status === 'string' && status !== 'success')) {
      this.log.warn({ http: res.status, status: typeof status === 'string' ? status : undefined, phone: maskPhone(phone) }, 'faraz send failed');
      throw new Error(`faraz http ${res.status}`);
    }
  }
}
