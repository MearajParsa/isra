import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RevocationService } from '../auth/revocation.service';
import { Clock } from '../common/clock';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { ENV, type Env } from '../config/env';

const DAY = 86_400_000;

/** پاکسازی دادهٔ منقضی (audit هرگز پاک نمی‌شود) */
@Injectable()
export class MaintenanceService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Maintenance');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly limiter: RateLimitService,
    private readonly revocation: RevocationService,
    @Inject(ENV) private readonly env: Env
  ) {}

  onApplicationBootstrap() {
    if (!this.env.MAINTENANCE_ENABLED || this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.run(), 10 * 60_000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<Record<string, number>> {
    const now = this.clock.now().getTime();
    const ago = (ms: number) => new Date(now - ms);
    const del = async (sql: string, ...args: unknown[]) => ((await this.ds.query(sql, args)) as { affectedRows?: number }).affectedRows ?? 0;
    const out: Record<string, number> = {};
    try {
      out.outbox = await del('DELETE FROM outbox_events WHERE published_at < ? LIMIT 5000', ago(7 * DAY));
      out.revokedSessions = await this.revocation.purgeExpired();
      out.inboxEvents = await del('DELETE FROM inbox_events WHERE received_at < ? LIMIT 5000', ago(30 * DAY));
      out.counters = await this.limiter.purgeOlderThan(ago(2 * DAY));
    } catch (e) {
      this.log.error({ err: e instanceof Error ? e.message : 'unknown' }, 'maintenance failed');
    }
    return out;
  }
}
