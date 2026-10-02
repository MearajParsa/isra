export interface SmsMessage {
  phone: string;
  code: string;
}

/** ارسال OTP؛ پیاده‌سازی‌ها: Faraz (تولید)، console (فقط توسعه)، capturing (تست) */
export abstract class SmsProvider {
  /** در خطا throw می‌کند (timeout/HTTP غیر 2xx) */
  abstract sendOtp(msg: SmsMessage): Promise<void>;
}
