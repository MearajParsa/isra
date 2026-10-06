import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { MidAdminClient } from '../internal/admin-clients';
import { AuditService } from './audit.service';
import { UsersService } from './users.service';

type SessionStats = { draft: number; scheduled: number; started: number; ended: number };

const TTL_MS = 15_000;
const STALE_MS = 10 * 60_000;

/** نمای کلی: کاربران از DB خودمان؛ آمار جلسات از mid با MidAdminClient مشترک (نگاشت خطا/timeout یکسان؛ cache کوتاه + stale-if-error؛ بدون mid ⇒ 503) */
@Injectable()
export class OverviewService {
  private readonly log = new Logger('Overview');
  private cache?: { v: SessionStats; fresh: number; stale: number };

  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly mid: MidAdminClient
  ) {}

  private async sessions(): Promise<SessionStats> {
    const now = this.clock.now().getTime();
    if (this.cache && this.cache.fresh > now) return this.cache.v;
    try {
      const v = await this.mid.sessionStats();
      this.cache = { v, fresh: now + TTL_MS, stale: now + STALE_MS };
      return v;
    } catch (e) {
      this.log.warn({ code: e instanceof AppError ? e.code : 'unknown' }, 'mid stats unavailable');
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
