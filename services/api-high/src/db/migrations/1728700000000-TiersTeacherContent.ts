import type { MigrationInterface, QueryRunner } from 'typeorm';
import { bufToUuid, uuidToBuf } from '../../common/ids';
import { publishClaims } from '../../domain/claims.service';
import { publishCriteria } from '../../domain/criteria/criteria.service';
import { syncBaseline } from '../../domain/rbac.service';
import { DEFAULT_WEIGHTS } from '../../domain/rules';
import { IMPLICIT_ROLES, NEW_V17, NEW_V17_MODULES, seedRbac } from '../rbac-seed';
import { tableOptions } from '../table-options';

/**
 * شناسه‌های ثابت سه معیار seed (صوت/لحن/تجوید). mid ارزیابی‌های قدیمی را با همین شناسه‌ها snapshot می‌کند
 * (ترتیب استقرار low ← mid ← high: mid پیش از رسیدن رویداد high مهاجرت می‌کند) ⇒ شناسه باید قطعی و مشترک باشد.
 */
export const SEED_CRITERIA: readonly { id: string; key: string; title: string; weightKey: keyof typeof DEFAULT_WEIGHTS; sortOrder: number }[] = [
  { id: '00000000-0000-7000-8000-000000000001', key: 'voice', title: 'صوت', weightKey: 'voice', sortOrder: 10 },
  { id: '00000000-0000-7000-8000-000000000002', key: 'tone', title: 'لحن', weightKey: 'tone', sortOrder: 20 },
  { id: '00000000-0000-7000-8000-000000000003', key: 'tajweed', title: 'تجوید', weightKey: 'tajweed', sortOrder: 30 }
];
export const TEACHER_BACKFILL_JOB = 'teacher_backfill';

