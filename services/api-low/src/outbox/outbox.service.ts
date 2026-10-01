import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock';
import { bufToUuid } from '../common/ids';
import { ENV, type Env } from '../config/env';

const BATCH = 50;
const MAX_BACKOFF_SEC = 3600;

/**
 * outbox: رویدادها در همان تراکنش کسب‌وکار نوشته می‌شوند و worker با `FOR UPDATE SKIP LOCKED`
 * (چند instance بدون تداخل) آن‌ها را به mid/high می‌فرستد (at-least-once؛ consumer با eventId dedupe می‌کند).
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

  private targets(): string[] {
    return [this.env.INTERNAL_URL_MID, this.env.INTERNAL_URL_HIGH].filter((u): u is string => !!u);
  }

  /** یک دور پردازش؛ تعداد رویداد منتشرشده را برمی‌گرداند (تست‌پذیر) */
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.ds.transaction(async (m) => {
        const now = this.clock.now();
        const rows = (await m.query('SELECT id, type, payload, created_at, attempts FROM outbox_events WHERE published_at IS NULL AND next_attempt_at <= ? ORDER BY created_at LIMIT ? FOR UPDATE SKIP LOCKED', [now, BATCH])) as {
          id: Buffer;
          type: string;
          payload: unknown;
          created_at: Date;
          attempts: number;
        }[];
        const targets = this.targets();
        let published = 0;
        for (const r of rows) {
          const eventId = bufToUuid(r.id);
          const payload = typeof r.payload === 'string' ? (JSON.parse(r.payload) as unknown) : r.payload;
          try {
            for (const base of targets) await this.post(base, { eventId, type: r.type, occurredAt: r.created_at.toISOString(), payload });
            await m.query('UPDATE outbox_events SET published_at = ? WHERE id = ?', [now, r.id]);
            published++;
          } catch (e) {
            const delay = Math.min(MAX_BACKOFF_SEC, 2 ** Math.min(r.attempts, 12) * 5);
            await m.query('UPDATE outbox_events SET attempts = attempts + 1, next_attempt_at = ? WHERE id = ?', [new Date(now.getTime() + delay * 1000), r.id]);
            this.log.warn({ type: r.type, attempts: r.attempts + 1, err: e instanceof Error ? e.message : 'unknown' }, 'publish failed');
          }
        }
        return published;
      });
    } catch (e) {
      this.log.error({ err: e instanceof Error ? e.message : 'unknown' }, 'outbox tick failed');
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async post(base: string, body: unknown): Promise<void> {
    const res = await fetch(`${base}/internal/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': this.env.INTERNAL_SHARED_SECRET },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.env.INTERNAL_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
  }
}
