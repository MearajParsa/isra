import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock';
import { bufToUuid } from '../common/ids';
import { ENV, type Env } from '../config/env';
import { lockClause } from '../db/lock-clause';
import { routeOf } from '../domain/outbox.writer';
import { type Peer, internalHeaders, isPeer } from '../internal/internal-auth';

const BATCH = 50;
const MAX_BACKOFF_SEC = 3600;
/** مهلت claim: ردیف claim‌شده تا این مدت به worker دیگر داده نمی‌شود (ارسال بیرون از تراکنش) */
const LEASE_MS = 60_000;

interface Row {
  id: Buffer;
  type: string;
  payload: unknown;
  created_at: Date;
  attempts: number;
  pending_peers: string | null;
}

/**
 * outbox: رویدادها در همان تراکنش کسب‌وکار نوشته می‌شوند. worker (docs-v2/30 §۳):
 *  ۱) claim کوتاه با `FOR UPDATE SKIP LOCKED` + lease (next_attempt_at جلو می‌رود) و commit
 *  ۲) ارسال HTTP **بیرون از تراکنش** فقط به مقصدهای مصرف‌کنندهٔ همان نوع (`pending_peers`)
 *  ۳) وضعیت per مقصد: مقصد موفق از فهرست حذف می‌شود؛ مقصد ناموفق با backoff دوباره (بدون ارسال تکراری به مقصد موفق)
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

  private url(peer: Peer): string | undefined {
    return peer === 'low' ? this.env.INTERNAL_URL_LOW : peer === 'mid' ? this.env.INTERNAL_URL_MID : undefined;
  }

  /** مقصدهای باقی‌ماندهٔ ردیف (ردیف‌های پیش از ستون pending_peers ⇒ از مسیر نوع) */
  private peersOf(r: Row): Peer[] {
    const raw = r.pending_peers === null ? routeOf(r.type) : r.pending_peers.split(',');
    return raw.filter(isPeer);
  }

  /** یک دور پردازش؛ تعداد رویداد کامل‌منتشرشده را برمی‌گرداند (تست‌پذیر) */
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const lock = await lockClause(this.ds);
      const now = this.clock.now();
      const rows = await this.ds.transaction(async (m) => {
        const rs = (await m.query('SELECT id, type, payload, created_at, attempts, pending_peers FROM outbox_events WHERE published_at IS NULL AND next_attempt_at <= ? ORDER BY created_at LIMIT ? ' + lock, [now, BATCH])) as Row[];
        if (rs.length) await m.query(`UPDATE outbox_events SET next_attempt_at = ? WHERE id IN (${rs.map(() => '?').join(',')})`, [new Date(now.getTime() + LEASE_MS), ...rs.map((r) => r.id)]);
        return rs;
      });
      let published = 0;
      const done: Buffer[] = [];
      for (const r of rows) {
        const eventId = bufToUuid(r.id);
        const payload = typeof r.payload === 'string' ? (JSON.parse(r.payload) as unknown) : r.payload;
        const body = { eventId, type: r.type, occurredAt: r.created_at.toISOString(), payload };
        const remaining: Peer[] = [];
        let lastErr = '';
        for (const peer of this.peersOf(r)) {
          const url = this.url(peer);
          if (!url) continue; // مقصد پیکربندی‌نشده (فقط توسعه) ⇒ رها
          try {
            await this.post(peer, url, body);
          } catch (e) {
            remaining.push(peer);
            lastErr = e instanceof Error ? e.message : 'unknown';
          }
        }
        if (!remaining.length) {
          done.push(r.id);
          published++;
        } else {
          const delay = Math.min(MAX_BACKOFF_SEC, 2 ** Math.min(r.attempts, 12) * 5);
          await this.ds.query('UPDATE outbox_events SET attempts = attempts + 1, next_attempt_at = ?, pending_peers = ? WHERE id = ?', [new Date(now.getTime() + delay * 1000), remaining.join(','), r.id]);
          this.log.warn({ type: r.type, attempts: r.attempts + 1, peers: remaining, err: lastErr }, 'publish failed');
        }
      }
      if (done.length) await this.ds.query(`UPDATE outbox_events SET published_at = ?, pending_peers = '' WHERE id IN (${done.map(() => '?').join(',')})`, [now, ...done]);
      return published;
    } catch (e) {
      this.log.error({ err: e instanceof Error ? e.message : 'unknown' }, 'outbox tick failed');
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async post(peer: Peer, url: string, body: unknown): Promise<void> {
    const res = await fetch(`${url}/internal/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...internalHeaders(this.env, peer) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.env.INTERNAL_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
  }
}
