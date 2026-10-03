import { tableOptions } from '../table-options';
import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * schema_mid v1 (docs-v2/23). forward-only. شناسه‌ها BINARY(16) = UUIDv7؛ زمان‌ها DATETIME(3) UTC.
 * یکتایی‌های کسب‌وکار در سطح DB: «+۵ فقط یک‌بار» (attendance + ledger)، یک ارزیابی per نوبت، یک آیتم فعال per کاربر در صف.
 */
export class InitSchema1727800000000 implements MigrationInterface {
  name = 'InitSchema1727800000000';

  public async up(q: QueryRunner): Promise<void> {
    const T = await tableOptions(q);
    const stmts = [
      `CREATE TABLE sessions (
        id BINARY(16) NOT NULL,
        title VARCHAR(80) NOT NULL,
        description VARCHAR(500) NOT NULL,
        status VARCHAR(12) NOT NULL DEFAULT 'draft',
        schedule_type VARCHAR(12) NOT NULL,
        schedule JSON NOT NULL,
        next_starts_at DATETIME(3) NULL,
        location_label VARCHAR(120) NOT NULL,
        created_by BINARY(16) NOT NULL,
        version INT NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        KEY idx_sessions_status_next (status, next_starts_at),
        KEY idx_sessions_created_by (created_by)
      ) ${T}`,
      `CREATE TABLE session_members (
        id BINARY(16) NOT NULL,
        session_id BINARY(16) NOT NULL,
        user_id BINARY(16) NOT NULL,
        status VARCHAR(12) NOT NULL,
        requested_at DATETIME(3) NOT NULL,
        decided_by BINARY(16) NULL,
        decided_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_member_session_user (session_id, user_id),
        KEY idx_member_user_status (user_id, status),
        KEY idx_member_session_status (session_id, status)
      ) ${T}`,
      `CREATE TABLE session_member_roles (
        member_id BINARY(16) NOT NULL,
        role VARCHAR(24) NOT NULL,
        PRIMARY KEY (member_id, role)
      ) ${T}`,
      `CREATE TABLE attendance_entries (
        id BINARY(16) NOT NULL,
        session_id BINARY(16) NOT NULL,
        user_id BINARY(16) NOT NULL,
        entered_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_attendance_session_user (session_id, user_id),
        KEY idx_attendance_session_time (session_id, entered_at)
      ) ${T}`,
      `CREATE TABLE queue_items (
        id BINARY(16) NOT NULL,
        session_id BINARY(16) NOT NULL,
        user_id BINARY(16) NOT NULL,
        status VARCHAR(10) NOT NULL,
        position INT NULL,
        joined_at DATETIME(3) NOT NULL,
        finished_at DATETIME(3) NULL,
        active_key BINARY(32) GENERATED ALWAYS AS (IF(status IN ('waiting','current'), UNHEX(MD5(CONCAT(HEX(session_id), HEX(user_id)))), NULL)) STORED,
        PRIMARY KEY (id),
        UNIQUE KEY uq_queue_active (active_key),
        KEY idx_queue_session_status_pos (session_id, status, position),
        KEY idx_queue_user (user_id)
      ) ${T}`,
      `CREATE TABLE evaluations (
        id BINARY(16) NOT NULL,
        session_id BINARY(16) NOT NULL,
        queue_item_id BINARY(16) NOT NULL,
        user_id BINARY(16) NOT NULL,
        evaluator_id BINARY(16) NOT NULL,
        voice TINYINT UNSIGNED NOT NULL,
        tone TINYINT UNSIGNED NOT NULL,
        tajweed TINYINT UNSIGNED NOT NULL,
        weights JSON NOT NULL,
        score SMALLINT UNSIGNED NOT NULL,
        points TINYINT UNSIGNED NOT NULL,
        note VARCHAR(300) NOT NULL DEFAULT '',
        created_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_eval_queue_item (queue_item_id),
        KEY idx_eval_session_time (session_id, created_at),
        KEY idx_eval_user_time (user_id, created_at)
      ) ${T}`,
      `CREATE TABLE point_ledger (
        id BINARY(16) NOT NULL,
        user_id BINARY(16) NOT NULL,
        points INT NOT NULL,
        reason VARCHAR(24) NOT NULL,
        ref_id BINARY(16) NOT NULL,
        created_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_ledger_reason_ref (reason, ref_id),
        KEY idx_ledger_user_time (user_id, created_at)
      ) ${T}`,
      `CREATE TABLE user_points (
        user_id BINARY(16) NOT NULL,
        total INT NOT NULL DEFAULT 0,
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (user_id)
      ) ${T}`,
      `CREATE TABLE badge_awards (
        id BINARY(16) NOT NULL,
        user_id BINARY(16) NOT NULL,
        badge_key VARCHAR(16) NOT NULL,
        threshold INT NOT NULL,
        awarded_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_badge_user_key (user_id, badge_key)
      ) ${T}`,
      `CREATE TABLE settings_cache (
        setting_key VARCHAR(32) NOT NULL,
        value JSON NOT NULL,
        version INT NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (setting_key)
      ) ${T}`,
      `CREATE TABLE user_directory (
        user_id BINARY(16) NOT NULL,
        first_name VARCHAR(40) NOT NULL DEFAULT '',
        last_name VARCHAR(40) NOT NULL DEFAULT '',
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (user_id)
      ) ${T}`,
      `CREATE TABLE idempotency_keys (
        user_id BINARY(16) NOT NULL,
        idem_key VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
        request_hash BINARY(32) NOT NULL,
        status VARCHAR(10) NOT NULL,
        response JSON NULL,
        created_at DATETIME(3) NOT NULL,
        PRIMARY KEY (user_id, idem_key),
        KEY idx_idem_created (created_at)
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
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of ['inbox_events', 'outbox_events', 'rate_limit_counters', 'idempotency_keys', 'user_directory', 'settings_cache', 'badge_awards', 'user_points', 'point_ledger', 'evaluations', 'queue_items', 'attendance_entries', 'session_member_roles', 'session_members', 'sessions'])
      await q.query(`DROP TABLE IF EXISTS ${t}`);
  }
}
