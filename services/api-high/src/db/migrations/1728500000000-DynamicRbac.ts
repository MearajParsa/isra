import type { MigrationInterface, QueryRunner } from 'typeorm';
import { seedRbac } from '../rbac-seed';
import { tableOptions } from '../table-options';

const NEW_PERMS = ['system.role.manage', 'system.permission.manage', 'system.stepup.manage'];

/** DROP CONSTRAINT در MariaDB ≥10.2.1 و MySQL ≥8.0.19؛ نسخه‌های ۸.۰.۱۶–۸.۰.۱۸ فقط DROP CHECK */
async function dropCheck(q: QueryRunner, table: string, name: string): Promise<void> {
  try {
    await q.query(`ALTER TABLE ${table} DROP CONSTRAINT ${name}`);
  } catch {
    await q.query(`ALTER TABLE ${table} DROP CHECK ${name}`);
  }
}

/**
 * RBAC پویا (docs-v2/27 §1): ماژول، مجوز پویا، نقش پویا، ماژول نقش، قواعد step-up، نسخهٔ ماتریس، کلید idempotency.
 * داده‌پذیر: نقش/ماتریس/grant موجود دست‌نخورده می‌ماند؛ سه مجوز تازه فقط به developer می‌رسد.
 * down() معکوس‌پذیر است: نقش/مجوز/ماژول پویا و grantهای غیر v1 حذف می‌شوند (در مدل قدیم جایی ندارند).
 */
export class DynamicRbac1728500000000 implements MigrationInterface {
  name = 'DynamicRbac1728500000000';

