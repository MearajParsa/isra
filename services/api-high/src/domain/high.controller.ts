import { Controller, Req } from '@nestjs/common';
import type { z } from 'zod';
import type { high } from '@isra/api-types';
import { In, Route } from '../common/ep';
import type { IsraRequest } from '../common/request-context';
import { AuditService } from './audit.service';
import { OverviewService } from './overview.service';
import { RolesService } from './roles.service';
import { SettingsService } from './settings.service';
import { UsersAdminService } from './users-admin.service';
import { UsersService } from './users.service';
import { displayName } from './db';
import { DataSource } from 'typeorm';
import { uuidToBuf } from '../common/ids';
import { AccessQueryService } from './access/access-query.service';
import { RbacService } from './rbac.service';

type Page = { page: number; pageSize: number };
const uid = (r: IsraRequest) => r.user!.userId;

@Controller()
export class HighController {
  constructor(
    private readonly users: UsersService,
    private readonly usersAdmin: UsersAdminService,
    private readonly roles: RolesService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly overview: OverviewService,
    private readonly ds: DataSource,
    private readonly rbac: RbacService,
    private readonly accessQ: AccessQueryService
  ) {}

  @Route('H-00')
  async me(@Req() r: IsraRequest) {
    const rows = (await this.ds.query('SELECT phone, first_name, last_name FROM user_directory WHERE user_id = ?', [uuidToBuf(uid(r))])) as { phone: string; first_name: string; last_name: string }[];
    const d = rows[0];
    // کاربری که هنوز در دایرکتوری نیست نقش هم ندارد و در guard رد شده؛ اینجا همیشه هست
    const access = await this.rbac.access(uid(r));
    return { user: { id: uid(r), name: displayName(d?.first_name, d?.last_name), phone: d?.phone ?? '' }, roles: access.roles, tiers: access.tiers, permissions: access.permissions, ...(await this.accessQ.me(access)) };
  }

  @Route('H-01')
  getOverview(@Req() r: IsraRequest) {
    return this.overview.get(!!r.user?.perms.includes('system.audit.view'));
  }

  @Route('H-10')
  listRoles(@In() { query }: { query: z.infer<typeof high.RolesQuery> }) {
    return this.roles.list(query.page, query.pageSize, query.tier);
  }

  @Route('H-11')
  listPermissions(@In() { query }: { query: Page }) {
    return this.roles.permissions(query.page, query.pageSize);
  }

  @Route('H-12')
  setRolePermissions(@Req() r: IsraRequest, @In() { params, body }: { params: { key: string }; body: z.infer<typeof high.SetRolePermissionsBody> }) {
    return this.roles.setPermissions(uid(r), params.key, body.permissions);
  }

  @Route('H-20')
  listUsers(@In() { query }: { query: Page & z.infer<typeof high.UsersQuery> }) {
    return this.users.list(query);
  }

  @Route('H-21')
  getUser(@In() { params }: { params: { id: string } }) {
    return this.usersAdmin.get(params.id);
  }

  @Route('H-22')
  setRoles(@Req() r: IsraRequest, @In() { params, body }: { params: { id: string }; body: z.infer<typeof high.SetUserRolesBody> }) {
    return this.users.setRoles(uid(r), params.id, body.roles);
  }

  @Route('H-23')
  setGrants(@Req() r: IsraRequest, @In() { params, body }: { params: { id: string }; body: z.infer<typeof high.SetUserGrantsBody> }) {
    return this.users.setGrants(uid(r), params.id, body.grants);
  }

  @Route('H-30')
  getSettings() {
    return this.settings.get();
  }

  @Route('H-31')
  updateSettings(@Req() r: IsraRequest, @In() { body }: { body: z.infer<typeof high.UpdateSettingsBody> }) {
    return this.settings.update(uid(r), body);
  }

  @Route('H-40')
  auditList(@In() { query }: { query: Page & z.infer<typeof high.AuditQuery> }) {
    return this.audit.list(query.page, query.pageSize, query);
  }
}
