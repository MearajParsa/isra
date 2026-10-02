import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const sha256 = (v: string | Buffer): Buffer => createHash('sha256').update(v).digest();
export const hmac256 = (key: string, data: string): Buffer => createHmac('sha256', key).update(data).digest();

/** مقایسهٔ زمان‌ثابت دو بافر (طول متفاوت ⇒ false بدون نشت زمانی طول) */
export function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/** رشتهٔ تصادفی URL-safe با آنتروپی `bytes` بایت */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** کد OTP ۵ رقمی با CSPRNG */
export const randomOtp = (): string => String(randomInt(0, 100_000)).padStart(5, '0');

/** مقایسهٔ رشته‌های ثابت‌زمان (secret داخلی) */
export const safeEqualStr = (a: string, b: string): boolean => safeEqual(Buffer.from(a), Buffer.from(b));

/** شماره ماسک‌شده برای لاگ: 0912***4567 */
export const maskPhone = (p: string): string => (p.length === 11 ? `${p.slice(0, 4)}***${p.slice(7)}` : '***');
