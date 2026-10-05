import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { high } from '@isra/api-types';
import { AppError } from '../../common/app-error';
import { Clock } from '../../common/clock';
import { bufToUuid } from '../../common/ids';
import { AuditService } from '../audit.service';
import { ClaimsService } from '../claims.service';
import { type Q, conflict } from '../db';
import { RbacService } from '../rbac.service';
import { DEVELOPER, MAX_PERMISSIONS_TOTAL } from '../rules';
import { isDeveloper, isReservedPermissionKey } from './policy';
import { RegistryService } from './registry.service';
import { forbidden, invalid, isDupKey, keyTaken, ph, systemProtected } from './write-helpers';

type Body<K extends keyof typeof high> = (typeof high)[K] extends z.ZodType ? z.infer<(typeof high)[K]> : never;

/** مدیریت رجیستری: مجوزهای پویا (H-85..H-87) و ماژول‌ها (H-89..H-91). قواعد E4–E7 در docs-v2/27 §3. */
@Injectable()
export class PermissionAdminService {
  constructor(
    private readonly clock: Clock,
    private readonly rbac: RbacService,
    private readonly registry: RegistryService,
    private readonly audit: AuditService,
    private readonly claims: ClaimsService
  ) {}

  private async log(m: Q, actorId: string, action: string, summary: string, meta: Record<string, unknown>) {
    await this.audit.write(m, { actor: await this.audit.actorOf(actorId, m), action, summary, meta });
  }

  /** کاربران اثرپذیر از تغییر مجوزهای ماژول‌ها (نقش‌های دارای آن ماژول) ∪ نقش‌های داده‌شده */
  private async holdersViaModules(m: Q, modules: readonly string[], extraRoles: readonly string[] = []): Promise<string[]> {
    const rows = modules.length ? ((await m.query(`SELECT DISTINCT role_key FROM role_modules WHERE module_key IN (${ph(modules.length)})`, [...modules])) as { role_key: string }[]) : [];
    return this.rbac.holders([...new Set([...rows.map((r) => r.role_key), ...extraRoles])], m);
  }

  private async holdersOfPermission(m: Q, perm: string): Promise<string[]> {
    const mod = (await m.query('SELECT module_key FROM permissions WHERE permission_key = ?', [perm])) as { module_key: string }[];
    const roles = (await m.query('SELECT DISTINCT role_key FROM role_permissions WHERE permission_key = ?', [perm])) as { role_key: string }[];
    const viaRoles = await this.holdersViaModules(m, mod.map((x) => x.module_key), roles.map((r) => r.role_key));
    const grants = (await m.query('SELECT user_id FROM user_grants WHERE grant_key = ?', [perm])) as { user_id: Buffer }[];
    return [...viaRoles, ...grants.map((g) => bufToUuid(g.user_id))];
  }

  // ───────── H-85 ─────────
  async createPermission(actorId: string, body: Body<'CreatePermissionBody'>) {
    if (isReservedPermissionKey(body.key)) throw invalid('key', 'کلید مجوز پویا نمی‌تواند با «system.» شروع شود.');
    await this.rbac.write(async (m) => {
      const actor = await this.rbac.access(actorId, m);
      if (body.stepUp === 'none' && !isDeveloper(actor) && !actor.permissions.includes('system.stepup.manage')) throw forbidden('برای مجوز بدون step-up به «system.stepup.manage» نیاز دارید.');
      const mod = (await m.query('SELECT module_key FROM system_modules WHERE module_key = ? FOR UPDATE', [body.moduleKey])) as unknown[];
      if (!mod.length) throw new AppError('NOT_FOUND', { message: 'ماژول پیدا نشد.' });
      const n = (await m.query('SELECT COUNT(*) AS n FROM permissions')) as { n: string | number }[];
      if (Number(n[0]?.n ?? 0) >= MAX_PERMISSIONS_TOTAL) throw invalid('key', `حداکثر ${MAX_PERMISSIONS_TOTAL} مجوز مجاز است.`);
      try {
        await m.query('INSERT INTO permissions (permission_key, title, module_key, description, is_system, grantable, step_up) VALUES (?, ?, ?, ?, 0, ?, ?)', [body.key, body.title, body.moduleKey, body.description, body.grantable ? 1 : 0, body.stepUp]);
      } catch (e) {
        if (isDupKey(e)) throw keyTaken('مجوز');
        throw e;
      }
      // developer همهٔ مجوزها را دارد (قفل و ثابت)
      await m.query('INSERT INTO role_permissions (role_key, permission_key, locked) VALUES (?, ?, 1)', [DEVELOPER, body.key]);
      await this.claims.publishMany(m, await this.holdersViaModules(m, [body.moduleKey], [DEVELOPER]));
      await this.rbac.bump(m);
      await this.log(m, actorId, 'permission.create', `مجوز «${body.title}» ساخته شد.`, { key: body.key, moduleKey: body.moduleKey, grantable: body.grantable, stepUp: body.stepUp });
    });
    return this.registry.permission(body.key);
  }

