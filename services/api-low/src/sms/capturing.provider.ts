import { Injectable } from '@nestjs/common';
import { SmsProvider, type SmsMessage } from './sms.provider';

/** تست/CI: پیام‌ها را در حافظه نگه می‌دارد (در production با env ممنوع است) */
@Injectable()
export class CapturingSmsProvider extends SmsProvider {
  readonly sent: SmsMessage[] = [];
  /** شبیه‌سازی خطای provider در تست */
  failNext = false;

  async sendOtp(msg: SmsMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('simulated provider failure');
    }
    this.sent.push(msg);
  }

  lastCode(phone: string): string | undefined {
    return [...this.sent].reverse().find((m) => m.phone === phone)?.code;
  }
}
