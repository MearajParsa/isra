import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v3 (docs-v2/26): رمز موقت مدیر (`must_change_password`) + ایندکس‌های گزارش/فیلتر ادمین.
 * `users.status` از قبل هست (active | disabled | deleted؛ blocked دیگر مقداردهی نمی‌شود).
 */
export class AdminExpansion1728400000000 implements MigrationInterface {
  name = 'AdminExpansion1728400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER status');
    await q.query('ALTER TABLE users ADD KEY idx_users_created (created_at)');
    await q.query("UPDATE users SET status = 'disabled' WHERE status = 'blocked'");
    await q.query('ALTER TABLE otp_challenges ADD KEY idx_otp_created (created_at)');
    await q.query('ALTER TABLE auth_sessions ADD KEY idx_sessions_client (revoked_at, client_id)');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE auth_sessions DROP KEY idx_sessions_client');
    await q.query('ALTER TABLE otp_challenges DROP KEY idx_otp_created');
    await q.query('ALTER TABLE users DROP KEY idx_users_created');
    await q.query('ALTER TABLE users DROP COLUMN must_change_password');
  }
}
