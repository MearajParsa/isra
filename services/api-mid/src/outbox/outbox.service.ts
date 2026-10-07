import { lockClause } from '../db/lock-clause';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock';
import { bufToUuid } from '../common/ids';
import { ENV, type Env } from '../config/env';
import { type Peer, internalHeaders } from '../internal/internal-auth';

const BATCH = 50;
const MAX_BACKOFF_SEC = 3600;
/** اجارهٔ claim: اگر worker پیش از به‌روزرسانی نهایی بمیرد، رویداد پس از این مدت دوباره برداشته می‌شود */
const LEASE_MS = 60_000;

interface OutboxRow {
  id: Buffer;
  type: string;
  payload: unknown;
  created_at: Date;
  attempts: number;
}

/** مسیریابی per نوع: هر رویداد فقط به سرویس‌هایی که آن را مصرف می‌کنند (ACL گیرنده) */
const ROUTES: Readonly<Record<string, readonly Peer[]>> = {
  'inbox.message.created': ['low'],
  'inbox.messages.created': ['low'],
  'points.changed': ['low']
};
export const routesFor = (type: string): readonly Peer[] => ROUTES[type] ?? [];

/**
 * outbox: رویدادها در همان تراکنش کسب‌وکار نوشته می‌شوند و worker با `FOR UPDATE SKIP LOCKED`
 * (چند instance بدون تداخل) آن‌ها را به low می‌فرستد (at-least-once؛ consumer با eventId dedupe می‌کند).
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

  /** آدرس هر peer (فعلاً فقط low پیکربندی دارد) */
  private url(peer: Peer): string | undefined {
    return peer === 'low' ? this.env.INTERNAL_URL_LOW : undefined;
  }

  /**
   * یک دور: claim در تراکنش کوتاه (`FOR UPDATE SKIP LOCKED` + اجارهٔ next_attempt_at) ⇒ ارسال بیرون از تراکنش per مقصد
   * (فقط سرویس‌هایی که آن نوع را مصرف می‌کنند) ⇒ UPDATE دسته‌ای موفق/ناموفق. تعداد منتشرشده را برمی‌گرداند (تست‌پذیر).
   */
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const lock = await lockClause(this.ds);
      const now = this.clock.now();
      const rows = await this.ds.transaction(async (m) => {
        const r = (await m.query('SELECT id, type, payload, created_at, attempts FROM outbox_events WHERE published_at IS NULL AND next_attempt_at <= ? ORDER BY created_at LIMIT ? ' + lock, [now, BATCH])) as OutboxRow[];
        if (r.length) await m.query(`UPDATE outbox_events SET next_attempt_at = ? WHERE id IN (${r.map(() => '?').join(',')})`, [new Date(now.getTime() + LEASE_MS), ...r.map((x) => x.id)]);
        return r;
      });
      if (!rows.length) return 0;
      const ok: Buffer[] = [];
      const failed: Buffer[] = [];
      for (const r of rows) {
        const peers = routesFor(r.type);
        if (!peers.length) this.log.warn({ type: r.type }, 'outbox: no consumer for type; dropped');
        const payload = typeof r.payload === 'string' ? (JSON.parse(r.payload) as unknown) : r.payload;
        try {
          for (const peer of peers) {
            const url = this.url(peer);
            if (!url) throw new Error(`no url for ${peer}`);
            await this.post({ peer, url }, { eventId: bufToUuid(r.id), type: r.type, occurredAt: r.created_at.toISOString(), payload });
          }
          ok.push(r.id);
        } catch (e) {
          failed.push(r.id);
          this.log.warn({ type: r.type, attempts: r.attempts + 1, err: e instanceof Error ? e.message : 'unknown' }, 'publish failed');
        }
      }
      if (ok.length) await this.ds.query(`UPDATE outbox_events SET published_at = ? WHERE id IN (${ok.map(() => '?').join(',')})`, [now, ...ok]);
      if (failed.length)
        await this.ds.query(
          `UPDATE outbox_events SET attempts = attempts + 1, next_attempt_at = DATE_ADD(?, INTERVAL LEAST(${MAX_BACKOFF_SEC}, POW(2, LEAST(attempts, 12)) * 5) SECOND) WHERE id IN (${failed.map(() => '?').join(',')})`,
          [now, ...failed]
        );
      return ok.length;
    } catch (e) {
      this.log.error({ err: e instanceof Error ? e.message : 'unknown' }, 'outbox tick failed');
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async post(target: { peer: Peer; url: string }, body: unknown): Promise<void> {
    const res = await fetch(`${target.url}/internal/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...internalHeaders(this.env, target.peer) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.env.INTERNAL_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
  }
}
