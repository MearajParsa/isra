import type { MigrationInterface, QueryRunner } from 'typeorm';
import { tableOptions } from '../table-options';

/**
 * عضویت کامل جلسه (قرارداد ۱.۶.۰؛ docs-v2/30 §۱.۴ و §۱.۷):
 *  - sessions: join_policy / visibility / capacity + کلید مرتب‌سازی ذخیره‌شدهٔ فهرست عمومی (`sort_rank`, `sort_at`؛ ستون تولیدی STORED)
 *    به‌جای `ORDER BY FIELD(...)` + ایندکس‌های (visibility, status, next_starts_at) و (visibility, sort_rank, sort_at, id)
 *  - session_members: source (request|staff|admin|invite|open) و added_by
 *  - user_directory.status (active|disabled|deleted) از user.status.changed
 *  - session_invites: فقط SHA-256 کد ذخیره می‌شود
 * برگشت‌پذیر؛ روی DB تازه هم اجرا می‌شود.
 */
export class MembershipV161728600000000 implements MigrationInterface {
  name = 'MembershipV161728600000000';

  async up(q: QueryRunner): Promise<void> {
    const T = await tableOptions(q);
    await q.query(
      `ALTER TABLE sessions
         ADD COLUMN join_policy VARCHAR(12) NOT NULL DEFAULT 'request',
         ADD COLUMN visibility VARCHAR(10) NOT NULL DEFAULT 'public',
         ADD COLUMN capacity SMALLINT UNSIGNED NULL,
         ADD COLUMN sort_rank TINYINT AS (CASE status WHEN 'started' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'ended' THEN 2 ELSE 9 END) STORED,
         ADD COLUMN sort_at DATETIME(3) AS (COALESCE(next_starts_at, created_at)) STORED,
         ADD KEY idx_sessions_vis_status_next (visibility, status, next_starts_at),
         ADD KEY idx_sessions_public_sort (visibility, sort_rank, sort_at, id)`
    );
    await q.query("ALTER TABLE session_members ADD COLUMN source VARCHAR(10) NOT NULL DEFAULT 'request', ADD COLUMN added_by BINARY(16) NULL");
    await q.query("ALTER TABLE user_directory ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT 'active'");
    await q.query("UPDATE user_directory SET status = 'deleted' WHERE deleted = 1");
    await q.query(`CREATE TABLE session_invites (
        id BINARY(16) NOT NULL,
        session_id BINARY(16) NOT NULL,
        code_hash BINARY(32) NOT NULL,
        roles VARCHAR(80) NOT NULL,
        max_uses INT NULL,
        uses INT NOT NULL DEFAULT 0,
        expires_at DATETIME(3) NOT NULL,
        created_by BINARY(16) NOT NULL,
        created_at DATETIME(3) NOT NULL,
        revoked_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_invite_code (code_hash),
        KEY idx_invite_session_created (session_id, created_at)
      ) ${T}`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS session_invites');
    await q.query('ALTER TABLE user_directory DROP COLUMN status');
    await q.query('ALTER TABLE session_members DROP COLUMN source, DROP COLUMN added_by');
    await q.query(
      'ALTER TABLE sessions DROP KEY idx_sessions_public_sort, DROP KEY idx_sessions_vis_status_next, DROP COLUMN sort_at, DROP COLUMN sort_rank, DROP COLUMN capacity, DROP COLUMN visibility, DROP COLUMN join_policy'
    );
  }
}
