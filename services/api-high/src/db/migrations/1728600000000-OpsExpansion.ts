import type { MigrationInterface, QueryRunner } from 'typeorm';
import { bufToUuid, uuidToBuf, uuidv7 } from '../../common/ids';
import { publishClaims } from '../../domain/claims.service';
import { lockCatalog, publishCatalog } from '../../domain/badges/catalog';
import { DEFAULT_THRESHOLDS } from '../../domain/rules';
import { NEW_V16, seedRbac } from '../rbac-seed';
import { tableOptions } from '../table-options';

const NEW_MODULES = ['gamification', 'messaging', 'exports'];
const SEED_BADGES: readonly { key: string; title: string; sortOrder: number }[] = [
  { key: 'badge_50', title: 'قرآن‌آموز کوشا', sortOrder: 10 },
  { key: 'badge_150', title: 'همراه پیگیر', sortOrder: 20 },
  { key: 'badge_300', title: 'یار همیشگی جلسه', sortOrder: 30 },
  { key: 'badge_500', title: 'ستارهٔ قرآنی', sortOrder: 40 }
];

/**
 * قرارداد ۱.۶.۰ (docs-v2/30 §۳): نشان‌های پویا + نسخهٔ کاتالوگ، پیام همگانی، ایندکس‌های audit، outbox per مقصد،
 * مجوزها/ماژول‌های تازه (INSERT IGNORE؛ ویرایش مالک حفظ) + انتشار claim دارندگان اثرپذیر (developer)،
 * seed ۴ نشان قدیمی از آستانه‌های فعلی تنظیمات و انتشار فوری کاتالوگ.
 */
export class OpsExpansion1728600000000 implements MigrationInterface {
  name = 'OpsExpansion1728600000000';

  async up(q: QueryRunner): Promise<void> {
    const T = await tableOptions(q);
    await q.query('ALTER TABLE outbox_events ADD COLUMN pending_peers VARCHAR(32) NULL');
    await q.query('ALTER TABLE audit_logs ADD KEY idx_audit_actor_at (actor_id, at), ADD KEY idx_audit_target_at (target_type, target_id, at)');
    await q.query(`CREATE TABLE badges (
      id BINARY(16) NOT NULL,
      badge_key VARCHAR(40) NOT NULL,
      title VARCHAR(60) NOT NULL,
      description VARCHAR(300) NOT NULL DEFAULT '',
      threshold INT NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 100,
      image MEDIUMBLOB NULL,
      image_type VARCHAR(16) NULL,
      image_hash CHAR(64) NULL,
      image_bytes INT NULL,
      image_w SMALLINT UNSIGNED NULL,
      image_h SMALLINT UNSIGNED NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_badges_key (badge_key),
      KEY idx_badges_order (sort_order, threshold)
    ) ${T}`);
    await q.query(`CREATE TABLE badge_catalog_meta (
      id TINYINT NOT NULL,
      version BIGINT NOT NULL,
      PRIMARY KEY (id)
    ) ${T}`);
    await q.query(`CREATE TABLE announcements (
      id BINARY(16) NOT NULL,
      audience JSON NOT NULL,
      title VARCHAR(120) NOT NULL,
      body VARCHAR(500) NOT NULL,
      ref VARCHAR(200) NULL,
      status VARCHAR(10) NOT NULL,
      recipients INT NULL,
      created_by BINARY(16) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      PRIMARY KEY (id),
      KEY idx_announcements_created (created_at, id),
      KEY idx_announcements_actor (created_by, created_at)
    ) ${T}`);

    const [{ now: raw }] = (await q.query('SELECT UTC_TIMESTAMP(3) AS now')) as { now: Date | string }[];
    const now = raw instanceof Date ? raw : new Date(`${raw}Z`);

    // مجوزها/ماژول‌های تازه (idempotent؛ ردیف موجود overwrite نمی‌شود) + claim تازهٔ دارندگان developer
    await seedRbac(q, now);
    await q.query('UPDATE rbac_meta SET version = version + 1 WHERE id = 1');
    const devs = (await q.query("SELECT DISTINCT user_id FROM user_system_roles WHERE role_key = 'developer'")) as { user_id: Buffer }[];
    await publishClaims(
      q,
      devs.map((d) => bufToUuid(d.user_id)),
      () => now
    );

    // نشان‌های قدیمی با آستانه‌های فعلی تنظیمات (منسوخ‌شده در ۱.۶.۰) و انتشار فوری کاتالوگ
    const s = (await q.query("SELECT badge_thresholds FROM system_settings WHERE setting_key = 'global'")) as { badge_thresholds: unknown }[];
    let th: number[] = [...DEFAULT_THRESHOLDS];
    try {
      const v = typeof s[0]?.badge_thresholds === 'string' ? (JSON.parse(s[0].badge_thresholds) as unknown) : s[0]?.badge_thresholds;
      if (Array.isArray(v) && v.length === 4 && v.every((x) => Number.isInteger(x) && x >= 1)) th = v as number[];
    } catch {
      /* پیش‌فرض */
    }
    await q.query('INSERT INTO badge_catalog_meta (id, version) VALUES (1, 0)');
    await lockCatalog(q);
    for (const [i, b] of SEED_BADGES.entries()) {
      await q.query('INSERT INTO badges (id, badge_key, title, description, threshold, active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)', [
        uuidToBuf(uuidv7(now.getTime())),
        b.key,
        b.title,
        `کسب دست‌کم ${th[i]} امتیاز`,
        th[i],
        b.sortOrder,
        now,
        now
      ]);
    }
    await publishCatalog(q, now);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS announcements');
    await q.query('DROP TABLE IF EXISTS badge_catalog_meta');
    await q.query('DROP TABLE IF EXISTS badges');
    const ph = NEW_V16.map(() => '?').join(',');
    await q.query(`DELETE FROM role_permissions WHERE permission_key IN (${ph})`, NEW_V16);
    await q.query(`DELETE FROM role_step_up WHERE permission_key IN (${ph})`, NEW_V16);
    await q.query(`DELETE FROM user_grants WHERE grant_key IN (${ph})`, NEW_V16);
    await q.query(`DELETE FROM permissions WHERE permission_key IN (${ph})`, NEW_V16);
    const mh = NEW_MODULES.map(() => '?').join(',');
    // مجوز پویای ساخته‌شده در ماژول‌های تازه ⇒ به ماژول قدیمی sessions_admin منتقل (داده از دست نرود)
    await q.query(`UPDATE permissions SET module_key = 'sessions_admin' WHERE module_key IN (${mh})`, NEW_MODULES);
    await q.query(`DELETE FROM role_modules WHERE module_key IN (${mh})`, NEW_MODULES);
    await q.query(`DELETE FROM system_modules WHERE module_key IN (${mh})`, NEW_MODULES);
    await q.query('ALTER TABLE audit_logs DROP KEY idx_audit_actor_at, DROP KEY idx_audit_target_at');
    await q.query('ALTER TABLE outbox_events DROP COLUMN pending_peers');
  }
}
