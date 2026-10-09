import type { MigrationInterface, QueryRunner } from 'typeorm';
import { bufToUuid, uuidToBuf, uuidv7 } from '../../common/ids';
import { LEGACY_CRITERIA, legacyCriterionId } from '../../domain/refs';
import { ALL_SESSION_PERMISSIONS, type Permission, parsePermissions, sanitizePermissions } from '../../domain/rules';
import { tableOptions } from '../table-options';

const CHUNK = 500;

/** نگاشت نقش‌های قبلی جلسه ⇒ مجوزهای معادل پشتیبان (docs-v2/31 §۲؛ هم‌مدیر ⇒ همه) */
export const LEGACY_ROLE_PERMISSIONS: Readonly<Record<string, readonly Permission[]>> = {
  session_manager: ALL_SESSION_PERMISSIONS,
  session_supporter: ['membership.approve', 'membership.manage', 'attendance.manage', 'queue.manage', 'eval.submit', 'occurrence.manage'],
  teacher: ['attendance.manage', 'queue.manage', 'eval.submit', 'occurrence.manage'],
  quran_student: []
};
const STAFF_ROLES = new Set(['session_manager', 'session_supporter', 'teacher']);

const hasTable = async (q: QueryRunner, t: string): Promise<boolean> =>
  ((await q.query('SELECT 1 AS x FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [t])) as unknown[]).length > 0;
const hasColumn = async (q: QueryRunner, t: string, c: string): Promise<boolean> =>
  ((await q.query('SELECT 1 AS x FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?', [t, c])) as unknown[]).length > 0;
const hasIndex = async (q: QueryRunner, t: string, i: string): Promise<boolean> =>
  ((await q.query('SELECT 1 AS x FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?', [t, i])) as unknown[]).length > 0;

const parseObj = (v: unknown): Record<string, unknown> => {
  if (v && typeof v === 'object') return v as Record<string, unknown>;
  if (typeof v === 'string')
    try {
      const p = JSON.parse(v) as unknown;
      return p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  return {};
};

interface StaffRow {
  id: Buffer;
  session_id: Buffer;
  user_id: Buffer;
  decided_at: Date | null;
  requested_at: Date;
  roles: string;
}

/**
 * api-types ۱.۷.۰ (docs-v2/31): استاد صاحب جلسه، پشتیبان ثابت/per جلسه، ارزیابی با snapshot معیار، گالری و کامنت.
 *
 * مهاجرت داده (روی داده‌های تولید؛ هر گام با بررسی وضعیت فعلی schema ⇒ اجرای دوباره پس از شکست نیمه‌کاره امن است):
 *  - `sessions.owner_id`: مدیر فعلی جلسه (اگر سازنده هنوز مدیر است همان؛ وگرنه قدیمی‌ترین مدیر تأییدشده؛ جلسهٔ بی‌مدیر ⇒ سازنده).
 *  - هم‌مدیرهای دیگر ⇒ پشتیبان per جلسه با همهٔ مجوزها؛ معلم/پشتیبان قبلی ⇒ پشتیبان per جلسه با مجوزهای معادل
 *    (`LEGACY_ROLE_PERMISSIONS`؛ اجتماع اگر چند نقش داشت).
 *  - `session_members` فقط اعضا: ردیف صاحب و ردیف کادرِ بدون نقش quran_student حذف؛ کادری که قرآن‌آموز هم بود عضو می‌ماند.
 *  - جدول `session_member_roles` و ستون `session_invites.roles` حذف (دعوت فقط برای عضویت).
 *  - `queue_items.started_at` (شروع تلاوت؛ آیتم‌های current فعلی ⇒ زمان مهاجرت).
 *  - `evaluations.criteria` snapshot سه معیار قدیمی (وزن‌های زمان ثبت؛ وزن صفر حذف) و حذف ستون‌های ثابت voice/tone/tajweed/weights.
 *  - جدول‌های گالری/آیتم/کامنت.
 */
export class TeacherContentV171728700000000 implements MigrationInterface {
  name = 'TeacherContentV171728700000000';

  public async up(q: QueryRunner): Promise<void> {
    const T = await tableOptions(q);

    // ───── ۱. جلسه: صاحب + تنظیمات کامنت ─────
    if (!(await hasColumn(q, 'sessions', 'owner_id'))) await q.query('ALTER TABLE sessions ADD COLUMN owner_id BINARY(16) NULL AFTER created_by');
    if (!(await hasColumn(q, 'sessions', 'comments_enabled'))) await q.query('ALTER TABLE sessions ADD COLUMN comments_enabled TINYINT(1) NOT NULL DEFAULT 1');
    if (!(await hasColumn(q, 'sessions', 'comment_visibility'))) await q.query("ALTER TABLE sessions ADD COLUMN comment_visibility VARCHAR(12) NOT NULL DEFAULT 'public'");

    // ───── ۲. پشتیبان‌ها ─────
    await q.query(`CREATE TABLE IF NOT EXISTS session_supporters (
        session_id BINARY(16) NOT NULL,
        user_id BINARY(16) NOT NULL,
        permissions JSON NOT NULL,
        created_by BINARY(16) NULL,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (session_id, user_id),
        KEY idx_ss_user (user_id)
      ) ${T}`);
    await q.query(`CREATE TABLE IF NOT EXISTS teacher_supporters (
        teacher_id BINARY(16) NOT NULL,
        user_id BINARY(16) NOT NULL,
        permissions JSON NOT NULL,
        created_by BINARY(16) NULL,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (teacher_id, user_id),
        KEY idx_ts_user (user_id)
      ) ${T}`);

    // ───── ۳. مهاجرت نقش‌ها ⇒ صاحب/پشتیبان/عضو ─────
    if (await hasTable(q, 'session_member_roles')) await this.migrateRoles(q);
    // جلسه‌ای که owner ندارد (مثلاً اجرای نیمه‌کارهٔ قبلی) ⇒ سازنده
    await q.query('UPDATE sessions SET owner_id = created_by WHERE owner_id IS NULL');
    await q.query('ALTER TABLE sessions MODIFY owner_id BINARY(16) NOT NULL');
    if (!(await hasIndex(q, 'sessions', 'idx_sessions_owner'))) await q.query('ALTER TABLE sessions ADD KEY idx_sessions_owner (owner_id, deleted_at)');
    if (await hasTable(q, 'session_member_roles')) await q.query('DROP TABLE session_member_roles');
    if (await hasColumn(q, 'session_invites', 'roles')) await q.query('ALTER TABLE session_invites DROP COLUMN roles');

    // ───── ۴. صف: شروع تلاوت ─────
    if (!(await hasColumn(q, 'queue_items', 'started_at'))) {
      await q.query('ALTER TABLE queue_items ADD COLUMN started_at DATETIME(3) NULL AFTER joined_at');
      await q.query("UPDATE queue_items SET started_at = UTC_TIMESTAMP(3) WHERE status = 'current'");
    }

    // ───── ۵. ارزیابی: snapshot معیار ─────
    if (!(await hasColumn(q, 'evaluations', 'criteria'))) await q.query('ALTER TABLE evaluations ADD COLUMN criteria JSON NULL AFTER evaluator_id');
    if (await hasColumn(q, 'evaluations', 'voice')) {
      await this.snapshotLegacyEvaluations(q);
      await q.query('ALTER TABLE evaluations DROP COLUMN voice, DROP COLUMN tone, DROP COLUMN tajweed, DROP COLUMN weights');
    }
    await q.query("UPDATE evaluations SET criteria = JSON_ARRAY() WHERE criteria IS NULL");
    await q.query('ALTER TABLE evaluations MODIFY criteria JSON NOT NULL');

    // ───── ۶. گالری و کامنت ─────
    await q.query(`CREATE TABLE IF NOT EXISTS galleries (
        id BINARY(16) NOT NULL,
        session_id BINARY(16) NOT NULL,
        occurrence_id BINARY(16) NOT NULL,
        title VARCHAR(80) NOT NULL,
        kind ENUM('image','audio') NOT NULL,
        visibility ENUM('public','members','staff') NOT NULL,
        sort_order INT NOT NULL DEFAULT 100,
        created_by BINARY(16) NOT NULL,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY idx_gal_occ (occurrence_id, deleted_at, sort_order),
        KEY idx_gal_session (session_id, deleted_at, visibility)
      ) ${T}`);
    await q.query(`CREATE TABLE IF NOT EXISTS gallery_items (
        id BINARY(16) NOT NULL,
        gallery_id BINARY(16) NOT NULL,
        session_id BINARY(16) NOT NULL,
        mime VARCHAR(32) NOT NULL,
        bytes BIGINT UNSIGNED NOT NULL,
        sha256 CHAR(64) NOT NULL,
        width INT NULL,
        height INT NULL,
        duration_sec INT NULL,
        title VARCHAR(120) NOT NULL DEFAULT '',
        storage_key VARCHAR(200) NOT NULL,
        uploaded_by BINARY(16) NOT NULL,
        created_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3) NULL,
        purged_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY idx_gi_gallery (gallery_id, deleted_at, created_at),
        KEY idx_gi_session (session_id, deleted_at),
        KEY idx_gi_purge (deleted_at, purged_at)
      ) ${T}`);
    await q.query(`CREATE TABLE IF NOT EXISTS comments (
        id BINARY(16) NOT NULL,
        session_id BINARY(16) NOT NULL,
        occurrence_id BINARY(16) NOT NULL,
        queue_item_id BINARY(16) NULL,
        reciter_id BINARY(16) NULL,
        author_id BINARY(16) NOT NULL,
        body VARCHAR(500) NOT NULL,
        at_sec INT NULL,
        hidden TINYINT(1) NOT NULL DEFAULT 0,
        hidden_by BINARY(16) NULL,
        created_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3) NULL,
        deleted_by BINARY(16) NULL,
        PRIMARY KEY (id),
        KEY idx_cmt_occ (occurrence_id, created_at),
        KEY idx_cmt_queue (queue_item_id, created_at),
        KEY idx_cmt_session (session_id, created_at),
        KEY idx_cmt_author (author_id, created_at)
      ) ${T}`);
  }

  /** نقش‌های قدیمی ⇒ owner_id، پشتیبان per جلسه، حذف ردیف عضویت کادرِ غیرقرآن‌آموز */
  private async migrateRoles(q: QueryRunner): Promise<void> {
    const staff = (await q.query(
      `SELECT m.id, m.session_id, m.user_id, m.decided_at, m.requested_at, GROUP_CONCAT(r.role) AS roles
         FROM session_members m JOIN session_member_roles r ON r.member_id = m.id
        WHERE m.status = 'approved'
        GROUP BY m.id, m.session_id, m.user_id, m.decided_at, m.requested_at`
    )) as StaffRow[];
    const bySession = new Map<string, StaffRow[]>();
    for (const r of staff) {
      const roles = r.roles.split(',');
      if (!roles.some((x) => STAFF_ROLES.has(x))) continue;
      const k = bufToUuid(r.session_id);
      const list = bySession.get(k);
      if (list) list.push(r);
      else bySession.set(k, [r]);
    }
    const sessions = (await q.query('SELECT id, created_by, owner_id FROM sessions')) as { id: Buffer; created_by: Buffer; owner_id: Buffer | null }[];
    const now = new Date();
    const owners: [Buffer, Buffer][] = [];
    const supporters: [Buffer, Buffer, string][] = [];
    const deleteMembers: Buffer[] = [];
    for (const s of sessions) {
      const sid = bufToUuid(s.id);
      const rows = bySession.get(sid) ?? [];
      const managers = rows
        .filter((r) => r.roles.split(',').includes('session_manager'))
        .sort((a, b) => (a.decided_at ?? a.requested_at).getTime() - (b.decided_at ?? b.requested_at).getTime() || Buffer.compare(a.id, b.id));
      const owner = s.owner_id ?? (managers.find((m) => m.user_id.equals(s.created_by)) ?? managers[0])?.user_id ?? s.created_by;
      if (!s.owner_id) owners.push([s.id, owner]);
      for (const r of rows) {
        const roles = r.roles.split(',');
        if (r.user_id.equals(owner)) continue;
        const perms = sanitizePermissions(roles.flatMap((x) => LEGACY_ROLE_PERMISSIONS[x] ?? []));
        if (perms.length) supporters.push([s.id, r.user_id, JSON.stringify(perms)]);
        if (!roles.includes('quran_student')) deleteMembers.push(r.id);
      }
    }
    for (let i = 0; i < owners.length; i += CHUNK) {
      const c = owners.slice(i, i + CHUNK);
      await q.query(`UPDATE sessions SET owner_id = CASE id ${c.map(() => 'WHEN ? THEN ?').join(' ')} END WHERE id IN (${c.map(() => '?').join(',')})`, [...c.flat(), ...c.map((x) => x[0])]);
    }
    for (let i = 0; i < supporters.length; i += CHUNK) {
      const c = supporters.slice(i, i + CHUNK);
      await q.query(
        `INSERT IGNORE INTO session_supporters (session_id, user_id, permissions, created_by, created_at, updated_at) VALUES ${c.map(() => '(?, ?, ?, NULL, ?, ?)').join(',')}`,
        c.flatMap((x) => [...x, now, now])
      );
    }
    // صاحب عضو نیست (ردیف عضویت او در هر وضعیت حذف می‌شود)
    const own = (await q.query('SELECT m.id FROM session_members m JOIN sessions s ON s.id = m.session_id AND s.owner_id = m.user_id')) as { id: Buffer }[];
    for (const o of own) deleteMembers.push(o.id);
    const del = [...new Map(deleteMembers.map((b) => [b.toString('hex'), b])).values()];
    for (let i = 0; i < del.length; i += CHUNK) {
      const c = del.slice(i, i + CHUNK);
      const ph = c.map(() => '?').join(',');
      await q.query(`DELETE FROM session_member_roles WHERE member_id IN (${ph})`, c);
      await q.query(`DELETE FROM session_members WHERE id IN (${ph})`, c);
    }
  }

  /** ستون‌های ثابت ⇒ snapshot با شناسهٔ قطعی معیار قدیمی؛ وزن صفر (تنظیم قدیمی مجاز) کنار گذاشته می‌شود */
  private async snapshotLegacyEvaluations(q: QueryRunner): Promise<void> {
    for (;;) {
      const rows = (await q.query('SELECT id, voice, tone, tajweed, weights FROM evaluations WHERE criteria IS NULL LIMIT ?', [CHUNK])) as { id: Buffer; voice: number; tone: number; tajweed: number; weights: unknown }[];
      if (!rows.length) return;
      const vals = rows.map((r) => {
        const w = parseObj(r.weights);
        const scores: Record<string, number> = { voice: Number(r.voice), tone: Number(r.tone), tajweed: Number(r.tajweed) };
        const snap = LEGACY_CRITERIA.map((c) => ({ criterionId: legacyCriterionId(c.key), key: c.key, title: c.title, weight: Math.round(Number(w[c.key] ?? c.weight)), maxScore: c.maxScore, score: Math.min(c.maxScore, Math.max(0, scores[c.key] ?? 0)) })).filter((c) => c.weight >= 1 && c.weight <= 100);
        return [r.id, JSON.stringify(snap.length ? snap : LEGACY_CRITERIA.map((c) => ({ criterionId: legacyCriterionId(c.key), key: c.key, title: c.title, weight: c.weight, maxScore: c.maxScore, score: Math.min(c.maxScore, Math.max(0, scores[c.key] ?? 0)) })))] as const;
      });
      await q.query(`UPDATE evaluations SET criteria = CASE id ${vals.map(() => 'WHEN ? THEN ?').join(' ')} END WHERE id IN (${vals.map(() => '?').join(',')})`, [...vals.flat(), ...vals.map((v) => v[0])]);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    const T = await tableOptions(q);
    await q.query('DROP TABLE IF EXISTS comments');
    await q.query('DROP TABLE IF EXISTS gallery_items');
    await q.query('DROP TABLE IF EXISTS galleries');

    // ارزیابی: snapshot ⇒ ستون‌های ثابت (معیارهای غیر قدیمی قابل بازگشت نیستند ⇒ ۰)
    if (!(await hasColumn(q, 'evaluations', 'voice'))) {
      await q.query("ALTER TABLE evaluations ADD COLUMN voice TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER evaluator_id, ADD COLUMN tone TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER voice, ADD COLUMN tajweed TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER tone, ADD COLUMN weights JSON NULL AFTER tajweed");
      let cursor = Buffer.alloc(16);
      for (;;) {
        const rows = (await q.query('SELECT id, criteria FROM evaluations WHERE id > ? ORDER BY id LIMIT ?', [cursor, CHUNK])) as { id: Buffer; criteria: unknown }[];
        if (!rows.length) break;
        cursor = rows[rows.length - 1]!.id;
        for (const r of rows) {
          const snap = (Array.isArray(r.criteria) ? r.criteria : (JSON.parse(String(r.criteria ?? '[]')) as unknown[])) as { key?: string; weight?: number; maxScore?: number; score?: number }[];
          const get = (k: string) => snap.find((c) => c.key === k);
          const sc = (k: string) => {
            const c = get(k);
            return c && c.maxScore ? Math.round(((c.score ?? 0) / c.maxScore) * 10) : 0;
          };
          const weights = { voice: get('voice')?.weight ?? 0, tone: get('tone')?.weight ?? 0, tajweed: get('tajweed')?.weight ?? 0 };
          await q.query('UPDATE evaluations SET voice = ?, tone = ?, tajweed = ?, weights = ? WHERE id = ?', [sc('voice'), sc('tone'), sc('tajweed'), JSON.stringify(weights), r.id]);
        }
      }
      await q.query("UPDATE evaluations SET weights = JSON_OBJECT('voice', 40, 'tone', 30, 'tajweed', 30) WHERE weights IS NULL");
      await q.query('ALTER TABLE evaluations MODIFY weights JSON NOT NULL');
    }
    if (await hasColumn(q, 'evaluations', 'criteria')) await q.query('ALTER TABLE evaluations DROP COLUMN criteria');

    if (await hasColumn(q, 'queue_items', 'started_at')) await q.query('ALTER TABLE queue_items DROP COLUMN started_at');
    if (!(await hasColumn(q, 'session_invites', 'roles'))) await q.query("ALTER TABLE session_invites ADD COLUMN roles VARCHAR(80) NOT NULL DEFAULT 'quran_student' AFTER code_hash");

    // نقش‌ها: صاحب ⇒ مدیر، پشتیبان ⇒ پشتیبان/معلم/مدیر (بر اساس مجوز)، عضو ⇒ قرآن‌آموز
    if (!(await hasTable(q, 'session_member_roles'))) {
      await q.query(`CREATE TABLE session_member_roles (member_id BINARY(16) NOT NULL, role VARCHAR(24) NOT NULL, PRIMARY KEY (member_id, role)) ${T}`);
      await q.query("INSERT IGNORE INTO session_member_roles (member_id, role) SELECT id, 'quran_student' FROM session_members WHERE status = 'approved'");
      const now = new Date();
      const ensureMember = async (sessionId: Buffer, userId: Buffer): Promise<Buffer> => {
        const ex = (await q.query('SELECT id, status FROM session_members WHERE session_id = ? AND user_id = ?', [sessionId, userId])) as { id: Buffer; status: string }[];
        if (ex[0]) {
          if (ex[0].status !== 'approved') await q.query("UPDATE session_members SET status = 'approved', decided_at = ? WHERE id = ?", [now, ex[0].id]);
          return ex[0].id;
        }
        const id = uuidToBuf(uuidv7(now.getTime()));
        await q.query("INSERT INTO session_members (id, session_id, user_id, status, requested_at, decided_at, source) VALUES (?, ?, ?, 'approved', ?, ?, 'staff')", [id, sessionId, userId, now, now]);
        return id;
      };
      const sessions = (await q.query('SELECT id, owner_id FROM sessions')) as { id: Buffer; owner_id: Buffer }[];
      for (const s of sessions) await q.query("INSERT IGNORE INTO session_member_roles (member_id, role) VALUES (?, 'session_manager')", [await ensureMember(s.id, s.owner_id)]);
      if (await hasTable(q, 'session_supporters')) {
        const sup = (await q.query('SELECT session_id, user_id, permissions FROM session_supporters')) as { session_id: Buffer; user_id: Buffer; permissions: unknown }[];
        for (const r of sup) {
          const p = new Set(parsePermissions(r.permissions));
          const role = p.size === ALL_SESSION_PERMISSIONS.length ? 'session_manager' : p.has('membership.approve') ? 'session_supporter' : 'teacher';
          await q.query('INSERT IGNORE INTO session_member_roles (member_id, role) VALUES (?, ?)', [await ensureMember(r.session_id, r.user_id), role]);
        }
      }
    }
    await q.query('DROP TABLE IF EXISTS teacher_supporters');
    await q.query('DROP TABLE IF EXISTS session_supporters');
    if (await hasIndex(q, 'sessions', 'idx_sessions_owner')) await q.query('ALTER TABLE sessions DROP KEY idx_sessions_owner');
    for (const c of ['comment_visibility', 'comments_enabled', 'owner_id']) if (await hasColumn(q, 'sessions', c)) await q.query(`ALTER TABLE sessions DROP COLUMN ${c}`);
  }
}
