import { tableOptions } from '../table-options';
import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v4 (docs-v2/30 §۲، api-types ۱.۶.۰):
 *  - OTP: `send_failed_at` (گزارش failed/verified) + جدول cooldown اتمیک `otp_cooldowns`
 *  - اینباکس: `broadcast_id` + UNIQUE(broadcast_id,user_id)، ایندکس (user_id, read_at, created_at, id)، source_event_id تا ۸۰ نویسه (`eventId:index`)
 *  - `inbox_broadcasts` (پیام همگانی با cursor پایدار)، `badge_catalog` (کاتالوگ نشان از high)، `dead_letter_events` (رویداد ناسالم)
 *  - outbox: وضعیت تحویل per مقصد (`pending_targets`)
 *  - ایندکس‌های نگهداشت: refresh_tokens.expires_at/rotated_at، inbox_events.received_at، rate_limit_counters.window_start (auth_sessions.revoked_at و outbox.published_at از قبل پیشوند ایندکس‌اند)
 */
export class LowV161728600000010 implements MigrationInterface {
  name = 'LowV161728600000010';

  public async up(q: QueryRunner): Promise<void> {
    const T = await tableOptions(q);
    await q.query('ALTER TABLE otp_challenges ADD COLUMN send_failed_at DATETIME(3) NULL AFTER consumed_at');
    await q.query(`CREATE TABLE otp_cooldowns (
      cooldown_key VARCHAR(64) NOT NULL,
      last_sent_at DATETIME(3) NOT NULL,
      PRIMARY KEY (cooldown_key),
      KEY idx_otp_cooldown_sent (last_sent_at)
    ) ${T}`);

    await q.query('ALTER TABLE inbox_messages MODIFY COLUMN source_event_id VARCHAR(80) NULL');
    await q.query('ALTER TABLE inbox_messages ADD COLUMN broadcast_id BINARY(16) NULL AFTER source_event_id');
    await q.query('ALTER TABLE inbox_messages ADD UNIQUE KEY uq_inbox_broadcast_user (broadcast_id, user_id)');
    await q.query('ALTER TABLE inbox_messages ADD KEY idx_inbox_user_read_created (user_id, read_at, created_at, id)');
    await q.query('ALTER TABLE inbox_messages DROP KEY idx_inbox_user_read');

    await q.query(`CREATE TABLE inbox_broadcasts (
      id BINARY(16) NOT NULL,
      segment JSON NOT NULL,
      title VARCHAR(120) NOT NULL,
      body VARCHAR(500) NOT NULL,
      ref VARCHAR(200) NULL,
      created_by BINARY(16) NOT NULL,
      status VARCHAR(10) NOT NULL DEFAULT 'queued',
      cursor_id BINARY(16) NULL,
      targeted INT UNSIGNED NULL,
      delivered INT UNSIGNED NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      finished_at DATETIME(3) NULL,
      PRIMARY KEY (id),
      KEY idx_broadcast_status (status, created_at)
    ) ${T}`);

    await q.query(`CREATE TABLE badge_catalog (
      id BINARY(16) NOT NULL,
      badge_key VARCHAR(40) NOT NULL,
      title VARCHAR(60) NOT NULL,
      description VARCHAR(300) NOT NULL,
      threshold INT UNSIGNED NOT NULL,
      active TINYINT(1) NOT NULL,
      sort_order INT UNSIGNED NOT NULL,
      image_hash VARCHAR(64) NULL,
      version INT UNSIGNED NOT NULL,
      PRIMARY KEY (id),
      KEY idx_badge_active_sort (active, sort_order, threshold)
    ) ${T}`);

    await q.query(`CREATE TABLE dead_letter_events (
      id BINARY(16) NOT NULL,
      event_id VARCHAR(64) NOT NULL,
      type VARCHAR(64) NOT NULL,
      caller VARCHAR(8) NOT NULL,
      payload JSON NOT NULL,
      error VARCHAR(1000) NOT NULL,
      received_at DATETIME(3) NOT NULL,
      PRIMARY KEY (id),
      KEY idx_dead_letter_received (received_at),
      KEY idx_dead_letter_type (type, received_at)
    ) ${T}`);

    await q.query('ALTER TABLE outbox_events ADD COLUMN pending_targets VARCHAR(32) NULL AFTER payload');

    await q.query('ALTER TABLE refresh_tokens ADD KEY idx_refresh_expires (expires_at), ADD KEY idx_refresh_rotated (rotated_at)');
    await q.query('ALTER TABLE inbox_events ADD KEY idx_inbox_events_received (received_at)');
    await q.query('ALTER TABLE rate_limit_counters ADD KEY idx_rl_window (window_start)');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE rate_limit_counters DROP KEY idx_rl_window');
    await q.query('ALTER TABLE inbox_events DROP KEY idx_inbox_events_received');
    await q.query('ALTER TABLE refresh_tokens DROP KEY idx_refresh_expires, DROP KEY idx_refresh_rotated');
    await q.query('ALTER TABLE outbox_events DROP COLUMN pending_targets');
    await q.query('DROP TABLE IF EXISTS dead_letter_events');
    await q.query('DROP TABLE IF EXISTS badge_catalog');
    await q.query('DROP TABLE IF EXISTS inbox_broadcasts');
    await q.query('ALTER TABLE inbox_messages ADD KEY idx_inbox_user_read (user_id, read_at)');
    await q.query('ALTER TABLE inbox_messages DROP KEY idx_inbox_user_read_created');
    await q.query('ALTER TABLE inbox_messages DROP KEY uq_inbox_broadcast_user');
    await q.query('ALTER TABLE inbox_messages DROP COLUMN broadcast_id');
    // شناسه‌های بلندتر از ۶۴ (eventId:index) پیش از کوتاه‌کردن ستون حذف می‌شوند (dedupe آن‌ها دیگر لازم نیست)
    await q.query('UPDATE inbox_messages SET source_event_id = NULL WHERE CHAR_LENGTH(source_event_id) > 64');
    await q.query('ALTER TABLE inbox_messages MODIFY COLUMN source_event_id VARCHAR(64) NULL');
    await q.query('DROP TABLE IF EXISTS otp_cooldowns');
    await q.query('ALTER TABLE otp_challenges DROP COLUMN send_failed_at');
  }
}
