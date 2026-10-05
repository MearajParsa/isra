import { errorMessage, isNetworkError } from './errors';

/** وضعیت بارگذاری یک منبع سمت کلاینت (skeleton / خطا / خالی) */
export class Resource<T> {
  status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  data = $state<T | null>(null);
  error = $state<string | null>(null);
  offline = $state(false);
  fetching = $state(false);
  #ctl: AbortController | null = null;
  #seq = 0;

  /**
   * بارگذاری با لغو درخواست قبلی (فیلتر/صفحه‌بندی): فقط آخرین درخواست نتیجه را می‌نویسد.
   * داده‌ٔ قبلی تا رسیدن جدید می‌ماند (بدون پرش) و `fetching` نشان می‌دهد.
   */
  async loadLatest(fn: (signal: AbortSignal) => Promise<T>): Promise<void> {
    this.#ctl?.abort();
    const ctl = (this.#ctl = new AbortController());
    const seq = ++this.#seq;
    this.fetching = true;
    this.error = null;
    this.offline = false;
    if (this.status !== 'ready') this.status = 'loading';
    try {
      const d = await fn(ctl.signal);
      if (seq !== this.#seq) return;
      this.data = d;
      this.status = 'ready';
    } catch (e) {
      if (seq !== this.#seq || ctl.signal.aborted) return;
      this.error = errorMessage(e);
      this.offline = isNetworkError(e);
      this.status = 'error';
    } finally {
      if (seq === this.#seq) this.fetching = false;
    }
  }

  abort() {
    this.#ctl?.abort();
    this.#seq++;
    this.fetching = false;
  }

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
