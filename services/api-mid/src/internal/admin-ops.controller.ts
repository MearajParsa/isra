import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { internal, pageQuery } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { isUuid } from '../common/ids';
import { AdminOpsService } from './admin-ops.service';
import { InternalGuard } from './internal.guard';
import { InternalCallers, InternalRoute } from './internal-auth';
import { PointsService } from '../domain/points.service';

const R = internal.MID_ADMIN;
const OccQuery = pageQuery(50);

const id = (v: string): string => {
  if (!isUuid(v)) throw new AppError('NOT_FOUND');
  return v;
};
const ok = (data: unknown) => ({ success: true, data });
const okList = (r: { items: unknown[]; page: number; pageSize: number; total: number }) => ({ success: true, data: r.items, meta: { page: r.page, pageSize: r.pageSize, total: r.total } });

/**
 * MID_ADMIN ۱.۶.۰ (docs-v2/30): نوبت‌ها، ثبت/لغو حضور، صف (با شرط هم‌زمانی)، ویرایش/باطل ارزیابی، امتیاز و نشان.
 * فقط api-high (`@InternalCallers('high')`)؛ مجوز/audit/step-up در high.
 */
@Controller('o/internal/v1')
@InternalRoute()
@UseGuards(InternalGuard)
export class AdminOpsController {
  constructor(private readonly ops: AdminOpsService) {}

  @InternalCallers('high')
  @Get(R.occurrences)
  async occurrences(@Param('id') sid: string, @Query() raw: unknown) {
    const q = OccQuery.parse(raw);
    return okList(await this.ops.occurrencesOf(id(sid), q.page, q.pageSize));
  }

  @InternalCallers('high')
  @Post(R.attendanceMark)
  @HttpCode(200)
  async attendanceMark(@Param('id') sid: string, @Body() raw: unknown) {
    return ok(await this.ops.attendanceMark(id(sid), internal.MidAdminMarkAttendance.parse(raw)));
  }

  @InternalCallers('high')
  @Post(R.attendanceRevoke)
  @HttpCode(200)
  async attendanceRevoke(@Param('id') sid: string, @Param('userId') userId: string, @Body() raw: unknown) {
    return ok(await this.ops.attendanceRevoke(id(sid), userId, internal.MidAdminRevokeAttendance.parse(raw)));
  }

  @InternalCallers('high')
  @Post(R.queueNext)
  @HttpCode(200)
  async queueNext(@Param('id') sid: string, @Body() raw: unknown) {
    const b = internal.MidAdminQueueNext.parse(raw);
    return ok(await this.ops.queueNext(id(sid), b.expectCurrentItemId));
  }

  @InternalCallers('high')
  @Patch(R.queueItem)
  @HttpCode(200)
  async queueItem(@Param('id') sid: string, @Param('itemId') itemId: string, @Body() raw: unknown) {
    const b = internal.MidAdminQueueAct.parse(raw);
    return ok(await this.ops.queueItem(id(sid), itemId, b.action, b.expectPosition));
  }

  @InternalCallers('high')
  @Patch(R.evaluation)
  @HttpCode(200)
  async evaluationPatch(@Param('id') sid: string, @Param('evalId') evalId: string, @Body() raw: unknown) {
    return ok(await this.ops.evaluationPatch(id(sid), evalId, internal.MidAdminEvaluationPatch.parse(raw)));
  }

  @InternalCallers('high')
  @Post(R.evaluationVoid)
  @HttpCode(200)
  async evaluationVoid(@Param('id') sid: string, @Param('evalId') evalId: string, @Body() raw: unknown) {
    const b = internal.MidAdminEvaluationVoid.parse(raw);
    return ok(await this.ops.evaluationVoid(id(sid), evalId, b.actorId, b.reason));
  }

  @InternalCallers('high')
  @Get(R.userPoints)
  async userPoints(@Param('id') uid: string, @Query() raw: unknown) {
    const q = internal.MidAdminUserPointsQuery.parse(raw);
    return ok(await this.ops.userPoints(id(uid), q.page, q.pageSize));
  }

  @InternalCallers('high')
  @Post(R.pointsAdjust)
  @HttpCode(200)
  async pointsAdjust(@Param('id') uid: string, @Body() raw: unknown) {
    const b = internal.MidAdminPointsAdjust.parse(raw);
    return ok(await this.ops.pointsAdjust(id(uid), b.actorId, b.delta, b.reason));
  }

  @InternalCallers('high')
  @Get(R.badgeHolders)
  async badgeHolders() {
    return ok(await this.ops.badgeHolders());
  }
}

/** MID_FOR_LOW (۱.۶.۰): دفتر امتیاز کاربر برای L-23 (ACL فقط low) */
@Controller('o/internal/v1')
@InternalRoute()
@UseGuards(InternalGuard)
export class PointsInternalController {
  constructor(private readonly points: PointsService) {}

  @InternalCallers('low')
  @Get(internal.MID_FOR_LOW.pointsLedger)
  async ledger(@Param('id') uid: string, @Query() raw: unknown) {
    const q = internal.MidLowPointsLedgerQuery.parse(raw);
    return okList(await this.points.ledger(id(uid), q.page, q.pageSize));
  }
}
