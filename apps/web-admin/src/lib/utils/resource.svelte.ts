import { errorMessage, isNetworkError } from './errors';

/** وضعیت بارگذاری یک منبع سمت کلاینت (skeleton / خطا / خالی) */
export class Resource<T> {
  status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  data = $state<T | null>(null);
  error = $state<string | null>(null);
  offline = $state(false);

  /** silent: داده‌ٔ فعلی را نگه دار و بدون skeleton تازه کن (رویدادهای زنده) */
  async load(fn: () => Promise<T>, silent = false): Promise<void> {
    if (!silent || this.status !== 'ready') this.status = 'loading';
    this.error = null;
    this.offline = false;
    try {
      this.data = await fn();
      this.status = 'ready';
    } catch (e) {
      if (silent && this.status === 'ready') return;
      this.error = errorMessage(e);
      this.offline = isNetworkError(e);
      this.status = 'error';
    }
  }
}