async function hasColumn(q: QueryRunner, table: string, column: string): Promise<boolean> {
  const r = (await q.query('SELECT 1 AS x FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, column])) as unknown[];
  return r.length > 0;
}

/** وزن‌های فعلی تنظیمات (منسوخ در ۱.۷.۰) ⇒ وزن معیارهای seed؛ مقدار نامعتبر/صفر ⇒ پیش‌فرض ۴۰/۳۰/۳۰ */
function weightsOf(raw: unknown): Record<keyof typeof DEFAULT_WEIGHTS, number> {
  try {
    const v = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown> | null;
    const ok = (x: unknown) => Number.isInteger(x) && (x as number) >= 1 && (x as number) <= 100;
    if (v && ok(v.voice) && ok(v.tone) && ok(v.tajweed)) return { voice: v.voice as number, tone: v.tone as number, tajweed: v.tajweed as number };
  } catch {
    /* پیش‌فرض */
  }
  return { ...DEFAULT_WEIGHTS };
}

/**
 * قرارداد ۱.۷.۰ (docs-v2/31 §۱، §۳، §۷):
 *  - tier روی نقش و ماژول (موجودها ⇒ high)؛ نقش‌های ثابت teacher (mid)، guest و quran_student (low، ضمنی)
 *  - ماژول/مجوزهای تازه (teaching، learning، evaluation، content_admin، system.roles.mid/low.manage)؛ session.create ⇒ ماژول teaching
 *    (نقش‌هایی که ماژول قدیمی `sessions` را داشتند session.create را صریح نگه می‌دارند؛ مجوز مؤثرشان عوض نمی‌شود)
 *  - معیارهای ارزیابی پویا + seed سه معیار با وزن‌های فعلی تنظیمات؛ حذف eval_weights/badge_thresholds از تنظیمات
 *  - انتشار baseline نسخهٔ ۱ (`tier.baseline.changed`) و کاتالوگ معیار (`evaluation.criteria.changed`) + claim تازهٔ developerها
 *  - job یک‌بارهٔ اعطای teacher به سازندگان فعلی جلسه (فهرست از MID_ADMIN.sessionOwners؛ HTTP بیرون از migration)
 * امن روی دادهٔ موجود: ستون‌ها با بررسی information_schema (اجرای دوباره پس از شکست نیمه‌کاره ممکن است).
 */
export class TiersTeacherContent1728700000000 implements MigrationInterface {
  name = 'TiersTeacherContent1728700000000';

  async up(q: QueryRunner): Promise<void> {
    const T = await tableOptions(q);
    if (!(await hasColumn(q, 'system_roles', 'tier'))) await q.query("ALTER TABLE system_roles ADD COLUMN tier ENUM('high','mid','low') NOT NULL DEFAULT 'high', ADD KEY idx_roles_tier (tier)");
    if (!(await hasColumn(q, 'system_modules', 'tier'))) await q.query("ALTER TABLE system_modules ADD COLUMN tier ENUM('high','mid','low') NOT NULL DEFAULT 'high'");
    if (!(await hasColumn(q, 'rbac_meta', 'baseline_version'))) await q.query('ALTER TABLE rbac_meta ADD COLUMN baseline_version BIGINT NOT NULL DEFAULT 0, ADD COLUMN baseline_hash CHAR(64) NULL');

    await q.query(`CREATE TABLE IF NOT EXISTS evaluation_criteria (
      id BINARY(16) NOT NULL,
      criterion_key VARCHAR(32) NOT NULL,
      title VARCHAR(60) NOT NULL,
      description VARCHAR(300) NOT NULL DEFAULT '',
      weight SMALLINT NOT NULL,
      max_score SMALLINT NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 100,
      used TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_criteria_key (criterion_key),
      KEY idx_criteria_order (sort_order, created_at),
      CONSTRAINT chk_criteria_weight CHECK (weight BETWEEN 1 AND 100),
      CONSTRAINT chk_criteria_max CHECK (max_score BETWEEN 1 AND 100)
    ) ${T}`);
    await q.query(`CREATE TABLE IF NOT EXISTS criteria_meta (
      id TINYINT NOT NULL,
      version BIGINT NOT NULL,
      PRIMARY KEY (id)
    ) ${T}`);
    await q.query(`CREATE TABLE IF NOT EXISTS system_jobs (
      job_key VARCHAR(64) NOT NULL,
      status VARCHAR(12) NOT NULL,
      cursor_page INT NOT NULL DEFAULT 1,
      attempts INT NOT NULL DEFAULT 0,
      lease_until DATETIME(3) NULL,
      meta JSON NULL,
      done_at DATETIME(3) NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (job_key)
    ) ${T}`);

    const [{ now: raw }] = (await q.query('SELECT UTC_TIMESTAMP(3) AS now')) as { now: Date | string }[];
    const now = raw instanceof Date ? raw : new Date(`${raw}Z`);

    // ماژول قدیمی `sessions` (فقط session.create) ⇒ مجوز صریح برای نقش‌های دارندهٔ آن (پیش از جابه‌جایی مجوز به teaching)
    await q.query("INSERT IGNORE INTO role_permissions (role_key, permission_key, locked) SELECT role_key, 'session.create', 0 FROM role_modules WHERE module_key = 'sessions' AND role_key <> 'developer'");

    // نقش‌های ضمنی قابل اختصاص نیستند: دارندهٔ صریح احتمالی (نقش پویای هم‌نام پیش از ۱.۷.۰) برداشته می‌شود
    const ph = IMPLICIT_ROLES.map(() => '?').join(',');
    const exHolders = (await q.query(`SELECT DISTINCT user_id FROM user_system_roles WHERE role_key IN (${ph})`, [...IMPLICIT_ROLES])) as { user_id: Buffer }[];
    if (exHolders.length) await q.query(`DELETE FROM user_system_roles WHERE role_key IN (${ph})`, [...IMPLICIT_ROLES]);

    await seedRbac(q, now);

    // ماژول `sessions` اکنون خالی است (session.create ⇒ teaching): حذف؛ اگر مالک مجوز پویا در آن ساخته بود، ماژول پویا می‌شود
    await q.query("DELETE FROM role_modules WHERE module_key = 'sessions'");
    const left = (await q.query("SELECT COUNT(*) AS n FROM permissions WHERE module_key = 'sessions'")) as { n: string | number }[];
    if (Number(left[0]?.n ?? 0) === 0) await q.query("DELETE FROM system_modules WHERE module_key = 'sessions'");
    else await q.query("UPDATE system_modules SET is_system = 0 WHERE module_key = 'sessions'");

    // معیارهای ارزیابی (وزن از تنظیمات فعلی) + نسخهٔ ۱
    const settingsHasWeights = await hasColumn(q, 'system_settings', 'eval_weights');
    const s = settingsHasWeights ? ((await q.query("SELECT eval_weights FROM system_settings WHERE setting_key = 'global'")) as { eval_weights: unknown }[]) : [];
    const w = weightsOf(s[0]?.eval_weights);
    for (const c of SEED_CRITERIA)
      await q.query('INSERT IGNORE INTO evaluation_criteria (id, criterion_key, title, description, weight, max_score, active, sort_order, used, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 10, 1, ?, 1, ?, ?)', [
        uuidToBuf(c.id),
        c.key,
        c.title,
        '',
        w[c.weightKey],
        c.sortOrder,
        now,
        now
      ]);
    await q.query('INSERT IGNORE INTO criteria_meta (id, version) VALUES (1, 0)');
    await publishCriteria(q, now);

    if (settingsHasWeights) await q.query('ALTER TABLE system_settings DROP COLUMN eval_weights, DROP COLUMN badge_thresholds');

    await q.query("INSERT IGNORE INTO system_jobs (job_key, status, cursor_page, attempts, updated_at) VALUES (?, 'pending', 1, 0, ?)", [TEACHER_BACKFILL_JOB, now]);

    // claim: developerها (مجوزهای تازه) و دارندگان صریح قبلی نقش‌های ضمنی
    await q.query('UPDATE rbac_meta SET version = version + 1 WHERE id = 1');
    const devs = (await q.query("SELECT DISTINCT user_id FROM user_system_roles WHERE role_key = 'developer'")) as { user_id: Buffer }[];
    await publishClaims(
      q,
      [...devs, ...exHolders].map((d) => bufToUuid(d.user_id)),
      () => now
    );
    await syncBaseline(q, now, true);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS system_jobs');
    await q.query('DROP TABLE IF EXISTS criteria_meta');
    await q.query('DROP TABLE IF EXISTS evaluation_criteria');
    if (!(await hasColumn(q, 'system_settings', 'eval_weights'))) {
      await q.query("ALTER TABLE system_settings ADD COLUMN eval_weights JSON NULL, ADD COLUMN badge_thresholds JSON NULL");
      await q.query("UPDATE system_settings SET eval_weights = ?, badge_thresholds = ?", [JSON.stringify(DEFAULT_WEIGHTS), JSON.stringify([50, 150, 300, 500])]);
      await q.query('ALTER TABLE system_settings MODIFY eval_weights JSON NOT NULL, MODIFY badge_thresholds JSON NOT NULL');
    }
    // ماژول sessions و جای قبلی session.create
    await q.query("INSERT IGNORE INTO system_modules (module_key, title, description, is_system, sort_order, created_at, updated_at) VALUES ('sessions', 'جلسه‌ها', 'مجوزهای مربوط به جلسه‌های کاربران', 1, 70, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))");
    await q.query("UPDATE system_modules SET is_system = 1 WHERE module_key = 'sessions'");
    await q.query("UPDATE permissions SET module_key = 'sessions' WHERE permission_key = 'session.create'");
    const ph = NEW_V17.map(() => '?').join(',');
    await q.query(`DELETE FROM role_permissions WHERE permission_key IN (${ph})`, NEW_V17);
    await q.query(`DELETE FROM role_step_up WHERE permission_key IN (${ph})`, NEW_V17);
    await q.query(`DELETE FROM user_grants WHERE grant_key IN (${ph})`, NEW_V17);
    await q.query(`DELETE FROM permissions WHERE permission_key IN (${ph})`, NEW_V17);
    const mh = NEW_V17_MODULES.map(() => '?').join(',');
    // مجوز پویای ساخته‌شده در ماژول‌های تازه ⇒ ماژول قدیمی sessions_admin (داده از دست نرود)
    await q.query(`UPDATE permissions SET module_key = 'sessions_admin' WHERE module_key IN (${mh})`, NEW_V17_MODULES);
    await q.query(`DELETE FROM role_modules WHERE module_key IN (${mh})`, NEW_V17_MODULES);
    await q.query(`DELETE FROM system_modules WHERE module_key IN (${mh})`, NEW_V17_MODULES);
    // نقش‌های ثابت تازه پیش از ۱.۷.۰ پویا بودند: قابل‌حذف می‌شوند (دارندگان teacher حفظ می‌شوند)
    await q.query("UPDATE system_roles SET undeletable = 0 WHERE role_key IN ('teacher', 'guest', 'quran_student')");
    if (await hasColumn(q, 'rbac_meta', 'baseline_version')) await q.query('ALTER TABLE rbac_meta DROP COLUMN baseline_version, DROP COLUMN baseline_hash');
    if (await hasColumn(q, 'system_modules', 'tier')) await q.query('ALTER TABLE system_modules DROP COLUMN tier');
    if (await hasColumn(q, 'system_roles', 'tier')) await q.query('ALTER TABLE system_roles DROP KEY idx_roles_tier, DROP COLUMN tier');
  }
}
