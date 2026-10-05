import { Controller, Req } from '@nestjs/common';
import type { z } from 'zod';
import type { high } from '@isra/api-types';
import { In, Route } from '../common/ep';
import type { IsraRequest } from '../common/request-context';
import { AccessQueryService } from './access/access-query.service';
import { PermissionAdminService } from './access/permission-admin.service';
import { RegistryService } from './access/registry.service';
import { RolesService } from './roles.service';

type Page = { page: number; pageSize: number };
type Key = { key: string };
type B<K extends keyof typeof high> = (typeof high)[K] extends z.ZodType ? z.infer<(typeof high)[K]> : never;
const uid = (r: IsraRequest) => r.user!.userId;

/** endpointهای RBAC پویا (قرارداد ۱.۵، docs-v2/27): نقش، مجوز، ماژول، ماتریس و دسترسی مؤثر. مجوز/step-up/اعتبارسنجی در EndpointGuard. */
@Controller()
export class RbacController {
  constructor(
    private readonly roles: RolesService,
    private readonly perms: PermissionAdminService,
    private readonly registry: RegistryService,
    private readonly access: AccessQueryService
  ) {}

  @Route('H-13')
  createRole(@Req() r: IsraRequest, @In() { body }: { body: B<'CreateRoleBody'> }) {
    return this.roles.create(uid(r), body);
  }
  @Route('H-14')
  getRole(@In() { params }: { params: Key }) {
    return this.roles.get(params.key);
  }
  @Route('H-15')
  updateRole(@Req() r: IsraRequest, @In() { params, body }: { params: Key; body: B<'UpdateRoleBody'> }) {
    return this.roles.update(uid(r), params.key, body);
  }
  @Route('H-16')
  deleteRole(@Req() r: IsraRequest, @In() { params }: { params: Key }) {
    return this.roles.remove(uid(r), params.key);
  }
  @Route('H-17')
  setRoleModules(@Req() r: IsraRequest, @In() { params, body }: { params: Key; body: B<'SetRoleModulesBody'> }) {
    return this.roles.setModules(uid(r), params.key, body.modules);
  }
  @Route('H-18')
  setRoleStepUp(@Req() r: IsraRequest, @In() { params, body }: { params: Key; body: B<'SetRoleStepUpBody'> }) {
    return this.roles.setStepUp(uid(r), params.key, body.rules);
  }

  @Route('H-85')
  createPermission(@Req() r: IsraRequest, @In() { body }: { body: B<'CreatePermissionBody'> }) {
    return this.perms.createPermission(uid(r), body);
  }
  @Route('H-86')
  updatePermission(@Req() r: IsraRequest, @In() { params, body }: { params: Key; body: B<'UpdatePermissionBody'> }) {
    return this.perms.updatePermission(uid(r), params.key, body);
  }
  @Route('H-87')
  deletePermission(@Req() r: IsraRequest, @In() { params }: { params: Key }) {
    return this.perms.deletePermission(uid(r), params.key);
  }

  @Route('H-88')
  async listModules(@In() { query }: { query: Page }) {
    const all = (await this.registry.snapshot()).modules;
    return { items: all.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), page: query.page, pageSize: query.pageSize, total: all.length };
  }
  @Route('H-89')
  createModule(@Req() r: IsraRequest, @In() { body }: { body: B<'CreateModuleBody'> }) {
    return this.perms.createModule(uid(r), body);
  }
  @Route('H-90')
  updateModule(@Req() r: IsraRequest, @In() { params, body }: { params: Key; body: B<'UpdateModuleBody'> }) {
    return this.perms.updateModule(uid(r), params.key, body);
  }
  @Route('H-91')
  deleteModule(@Req() r: IsraRequest, @In() { params }: { params: Key }) {
    return this.perms.deleteModule(uid(r), params.key);
  }

  @Route('H-92')
  matrix() {
    return this.registry.snapshot();
  }
  @Route('H-93')
  effective(@In() { params }: { params: { id: string } }) {
    return this.access.describeUser(params.id);
  }
  @Route('H-94')
  myAccess(@Req() r: IsraRequest) {
    return this.access.describe(uid(r));
  }
}
