import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { AuditService } from './audit.service';
import { ClaimsService } from './claims.service';
import { type Q, conflict, withRetry } from './db';
import { emit } from './outbox.writer';
import { RbacService } from './rbac.service';
import { ALL_PERMISSIONS, LOCKED, PERMISSION_TITLES, type PermissionKey, ROLE_KEYS, ROLE_TEXT, type SystemRoleKey, missingLocked, sameSet } from './rules';

@Injectable()
export class RolesService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly claims: ClaimsService
  ) {}

  private async role(q: Q, key: SystemRoleKey) {
    const [perms, holders] = await Promise.all([
      q.query('SELECT permission_key, locked FROM role_permissions WHERE role_key = ? ORDER BY permission_key', [key]) as Promise<{ permission_key: PermissionKey; locked: number }[]>,
      q.query('SELECT COUNT(*) AS n FROM user_system_roles WHERE role_key = ?', [key]) as Promise<{ n: string | number }[]>
    ]);
    return {
      key,
      title: ROLE_TEXT[key].title,
      description: ROLE_TEXT[key].description,
      undeletable: true as const,
      permissions: perms.map((p) => p.permission_key),
      lockedPermissions: perms.filter((p) => p.locked).map((p) => p.permission_key),
      holders: Number(holders[0]?.n ?? 0)
    };
  }

  async list(page: number, pageSize: number) {
    const all = await Promise.all(ROLE_KEYS.map((k) => this.role(this.ds, k)));
    return { items: all.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: all.length };
  }

  permissions(page: number, pageSize: number) {
    const all = ALL_PERMISSIONS.map((key) => ({ key, ...PERMISSION_TITLES[key] }));
    return { items: all.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: all.length };
  }

  /**
   * ماتریس مجوز: developer ثابت (AUTH_FORBIDDEN)؛ حذف مجوز قفل‌شده ⇒ CONFLICT(LOCKED_PERMISSION).
   * اثر: audit + `system.permission.changed` + claim تازهٔ همهٔ دارندگان نقش (مجوز مؤثر آن‌ها عوض شده).
   */
  async setPermissions(actorId: string, key: SystemRoleKey, permissions: readonly PermissionKey[]) {
    if (key === 'developer') throw new AppError('AUTH_FORBIDDEN', { message: 'ماتریس مجوز نقش توسعه‌دهنده ثابت است.' });
    const next = [...new Set(permissions)].sort() as PermissionKey[];
    const missing = missingLocked(key, next);
    if (missing.length) throw conflict('LOCKED_PERMISSION', 'مجوزهای قفل‌شدهٔ این نقش قابل حذف نیستند.', { missing });

    await withRetry(() =>
      this.ds.transaction(async (m) => {
        const cur = (await m.query('SELECT permission_key FROM role_permissions WHERE role_key = ? FOR UPDATE', [key])) as { permission_key: PermissionKey }[];
        const before = cur.map((c) => c.permission_key).sort() as PermissionKey[];
        if (sameSet(before, next)) return;
        const now = this.clock.now();
        await m.query('DELETE FROM role_permissions WHERE role_key = ?', [key]);
        for (const p of next) await m.query('INSERT INTO role_permissions (role_key, permission_key, locked) VALUES (?, ?, ?)', [key, p, LOCKED[key].includes(p) ? 1 : 0]);
        await emit(m, now, 'system.permission.changed', { roleKey: key, permissions: next });
        for (const uid of await this.rbac.holders(key, m)) await this.claims.publish(m, uid);
        await this.audit.write(m, {
          actor: await this.audit.actorOf(actorId, m),
          action: 'role.permissions.updated',
          target: { type: 'role', id: key, label: ROLE_TEXT[key].title },
          summary: `ماتریس مجوز «${ROLE_TEXT[key].title}» تغییر کرد.`,
          meta: { added: next.filter((p) => !before.includes(p)), removed: before.filter((p) => !next.includes(p)) }
        });
      })
    );
    return this.role(this.ds, key);
  }
}
