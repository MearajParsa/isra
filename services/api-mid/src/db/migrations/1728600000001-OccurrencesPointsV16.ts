import type { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidToBuf, uuidv7 } from '../../common/ids';
import { legacyBadgeId } from '../../domain/refs';
import { tableOptions } from '../table-options';

const CHUNK = 500;
const LEGACY = [
  ['badge_50', 50],
  ['badge_150', 150],
  ['badge_300', 300],
  ['badge_500', 500]
] as const;

const count = async (q: QueryRunner, sql: string): Promise<number> => Number(((await q.query(sql)) as { n: string | number }[])[0]?.n ?? 0);

/**
 * api-types ۱.۶.۰ (docs-v2/30 §۱.۱–۱.۳، §۱.۷):
 *  - نوبت برگزاری `session_occurrences` (حداکثر یک live per جلسه: UNIQUE روی ستون تولیدی live_key)
 *  - `occurrence_id` روی حضور/صف/ارزیابی + backfill: per جلسهٔ دارای داده (یا started) نوبت #۱ (live اگر started، وگرنه closed)؛
 *    صفِ نوبت‌های بسته مثل بستن عادی: current⇒done و waiting حذف
 *  - یکتایی حضور (occurrence_id,user_id)، کلید فعال صف per (occurrence,user)
 *  - دفتر امتیاز امضادار با session_id/note/actor_id و یکتایی (user_id, reason, ref_id)
 *  - کاتالوگ نشان پویا `badges_catalog` و `badge_awards(user_id, badge_id)` (نشان‌های قدیمی با شناسهٔ قطعی legacyBadgeId(key))
 *  - ایندکس‌های گزارش (§۱.۷)
 * down(): معکوس؛ اگر داده اجازه ندهد (چند حضور یک کاربر در نوبت‌های مختلف یک جلسه) خطای صریح می‌دهد.
 */
export class OccurrencesPointsV161728600000001 implements MigrationInterface {
  name = 'OccurrencesPointsV161728600000001';

