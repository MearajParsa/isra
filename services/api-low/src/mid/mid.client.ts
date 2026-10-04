import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PointsSummary, PublicSession } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { internalHeaders } from '../internal/internal-auth';
import { ENV, type Env } from '../config/env';

type Public = z.infer<typeof PublicSession>;
type Points = z.infer<typeof PointsSummary>;

export interface PublicList {
  items: Public[];
  page: number;
  pageSize: number;
  total: number;
}

const ListEnvelope = z.object({
  success: z.literal(true),
  data: z.array(PublicSession),
  meta: z.object({ page: z.number().int(), pageSize: z.number().int(), total: z.number().int() })
});
const OneEnvelope = <T extends z.ZodType>(s: T) => z.object({ success: z.literal(true), data: s });

const BREAKER_THRESHOLD = 5;
const BREAKER_OPEN_MS = 10_000;
const STALE_MAX_MS = 10 * 60_000;
const CACHE_MAX = 2000;

interface Entry {
  v: unknown;
  fresh: number;
  stale: number;
}

/**
 * کلاینت internal REST به api-mid (قفل #12: کلاینت low مستقیم به mid نمی‌زند).
 * timeout سخت، cache کوتاه، coalescing درخواست‌های هم‌زمان، circuit breaker و stale-if-error تا ۱۰ دقیقه.
 * پاسخ mid با schemaهای قرارداد parse می‌شود (قرارداد نقض‌شده ⇒ خطا، نه داده‌ٔ خراب).
 */
@Injectable()
export class MidClient {
  private readonly log = new Logger('MidClient');
  private readonly cache = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private failures = 0;
  private openUntil = 0;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly clock: Clock
  ) {}

  /** بدون INTERNAL_URL_MID (فقط غیر production) mid در دسترس نیست و داده‌ٔ خالی برمی‌گردد */
  get stubbed(): boolean {
    return !this.env.INTERNAL_URL_MID;
  }

  async publicSessions(q: { page: number; pageSize: number; status?: string }): Promise<PublicList> {
    if (this.stubbed) return { items: [], page: q.page, pageSize: q.pageSize, total: 0 };
    const qs = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize), ...(q.status ? { status: q.status } : {}) });
    const parsed = await this.get(`/internal/v1/public/sessions?${qs}`, ListEnvelope, 30_000);
    return { items: parsed.data, ...parsed.meta };
  }

  async publicSession(id: string): Promise<Public> {
    if (this.stubbed) throw new AppError('NOT_FOUND');
    const parsed = await this.get(`/internal/v1/public/sessions/${encodeURIComponent(id)}`, OneEnvelope(PublicSession), 30_000, true);
    return parsed.data;
  }

  async points(userId: string): Promise<Points> {
    if (this.stubbed) {
      const t = [50, 150, 300, 500] as const;
      return { total: 0, badges: t.map((n) => ({ key: `badge_${n}` as Points['badges'][number]['key'], threshold: n, awardedAt: null })) };
    }
    const parsed = await this.get(`/internal/v1/users/${encodeURIComponent(userId)}/points`, OneEnvelope(PointsSummary), 15_000);
    return parsed.data;
  }

  private async get<S extends z.ZodType>(path: string, schema: S, ttlMs: number, notFoundIs404 = false): Promise<z.infer<S>> {
    const now = this.clock.now().getTime();
    const hit = this.cache.get(path);
    if (hit && hit.fresh > now) return hit.v as z.infer<S>;

    // breaker باز: فقط از stale جواب بده
    if (now < this.openUntil) return this.staleOrFail<z.infer<S>>(path, hit, now);

    let p = this.inflight.get(path);
    if (!p) {
      p = this.fetchOnce(path, schema, ttlMs, notFoundIs404, now).finally(() => this.inflight.delete(path));
      this.inflight.set(path, p);
    }
    try {
      return (await p) as z.infer<S>;
    } catch (e) {
      if (e instanceof AppError && e.code === 'NOT_FOUND') throw e;
      return this.staleOrFail<z.infer<S>>(path, hit, now, e);
    }
  }

  private staleOrFail<T>(path: string, hit: Entry | undefined, now: number, cause?: unknown): T {
    if (hit && hit.stale > now) return hit.v as T;
    if (cause) this.log.warn({ path: path.split('?')[0], err: cause instanceof Error ? cause.message : 'unknown' }, 'mid unavailable');
    throw new AppError('SERVICE_UNAVAILABLE');
  }

  private async fetchOnce<S extends z.ZodType>(path: string, schema: S, ttlMs: number, notFoundIs404: boolean, now: number): Promise<z.infer<S>> {
    try {
      const res = await fetch(`${this.env.INTERNAL_URL_MID}${path}`, {
        headers: { ...internalHeaders(this.env, 'mid'), Accept: 'application/json' },
        signal: AbortSignal.timeout(this.env.INTERNAL_TIMEOUT_MS)
      });
      if (res.status === 404 && notFoundIs404) {
        this.failures = 0;
        throw new AppError('NOT_FOUND');
      }
      if (!res.ok) throw new Error(`mid http ${res.status}`);
      const value = schema.parse(await res.json()) as z.infer<S>;
      this.failures = 0;
      if (this.cache.size >= CACHE_MAX) this.cache.clear();
      this.cache.set(path, { v: value, fresh: now + ttlMs, stale: now + STALE_MAX_MS });
      return value;
    } catch (e) {
      if (e instanceof AppError) throw e;
      if (++this.failures >= BREAKER_THRESHOLD) this.openUntil = this.clock.now().getTime() + BREAKER_OPEN_MS;
      throw e;
    }
  }
}
