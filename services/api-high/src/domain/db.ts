import { AppError } from '../common/app-error';

export interface Q {
  query(sql: string, params?: unknown[]): Promise<any>;
}

export const parseJson = <T>(v: unknown): T => (typeof v === 'string' ? (JSON.parse(v) as T) : (v as T));
export const conflict = (reason: string, message: string, extra: Record<string, unknown> = {}) => new AppError('CONFLICT', { message, details: { reason, ...extra } });
export const displayName = (first?: string | null, last?: string | null): string => `${first ?? ''} ${last ?? ''}`.trim() || 'کاربر';

const RETRYABLE = new Set([1213, 1205]);
/** deadlock/lock-wait در تراکنش‌های رقابتی ⇒ تا ۴ بار تکرار (callback باید بدون اثر بیرونی باشد) */
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
