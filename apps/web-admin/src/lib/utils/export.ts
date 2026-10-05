import { ApiError } from '$lib/api/types';

export interface CollectOptions {
  /** حداکثر تعداد ردیف (برای خروجی CSV: ۵۰۰۰) */
  cap: number;
  pageSize: number;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
  /** وقتی RATE_LIMITED شد چند ثانیه صبر می‌کنیم (اطلاع به UI) */
  onWait?: (seconds: number) => void;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}
export interface Collected<T> {
  items: T[];
  total: number;
  /** تعداد کل از سقف بیشتر بود */
  truncated: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** صفحه‌به‌صفحه جمع‌آوری تا سقف؛ در RATE_LIMITED به اندازهٔ Retry-After صبر و همان صفحه تکرار می‌شود */
export async function collectPages<T>(fetchPage: (page: number) => Promise<{ items: T[]; total: number }>, o: CollectOptions): Promise<Collected<T>> {
  const sleep = o.sleep ?? defaultSleep;
  const out: T[] = [];
  let total = 0;
  const maxPages = Math.ceil(o.cap / o.pageSize);
  for (let page = 1; page <= maxPages; page++) {
    if (o.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    let retries = 0;
    for (;;) {
      try {
        const r = await fetchPage(page);
        total = r.total;
        out.push(...r.items);
        o.onProgress?.(Math.min(out.length, o.cap), Math.min(total, o.cap));
        if (r.items.length === 0) page = maxPages;
        break;
      } catch (e) {
        if (e instanceof ApiError && e.code === 'RATE_LIMITED' && retries < (o.maxRetries ?? 5)) {
          retries++;
          const sec = Math.min(Math.max(e.retryAfterSec ?? 5, 1), 90);
          o.onWait?.(sec);
          await sleep(sec * 1000);
          continue;
        }
        throw e;
      }
    }
    if (out.length >= total) break;
  }
  const items = out.slice(0, o.cap);
  return { items, total, truncated: total > o.cap };
}
