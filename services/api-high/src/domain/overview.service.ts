import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { internalHeaders } from '../internal/internal-auth';
import { ENV, type Env } from '../config/env';
import { AuditService } from './audit.service';
import { UsersService } from './users.service';

const Stats = z.object({ success: z.literal(true), data: z.object({ draft: z.number().int().min(0), scheduled: z.number().int().min(0), started: z.number().int().min(0), ended: z.number().int().min(0) }) });
type SessionStats = z.infer<typeof Stats>['data'];

const TTL_MS = 15_000;
const STALE_MS = 10 * 60_000;

/** نمای کلی: کاربران از DB خودمان؛ آمار جلسات از mid با internal REST (cache کوتاه + stale-if-error؛ بدون mid ⇒ 503) */
@Injectable()
export class OverviewService {
  private readonly log = new Logger('Overview');
  private cache?: { v: SessionStats; fresh: number; stale: number };

  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env
  ) {}

  private async sessions(): Promise<SessionStats> {
    if (!this.env.INTERNAL_URL_MID) return { draft: 0, scheduled: 0, started: 0, ended: 0 }; // فقط توسعه (production الزامی است)
    const now = this.clock.now().getTime();
    if (this.cache && this.cache.fresh > now) return this.cache.v;
    try {
      const res = await fetch(`${this.env.INTERNAL_URL_MID}/internal/v1/stats/sessions`, { headers: internalHeaders(this.env, 'mid'), signal: AbortSignal.timeout(this.env.INTERNAL_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`mid http ${res.status}`);
      const v = Stats.parse(await res.json()).data;
      this.cache = { v, fresh: now + TTL_MS, stale: now + STALE_MS };
      return v;
    } catch (e) {
      this.log.warn({ err: e instanceof Error ? e.message : 'unknown' }, 'mid stats unavailable');
      if (this.cache && this.cache.stale > now) return this.cache.v;
      throw new AppError('SERVICE_UNAVAILABLE');
    }
  }

  /** آخرین رویدادهای audit فقط با مجوز `system.audit.view` (وگرنه فهرست خالی) */
  async get(canViewAudit: boolean) {
    const [users, sessions, lastAudit] = await Promise.all([this.users.stats(), this.sessions(), canViewAudit ? this.audit.last(5) : Promise.resolve([])]);
    return { users, sessions, lastAudit };
  }
}
