import { ApiError } from '$lib/api/types';
import { auth } from '$lib/auth/auth.svelte';
import { conflictMessage } from './labels';
import { errorMessage } from './errors';
import { withStepUp } from './stepup';

/**
 * اجرای یک write مدیریتی: توکن دسترسی (با تمدید خودکار) + step-up؛ با AUTH_STEP_UP_REQUIRED یک‌بار دیگر تأیید می‌گیرد و
 * همان درخواست را تکرار می‌کند. لغو تأیید هویت ⇒ undefined.
 */
export const stepped = <T>(fn: (token: string, su: string) => Promise<T>): Promise<T | undefined> => withStepUp((su) => auth.withAuth((t) => fn(t, su)));

/** پیام قابل‌نمایش برای خطای write (دلیل CONFLICT فارسی‌سازی می‌شود) */
export function describeError(e: unknown): string {
  if (e instanceof ApiError && e.code === 'CONFLICT') return conflictMessage(e.reason, e.message);
  return errorMessage(e);
}
