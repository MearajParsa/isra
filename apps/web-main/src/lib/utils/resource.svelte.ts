import { errorMessage, isNetworkError } from './errors';

/** وضعیت بارگذاری یک منبع سمت کلاینت (skeleton / خطا / خالی) */
export class Resource<T> {
  status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  data = $state<T | null>(null);
  error = $state<string | null>(null);
  offline = $state(false);

  async load(fn: () => Promise<T>): Promise<void> {
    this.status = 'loading';
    this.error = null;
    this.offline = false;
    try {
      this.data = await fn();
      this.status = 'ready';
    } catch (e) {
      this.error = errorMessage(e);
      this.offline = isNetworkError(e);
      this.status = 'error';
    }
  }
}
