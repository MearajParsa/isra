import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PointsLedgerItem, PointsSummary, PublicSession } from '@isra/api-types';
import { BadgesService, type CatalogBadge } from '../badges/badges.service';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { Lru } from '../common/lru';
import { internalHeaders } from '../internal/internal-auth';
import { ENV, type Env } from '../config/env';

type Public = z.infer<typeof PublicSession>;
type Points = z.infer<typeof PointsSummary>;
type Ledger = z.infer<typeof PointsLedgerItem>;

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
export type PublicList = Page<Public>;

const Meta = z.object({ page: z.number().int(), pageSize: z.number().int(), total: z.number().int() });
const ListEnvelope = <T extends z.ZodType>(s: T) => z.object({ success: z.literal(true), data: z.array(s), meta: Meta });
const OneEnvelope = <T extends z.ZodType>(s: T) => z.object({ success: z.literal(true), data: s });

/** شکل قدیمی (پیش از ۱.۶.۰) خلاصهٔ امتیاز mid — در دورهٔ استقرار تدریجی (low قبل از mid) پذیرفته و نگاشت می‌شود */
const LegacyPoints = z.object({
  total: z.number().int().min(0),
  badges: z.array(z.object({ key: z.string().regex(/^badge_\d{1,6}$/), threshold: z.number().int().min(1), awardedAt: z.string().nullable() })).max(10)
});
const PointsAny = z.union([PointsSummary, LegacyPoints]);

const BREAKER_THRESHOLD = 5;
const BREAKER_OPEN_MS = 10_000;
const STALE_MAX_MS = 10 * 60_000;
const NEGATIVE_TTL_MS = 30_000;
/** pageSizeهای مجاز فهرست عمومی (کلید cache محدود)؛ مقدار دیگر به نزدیک‌ترین بزرگ‌تر گرد می‌شود و meta.pageSize واقعی برمی‌گردد */
const PUBLIC_PAGE_SIZES = [10, 20, 30, 50] as const;
const PUBLIC_MAX_PAGE = 200;

type Ns = 'publicList' | 'publicOne' | 'points' | 'ledger';
const NS_MAX: Record<Ns, number> = { publicList: 500, publicOne: 2000, points: 5000, ledger: 5000 };
const NOT_FOUND = Symbol('not-found');

interface Entry {
  v: unknown;
  fresh: number;
  stale: number;
}

/**
 * کلاینت internal REST به api-mid (قفل #12: کلاینت low مستقیم به mid نمی‌زند).
 * timeout سخت، cache کوتاه با LRU per namespace، coalescing، circuit breaker per مسیر، stale-if-error تا ۱۰ دقیقه،
 * negative-cache برای 404 جلسهٔ عمومی (۳۰ ثانیه). پاسخ mid با schemaهای قرارداد parse می‌شود.
 */
