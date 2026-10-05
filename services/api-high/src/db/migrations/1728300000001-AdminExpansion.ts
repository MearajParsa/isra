import type { MigrationInterface, QueryRunner } from 'typeorm';
import { PERMISSION_TITLES, type PermissionKey } from '../../domain/rules';

const NEW: readonly PermissionKey[] = ['system.users.manage', 'system.sessions.view', 'system.sessions.manage', 'system.reports.view'];

/**
 * قرارداد ۱.۴ (docs-v2/26): وضعیت کاربر در دایرکتوری + ۴ مجوز تازه.
 * developer همه را قفل‌شده می‌گیرد؛ super_admin فقط sessions.view و reports.view (بدون قفل؛ قابل‌ویرایش).
 */
export class AdminExpansion1728300000001 implements MigrationInterface {
  name = 'AdminExpansion1728300000001';

  async up(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE user_directory ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT 'active', ADD KEY idx_directory_status (status, created_at)");
    for (const p of NEW) {
      await q.query('INSERT INTO permissions (permission_key, title, perm_group) VALUES (?, ?, ?)', [p, PERMISSION_TITLES[p].title, PERMISSION_TITLES[p].group]);
      await q.query("INSERT INTO role_permissions (role_key, permission_key, locked) VALUES ('developer', ?, 1)", [p]);
    }
    for (const p of ['system.sessions.view', 'system.reports.view']) await q.query("INSERT INTO role_permissions (role_key, permission_key, locked) VALUES ('super_admin', ?, 0)", [p]);
  }

  async down(q: QueryRunner): Promise<void> {
    const ph = NEW.map(() => '?').join(',');
    await q.query(`DELETE FROM role_permissions WHERE permission_key IN (${ph})`, [...NEW]);
    await q.query(`DELETE FROM permissions WHERE permission_key IN (${ph})`, [...NEW]);
    await q.query('ALTER TABLE user_directory DROP KEY idx_directory_status, DROP COLUMN status');
  }
}
