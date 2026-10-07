import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock';
import { ENV, type Env } from '../config/env';

const DAY = 86_400_000;
const LIMIT = 5000;

/**
 * پاکسازی دوره‌ای دادهٔ منقضی (رشد جدول‌ها را مهار می‌کند)؛ هر جدول در هر دور حداکثر ۵۰۰۰ ردیف و هر شرط روی ستون ایندکس‌دار
 * (refresh_tokens.expires_at/rotated_at، auth_sessions.revoked_at، inbox_events.received_at، rate_limit_counters.window_start، …).
 */
@Injectable()
export class MaintenanceService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Maintenance');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
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
    const del = async (sql: string, ...args: unknown[]) => ((await this.ds.query(sql, [...args, LIMIT])) as { affectedRows?: number }).affectedRows ?? 0;
    const out: Record<string, number> = {};
    try {
      out.otp = await del('DELETE FROM otp_challenges WHERE expires_at < ? LIMIT ?', ago(DAY));
      out.otpCooldowns = await del('DELETE FROM otp_cooldowns WHERE last_sent_at < ? LIMIT ?', ago(DAY));
      out.refresh = await del('DELETE FROM refresh_tokens WHERE expires_at < ? LIMIT ?', ago(DAY));
      // توکن‌های چرخیده پس از ۷ روز فقط برای تشخیص reuse نگه داشته می‌شدند
      out.refreshRotated = await del('DELETE FROM refresh_tokens WHERE rotated_at < ? LIMIT ?', ago(7 * DAY));
      out.refreshOfRevoked = await del(
        'DELETE FROM refresh_tokens WHERE session_id IN (SELECT id FROM (SELECT id FROM auth_sessions WHERE revoked_at < ? ORDER BY revoked_at LIMIT ?) x)',
        ago(7 * DAY)
      );
      out.sessions = await del('DELETE FROM auth_sessions WHERE revoked_at < ? LIMIT ?', ago(30 * DAY));
      out.outbox = await del('DELETE FROM outbox_events WHERE published_at < ? LIMIT ?', ago(7 * DAY));
      out.inboxEvents = await del('DELETE FROM inbox_events WHERE received_at < ? LIMIT ?', ago(30 * DAY));
      out.deadLetters = await del('DELETE FROM dead_letter_events WHERE received_at < ? LIMIT ?', ago(90 * DAY));
      out.counters = await del('DELETE FROM rate_limit_counters WHERE window_start < ? LIMIT ?', ago(2 * DAY));
    } catch (e) {
      this.log.error({ err: e instanceof Error ? e.message : 'unknown' }, 'maintenance failed');
    }
    return out;
  }
}
