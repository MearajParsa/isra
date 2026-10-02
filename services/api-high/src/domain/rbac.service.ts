import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { bufToUuid, uuidToBuf } from '../common/ids';
import type { Q } from './db';
import { type Grant, type PermissionKey, type SystemRoleKey } from './rules';

export interface UserAccess {
  roles: SystemRoleKey[];
  grants: Grant[];
  /** مجوزهای مؤثر = مجوزهای نقش‌ها ∪ grantهای مستقیم */
  permissions: PermissionKey[];
}

/** منبع حقیقت نقش/مجوز سیستمی (DB این سرویس)؛ هر درخواست ادمین از همین‌جا مجاز می‌شود */
@Injectable()
export class RbacService {
  constructor(private readonly ds: DataSource) {}

  async access(userId: string, q: Q = this.ds): Promise<UserAccess> {
    const id = uuidToBuf(userId);
    const [roles, grants, perms] = await Promise.all([
      q.query('SELECT role_key FROM user_system_roles WHERE user_id = ? ORDER BY role_key', [id]) as Promise<{ role_key: SystemRoleKey }[]>,
      q.query('SELECT grant_key FROM user_grants WHERE user_id = ?', [id]) as Promise<{ grant_key: Grant }[]>,
      q.query('SELECT DISTINCT rp.permission_key FROM user_system_roles ur JOIN role_permissions rp ON rp.role_key = ur.role_key WHERE ur.user_id = ?', [id]) as Promise<{ permission_key: PermissionKey }[]>
    ]);
    const g = grants.map((x) => x.grant_key);
    return { roles: roles.map((r) => r.role_key), grants: g, permissions: [...new Set<PermissionKey>([...perms.map((p) => p.permission_key), ...(g as PermissionKey[])])] };
  }

  /** دارندگان یک نقش (برای انتشار claim پس از تغییر ماتریس) */
  async holders(roleKey: SystemRoleKey, q: Q = this.ds): Promise<string[]> {
    const rows = (await q.query('SELECT user_id FROM user_system_roles WHERE role_key = ?', [roleKey])) as { user_id: Buffer }[];
    return rows.map((r) => bufToUuid(r.user_id));
  }
}