  async up(q: QueryRunner): Promise<void> {
    const T = await tableOptions(q);
    await q.query(`CREATE TABLE system_modules (
      module_key VARCHAR(32) NOT NULL,
      title VARCHAR(60) NOT NULL,
      description VARCHAR(300) NOT NULL DEFAULT '',
      is_system TINYINT(1) NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 100,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (module_key)
    ) ${T}`);

    await dropCheck(q, 'system_roles', 'chk_roles_undeletable');
    await q.query(`ALTER TABLE system_roles
      MODIFY role_key VARCHAR(32) NOT NULL,
      MODIFY undeletable TINYINT(1) NOT NULL DEFAULT 0,
      ADD COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      ADD COLUMN created_by BINARY(16) NULL`);
    await q.query('ALTER TABLE role_permissions MODIFY role_key VARCHAR(32) NOT NULL, MODIFY permission_key VARCHAR(64) NOT NULL');
    await q.query('ALTER TABLE user_system_roles MODIFY role_key VARCHAR(32) NOT NULL');
    await q.query('ALTER TABLE user_grants MODIFY grant_key VARCHAR(64) NOT NULL');

    // module_key ابتدا NULL: seed آن را برای مجوزهای موجود پر می‌کند، سپس NOT NULL
    await q.query(`ALTER TABLE permissions
      MODIFY permission_key VARCHAR(64) NOT NULL,
      DROP COLUMN perm_group,
      ADD COLUMN module_key VARCHAR(32) NULL,
      ADD COLUMN description VARCHAR(300) NOT NULL DEFAULT '',
      ADD COLUMN is_system TINYINT(1) NOT NULL DEFAULT 0,
      ADD COLUMN grantable TINYINT(1) NOT NULL DEFAULT 0,
      ADD COLUMN step_up ENUM('required','none') NOT NULL DEFAULT 'required',
      ADD KEY idx_permissions_module (module_key)`);

    await q.query(`CREATE TABLE role_modules (
      role_key VARCHAR(32) NOT NULL,
      module_key VARCHAR(32) NOT NULL,
      PRIMARY KEY (role_key, module_key),
      KEY idx_role_modules_module (module_key)
    ) ${T}`);
    await q.query(`CREATE TABLE role_step_up (
      role_key VARCHAR(32) NOT NULL,
      permission_key VARCHAR(64) NOT NULL,
      mode ENUM('required','none') NOT NULL,
      PRIMARY KEY (role_key, permission_key),
      KEY idx_role_step_up_perm (permission_key)
    ) ${T}`);
    await q.query(`CREATE TABLE rbac_meta (
      id TINYINT NOT NULL,
      version BIGINT NOT NULL,
      PRIMARY KEY (id)
    ) ${T}`);
    await q.query(`CREATE TABLE idempotency_keys (
      user_id BINARY(16) NOT NULL,
      idem_key VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
      request_hash BINARY(32) NOT NULL,
      status VARCHAR(10) NOT NULL,
      response JSON NULL,
      created_at DATETIME(3) NOT NULL,
      PRIMARY KEY (user_id, idem_key),
      KEY idx_idem_created (created_at)
    ) ${T}`);

    const [{ now }] = (await q.query('SELECT UTC_TIMESTAMP(3) AS now')) as { now: Date | string }[];
    await seedRbac(q, now instanceof Date ? now : new Date(`${now}Z`));
    await q.query('ALTER TABLE permissions MODIFY module_key VARCHAR(32) NOT NULL');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS idempotency_keys');
    await q.query('DROP TABLE IF EXISTS rbac_meta');
    await q.query('DROP TABLE IF EXISTS role_step_up');
    await q.query('DROP TABLE IF EXISTS role_modules');

    // داده‌ای که در مدل قدیم جایی ندارد: نقش پویا (و دارندگانش)، مجوزهای پویا/جدید، grantهای غیر session.create
    await q.query('DELETE FROM user_system_roles WHERE role_key NOT IN (?, ?)', ['developer', 'super_admin']);
    await q.query('DELETE FROM role_permissions WHERE role_key NOT IN (?, ?)', ['developer', 'super_admin']);
    await q.query('DELETE FROM system_roles WHERE role_key NOT IN (?, ?)', ['developer', 'super_admin']);
    const ph = NEW_PERMS.map(() => '?').join(',');
    await q.query(`DELETE FROM role_permissions WHERE permission_key IN (${ph}) OR permission_key NOT IN (SELECT permission_key FROM permissions WHERE is_system = 1)`, NEW_PERMS);
    await q.query(`DELETE FROM permissions WHERE permission_key IN (${ph}) OR is_system = 0`, NEW_PERMS);
    await q.query("DELETE FROM user_grants WHERE grant_key <> 'session.create'");

    await q.query(`ALTER TABLE permissions
      DROP KEY idx_permissions_module,
      DROP COLUMN module_key, DROP COLUMN description, DROP COLUMN is_system, DROP COLUMN grantable, DROP COLUMN step_up,
      ADD COLUMN perm_group VARCHAR(12) NOT NULL DEFAULT 'system',
      MODIFY permission_key VARCHAR(40) NOT NULL`);
    await q.query("UPDATE permissions SET perm_group = 'session' WHERE permission_key LIKE 'session.%'");
    await q.query('ALTER TABLE permissions ALTER COLUMN perm_group DROP DEFAULT');
    await q.query('ALTER TABLE user_grants MODIFY grant_key VARCHAR(40) NOT NULL');
    await q.query('ALTER TABLE user_system_roles MODIFY role_key VARCHAR(24) NOT NULL');
    await q.query('ALTER TABLE role_permissions MODIFY role_key VARCHAR(24) NOT NULL, MODIFY permission_key VARCHAR(40) NOT NULL');
    await q.query(`ALTER TABLE system_roles
      DROP COLUMN created_at, DROP COLUMN updated_at, DROP COLUMN created_by,
      MODIFY undeletable TINYINT(1) NOT NULL DEFAULT 1,
      MODIFY role_key VARCHAR(24) NOT NULL`);
    await q.query('UPDATE system_roles SET undeletable = 1');
    await q.query('ALTER TABLE system_roles ADD CONSTRAINT chk_roles_undeletable CHECK (undeletable = 1)');
    await q.query('DROP TABLE IF EXISTS system_modules');
  }
}
