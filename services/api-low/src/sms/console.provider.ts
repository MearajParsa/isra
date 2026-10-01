import { Injectable, Logger } from '@nestjs/common';
import { maskPhone } from '../common/crypto';
import { SmsProvider, type SmsMessage } from './sms.provider';

/** فقط توسعهٔ محلی: کد را در کنسول چاپ می‌کند (production با env ممنوع است) */
@Injectable()
export class ConsoleSmsProvider extends SmsProvider {
  private readonly log = new Logger('DevSMS');
  async sendOtp({ phone, code }: SmsMessage): Promise<void> {
    this.log.warn(`OTP برای ${maskPhone(phone)}: ${code}`);
  }
}
