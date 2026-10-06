import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HEADERS, high, internal, pageQuery } from '@isra/api-types';
import { Clock } from '../common/clock';
import { AppError } from '../common/app-error';
import { isUuid } from '../common/ids';
import { AdminService, parseRange } from './admin.service';
import { InternalGuard } from './internal.guard';
import { InternalCallers, InternalRoute } from './internal-auth';
import { internalIdempotent } from './internal-idempotency';

const R = internal.MID_ADMIN;
const ListQuery = high.AdminSessionsQuery.extend(pageQuery(100).shape);

/** شناسهٔ نامعتبر = وجود ندارد */
const id = (v: string): string => {
  if (!isUuid(v)) throw new AppError('NOT_FOUND');
  return v;
};
const ok = (data: unknown) => ({ success: true, data });
const okList = (r: { items: unknown[]; page: number; pageSize: number; total: number }) => ({ success: true, data: r.items, meta: { page: r.page, pageSize: r.pageSize, total: r.total } });

/** بازهٔ گزارش: from/to اجباری (high پیش‌فرض‌ها را پر می‌کند) */
const range = (raw: unknown) => {
  const q = internal.MidAdminRangeQuery.parse(raw);
  return { r: parseRange(q.from, q.to), interval: q.interval };
};

/**
 * عملیات ادمین روی جلسه/عضو/حضور/صف/ارزیابی/امتیاز (docs-v2/26). فقط api-high (secret جفت mid↔high).
 * مجوزسنجی و audit در high است؛ اینجا فقط قواعد دامنه و ۴xx/۵xx استاندارد.
 */
@Controller('o/internal/v1')
@InternalRoute()
@UseGuards(InternalGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly ds: DataSource,
    private readonly clock: Clock
  ) {}

  @InternalCallers('high')
  @Get(R.sessions)
  async list(@Query() raw: unknown) {
    return okList(await this.admin.list(ListQuery.parse(raw)));
  }

  @InternalCallers('high')
  @Post(R.sessions)
  @HttpCode(200)
  async create(@Body() raw: unknown, @Headers(HEADERS.idempotencyKey.toLowerCase()) key?: string) {
    const b = internal.MidAdminCreateSession.parse(raw);
    return ok(await internalIdempotent(this.ds, this.clock, 'sessions', key, b, () => this.admin.create(b.creatorId, b.session)));
  }

  @InternalCallers('high')
  @Get(R.session)
  async one(@Param('id') sid: string) {
    return ok(await this.admin.one(id(sid)));
  }

  @InternalCallers('high')
  @Patch(R.session)
  @HttpCode(200)
  async patch(@Param('id') sid: string, @Body() raw: unknown) {
    const body = internal.MidAdminPatchSession.parse(raw);
    return ok(await this.admin.patch(id(sid), body));
  }

  @InternalCallers('high')
  @Post(R.transition)
  @HttpCode(200)
  async transition(@Param('id') sid: string, @Body() raw: unknown) {
    const b = internal.MidAdminTransition.parse(raw);
    return ok(await this.admin.transition(id(sid), b.to));
  }

  @InternalCallers('high')
  @Delete(R.session)
  @HttpCode(200)
  async remove(@Param('id') sid: string) {
    return ok(await this.admin.remove(id(sid)));
  }

  @InternalCallers('high')
  @Get(R.attendance)
  async attendance(@Param('id') sid: string) {
    return ok(await this.admin.attendanceOf(id(sid)));
  }

  @InternalCallers('high')
  @Get(R.queue)
  async queue(@Param('id') sid: string) {
    return ok(await this.admin.queueOf(id(sid)));
  }

  @InternalCallers('high')
  @Get(R.evaluations)
  async evaluations(@Param('id') sid: string) {
    return ok(await this.admin.evaluationsOf(id(sid)));
  }

  @InternalCallers('high')
  @Get(R.userSummary)
  async userSummary(@Param('id') uid: string) {
    return ok(await this.admin.userSummary(id(uid)));
  }

  @InternalCallers('high')
  @Get(R.reportOverview)
  async overview(@Query() raw: unknown) {
    return ok(await this.admin.overview(range(raw).r));
  }

  @InternalCallers('high')
  @Get(R.reportSessions)
  async series(@Query() raw: unknown) {
    const { r, interval } = range(raw);
    return ok(await this.admin.sessionsSeries(r, interval));
  }

  @InternalCallers('high')
  @Get(R.reportLeaderboard)
  async leaderboard(@Query() raw: unknown) {
    return ok(await this.admin.leaderboard(internal.MidAdminLeaderboardQuery.parse(raw).limit));
  }
}