@Injectable()
export class MidClient {
  private readonly log = new Logger('MidClient');
  private readonly caches: Record<Ns, Lru<string, Entry>> = {
    publicList: new Lru(NS_MAX.publicList),
    publicOne: new Lru(NS_MAX.publicOne),
    points: new Lru(NS_MAX.points),
    ledger: new Lru(NS_MAX.ledger)
  };
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly breakers = new Map<Ns, { failures: number; openUntil: number }>();

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly clock: Clock,
    private readonly badges: BadgesService
  ) {}

  /** بدون INTERNAL_URL_MID (فقط غیر production) mid در دسترس نیست و داده‌ٔ خالی برمی‌گردد */
  get stubbed(): boolean {
    return !this.env.INTERNAL_URL_MID;
  }

  async publicSessions(q: { page: number; pageSize: number; status?: string }): Promise<PublicList> {
    const pageSize = PUBLIC_PAGE_SIZES.find((s) => s >= q.pageSize) ?? 50;
    if (q.page > PUBLIC_MAX_PAGE) throw new AppError('VALIDATION_FAILED', { details: { fields: { page: `حداکثر ${PUBLIC_MAX_PAGE}` } } });
    if (this.stubbed) return { items: [], page: q.page, pageSize, total: 0 };
    const qs = new URLSearchParams({ page: String(q.page), pageSize: String(pageSize), ...(q.status ? { status: q.status } : {}) });
    const parsed = await this.get('publicList', qs.toString(), `/internal/v1/public/sessions?${qs}`, ListEnvelope(PublicSession), 30_000);
    return { items: parsed.data, ...parsed.meta };
  }

  async publicSession(id: string): Promise<Public> {
    if (this.stubbed) throw new AppError('NOT_FOUND');
    const parsed = await this.get('publicOne', id, `/internal/v1/public/sessions/${encodeURIComponent(id)}`, OneEnvelope(PublicSession), 30_000, true);
    return parsed.data;
  }

  /** L-21: شکل پویا (۱.۶.۰)؛ شکل قدیمی mid با کاتالوگ محلی نگاشت می‌شود */
  async points(userId: string): Promise<Points> {
    if (this.stubbed) {
      const c = await this.badges.catalog();
      return { total: 0, badges: c.all.filter((b) => b.active).map((b) => this.view(b, null)) };
    }
    const parsed = await this.get('points', userId, `/internal/v1/users/${encodeURIComponent(userId)}/points`, OneEnvelope(PointsAny), 15_000);
    return this.normalizePoints(parsed.data);
  }

  /** L-23: دفتر امتیاز من (MID_FOR_LOW.pointsLedger) */
  async pointsLedger(userId: string, page: number, pageSize: number): Promise<Page<Ledger>> {
    if (this.stubbed) return { items: [], page, pageSize, total: 0 };
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const parsed = await this.get('ledger', `${userId}?${qs}`, `/internal/v1/users/${encodeURIComponent(userId)}/points/ledger?${qs}`, ListEnvelope(PointsLedgerItem), 15_000);
    return { items: parsed.data, ...parsed.meta };
  }

  /** رویداد `points.changed`: کش L-21/L-23 همان کاربر در همین instance باطل می‌شود */
  evictUser(userId: string): void {
    this.caches.points.delete(userId);
    // کلیدهای دفتر `${userId}?page…` — فقط همان کاربر (پیمایش محدود به سقف namespace)
    const prefix = `${userId}?`;
    this.caches.ledger.deleteWhere((k) => k.startsWith(prefix));
  }

  private async normalizePoints(p: z.infer<typeof PointsAny>): Promise<Points> {
    const first = p.badges[0] as Record<string, unknown> | undefined;
    if (!first || 'id' in first) return p as Points;
    const legacy = p as z.infer<typeof LegacyPoints>;
    const c = await this.badges.catalog();
    const byKey = new Map(c.all.map((b) => [b.key, b]));
    return {
      total: legacy.total,
      badges: legacy.badges.map((b) => {
        const cat = byKey.get(b.key);
        return cat ? this.view(cat, b.awardedAt) : { id: b.key, key: b.key, title: `نشان ${b.threshold} امتیاز`, description: '', threshold: b.threshold, image: null, awardedAt: b.awardedAt };
      })
    };
  }

  private view(b: CatalogBadge, awardedAt: string | null): Points['badges'][number] {
    return { id: b.id, key: b.key, title: b.title, description: b.description, threshold: b.threshold, image: b.imageHash ? { hash: b.imageHash } : null, awardedAt };
  }

  private breaker(ns: Ns) {
    let b = this.breakers.get(ns);
    if (!b) this.breakers.set(ns, (b = { failures: 0, openUntil: 0 }));
    return b;
  }

  private async get<S extends z.ZodType>(ns: Ns, key: string, path: string, schema: S, ttlMs: number, notFoundIs404 = false): Promise<z.infer<S>> {
    const now = this.clock.now().getTime();
    const cache = this.caches[ns];
    const hit = cache.get(key);
    if (hit && hit.fresh > now) {
      if (hit.v === NOT_FOUND) throw new AppError('NOT_FOUND');
      return hit.v as z.infer<S>;
    }

    // breaker همین مسیر باز: فقط از stale جواب بده
    if (now < this.breaker(ns).openUntil) return this.staleOrFail<z.infer<S>>(path, hit, now);

    const flightKey = `${ns}|${key}`;
    let p = this.inflight.get(flightKey);
    if (!p) {
      p = this.fetchOnce(ns, key, path, schema, ttlMs, notFoundIs404, now).finally(() => this.inflight.delete(flightKey));
      this.inflight.set(flightKey, p);
    }
    try {
      return (await p) as z.infer<S>;
    } catch (e) {
      if (e instanceof AppError && e.code === 'NOT_FOUND') throw e;
      return this.staleOrFail<z.infer<S>>(path, hit, now, e);
    }
  }

  private staleOrFail<T>(path: string, hit: Entry | undefined, now: number, cause?: unknown): T {
    if (hit && hit.stale > now && hit.v !== NOT_FOUND) return hit.v as T;
    if (cause) this.log.warn({ path: path.split('?')[0]!.replace(/[0-9a-f-]{36}/gi, ':id'), err: cause instanceof Error ? cause.message : 'unknown' }, 'mid unavailable');
    throw new AppError('SERVICE_UNAVAILABLE');
  }

  private async fetchOnce<S extends z.ZodType>(ns: Ns, key: string, path: string, schema: S, ttlMs: number, notFoundIs404: boolean, now: number): Promise<z.infer<S>> {
    const br = this.breaker(ns);
    try {
      const res = await fetch(`${this.env.INTERNAL_URL_MID}${path}`, {
        headers: { ...internalHeaders(this.env, 'mid'), Accept: 'application/json' },
        signal: AbortSignal.timeout(this.env.INTERNAL_TIMEOUT_MS)
      });
      if (res.status === 404 && notFoundIs404) {
        br.failures = 0;
        this.caches[ns].set(key, { v: NOT_FOUND, fresh: now + NEGATIVE_TTL_MS, stale: now + NEGATIVE_TTL_MS });
        throw new AppError('NOT_FOUND');
      }
      if (!res.ok) throw new Error(`mid http ${res.status}`);
      const value = schema.parse(await res.json()) as z.infer<S>;
      br.failures = 0;
      this.caches[ns].set(key, { v: value, fresh: now + ttlMs, stale: now + STALE_MAX_MS });
      return value;
    } catch (e) {
      if (e instanceof AppError) throw e;
      if (++br.failures >= BREAKER_THRESHOLD) br.openUntil = this.clock.now().getTime() + BREAKER_OPEN_MS;
      throw e;
    }
  }
}
