import { describe, expect, it } from 'vitest';
import { ApiError } from '$lib/api/types';
import { collectPages } from './export';

const mkPages = (total: number, size: number) => async (page: number) => {
  const start = (page - 1) * size;
  const n = Math.max(0, Math.min(size, total - start));
  return { items: Array.from({ length: n }, (_, i) => start + i), total };
};

describe('collectPages', () => {
  it('همهٔ صفحه‌ها را می‌گیرد و پیشرفت می‌دهد', async () => {
    const seen: number[] = [];
    const r = await collectPages(mkPages(120, 50), { cap: 5000, pageSize: 50, onProgress: (n) => seen.push(n) });
    expect(r.items).toHaveLength(120);
    expect(r.truncated).toBe(false);
    expect(seen).toEqual([50, 100, 120]);
  });
  it('سقف را اعمال و truncated را اعلام می‌کند', async () => {
    const r = await collectPages(mkPages(7000, 50), { cap: 5000, pageSize: 50 });
    expect(r.items).toHaveLength(5000);
    expect(r.total).toBe(7000);
    expect(r.truncated).toBe(true);
  });
  it('فهرست خالی', async () => {
    const r = await collectPages(mkPages(0, 50), { cap: 5000, pageSize: 50 });
    expect(r).toEqual({ items: [], total: 0, truncated: false });
  });
  it('RATE_LIMITED: صبر و تکرار همان صفحه', async () => {
    const base = mkPages(100, 50);
    let hit = 0;
    const waits: number[] = [];
    const r = await collectPages(
      async (p) => {
        if (p === 2 && hit++ === 0) throw new ApiError('RATE_LIMITED', 'x', 429, { retryAfterSec: 7 });
        return base(p);
      },
      { cap: 5000, pageSize: 50, sleep: async () => {}, onWait: (s) => waits.push(s) }
    );
    expect(r.items).toHaveLength(100);
    expect(waits).toEqual([7]);
  });
  it('خطای دیگر و لغو منتشر می‌شود', async () => {
    await expect(collectPages(async () => { throw new ApiError('SERVICE_UNAVAILABLE', 'x', 503); }, { cap: 100, pageSize: 50 })).rejects.toThrow('x');
    const ac = new AbortController();
    ac.abort();
    await expect(collectPages(mkPages(10, 5), { cap: 100, pageSize: 5, signal: ac.signal })).rejects.toThrow();
  });
});
