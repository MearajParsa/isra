import { lockClause } from '../db/lock-clause';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock';
import { bufToUuid } from '../common/ids';
import { ENV, type Env } from '../config/env';
import { OUTBOX_ROUTES, type Peer, internalHeaders, isPeer } from '../internal/internal-auth';

const BATCH = 50;
const MAX_BACKOFF_SEC = 3600;
/** مهلت claim: ردیف claim‌شده تا این مدت به worker دیگری داده نمی‌شود (crash ⇒ پس از آن دوباره) */
const LEASE_SEC = 300;

interface Claimed {
  id: Buffer;
  type: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  pending: Peer[];
}

/**
 * outbox: رویدادها در همان تراکنش کسب‌وکار نوشته می‌شوند. worker:
 *  ۱) claim کوتاه در تراکنش (`FOR UPDATE SKIP LOCKED` + lease روی next_attempt_at) — بدون HTTP داخل تراکنش
 *  ۲) ارسال بیرون از تراکنش، فقط به مقصدهایی که آن نوع را مصرف می‌کنند (OUTBOX_ROUTES؛ شمارهٔ کامل فقط به high)
 *  ۳) وضعیت per مقصد (`pending_targets`) و UPDATE دسته‌ای
 * at-least-once؛ consumer با eventId dedupe می‌کند.
 */
@Injectable()
export class OutboxService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Outbox');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env
  ) {}

  onApplicationBootstrap() {
    if (!this.env.OUTBOX_ENABLED || this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), this.env.OUTBOX_POLL_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private urlOf(peer: Peer): string | undefined {
    return peer === 'mid' ? this.env.INTERNAL_URL_MID : peer === 'high' ? this.env.INTERNAL_URL_HIGH : undefined;
  }

  /** مقصدهای پیکربندی‌شده‌ای که این نوع را مصرف می‌کنند (نوع ناشناخته ⇒ همهٔ مقصدها، رفتار قبلی) */
  routeOf(type: string): Peer[] {
    const r = OUTBOX_ROUTES[type];
    const peers: Peer[] = r ? (Object.keys(r) as Peer[]) : ['mid', 'high'];
    return peers.filter((p) => !!this.urlOf(p));
  }

  /** payload ویژهٔ مقصد (حذف فیلدهای حساس برای مقصدی که لازم ندارد) */
  payloadFor(type: string, peer: Peer, payload: Record<string, unknown>): Record<string, unknown> {
    const strip = OUTBOX_ROUTES[type]?.[peer]?.strip;
    if (!strip?.length) return payload;
    const out = { ...payload };
    for (const k of strip) delete out[k];
    return out;
  }

  /** یک دور پردازش؛ تعداد رویداد کامل‌منتشرشده را برمی‌گرداند (تست‌پذیر) */
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const now = this.clock.now();
      const rows = await this.claim(now);
      if (!rows.length) return 0;

      const done: Buffer[] = [];
      const partial = new Map<string, Buffer[]>(); // pending باقی‌مانده ⇒ ids
      for (const r of rows) {
        const eventId = bufToUuid(r.id);
        const left: Peer[] = [];
        for (const peer of r.pending) {
          try {
            await this.post(peer, { eventId, type: r.type, occurredAt: r.createdAt.toISOString(), payload: this.payloadFor(r.type, peer, r.payload) });
          } catch (e) {
            left.push(peer);
            this.log.warn({ type: r.type, target: peer, err: e instanceof Error ? e.message : 'unknown' }, 'publish failed');
          }
        }
        if (!left.length) done.push(r.id);
        else {
          const k = left.join(',');
          partial.set(k, [...(partial.get(k) ?? []), r.id]);
        }
      }

      const inList = (ids: Buffer[]) => ids.map(() => '?').join(',');
      if (done.length) await this.ds.query(`UPDATE outbox_events SET published_at = ?, pending_targets = '' WHERE id IN (${inList(done)})`, [now, ...done]);
      for (const [left, ids] of partial) {
        await this.ds.query(
          // ترتیب SET مهم است (MySQL چپ‌به‌راست): backoff از attempts پیش از افزایش
          `UPDATE outbox_events SET pending_targets = ?, next_attempt_at = DATE_ADD(?, INTERVAL LEAST(?, POW(2, LEAST(attempts, 12)) * 5) SECOND),
             attempts = attempts + 1 WHERE id IN (${inList(ids)})`,
          [left, now, MAX_BACKOFF_SEC, ...ids]
        );
      }
      return done.length;
    } catch (e) {
      this.log.error({ err: e instanceof Error ? e.message : 'unknown' }, 'outbox tick failed');
      return 0;
    } finally {
      this.running = false;
    }
  }

  /** claim در تراکنش کوتاه: قفل ردیف‌ها، مسیریابی اولیه، lease؛ سپس commit (ارسال بیرون از تراکنش) */
  private async claim(now: Date): Promise<Claimed[]> {
    const lock = await lockClause(this.ds);
    return this.ds.transaction(async (m) => {
      const rows = (await m.query(`SELECT id, type, payload, pending_targets, created_at FROM outbox_events WHERE published_at IS NULL AND next_attempt_at <= ? ORDER BY next_attempt_at, created_at LIMIT ? ${lock}`, [now, BATCH])) as {
        id: Buffer;
        type: string;
        payload: unknown;
        pending_targets: string | null;
        created_at: Date;
      }[];
      if (!rows.length) return [];
      await m.query(`UPDATE outbox_events SET next_attempt_at = ? WHERE id IN (${rows.map(() => '?').join(',')})`, [new Date(now.getTime() + LEASE_SEC * 1000), ...rows.map((r) => r.id)]);
      return rows.map((r) => {
        const route = this.routeOf(r.type);
        const pending = r.pending_targets === null ? route : r.pending_targets.split(',').filter((p): p is Peer => isPeer(p) && route.includes(p));
        return { id: r.id, type: r.type, payload: (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload) as Record<string, unknown>, createdAt: r.created_at, pending };
      });
    });
  }

  private async post(peer: Peer, body: unknown): Promise<void> {
    const res = await fetch(`${this.urlOf(peer)}/internal/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...internalHeaders(this.env, peer) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.env.INTERNAL_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
  }
}