  public async up(q: QueryRunner): Promise<void> {
    const T = await tableOptions(q);

    // ───── ۱. نوبت‌ها ─────
    await q.query(`CREATE TABLE session_occurrences (
        id BINARY(16) NOT NULL,
        session_id BINARY(16) NOT NULL,
        seq INT NOT NULL,
        status ENUM('live','closed') NOT NULL,
        opened_at DATETIME(3) NOT NULL,
        closed_at DATETIME(3) NULL,
        opened_by BINARY(16) NULL,
        closed_by BINARY(16) NULL,
        live_key BINARY(16) GENERATED ALWAYS AS (IF(status = 'live', session_id, NULL)) STORED,
        PRIMARY KEY (id),
        UNIQUE KEY uq_occ_session_seq (session_id, seq),
        UNIQUE KEY uq_occ_live (live_key),
        KEY idx_occ_session_status (session_id, status),
        KEY idx_occ_opened (opened_at)
      ) ${T}`);

    const sessions = (await q.query(`
      SELECT s.id, s.status, s.updated_at,
             LEAST(
               COALESCE((SELECT MIN(a.entered_at) FROM attendance_entries a WHERE a.session_id = s.id), s.updated_at),
               COALESCE((SELECT MIN(x.joined_at) FROM queue_items x WHERE x.session_id = s.id), s.updated_at),
               COALESCE((SELECT MIN(e.created_at) FROM evaluations e WHERE e.session_id = s.id), s.updated_at)
             ) AS opened_at
        FROM sessions s
       WHERE s.status = 'started'
          OR EXISTS (SELECT 1 FROM attendance_entries a WHERE a.session_id = s.id)
          OR EXISTS (SELECT 1 FROM queue_items x WHERE x.session_id = s.id)
          OR EXISTS (SELECT 1 FROM evaluations e WHERE e.session_id = s.id)`)) as { id: Buffer; status: string; updated_at: Date; opened_at: Date }[];
    for (let i = 0; i < sessions.length; i += CHUNK) {
      const chunk = sessions.slice(i, i + CHUNK);
      const args: unknown[] = [];
      for (const s of chunk) {
        const live = s.status === 'started';
        const opened = new Date(s.opened_at);
        args.push(uuidToBuf(uuidv7(opened.getTime())), s.id, live ? 'live' : 'closed', opened, live ? null : new Date(Math.max(opened.getTime(), new Date(s.updated_at).getTime())));
      }
      await q.query(`INSERT INTO session_occurrences (id, session_id, seq, status, opened_at, closed_at) VALUES ${chunk.map(() => '(?, ?, 1, ?, ?, ?)').join(', ')}`, args);
    }

    // ───── ۲. حضور ─────
    await q.query(
      "ALTER TABLE attendance_entries ADD COLUMN occurrence_id BINARY(16) NULL AFTER session_id, ADD COLUMN source VARCHAR(8) NOT NULL DEFAULT 'self' AFTER entered_at, ADD COLUMN marked_by BINARY(16) NULL AFTER source, ADD COLUMN award_ref BINARY(16) NULL AFTER marked_by"
    );
    await q.query('UPDATE attendance_entries a JOIN session_occurrences o ON o.session_id = a.session_id AND o.seq = 1 SET a.occurrence_id = o.id');
    // +۵ قدیمی ref = شناسهٔ ردیف حضور بود ⇒ award_ref همان (لغو بعدی همان را برمی‌گرداند)
    await q.query("UPDATE attendance_entries a JOIN point_ledger l ON l.reason = 'attendance' AND l.ref_id = a.id AND l.user_id = a.user_id SET a.award_ref = a.id");
    await q.query(
      'ALTER TABLE attendance_entries MODIFY occurrence_id BINARY(16) NOT NULL, DROP INDEX uq_attendance_session_user, ADD UNIQUE KEY uq_attendance_occ_user (occurrence_id, user_id), ADD KEY idx_attendance_user_time (user_id, entered_at), ADD KEY idx_attendance_time (entered_at)'
    );

    // ───── ۳. صف ─────
    await q.query('ALTER TABLE queue_items ADD COLUMN occurrence_id BINARY(16) NULL AFTER session_id');
    await q.query('UPDATE queue_items x JOIN session_occurrences o ON o.session_id = x.session_id AND o.seq = 1 SET x.occurrence_id = o.id');
    await q.query("UPDATE queue_items x JOIN session_occurrences o ON o.id = x.occurrence_id AND o.status = 'closed' SET x.status = 'done', x.position = NULL, x.finished_at = COALESCE(x.finished_at, o.closed_at) WHERE x.status = 'current'");
    await q.query("DELETE x FROM queue_items x JOIN session_occurrences o ON o.id = x.occurrence_id AND o.status = 'closed' WHERE x.status = 'waiting'");
    await q.query('ALTER TABLE queue_items MODIFY occurrence_id BINARY(16) NOT NULL, DROP INDEX uq_queue_active, DROP COLUMN active_key');
    await q.query(
      "ALTER TABLE queue_items ADD COLUMN active_key BINARY(16) GENERATED ALWAYS AS (IF(status IN ('waiting','current'), UNHEX(MD5(CONCAT(HEX(occurrence_id), HEX(user_id)))), NULL)) STORED, ADD UNIQUE KEY uq_queue_active_occ (active_key), ADD KEY idx_queue_occ_status_pos (occurrence_id, status, position)"
    );

    // ───── ۴. ارزیابی ─────
    await q.query(
      "ALTER TABLE evaluations ADD COLUMN occurrence_id BINARY(16) NULL AFTER session_id, ADD COLUMN status VARCHAR(8) NOT NULL DEFAULT 'active' AFTER note, ADD COLUMN updated_at DATETIME(3) NULL AFTER created_at, ADD COLUMN voided_at DATETIME(3) NULL AFTER updated_at, ADD COLUMN voided_by BINARY(16) NULL AFTER voided_at, ADD COLUMN void_reason VARCHAR(300) NULL AFTER voided_by"
    );
    await q.query('UPDATE evaluations e JOIN queue_items x ON x.id = e.queue_item_id SET e.occurrence_id = x.occurrence_id');
    await q.query('UPDATE evaluations e JOIN session_occurrences o ON o.session_id = e.session_id AND o.seq = 1 SET e.occurrence_id = o.id WHERE e.occurrence_id IS NULL');
    await q.query('ALTER TABLE evaluations MODIFY occurrence_id BINARY(16) NOT NULL, ADD KEY idx_eval_occ_time (occurrence_id, created_at), ADD KEY idx_eval_time (created_at)');

    // ───── ۵. دفتر امتیاز ─────
    await q.query('ALTER TABLE point_ledger ADD COLUMN session_id BINARY(16) NULL AFTER ref_id, ADD COLUMN note VARCHAR(200) NULL AFTER session_id, ADD COLUMN actor_id BINARY(16) NULL AFTER note');
    await q.query("UPDATE point_ledger l JOIN attendance_entries a ON a.id = l.ref_id SET l.session_id = a.session_id WHERE l.reason = 'attendance'");
    await q.query("UPDATE point_ledger l JOIN evaluations e ON e.id = l.ref_id SET l.session_id = e.session_id WHERE l.reason = 'evaluation'");
    await q.query('ALTER TABLE point_ledger DROP INDEX uq_ledger_reason_ref, ADD UNIQUE KEY uq_ledger_user_reason_ref (user_id, reason, ref_id), ADD KEY idx_ledger_time (created_at)');

    // ───── ۶. ایندکس‌های گزارش (§۱.۷) ─────
    await q.query('ALTER TABLE user_points ADD KEY idx_points_total (total, updated_at)');
    await q.query('ALTER TABLE sessions ADD KEY idx_sessions_updated (updated_at)');

    // ───── ۷. نشان پویا ─────
    await q.query(`CREATE TABLE badges_catalog (
        id BINARY(16) NOT NULL,
        badge_key VARCHAR(40) NOT NULL,
        title VARCHAR(60) NOT NULL,
        description VARCHAR(300) NOT NULL DEFAULT '',
        threshold INT NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        image_hash VARCHAR(64) NULL,
        version INT NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_badges_catalog_key (badge_key)
      ) ${T}`);
    await q.query('ALTER TABLE badge_awards ADD COLUMN badge_id BINARY(16) NULL AFTER user_id');
    const keys = (await q.query('SELECT DISTINCT badge_key FROM badge_awards')) as { badge_key: string }[];
    for (const k of keys) await q.query('UPDATE badge_awards SET badge_id = ? WHERE badge_key = ?', [uuidToBuf(legacyBadgeId(k.badge_key)), k.badge_key]);
    await q.query(
      'ALTER TABLE badge_awards DROP PRIMARY KEY, DROP INDEX uq_badge_user_key, DROP COLUMN id, DROP COLUMN badge_key, DROP COLUMN threshold, MODIFY badge_id BINARY(16) NOT NULL, ADD PRIMARY KEY (user_id, badge_id), ADD KEY idx_badge_awards_badge (badge_id)'
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    // پیش‌شرط‌ها: یکتایی‌های قدیم باید با داده سازگار باشند؛ وگرنه خطای صریح (بدون تغییر)
    if (await count(q, 'SELECT COUNT(*) AS n FROM (SELECT 1 FROM attendance_entries GROUP BY session_id, user_id HAVING COUNT(*) > 1) d'))
      throw new Error('down ممکن نیست: کاربری در چند نوبت یک جلسه حضور دارد (یکتایی قدیم session_id,user_id نقض می‌شود).');
    if (await count(q, 'SELECT COUNT(*) AS n FROM (SELECT 1 FROM point_ledger GROUP BY reason, ref_id HAVING COUNT(*) > 1) d'))
      throw new Error('down ممکن نیست: refهای تکراری در دفتر امتیاز (یکتایی قدیم reason,ref_id نقض می‌شود).');
    if (await count(q, "SELECT COUNT(*) AS n FROM (SELECT 1 FROM queue_items WHERE status IN ('waiting','current') GROUP BY session_id, user_id HAVING COUNT(*) > 1) d"))
      throw new Error('down ممکن نیست: چند آیتم فعال صف برای یک کاربر در یک جلسه.');

    // نشان‌ها
    await q.query('ALTER TABLE badge_awards ADD COLUMN id BINARY(16) NULL FIRST, ADD COLUMN badge_key VARCHAR(16) NULL AFTER user_id, ADD COLUMN threshold INT NULL AFTER badge_key');
    await q.query('UPDATE badge_awards a JOIN badges_catalog c ON c.id = a.badge_id SET a.badge_key = LEFT(c.badge_key, 16), a.threshold = c.threshold');
    for (const [k, t] of LEGACY) await q.query('UPDATE badge_awards SET badge_key = ?, threshold = ? WHERE badge_id = ? AND badge_key IS NULL', [k, t, uuidToBuf(legacyBadgeId(k))]);
    await q.query('DELETE FROM badge_awards WHERE badge_key IS NULL');
    await q.query("UPDATE badge_awards SET id = UNHEX(REPLACE(UUID(), '-', ''))");
    await q.query(
      'ALTER TABLE badge_awards DROP PRIMARY KEY, DROP INDEX idx_badge_awards_badge, DROP COLUMN badge_id, MODIFY id BINARY(16) NOT NULL, MODIFY badge_key VARCHAR(16) NOT NULL, MODIFY threshold INT NOT NULL, ADD PRIMARY KEY (id), ADD UNIQUE KEY uq_badge_user_key (user_id, badge_key)'
    );
    await q.query('DROP TABLE badges_catalog');
    await q.query("DELETE FROM settings_cache WHERE setting_key IN ('badge_catalog', 'badge_recompute')");

    await q.query('ALTER TABLE sessions DROP KEY idx_sessions_updated');
    await q.query('ALTER TABLE user_points DROP KEY idx_points_total');

    await q.query('ALTER TABLE point_ledger DROP INDEX uq_ledger_user_reason_ref, DROP INDEX idx_ledger_time, ADD UNIQUE KEY uq_ledger_reason_ref (reason, ref_id), DROP COLUMN session_id, DROP COLUMN note, DROP COLUMN actor_id');

    await q.query('ALTER TABLE evaluations DROP INDEX idx_eval_occ_time, DROP INDEX idx_eval_time, DROP COLUMN occurrence_id, DROP COLUMN status, DROP COLUMN updated_at, DROP COLUMN voided_at, DROP COLUMN voided_by, DROP COLUMN void_reason');

    await q.query('ALTER TABLE queue_items DROP INDEX uq_queue_active_occ, DROP INDEX idx_queue_occ_status_pos, DROP COLUMN active_key');
    await q.query(
      "ALTER TABLE queue_items DROP COLUMN occurrence_id, ADD COLUMN active_key BINARY(32) GENERATED ALWAYS AS (IF(status IN ('waiting','current'), UNHEX(MD5(CONCAT(HEX(session_id), HEX(user_id)))), NULL)) STORED, ADD UNIQUE KEY uq_queue_active (active_key)"
    );

    await q.query(
      'ALTER TABLE attendance_entries DROP INDEX uq_attendance_occ_user, DROP INDEX idx_attendance_user_time, DROP INDEX idx_attendance_time, ADD UNIQUE KEY uq_attendance_session_user (session_id, user_id), DROP COLUMN occurrence_id, DROP COLUMN source, DROP COLUMN marked_by, DROP COLUMN award_ref'
    );

    await q.query('DROP TABLE session_occurrences');
  }
}
