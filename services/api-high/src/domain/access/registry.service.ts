import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { high } from '@isra/api-types';
import { AppError } from '../../common/app-error';
import { Clock } from '../../common/clock';
import type { Q } from '../db';
import { RbacService } from '../rbac.service';
import type { PermissionKey, StepUpMode } from '../rules';
import { effectiveOfRole } from './policy';

export type RbacMatrix = z.infer<typeof high.RbacMatrix>;
export type ModuleInfo = z.infer<typeof high.ModuleInfo>;
export type PermissionInfo = z.infer<typeof high.PermissionInfo>;
export type RoleInfo = z.infer<typeof high.SystemRole>;

const TTL_MS = 5_000;

interface ModuleRow {
  module_key: string;
  title: string;
  description: string;
  is_system: number;
  sort_order: number;
  n: string | number;
}
interface PermRow {
  permission_key: string;
  title: string;
  description: string;
  module_key: string;
  is_system: number;
  grantable: number;
  step_up: StepUpMode;
}
interface RoleRow {
  role_key: string;
  title: string;
  description: string;
  undeletable: number;
  holders: string | number;
}
interface ItemRow {
  t: 'p' | 'm' | 's';
  role_key: string;
  k: string;
  locked: number;
  mode: StepUpMode | null;
}

/**
 * رجیستری/ماتریس RBAC (ماژول‌ها، مجوزها، نقش‌ها با مجوز مؤثر و قواعد step-up): ۵ query، کش TTL ۵ ثانیه،
 * باطل‌سازی محلی با `RbacService.generation` پس از هر نوشتن. همهٔ endpointهای خواندنی (H-10/11/14/88/92) از همین‌جا می‌خوانند.
 * مسیرهای نوشتن هرگز از این کش تصمیم نمی‌گیرند (از DB داخل تراکنش می‌خوانند).
 */
@Injectable()
export class RegistryService {
  private cache?: { v: RbacMatrix; exp: number; gen: number };

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly rbac: RbacService
  ) {}

  async snapshot(): Promise<RbacMatrix> {
    const now = this.clock.now().getTime();
    const c = this.cache;
    if (c && c.exp > now && c.gen === this.rbac.generation) return c.v;
    const gen = this.rbac.generation;
    const v = await this.fresh(this.ds);
    if (gen === this.rbac.generation) this.cache = { v, exp: now + TTL_MS, gen };
    return v;
  }

  async role(key: string): Promise<RoleInfo> {
    const r = (await this.snapshot()).roles.find((x) => x.key === key);
    if (!r) throw new AppError('NOT_FOUND', { message: 'نقش پیدا نشد.' });
    return r;
  }

  async permission(key: string): Promise<PermissionInfo> {
    const p = (await this.snapshot()).permissions.find((x) => x.key === key);
    if (!p) throw new AppError('NOT_FOUND', { message: 'مجوز پیدا نشد.' });
    return p;
  }

  async module(key: string): Promise<ModuleInfo> {
    const m = (await this.snapshot()).modules.find((x) => x.key === key);
    if (!m) throw new AppError('NOT_FOUND', { message: 'ماژول پیدا نشد.' });
    return m;
  }

  /** خواندن مستقیم از DB (بدون کش)؛ داخل تراکنش با `m` برای وضعیت پیش از حذف */
  async fresh(q: Q): Promise<RbacMatrix> {
    // نسخه اول خوانده می‌شود: اگر نوشتنی وسط بخواند، نسخه ≤ داده است (بدترین حالت یک بار کش اضافه)
    const version = await this.rbac.version(q);
    const [mods, perms, roles, items] = (await Promise.all([
      q.query('SELECT m.module_key, m.title, m.description, m.is_system, m.sort_order, (SELECT COUNT(*) FROM permissions p WHERE p.module_key = m.module_key) AS n FROM system_modules m ORDER BY m.sort_order, m.module_key'),
      q.query('SELECT permission_key, title, description, module_key, is_system, grantable, step_up FROM permissions ORDER BY permission_key'),
      q.query('SELECT r.role_key, r.title, r.description, r.undeletable, (SELECT COUNT(*) FROM user_system_roles u WHERE u.role_key = r.role_key) AS holders FROM system_roles r ORDER BY r.undeletable DESC, r.role_key'),
      q.query(
        `SELECT 'p' AS t, role_key, permission_key AS k, locked, NULL AS mode FROM role_permissions
         UNION ALL SELECT 'm', role_key, module_key, 0, NULL FROM role_modules
         UNION ALL SELECT 's', role_key, permission_key, 0, mode FROM role_step_up`
      )
    ])) as [ModuleRow[], PermRow[], RoleRow[], ItemRow[]];

    const permsByModule = new Map<string, PermissionKey[]>();
    for (const p of perms) permsByModule.set(p.module_key, [...(permsByModule.get(p.module_key) ?? []), p.permission_key]);
    const per = new Map<string, { permissions: PermissionKey[]; locked: PermissionKey[]; modules: string[]; rules: Record<PermissionKey, StepUpMode> }>();
    const of = (r: string) => per.get(r) ?? per.set(r, { permissions: [], locked: [], modules: [], rules: {} }).get(r)!;
    for (const i of items) {
      const o = of(i.role_key);
      if (i.t === 'p') (o.permissions.push(i.k), i.locked && o.locked.push(i.k));
      else if (i.t === 'm') o.modules.push(i.k);
      else o.rules[i.k] = i.mode!;
    }
    return {
      version,
      modules: mods.map((m) => ({ key: m.module_key, title: m.title, description: m.description, isSystem: !!m.is_system, sortOrder: m.sort_order, permissionCount: Number(m.n) })),
      permissions: perms.map((p) => ({ key: p.permission_key, title: p.title, description: p.description, moduleKey: p.module_key, isSystem: !!p.is_system, grantable: !!p.grantable, stepUp: p.step_up })),
      roles: roles.map((r) => {
        const o = of(r.role_key);
        const permissions = [...o.permissions].sort();
        const modules = [...o.modules].sort();
        return {
          key: r.role_key,
          title: r.title,
          description: r.description,
          undeletable: !!r.undeletable,
          permissions,
          modules,
          effectivePermissions: effectiveOfRole(permissions, modules, permsByModule),
          lockedPermissions: [...o.locked].sort(),
          stepUpRules: o.rules,
          holders: Number(r.holders)
        };
      })
    };
  }
}
