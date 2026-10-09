import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { high } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { uuidToBuf } from '../common/ids';
import { RegistryService } from './access/registry.service';
import { developerImmutable, invalid, isDupKey, keyTaken, lockRole, permissionsOfModules, ph, requireHeld, requireImplicitSafe, requireModules, requirePermissions, requireTierManage, systemProtected, unique } from './access/write-helpers';
import { AuditService } from './audit.service';
import { ClaimsService } from './claims.service';
import { type Q, conflict } from './db';
import { emit } from './outbox.writer';
import { RbacService } from './rbac.service';
import { DEVELOPER, type PermissionKey, RESERVED_ROLE_KEYS, type StepUpMode, type SystemRoleKey, type Tier, missingLocked, sameSet } from './rules';

type Body<K extends keyof typeof high> = (typeof high)[K] extends z.ZodType ? z.infer<(typeof high)[K]> : never;

/**
 * مدیریت نقش‌ها (H-10..H-18): ساخت/ویرایش/حذف، مجوز صریح، ماژول و قواعد step-up. قواعد E2–E6 در docs-v2/27 §3.
 * ۱.۷.۰ (docs-v2/31 §۱): مجوز لازم per سطح نقش هدف (`requireTierManage`)؛ developer ثابت؛ نقش‌های ضمنی مجوز سطح high نمی‌گیرند.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly clock: Clock,
    private readonly rbac: RbacService,
    private readonly registry: RegistryService,
    private readonly audit: AuditService,
    private readonly claims: ClaimsService
  ) {}

  async list(page: number, pageSize: number, tier?: Tier) {
    const all = (await this.registry.snapshot()).roles.filter((r) => !tier || r.tier === tier);
    return { items: all.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: all.length };
  }

  async permissions(page: number, pageSize: number) {
    const all = (await this.registry.snapshot()).permissions;
    return { items: all.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: all.length };
  }

  get(key: string) {
    return this.registry.role(key);
  }

  private async log(m: Q, actorId: string, action: string, role: { key: string; title: string }, summary: string, meta: Record<string, unknown>) {
    await this.audit.write(m, { actor: await this.audit.actorOf(actorId, m), action, target: { type: 'role', id: role.key, label: role.title }, summary, meta });
  }

  // ───────── H-13 ─────────
  async create(actorId: string, body: Body<'CreateRoleBody'>) {
    if (RESERVED_ROLE_KEYS.includes(body.key)) throw invalid('key', 'این کلید رزرو است.');
    const explicit = unique(body.permissions);
    const modules = unique(body.modules);
    await this.rbac.write(async (m) => {
      const actor = await this.rbac.access(actorId, m);
      requireTierManage(actor, body.tier, 'system.role.manage');
      await requireModules(m, modules);
      await requirePermissions(m, explicit);
      requireHeld(actor, [...explicit, ...(await permissionsOfModules(m, modules))], 'این نقش');
      const now = this.clock.now();
      try {
        await m.query('INSERT INTO system_roles (role_key, title, description, undeletable, tier, created_at, updated_at, created_by) VALUES (?, ?, ?, 0, ?, ?, ?, ?)', [body.key, body.title, body.description, body.tier, now, now, uuidToBuf(actorId)]);
      } catch (e) {
        if (isDupKey(e)) throw keyTaken('نقش');
        throw e;
      }
      for (const p of explicit) await m.query('INSERT INTO role_permissions (role_key, permission_key, locked) VALUES (?, ?, 0)', [body.key, p]);
      for (const mod of modules) await m.query('INSERT INTO role_modules (role_key, module_key) VALUES (?, ?)', [body.key, mod]);
      await this.rbac.bump(m);
      await this.log(m, actorId, 'role.create', body, `نقش «${body.title}» ساخته شد.`, { tier: body.tier, permissions: explicit, modules });
    });
    return this.registry.role(body.key);
  }

  // ───────── H-15 ─────────
  async update(actorId: string, key: SystemRoleKey, body: Body<'UpdateRoleBody'>) {
    await this.rbac.write(async (m) => {
      const role = await lockRole(m, key);
      if (key === DEVELOPER) throw developerImmutable();
      requireTierManage(await this.rbac.access(actorId, m), role.tier, 'system.role.manage');
      const title = body.title ?? role.title;
      const cur = (await m.query('SELECT description FROM system_roles WHERE role_key = ?', [key])) as { description: string }[];
      const description = body.description ?? cur[0]!.description;
      if (title === role.title && description === cur[0]!.description) return;
      await m.query('UPDATE system_roles SET title = ?, description = ?, updated_at = ? WHERE role_key = ?', [title, description, this.clock.now(), key]);
      await this.rbac.bump(m);
      await this.log(m, actorId, 'role.update', { key, title }, `نقش «${title}» ویرایش شد.`, { fields: Object.keys(body) });
    });
    return this.registry.role(key);
  }

  // ───────── H-16 ─────────
  async remove(actorId: string, key: SystemRoleKey) {
    let before: Awaited<ReturnType<RegistryService['role']>> | undefined;
    await this.rbac.write(async (m) => {
      const role = await lockRole(m, key);
      if (key === DEVELOPER) throw developerImmutable();
      requireTierManage(await this.rbac.access(actorId, m), role.tier, 'system.role.manage');
      if (role.undeletable) throw systemProtected('این نقش');
      const holders = (await m.query('SELECT COUNT(*) AS n FROM (SELECT user_id FROM user_system_roles WHERE role_key = ? FOR UPDATE) h', [key])) as { n: string | number }[];
      const n = Number(holders[0]?.n ?? 0);
      if (n > 0) throw conflict('ROLE_IN_USE', 'این نقش هنوز دارنده دارد؛ ابتدا آن را از کاربران بردارید.', { holders: n });
      before = (await this.registry.fresh(m)).roles.find((r) => r.key === key);
      await m.query('DELETE FROM role_permissions WHERE role_key = ?', [key]);
      await m.query('DELETE FROM role_modules WHERE role_key = ?', [key]);
      await m.query('DELETE FROM role_step_up WHERE role_key = ?', [key]);
      await m.query('DELETE FROM system_roles WHERE role_key = ?', [key]);
      await this.rbac.bump(m);
      await this.log(m, actorId, 'role.delete', role, `نقش «${role.title}» حذف شد.`, { permissions: before?.permissions ?? [], modules: before?.modules ?? [] });
    });
    if (!before) throw new AppError('NOT_FOUND', { message: 'نقش پیدا نشد.' });
    return before;
  }

  // ───────── H-12 ─────────
  /**
   * ماتریس مجوزهای صریح: developer ثابت (AUTH_FORBIDDEN)؛ حذف مجوز قفل‌شده ⇒ CONFLICT(LOCKED_PERMISSION)؛
   * افزودن مجوزی که خودِ کاربر ندارد ⇒ AUTH_FORBIDDEN (E2). اثر: audit + `system.permission.changed` + claim دارندگان.
   */
  async setPermissions(actorId: string, key: SystemRoleKey, permissions: readonly PermissionKey[]) {
    const next = unique(permissions).sort();
    await this.rbac.write(async (m) => {
      const role = await lockRole(m, key);
      if (key === DEVELOPER) throw developerImmutable();
      const actor = await this.rbac.access(actorId, m);
      requireTierManage(actor, role.tier, 'system.permission.edit');
      const cur = (await m.query('SELECT permission_key, locked FROM role_permissions WHERE role_key = ? FOR UPDATE', [key])) as { permission_key: PermissionKey; locked: number }[];
      const before = cur.map((c) => c.permission_key).sort();
      const missing = missingLocked(cur.filter((c) => c.locked).map((c) => c.permission_key), next);
      if (missing.length) throw conflict('LOCKED_PERMISSION', 'مجوزهای قفل‌شدهٔ این نقش قابل حذف نیستند.', { missing });
      await requirePermissions(m, next);
      const added = next.filter((p) => !before.includes(p));
      await requireImplicitSafe(m, key, added, []);
      requireHeld(actor, added, 'افزودن این مجوزها');
      if (sameSet(before, next)) return;
      const removed = before.filter((p) => !next.includes(p));
      if (removed.length) await m.query(`DELETE FROM role_permissions WHERE role_key = ? AND permission_key IN (${ph(removed.length)})`, [key, ...removed]);
      for (const p of added) await m.query('INSERT INTO role_permissions (role_key, permission_key, locked) VALUES (?, ?, 0)', [key, p]);
      await emit(m, this.clock.now(), 'system.permission.changed', { roleKey: key, permissions: next });
      await this.claims.publishMany(m, await this.rbac.holders(key, m));
      await this.rbac.bump(m);
      await this.log(m, actorId, 'role.permissions.updated', role, `ماتریس مجوز «${role.title}» تغییر کرد.`, { added, removed });
    });
    return this.registry.role(key);
  }

  // ───────── H-17 ─────────
  async setModules(actorId: string, key: SystemRoleKey, modules: readonly string[]) {
    const next = unique(modules).sort();
    await this.rbac.write(async (m) => {
      const role = await lockRole(m, key);
      if (key === DEVELOPER) throw developerImmutable();
      const actor = await this.rbac.access(actorId, m);
      requireTierManage(actor, role.tier, 'system.role.manage');
      await requireModules(m, next);
      const cur = (await m.query('SELECT module_key FROM role_modules WHERE role_key = ? FOR UPDATE', [key])) as { module_key: string }[];
      const before = cur.map((c) => c.module_key).sort();
      const added = next.filter((x) => !before.includes(x));
      await requireImplicitSafe(m, key, [], added);
      requireHeld(actor, await permissionsOfModules(m, added), 'افزودن این ماژول‌ها');
      if (sameSet(before, next)) return;
      const removed = before.filter((x) => !next.includes(x));
      if (removed.length) await m.query(`DELETE FROM role_modules WHERE role_key = ? AND module_key IN (${ph(removed.length)})`, [key, ...removed]);
      for (const x of added) await m.query('INSERT INTO role_modules (role_key, module_key) VALUES (?, ?)', [key, x]);
      await this.claims.publishMany(m, await this.rbac.holders(key, m));
      await this.rbac.bump(m);
      await this.log(m, actorId, 'role.modules.updated', role, `ماژول‌های «${role.title}» تغییر کرد.`, { added, removed });
    });
    return this.registry.role(key);
  }

  // ───────── H-18 ─────────
  async setStepUp(actorId: string, key: SystemRoleKey, rules: readonly { permission: PermissionKey; mode: StepUpMode | 'inherit' }[]) {
    const seen = new Set<string>();
    for (const r of rules) {
      if (seen.has(r.permission)) throw invalid('rules', `مجوز «${r.permission}» تکراری است.`);
      seen.add(r.permission);
    }
    await this.rbac.write(async (m) => {
      const role = await lockRole(m, key);
      if (key === DEVELOPER) throw developerImmutable();
      requireTierManage(await this.rbac.access(actorId, m), role.tier, 'system.stepup.manage');
      await requirePermissions(m, rules.map((r) => r.permission));
      const cur = (await m.query('SELECT permission_key, mode FROM role_step_up WHERE role_key = ? FOR UPDATE', [key])) as { permission_key: string; mode: StepUpMode }[];
      const before = new Map(cur.map((c) => [c.permission_key, c.mode]));
      const changes: { permission: string; from: string; to: string }[] = [];
      for (const r of rules) {
        const from = before.get(r.permission) ?? 'inherit';
        if (from === r.mode) continue;
        if (r.mode === 'inherit') await m.query('DELETE FROM role_step_up WHERE role_key = ? AND permission_key = ?', [key, r.permission]);
        else await m.query('INSERT INTO role_step_up (role_key, permission_key, mode) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE mode = VALUES(mode)', [key, r.permission, r.mode]);
        changes.push({ permission: r.permission, from, to: r.mode });
      }
      if (!changes.length) return;
      await this.rbac.bump(m);
      await this.log(m, actorId, 'role.stepup.updated', role, `قواعد step-up «${role.title}» تغییر کرد.`, { changes });
    });
    return this.registry.role(key);
  }
}
