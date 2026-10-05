import { Controller, Req } from '@nestjs/common';
import type { z } from 'zod';
import type { high } from '@isra/api-types';
import { In, Route } from '../common/ep';
import type { IsraRequest } from '../common/request-context';
import { AccountService } from './account.service';
import { ReportsService } from './reports.service';
import type { SystemRoleKey } from './rules';
import { SessionsAdminService } from './sessions-admin.service';
import { UsersAdminService } from './users-admin.service';

type Page = { page: number; pageSize: number };
type Id = { id: string };
type Series = { from?: string; to?: string; interval: 'day' | 'week' | 'month' };
type B<K extends keyof typeof high> = (typeof high)[K] extends z.ZodType ? z.infer<(typeof high)[K]> : never;
const me = (r: IsraRequest) => r.user!;
const actor = (r: IsraRequest) => ({ id: r.user!.userId, roles: r.user!.roles as SystemRoleKey[] });

/** endpointهای قرارداد ۱.۴: حساب من، مدیریت کاربر، جلسه‌ها، گزارش‌ها. مجوز/step-up/اعتبارسنجی در EndpointGuard. */
@Controller()
export class AdminController {
  constructor(
    private readonly account: AccountService,
    private readonly users: UsersAdminService,
    private readonly sessions: SessionsAdminService,
    private readonly reports: ReportsService
  ) {}

  // ───────── حساب من ─────────
  @Route('H-02')
  myAccount(@Req() r: IsraRequest) {
    return this.account.get(me(r));
  }
  @Route('H-03')
  updateMyProfile(@Req() r: IsraRequest, @In() { body }: { body: B<'UpdateMyProfileBody'> }) {
    return this.account.updateProfile(me(r), body);
  }
  @Route('H-04')
  async setMyPassword(@Req() r: IsraRequest, @In() { body }: { body: B<'SetMyPasswordBody'> }) {
    await this.account.setPassword(me(r), body);
    return {};
  }
  @Route('H-05')
  mySessions(@Req() r: IsraRequest, @In() { query }: { query: Page }) {
    return this.account.sessions(me(r), query.page, query.pageSize);
  }
  @Route('H-06')
  async revokeMySession(@Req() r: IsraRequest, @In() { params }: { params: Id }) {
    await this.account.revoke(me(r), params.id);
    return {};
  }
  @Route('H-07')
  async revokeOthers(@Req() r: IsraRequest) {
    await this.account.revokeOthers(me(r));
    return {};
  }

  // ───────── مدیریت کاربر ─────────
  @Route('H-24')
  createUser(@Req() r: IsraRequest, @In() { body }: { body: B<'CreateUserBody'> }) {
    return this.users.create(actor(r), body);
  }
  @Route('H-25')
  updateUser(@Req() r: IsraRequest, @In() { params, body }: { params: Id; body: B<'UpdateUserBody'> }) {
    return this.users.update(actor(r), params.id, body);
  }
  @Route('H-26')
  setUserStatus(@Req() r: IsraRequest, @In() { params, body }: { params: Id; body: B<'SetUserStatusBody'> }) {
    return this.users.setStatus(actor(r), params.id, body.status);
  }
  @Route('H-27')
  async deleteUser(@Req() r: IsraRequest, @In() { params }: { params: Id }) {
    await this.users.remove(actor(r), params.id);
    return {};
  }
  @Route('H-28')
  async setUserPassword(@Req() r: IsraRequest, @In() { params, body }: { params: Id; body: B<'UserPasswordBody'> }) {
    await this.users.setPassword(actor(r), params.id, body);
    return {};
  }
  @Route('H-29')
  async logoutAll(@Req() r: IsraRequest, @In() { params }: { params: Id }) {
    await this.users.logoutAll(actor(r), params.id);
    return {};
  }
  @Route('H-50')
  userSessions(@Req() r: IsraRequest, @In() { params, query }: { params: Id; query: Page }) {
    return this.users.sessions(params.id, query.page, query.pageSize, r.user!.sessionId);
  }
  @Route('H-51')
  async revokeUserSession(@Req() r: IsraRequest, @In() { params }: { params: Id & { sessionId: string } }) {
    await this.users.revokeSession(actor(r), params.id, params.sessionId);
    return {};
  }

  // ───────── جلسه‌ها ─────────
  @Route('H-60')
  listSessions(@In() { query }: { query: z.infer<typeof high.AdminSessionsQuery> & Page }) {
    return this.sessions.list(query);
  }
  @Route('H-61')
  getSession(@In() { params }: { params: Id }) {
    return this.sessions.get(params.id);
  }
  @Route('H-62')
  createSession(@Req() r: IsraRequest, @In() { body }: { body: B<'AdminCreateSessionBody'> }) {
    return this.sessions.create(me(r).userId, body);
  }
  @Route('H-63')
  updateSession(@Req() r: IsraRequest, @In() { params, body }: { params: Id; body: Parameters<SessionsAdminService['update']>[2] }) {
    return this.sessions.update(me(r).userId, params.id, body);
  }
  @Route('H-64')
  transition(@Req() r: IsraRequest, @In() { params, body }: { params: Id; body: { to: 'scheduled' | 'started' | 'ended' } }) {
    return this.sessions.transition(me(r).userId, params.id, body.to);
  }
  @Route('H-65')
  async deleteSession(@Req() r: IsraRequest, @In() { params }: { params: Id }) {
    await this.sessions.remove(me(r).userId, params.id);
    return {};
  }
  @Route('H-66')
  members(@In() { params, query }: { params: Id; query: Page & { status?: string } }) {
    return this.sessions.members(params.id, query);
  }
  @Route('H-67')
  decide(@Req() r: IsraRequest, @In() { params, body }: { params: Id & { memberId: string }; body: B<'AdminDecideBody'> }) {
    return this.sessions.decide(me(r).userId, params.id, params.memberId, body.action);
  }
  @Route('H-68')
  memberRoles(@Req() r: IsraRequest, @In() { params, body }: { params: Id & { memberId: string }; body: { roles: Parameters<SessionsAdminService['setRoles']>[3] } }) {
    return this.sessions.setRoles(me(r).userId, params.id, params.memberId, body.roles);
  }
  @Route('H-69')
  async removeMember(@Req() r: IsraRequest, @In() { params }: { params: Id & { memberId: string } }) {
    await this.sessions.removeMember(me(r).userId, params.id, params.memberId);
    return {};
  }
  @Route('H-70')
  attendance(@In() { params }: { params: Id }) {
    return this.sessions.attendance(params.id);
  }
  @Route('H-71')
  queue(@In() { params }: { params: Id }) {
    return this.sessions.queue(params.id);
  }
  @Route('H-72')
  evaluations(@In() { params }: { params: Id }) {
    return this.sessions.evaluations(params.id);
  }

  // ───────── گزارش‌ها ─────────
  @Route('H-80')
  reportOverview(@In() { query }: { query: { from?: string; to?: string } }) {
    return this.reports.overview(query);
  }
  @Route('H-81')
  registrations(@In() { query }: { query: Series }) {
    return this.reports.registrations(query);
  }
  @Route('H-82')
  sessionsSeries(@In() { query }: { query: Series }) {
    return this.reports.sessions(query);
  }
  @Route('H-83')
  otp(@In() { query }: { query: Series }) {
    return this.reports.otp(query);
  }
  @Route('H-84')
  leaderboard(@In() { query }: { query: { limit: number } }) {
    return this.reports.leaderboard(query.limit);
  }
}
