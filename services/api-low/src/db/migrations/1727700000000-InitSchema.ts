import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * schema_low v1 (docs-v2/23). forward-only؛ تغییر بعدی = migration جدید (expand → migrate → contract).
 * شناسه‌ها BINARY(16) = UUIDv7؛ زمان‌ها DATETIME(3) به UTC.
 */
export class InitSchema1727700000000 implements MigrationInterface {
  name = 'InitSchema1727700000000';

  public async up(q: QueryRunner): Promise<void> {
    const T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    const stmts = [
      `CREATE TABLE users (
        id BINARY(16) NOT NULL,
        phone CHAR(11) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_phone (phone)
      ) ${T}`,
      `CREATE TABLE user_credentials (
        user_id BINARY(16) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (user_id)
      ) ${T}`,
      `CREATE TABLE profiles (
        user_id BINARY(16) NOT NULL,
        first_name VARCHAR(40) NOT NULL DEFAULT '',
        last_name VARCHAR(40) NOT NULL DEFAULT '',
        avatar_path VARCHAR(255) NULL,
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (user_id)
      ) ${T}`,
      `CREATE TABLE user_claims (
        user_id BINARY(16) NOT NULL,
        system_roles JSON NOT NULL,
        grants JSON NOT NULL,
        perm_ver INT NOT NULL DEFAULT 1,
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (user_id)
      ) ${T}`,
      `CREATE TABLE otp_challenges (
        id BINARY(16) NOT NULL,
        phone CHAR(11) NOT NULL,
        purpose VARCHAR(16) NOT NULL,
        user_id BINARY(16) NULL,
        code_hmac BINARY(32) NOT NULL,
        attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
        expires_at DATETIME(3) NOT NULL,
        consumed_at DATETIME(3) NULL,
        ip VARCHAR(45) NOT NULL,
        created_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        KEY idx_otp_phone_created (phone, created_at),
        KEY idx_otp_expires (expires_at)
      ) ${T}`,
      `CREATE TABLE auth_sessions (
        id BINARY(16) NOT NULL,
        user_id BINARY(16) NOT NULL,
        device_id VARCHAR(36) NOT NULL,
        device_label VARCHAR(80) NOT NULL,
        platform VARCHAR(16) NOT NULL,
        client_id VARCHAR(24) NULL,
        ip VARCHAR(45) NOT NULL,
        created_at DATETIME(3) NOT NULL,
        last_active_at DATETIME(3) NOT NULL,
        revoked_at DATETIME(3) NULL,
        otp_at DATETIME(3) NULL,
        perm_ver INT NOT NULL DEFAULT 1,
        PRIMARY KEY (id),
        KEY idx_sessions_user (user_id, revoked_at)
      ) ${T}`,
      `CREATE TABLE refresh_tokens (
        id BINARY(16) NOT NULL,
        session_id BINARY(16) NOT NULL,
        token_hash BINARY(32) NOT NULL,
        created_at DATETIME(3) NOT NULL,
        expires_at DATETIME(3) NOT NULL,
        rotated_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_refresh_hash (token_hash),
        KEY idx_refresh_session (session_id)
      ) ${T}`,
      `CREATE TABLE step_up_tokens (
        id BINARY(16) NOT NULL,
        session_id BINARY(16) NOT NULL,
        token_hash BINARY(32) NOT NULL,
        expires_at DATETIME(3) NOT NULL,
        created_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_stepup_hash (token_hash)
      ) ${T}`,
      `CREATE TABLE rate_limit_counters (
        counter_key VARCHAR(120) NOT NULL,
        window_start DATETIME(3) NOT NULL,
        hits INT UNSIGNED NOT NULL,
        PRIMARY KEY (counter_key, window_start)
      ) ${T}`,
      `CREATE TABLE inbox_messages (
        id BINARY(16) NOT NULL,
        user_id BINARY(16) NOT NULL,
        kind VARCHAR(16) NOT NULL,
        title VARCHAR(120) NOT NULL,
        body VARCHAR(500) NOT NULL,
        ref VARCHAR(200) NULL,
        created_at DATETIME(3) NOT NULL,
        read_at DATETIME(3) NULL,
        source_event_id VARCHAR(64) NULL,
        PRIMARY KEY (id),
        KEY idx_inbox_user_created (user_id, created_at, id),
        KEY idx_inbox_user_read (user_id, read_at),
        UNIQUE KEY uq_inbox_source_event (source_event_id)
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
    for (const t of ['inbox_events', 'outbox_events', 'inbox_messages', 'rate_limit_counters', 'step_up_tokens', 'refresh_tokens', 'auth_sessions', 'otp_challenges', 'user_claims', 'profiles', 'user_credentials', 'users'])
      await q.query(`DROP TABLE IF EXISTS ${t}`);
  }
}
