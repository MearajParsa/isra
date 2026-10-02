import type { MigrationInterface, QueryRunner } from 'typeorm';
import { ALL_PERMISSIONS, DEFAULT_FLAGS, DEFAULT_ROLE_PERMS, DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS, LOCKED, PERMISSION_TITLES, ROLE_KEYS, ROLE_TEXT } from '../../domain/rules';

/**
 * schema_high v1 (docs-v2/23) + دادهٔ پایهٔ سیستم (seed واقعی، نه نمونه): نقش‌های undeletable، مجوزها، ماتریس پیش‌فرض، تنظیمات اولیه.
 * forward-only. شناسه‌های کاربر/audit BINARY(16)=UUIDv7؛ زمان‌ها DATETIME(3) UTC.
 */
export class InitSchema1728000000000 implements MigrationInterface {
  name = 'InitSchema1728000000000';

  public async up(q: QueryRunner): Promise<void> {
    const T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    const stmts = [
      `CREATE TABLE system_roles (
        role_key VARCHAR(24) NOT NULL,
        title VARCHAR(60) NOT NULL,
        description VARCHAR(300) NOT NULL,
        undeletable TINYINT(1) NOT NULL DEFAULT 1,
        PRIMARY KEY (role_key),
        CONSTRAINT chk_roles_undeletable CHECK (undeletable = 1)
      ) ${T}`,
      `CREATE TABLE permissions (
        permission_key VARCHAR(40) NOT NULL,
        title VARCHAR(120) NOT NULL,
        perm_group VARCHAR(12) NOT NULL,
        PRIMARY KEY (permission_key)
      ) ${T}`,
      `CREATE TABLE role_permissions (
        role_key VARCHAR(24) NOT NULL,
        permission_key VARCHAR(40) NOT NULL,
        locked TINYINT(1) NOT NULL DEFAULT 0,
        PRIMARY KEY (role_key, permission_key)
      ) ${T}`,
      `CREATE TABLE user_directory (
        user_id BINARY(16) NOT NULL,
        phone CHAR(11) NOT NULL,
        first_name VARCHAR(40) NOT NULL DEFAULT '',
        last_name VARCHAR(40) NOT NULL DEFAULT '',
        perm_ver INT NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (user_id),
        UNIQUE KEY uq_directory_phone (phone),
        KEY idx_directory_created (created_at, user_id)
      ) ${T}`,
      `CREATE TABLE user_system_roles (
        user_id BINARY(16) NOT NULL,
        role_key VARCHAR(24) NOT NULL,
        granted_by BINARY(16) NULL,
        granted_at DATETIME(3) NOT NULL,
        PRIMARY KEY (user_id, role_key),
        KEY idx_usr_role (role_key)
      ) ${T}`,
      `CREATE TABLE user_grants (
        user_id BINARY(16) NOT NULL,
        grant_key VARCHAR(40) NOT NULL,
        granted_by BINARY(16) NULL,
        granted_at DATETIME(3) NOT NULL,
        PRIMARY KEY (user_id, grant_key)
      ) ${T}`,
      `CREATE TABLE system_settings (
        setting_key VARCHAR(16) NOT NULL,
        version INT NOT NULL,
        eval_weights JSON NOT NULL,
        badge_thresholds JSON NOT NULL,
        flags JSON NOT NULL,
        updated_by VARCHAR(80) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (setting_key)
      ) ${T}`,
      `CREATE TABLE audit_logs (
        id BINARY(16) NOT NULL,
        at DATETIME(3) NOT NULL,
        actor_id BINARY(16) NULL,
        actor_name VARCHAR(80) NOT NULL,
        action VARCHAR(64) NOT NULL,
        target_type VARCHAR(12) NULL,
        target_id VARCHAR(64) NULL,
        target_label VARCHAR(120) NULL,
        summary VARCHAR(300) NOT NULL,
        meta JSON NOT NULL,
        PRIMARY KEY (id),
        KEY idx_audit_at (at, id),
        KEY idx_audit_action_at (action, at)
      ) ${T}`,
      `CREATE TABLE rate_limit_counters (
        counter_key VARCHAR(120) NOT NULL,
        window_start DATETIME(3) NOT NULL,
        hits INT UNSIGNED NOT NULL,
        PRIMARY KEY (counter_key, window_start)
      ) ${T}`,
      `CREATE TABLE outbox_events (
        id BINARY(16) NOT NULL,
        type VARCHAR(64) NOT NULL,
        payload JSON NOT NULL,
        created_at DATETIME(3) NOT NULL,
        published_at DATETIME(3) NULL,
        attempts INT NOT NULL DEFAULT 0,
        next_attempt_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        KEY idx_outbox_pending (published_at, next_attempt_at)
      ) ${T}`,
      `CREATE TABLE inbox_events (
        event_id VARCHAR(64) NOT NULL,
        type VARCHAR(64) NOT NULL,
        received_at DATETIME(3) NOT NULL,
        PRIMARY KEY (event_id)
      ) ${T}`
    ];
    for (const s of stmts) await q.query(s);

    // دادهٔ پایه (سیستم بدون آن کار نمی‌کند)
    for (const r of ROLE_KEYS) await q.query('INSERT INTO system_roles (role_key, title, description, undeletable) VALUES (?, ?, ?, 1)', [r, ROLE_TEXT[r].title, ROLE_TEXT[r].description]);
    for (const p of ALL_PERMISSIONS) await q.query('INSERT INTO permissions (permission_key, title, perm_group) VALUES (?, ?, ?)', [p, PERMISSION_TITLES[p].title, PERMISSION_TITLES[p].group]);
    for (const r of ROLE_KEYS) for (const p of DEFAULT_ROLE_PERMS[r]) await q.query('INSERT INTO role_permissions (role_key, permission_key, locked) VALUES (?, ?, ?)', [r, p, LOCKED[r].includes(p) ? 1 : 0]);
    await q.query("INSERT INTO system_settings (setting_key, version, eval_weights, badge_thresholds, flags, updated_by, updated_at) VALUES ('global', 1, ?, ?, ?, 'سیستم', UTC_TIMESTAMP(3))", [JSON.stringify(DEFAULT_WEIGHTS), JSON.stringify(DEFAULT_THRESHOLDS), JSON.stringify(DEFAULT_FLAGS)]);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of ['inbox_events', 'outbox_events', 'rate_limit_counters', 'audit_logs', 'system_settings', 'user_grants', 'user_system_roles', 'user_directory', 'role_permissions', 'permissions', 'system_roles']) await q.query(`DROP TABLE IF EXISTS ${t}`);
  }
}