  // ───────── H-86 ─────────
  async updatePermission(actorId: string, key: string, body: Body<'UpdatePermissionBody'>) {
    await this.rbac.write(async (m) => {
      const rows = (await m.query('SELECT title, description, module_key, is_system, grantable, step_up FROM permissions WHERE permission_key = ? FOR UPDATE', [key])) as { title: string; description: string; module_key: string; is_system: number; grantable: number; step_up: 'required' | 'none' }[];
      const cur = rows[0];
      if (!cur) throw new AppError('NOT_FOUND', { message: 'مجوز پیدا نشد.' });
      const actor = await this.rbac.access(actorId, m);
      const changed: string[] = [];
      const affected: string[] = [];
      let title = cur.title;
      let description = cur.description;
      let moduleKey = cur.module_key;
      let grantable = !!cur.grantable;
      let stepUp = cur.step_up;
      if (body.title !== undefined && body.title !== title) (title = body.title, changed.push('title'));
      if (body.description !== undefined && body.description !== description) (description = body.description, changed.push('description'));
      if (body.moduleKey !== undefined && body.moduleKey !== moduleKey) {
        if (cur.is_system) throw systemProtected('این مجوز');
        const dest = (await m.query('SELECT module_key FROM system_modules WHERE module_key = ? FOR UPDATE', [body.moduleKey])) as unknown[];
        if (!dest.length) throw new AppError('NOT_FOUND', { message: 'ماژول پیدا نشد.' });
        affected.push(...(await this.holdersViaModules(m, [moduleKey, body.moduleKey])));
        moduleKey = body.moduleKey;
        changed.push('moduleKey');
      }
      if (body.grantable !== undefined && body.grantable !== grantable) {
        grantable = body.grantable;
        changed.push('grantable');
        if (!grantable) {
          const g = (await m.query('SELECT user_id FROM user_grants WHERE grant_key = ? FOR UPDATE', [key])) as { user_id: Buffer }[];
          if (g.length) {
            await m.query('DELETE FROM user_grants WHERE grant_key = ?', [key]);
            affected.push(...g.map((x) => bufToUuid(x.user_id)));
          }
        }
      }
      if (body.stepUp !== undefined && body.stepUp !== stepUp) {
        // E5: تغییر step-up فقط با system.stepup.manage
        if (!isDeveloper(actor) && !actor.permissions.includes('system.stepup.manage')) throw forbidden('تغییر step-up مجوز به «system.stepup.manage» نیاز دارد.');
        stepUp = body.stepUp;
        changed.push('stepUp');
      }
      if (!changed.length) return;
      await m.query('UPDATE permissions SET title = ?, description = ?, module_key = ?, grantable = ?, step_up = ? WHERE permission_key = ?', [title, description, moduleKey, grantable ? 1 : 0, stepUp, key]);
      await this.claims.publishMany(m, affected);
      await this.rbac.bump(m);
      await this.log(m, actorId, 'permission.update', `مجوز «${title}» ویرایش شد.`, { key, fields: changed });
    });
    return this.registry.permission(key);
  }

