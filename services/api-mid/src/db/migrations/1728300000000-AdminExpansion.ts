import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * توسعهٔ پنل مدیریت (docs-v2/26):
 *  - `sessions.deleted_at`: حذف نرم جلسه (NULL = موجود)؛ همهٔ پرسمان‌های عادی `deleted_at IS NULL` را اعمال می‌کنند.
 *  - `user_directory.deleted`: کاربر حذف‌شده/ناشناس‌شده (رویداد user.status.changed)؛ نام در همهٔ نمایش‌ها «کاربر حذف‌شده».
 */
export class AdminExpansion1728300000000 implements MigrationInterface {
  name = 'AdminExpansion1728300000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE sessions ADD COLUMN deleted_at DATETIME(3) NULL AFTER updated_at, ADD KEY idx_sessions_deleted_created (deleted_at, created_at)');
    await q.query('ALTER TABLE user_directory ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER last_name');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE user_directory DROP COLUMN deleted');
    await q.query('ALTER TABLE sessions DROP KEY idx_sessions_deleted_created, DROP COLUMN deleted_at');
  }
}
