import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { HEADERS, high, internal } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { isUuid } from '../common/ids';
import { MembersAccess } from '../domain/access.service';
import { SupportersService } from '../domain/supporters.service';
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
 * MID_ADMIN — عضویت/صاحب/پشتیبان (۱.۶.۰ و ۱.۷.۰): فهرست با فیلتر، تأیید/رد تکی و گروهی، حذف،
 * افزودن مستقیم، صاحب جلسه، پشتیبان‌ها، تاریخچهٔ عضویت کاربر، پیام به اعضای جلسه. فقط api-high.
 */
@Controller('o/internal/v1')
@InternalRoute()
@UseGuards(InternalGuard)
export class AdminMembersController {
  constructor(
    private readonly svc: AdminMembersService,
    private readonly admin: AdminService,
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly supporters: SupportersService,
    private readonly access: MembersAccess
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

  /** H-74 (۱.۷.۰): تغییر استاد صاحب؛ پاسخ AdminSession به‌روز */
  @InternalCallers('high')
  @Put(R.owner)
  @HttpCode(200)
  async owner(@Param('id') sid: string, @Body() raw: unknown) {
    const b = internal.MidAdminOwner.parse(raw);
    await this.svc.owner(id(sid), b);
    return ok(await this.admin.one(sid));
  }

  /** مهاجرت high: صاحبان جلسه (اعطای نقش teacher) */
  @InternalCallers('high')
  @Get(R.sessionOwners)
  async sessionOwners(@Query() raw: unknown) {
    const q = internal.MidAdminSessionOwnersQuery.parse(raw);
    return okList(await this.svc.sessionOwners(q.page, q.pageSize));
  }

  // ───── پشتیبان‌ها (H-104..H-109) ─────
  @InternalCallers('high')
  @Get(R.teacherSupporters)
  async teacherSupporters(@Param('id') uid: string, @Query() raw: unknown) {
    const q = internal.MidAdminSupportersQuery.parse(raw);
    return okList(await this.supporters.listTeacher(id(uid), q.page, q.pageSize));
  }

  @InternalCallers('high')
  @Put(R.teacherSupporter)
  @HttpCode(200)
  async putTeacherSupporter(@Param('id') uid: string, @Param('supporterId') supporterId: string, @Body() raw: unknown) {
    const b = internal.MidAdminSupporterPut.parse(raw);
    return ok(await this.supporters.setTeacher(id(uid), { userId: id(supporterId) }, b.permissions, { actorId: b.actorId, mode: 'upsert', names: { firstName: b.firstName, lastName: b.lastName } }));
  }

  @InternalCallers('high')
  @Delete(R.teacherSupporter)
  @HttpCode(200)
  async removeTeacherSupporter(@Param('id') uid: string, @Param('supporterId') supporterId: string, @Query() raw: unknown) {
    internal.MidAdminActorQuery.parse(raw);
    return ok(await this.supporters.removeTeacher(id(uid), supporterId));
  }

  @InternalCallers('high')
  @Get(R.supporters)
  async sessionSupporters(@Param('id') sid: string, @Query() raw: unknown) {
    const q = internal.MidAdminSupportersQuery.parse(raw);
    const s = await this.access.session(this.ds, id(sid), false, true);
    if (!s) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    return okList(await this.supporters.listSessionOf(s, q.page, q.pageSize));
  }

  @InternalCallers('high')
  @Put(R.supporter)
  @HttpCode(200)
  async putSessionSupporter(@Param('id') sid: string, @Param('userId') userId: string, @Body() raw: unknown) {
    const b = internal.MidAdminSupporterPut.parse(raw);
    return ok(await this.supporters.adminPutSession(id(sid), id(userId), b.permissions, b.actorId, { firstName: b.firstName, lastName: b.lastName }));
  }

  @InternalCallers('high')
  @Delete(R.supporter)
  @HttpCode(200)
  async removeSessionSupporter(@Param('id') sid: string, @Param('userId') userId: string, @Query() raw: unknown) {
    internal.MidAdminActorQuery.parse(raw);
    return ok(await this.supporters.removeSession(null, id(sid), userId));
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