  // ───────── H-87 ─────────
  async deletePermission(actorId: string, key: string) {
    let before: Awaited<ReturnType<RegistryService['permission']>> | undefined;
    await this.rbac.write(async (m) => {
      const rows = (await m.query('SELECT is_system FROM permissions WHERE permission_key = ? FOR UPDATE', [key])) as { is_system: number }[];
      if (!rows[0]) throw new AppError('NOT_FOUND', { message: 'مجوز پیدا نشد.' });
      if (rows[0].is_system) throw systemProtected('این مجوز');
      before = (await this.registry.fresh(m)).permissions.find((p) => p.key === key);
      const affected = await this.holdersOfPermission(m, key);
      await m.query('DELETE FROM role_permissions WHERE permission_key = ?', [key]);
      await m.query('DELETE FROM role_step_up WHERE permission_key = ?', [key]);
      await m.query('DELETE FROM user_grants WHERE grant_key = ?', [key]);
      await m.query('DELETE FROM permissions WHERE permission_key = ?', [key]);
      await this.claims.publishMany(m, affected);
      await this.rbac.bump(m);
      await this.log(m, actorId, 'permission.delete', `مجوز «${before?.title ?? key}» حذف شد.`, { key, affectedUsers: new Set(affected).size });
    });
    return before!;
  }

  // ───────── ماژول‌ها ─────────
  async createModule(actorId: string, body: Body<'CreateModuleBody'>) {
    await this.rbac.write(async (m) => {
      const now = this.clock.now();
      try {
        await m.query('INSERT INTO system_modules (module_key, title, description, is_system, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)', [body.key, body.title, body.description, body.sortOrder, now, now]);
      } catch (e) {
        if (isDupKey(e)) throw keyTaken('ماژول');
        throw e;
      }
      await this.rbac.bump(m);
      await this.log(m, actorId, 'module.create', `ماژول «${body.title}» ساخته شد.`, { key: body.key });
    });
    return this.registry.module(body.key);
  }

  async updateModule(actorId: string, key: string, body: Body<'UpdateModuleBody'>) {
    await this.rbac.write(async (m) => {
      const rows = (await m.query('SELECT title, description, sort_order FROM system_modules WHERE module_key = ? FOR UPDATE', [key])) as { title: string; description: string; sort_order: number }[];
      const cur = rows[0];
      if (!cur) throw new AppError('NOT_FOUND', { message: 'ماژول پیدا نشد.' });
      const title = body.title ?? cur.title;
      const description = body.description ?? cur.description;
      const sortOrder = body.sortOrder ?? cur.sort_order;
      if (title === cur.title && description === cur.description && sortOrder === cur.sort_order) return;
      await m.query('UPDATE system_modules SET title = ?, description = ?, sort_order = ?, updated_at = ? WHERE module_key = ?', [title, description, sortOrder, this.clock.now(), key]);
      await this.rbac.bump(m);
      await this.log(m, actorId, 'module.update', `ماژول «${title}» ویرایش شد.`, { key, fields: Object.keys(body) });
    });
    return this.registry.module(key);
  }

  async deleteModule(actorId: string, key: string) {
    let before: Awaited<ReturnType<RegistryService['module']>> | undefined;
    await this.rbac.write(async (m) => {
      const rows = (await m.query('SELECT title, is_system FROM system_modules WHERE module_key = ? FOR UPDATE', [key])) as { title: string; is_system: number }[];
      if (!rows[0]) throw new AppError('NOT_FOUND', { message: 'ماژول پیدا نشد.' });
      if (rows[0].is_system) throw systemProtected('این ماژول');
      const n = (await m.query('SELECT COUNT(*) AS n FROM permissions WHERE module_key = ?', [key])) as { n: string | number }[];
      if (Number(n[0]?.n ?? 0) > 0) throw conflict('MODULE_NOT_EMPTY', 'ماژول هنوز مجوز دارد؛ ابتدا مجوزها را حذف یا جابه‌جا کنید.', { permissions: Number(n[0]?.n) });
      before = (await this.registry.fresh(m)).modules.find((x) => x.key === key);
      // ماژول خالی مجوزی به نقش نمی‌داد ⇒ برداشتنش از نقش‌ها claim را عوض نمی‌کند
      await m.query('DELETE FROM role_modules WHERE module_key = ?', [key]);
      await m.query('DELETE FROM system_modules WHERE module_key = ?', [key]);
      await this.rbac.bump(m);
      await this.log(m, actorId, 'module.delete', `ماژول «${rows[0].title}» حذف شد.`, { key });
    });
    return before!;
  }
}
