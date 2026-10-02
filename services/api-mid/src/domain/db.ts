import { AppError } from '../common/app-error';

/** DataSource یا EntityManager (هر دو query(sql, params) دارند) */
export interface Q {
  query(sql: string, params?: unknown[]): Promise<any>;
}

export const parseJson = <T>(v: unknown): T => (typeof v === 'string' ? (JSON.parse(v) as T) : (v as T));

export const conflict = (reason: string, message: string) => new AppError('CONFLICT', { message, details: { reason } });

export const displayName = (first?: string | null, last?: string | null): string => `${first ?? ''} ${last ?? ''}`.trim() || 'کاربر';

/** ستون‌های نام از user_directory با alias d */
export const NAME_SQL = "TRIM(CONCAT(COALESCE(d.first_name,''), ' ', COALESCE(d.last_name,'')))";

const RETRYABLE = new Set([1213, 1205]); // deadlock، lock-wait timeout

/**
 * تراکنش‌های رقابتی (حضور/امتیاز/صف/ارزیابی) ممکن است در InnoDB deadlock بخورند (درج‌های موازی روی کلید یکتا).
 * این خطا قابل تکرار و بی‌خطر است؛ تا ۳ بار با تأخیر تصادفی کوتاه تکرار می‌شود (callback باید idempotent و بدون اثر بیرونی باشد).
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const errno = (e as { errno?: number; driverError?: { errno?: number } }).errno ?? (e as { driverError?: { errno?: number } }).driverError?.errno;
      if (i >= attempts || errno === undefined || !RETRYABLE.has(errno)) throw e;
      await new Promise((r) => setTimeout(r, 5 + Math.random() * 25 * i));
    }
  }
}
