import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock } from '../clock';

export interface HitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** ثانیه تا پایان پنجره */
  resetSec: number;
}

const MEMORY_MAX_KEYS = 100_000;

/**
 * شمارنده‌های پنجرهٔ ثابت.
 *  - durable: MySQL (دقیق بین instanceها) — فقط OTP/login/step-up (حساس به امنیت)
 *  - memory: درون‌فرآیند (تقریبی per instance) — سایر مسیرها؛ بدون Redis (قفل پروژه)
 */
@Injectable()
export class RateLimitService {
  private readonly mem = new Map<string, { windowStart: number; hits: number }>();

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock
  ) {}

  async hit(scope: 'memory' | 'durable', key: string, limit: number, windowSec: number): Promise<HitResult> {
    const nowMs = this.clock.now().getTime();
    const windowMs = windowSec * 1000;
    const windowStart = Math.floor(nowMs / windowMs) * windowMs;
    const resetSec = Math.max(1, Math.ceil((windowStart + windowMs - nowMs) / 1000));
    const hits = scope === 'durable' ? await this.durableHit(key, windowStart) : this.memoryHit(key, windowStart);
    return { allowed: hits <= limit, limit, remaining: Math.max(0, limit - hits), resetSec };
  }

  /** فقط شمارش بدون افزایش (برای بررسی پیش از اقدام) */
  async peek(key: string, limit: number, windowSec: number): Promise<number> {
    const nowMs = this.clock.now().getTime();
    const windowStart = Math.floor(nowMs / (windowSec * 1000)) * windowSec * 1000;
    const rows = (await this.ds.query('SELECT hits FROM rate_limit_counters WHERE counter_key = ? AND window_start = ?', [key, new Date(windowStart)])) as { hits: number }[];
    return Math.min(limit + 1, rows[0]?.hits ?? 0);
  }

  private memoryHit(key: string, windowStart: number): number {
    const cur = this.mem.get(key);
    if (cur && cur.windowStart === windowStart) {
      cur.hits += 1;
      return cur.hits;
    }
    if (this.mem.size >= MEMORY_MAX_KEYS) this.sweep(windowStart);
    this.mem.set(key, { windowStart, hits: 1 });
    return 1;
  }

  private sweep(currentWindow: number) {
    for (const [k, v] of this.mem) if (v.windowStart < currentWindow) this.mem.delete(k);
    if (this.mem.size >= MEMORY_MAX_KEYS) this.mem.clear();
  }

  private async durableHit(key: string, windowStart: number): Promise<number> {
    const qr = this.ds.createQueryRunner();
    try {
      await qr.connect();
      // LAST_INSERT_ID(expr) ⇒ مقدار افزایش‌یافته در همان اتصال (اتمی)
      await qr.query(
        'INSERT INTO rate_limit_counters (counter_key, window_start, hits) VALUES (?, ?, LAST_INSERT_ID(1)) ON DUPLICATE KEY UPDATE hits = LAST_INSERT_ID(hits + 1)',
        [key, new Date(windowStart)]
      );
      const rows = (await qr.query('SELECT LAST_INSERT_ID() AS n')) as { n: string | number }[];
      return Number(rows[0]?.n ?? 1);
    } finally {
      await qr.release();
    }
  }

  /** پاکسازی پنجره‌های قدیمی (job نگهداشت) */
  async purgeOlderThan(date: Date): Promise<number> {
    const r = (await this.ds.query('DELETE FROM rate_limit_counters WHERE window_start < ? LIMIT 5000', [date])) as { affectedRows?: number };
    return r.affectedRows ?? 0;
  }
}
