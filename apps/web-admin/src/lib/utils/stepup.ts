import { ApiError } from '$lib/api';
import { stepUp } from '$lib/stores/stepup.svelte';

/** اجرای یک write حساس با توکن step-up؛ لغو ⇒ undefined. اگر سرور بخواهد دوباره تأیید می‌گیرد. */
export async function withStepUp<T>(fn: (su: string) => Promise<T>): Promise<T | undefined> {
  const su = await stepUp.ensure();
  if (!su) return undefined;
  try {
    return await fn(su);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'AUTH_STEP_UP_REQUIRED') {
      stepUp.clear();
      const again = await stepUp.request();
      if (!again) return undefined;
      return fn(again);
    }
    throw e;
  }
}
