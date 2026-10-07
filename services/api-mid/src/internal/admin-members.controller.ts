import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { HEADERS, high, internal } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { isUuid } from '../common/ids';
import { AdminMembersService } from './admin-members.service';
import { AdminService } from './admin.service';
import { InternalGuard } from './internal.guard';
import { InternalCallers, InternalRoute } from './internal-auth';
import { internalIdempotent } from './internal-idempotency';

const R = internal.MID_ADMIN;
const ActorOpt = z.object({ actorId: z.uuid().optional() }).loose();

const id = (v: string): string => {
  if (!isUuid(v)) throw new AppError('NOT_FOUND');
  return v;
};
const ok = (data: unknown) => ({ success: true, data });
const okList = (r: { items: unknown[]; page: number; pageSize: number; total: number }) => ({ success: true, data: r.items, meta: { page: r.page, pageSize: r.pageSize, total: r.total } });

/**
 * MID_ADMIN — عضویت (۱.۶.۰؛ docs-v2/30 §۱.۴): فهرست با فیلتر، تأیید/رد تکی و گروهی، نقش‌ها (با session_manager)، حذف،
 * افزودن مستقیم، مدیر، تاریخچهٔ عضویت کاربر، پیام به اعضای جلسه. فقط api-high.
 */
@Controller('o/internal/v1')
@InternalRoute()
@UseGuards(InternalGuard)
export class AdminMembersController {
  constructor(
    private readonly svc: AdminMembersService,
    private readonly admin: AdminService,
    private readonly ds: DataSource,
    private readonly clock: Clock
  ) {}

  @InternalCallers('high')
  @Get(R.members)
  async members(@Param('id') sid: string, @Query() raw: unknown) {
    const q = high.AdminMembersQuery.parse(raw);
    return okList(await this.svc.list(id(sid), q, q.page, q.pageSize));
  }

  @InternalCallers('high')
  @Patch(R.member)
  @HttpCode(200)
  async decide(@Param('id') sid: string, @Param('memberId') mid: string, @Body() raw: unknown) {
    const { actorId: _a, ...rest } = ActorOpt.parse(raw ?? {});
    const b = internal.MidAdminDecide.parse(rest);
    return ok(await this.svc.decide(id(sid), mid, b.action));
  }

  /** بدنه: AdminSetMemberRolesBody (+actorId اختیاری؛ schema قرارداد strict است و actorId را جدا می‌خوانیم) */
  @InternalCallers('high')
  @Put(R.memberRoles)
  @HttpCode(200)
  async setRoles(@Param('id') sid: string, @Param('memberId') mid: string, @Body() raw: unknown) {
    const { actorId, ...rest } = ActorOpt.parse(raw ?? {});
    const b = internal.MidAdminSetRoles.parse(rest);
    return ok(await this.svc.setRoles(id(sid), mid, b.roles, actorId ?? null));
  }

  @InternalCallers('high')
  @Delete(R.member)
  @HttpCode(200)
  async removeMember(@Param('id') sid: string, @Param('memberId') mid: string) {
    // ۱.۶.۰: شناسهٔ کاربرِ حذف‌شده برای audit high (`session.member_remove`)
    return ok(await this.svc.removeMember(id(sid), mid));
  }

  @InternalCallers('high')
  @Post(R.membersAdd)
  @HttpCode(200)
  async add(@Param('id') sid: string, @Body() raw: unknown, @Headers(HEADERS.idempotencyKey.toLowerCase()) key?: string) {
    const b = internal.MidAdminAddMembers.parse(raw);
    const sessionId = id(sid);
    return ok(await internalIdempotent(this.ds, this.clock, `membersAdd:${sessionId}`, key, b, () => this.svc.add(sessionId, b)));
  }

  @InternalCallers('high')
  @Post(R.membersDecide)
  @HttpCode(200)
  async decideBulk(@Param('id') sid: string, @Body() raw: unknown) {
    return ok(await this.svc.decideBulk(id(sid), internal.MidAdminDecideBulk.parse(raw)));
  }

  /** H-74: پاسخ AdminSession به‌روز */
  @InternalCallers('high')
  @Put(R.manager)
  @HttpCode(200)
  async manager(@Param('id') sid: string, @Body() raw: unknown) {
    const b = internal.MidAdminManager.parse(raw);
    await this.svc.manager(id(sid), b);
    return ok(await this.admin.one(sid));
  }

  @InternalCallers('high')
  @Get(R.userMemberships)
  async userMemberships(@Param('id') uid: string, @Query() raw: unknown) {
    return okList(await this.svc.userMemberships(id(uid), internal.MidAdminUserMembershipsQuery.parse(raw)));
  }

  @InternalCallers('high')
  @Post(R.notify)
  @HttpCode(200)
  async notify(@Param('id') sid: string, @Body() raw: unknown) {
    return ok(await this.svc.notify(id(sid), internal.MidAdminNotify.parse(raw)));
  }
}
