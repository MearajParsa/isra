import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dataSourceOptions } from '../src/db/data-source';
import { OverviewService } from '../src/domain/overview.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { MaintenanceService } from '../src/outbox/maintenance.service';
import { type TestApp, api, mkUser, resetDb, startApp, testEnv } from './helpers/app';

const SECRET = 'test-pair-low-high-0123456789abcdef0'; // جفت low↔high
const MID_SECRET = 'test-pair-mid-high-0123456789abcdef0'; // جفت mid↔high
let t: TestApp;
let a: ReturnType<typeof api>;
beforeAll(async () => {
  t = await startApp({ INTERNAL_TIMEOUT_MS: '500' });
  a = api(t);
});
afterAll(async () => t.close());
beforeEach(async () => resetDb(t.ds, t.app));

const send = (body: object, token: string | null = SECRET) => {
  const r = request(t.http).post('/s/internal/v1/events').set('X-Internal-Caller', 'low');
  return (token ? r.set('X-Internal-Token', token) : r).send(body);
};
const ev = (type: string, payload: object, eventId = randomUUID()) => ({ eventId, type, occurredAt: new Date().toISOString(), payload });

describe('رویدادهای ورودی از low', () => {
  it('secret نادرست ⇒ 401؛ payload نامعتبر ⇒ 400؛ نوع ناشناخته ⇒ 202', async () => {
    expect((await send(ev('user.registered', {}), null)).status).toBe(401);
    expect((await send(ev('user.registered', {}), 'wrong'.repeat(10))).status).toBe(401);
    expect((await send(ev('user.registered', { userId: 'x', phone: '1' }))).status).toBe(400);
    expect((await send(ev('future.event', { a: 1 }))).status).toBe(403); // allow-list نوع رویداد
    const midCaller = await request(t.http).post('/s/internal/v1/events').set('X-Internal-Caller', 'mid').set('X-Internal-Token', MID_SECRET).send(ev('user.registered', { userId: randomUUID(), phone: '09120000001' }));
    expect(midCaller.status).toBe(403); // mid اجازهٔ ارسال user.* به high را ندارد
  });

  it('user.registered ⇒ در فهرست کاربران؛ dedupe؛ profile.updated جزئی نام را می‌پاشد؟ خیر', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const uid = randomUUID();
    const e = ev('user.registered', { userId: uid, phone: '09127776655', firstName: 'نرگس', lastName: '', createdAt: '2026-10-01T10:00:00+03:30' });
    expect((await send(e)).status).toBe(202);
    expect((await send(e)).status).toBe(202);
    expect((await a.get(`/system/users/${uid}`, dev)).body.data).toMatchObject({ name: 'نرگس', phone: '09127776655', createdAt: '2026-10-01T06:30:00.000Z' });
    await send(ev('user.profile.updated', { userId: uid, lastName: 'کاظمی' }));
    expect((await a.get(`/system/users/${uid}`, dev)).body.data.name).toBe('نرگس کاظمی');
    // بازپخش رویداد جدید با همان کاربر نام را خالی نمی‌کند
    await send(ev('user.registered', { userId: uid, phone: '09127776655', firstName: '', lastName: '' }));
    expect((await a.get(`/system/users/${uid}`, dev)).body.data.name).toBe('نرگس کاظمی');
    expect((await a.get('/system/users?q=کاظمی', dev)).body.meta.total).toBe(1);
  });
});

describe('outbox به low و mid', () => {
  it('per مقصد: مقصد موفق دوباره دریافت نمی‌کند؛ role.changed فقط low', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const svc = t.app.get(OutboxService);
    const s = await a.get('/system/settings', dev);
    await a.put('/system/settings', await dev.step(), { version: s.body.data.version, flags: { maintenance_mode: false, registration_open: true } });
    // شبیه‌سازی: low قبلاً گرفته و فقط mid مانده
    await t.ds.query("UPDATE outbox_events SET pending_peers = 'mid' WHERE type = 'system.settings.changed'");
    t.fake.status = 202;
    t.fake.events.length = 0;
    expect(await svc.tick()).toBe(1);
    expect(t.fake.events.map((e) => e.url)).toEqual(['/o/internal/v1/events']);
    const u = await mkUser(t, 'هدف');
    await a.put(`/system/users/${u.id}/grants`, await dev.step(), { grants: ['session.create'] });
    t.fake.events.length = 0;
    expect(await svc.tick()).toBe(1);
    expect(t.fake.events.map((e) => e.url)).toEqual(['/c/internal/v1/events']);
    const [row] = (await t.ds.query("SELECT published_at, pending_peers FROM outbox_events WHERE type = 'system.role.changed'")) as { published_at: Date | null; pending_peers: string }[];
    expect(row!.published_at).not.toBeNull();
  });

  it('رویدادها با secret به مقصدهای مصرف‌کننده می‌رسند؛ شکست ⇒ backoff؛ eventId پایدار', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'هدف');
    await a.put(`/system/users/${u.id}/grants`, await dev.step(), { grants: ['session.create'] });
    const svc = t.app.get(OutboxService);
    t.fake.events.length = 0;
    t.fake.status = 500;
    expect(await svc.tick()).toBe(0);
    const [row] = (await t.ds.query('SELECT attempts, next_attempt_at FROM outbox_events')) as { attempts: number; next_attempt_at: Date }[];
    expect(row!.attempts).toBe(1);
    expect(await svc.tick()).toBe(0); // هنوز زود است
    t.clock.advance(120_000);
    t.fake.status = 202;
    t.fake.events.length = 0;
    expect(await svc.tick()).toBe(1);
    // system.role.changed فقط به low (mid مصرف‌کننده نیست؛ docs-v2/30 §۳)
    expect(t.fake.events).toHaveLength(1);
    expect(t.fake.events[0]!.headers['x-internal-token']).toBe(SECRET); // → low
    expect(t.fake.events[0]!.headers['x-internal-caller']).toBe('high');
    expect(t.fake.events[0]!.body).toMatchObject({ type: 'system.role.changed', payload: { userId: u.id, grants: ['session.create'] } });
    expect(await svc.tick()).toBe(0);
    // settings.changed ⇒ هر دو مقصد با secret جدا و eventId یکسان
    const s = await a.get('/system/settings', dev);
    await a.put('/system/settings', await dev.step(), { version: s.body.data.version, flags: { maintenance_mode: false, registration_open: true } });
    t.fake.events.length = 0;
    expect(await svc.tick()).toBe(1);
    expect(t.fake.events.map((e) => e.url).sort()).toEqual(['/c/internal/v1/events', '/o/internal/v1/events']);
    const toMid = t.fake.events.find((e) => e.url.startsWith('/o/'))!;
    expect(toMid.headers['x-internal-token']).toBe(MID_SECRET);
    expect(toMid.body.eventId).toBe(t.fake.events.find((e) => e.url.startsWith('/c/'))!.body.eventId);
  });
});

describe('maintenance', () => {
  it('outbox منتشرشدهٔ قدیمی پاک می‌شود؛ audit هرگز پاک نمی‌شود', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'هدف');
    await a.put(`/system/users/${u.id}/grants`, await dev.step(), { grants: ['session.create'] });
    await t.ds.query('UPDATE outbox_events SET published_at = DATE_SUB(NOW(3), INTERVAL 10 DAY)');
    t.clock.advance(11 * 86_400_000);
    const out = await t.app.get(MaintenanceService).run();
    expect(out.outbox).toBeGreaterThanOrEqual(1);
    const fresh = { Authorization: `Bearer ${await t.fake.sign({ sub: dev.id })}`, 'X-Forwarded-For': '10.99.0.1' };
    expect((await a.get('/system/audit', fresh)).body.meta.total).toBe(1);
  });
});

describe('migration و seed', () => {
  it('seed: ۲ نقش undeletable، ۱۱ مجوز، ماتریس، تنظیمات؛ CHECK روی undeletable؛ down/up تکرارپذیر', async () => {
    const ds = new DataSource(dataSourceOptions(testEnv({ DB_MIGRATIONS_RUN: 'false', LOW_JWKS_URL: t.fake.jwksUrl })));
    await ds.initialize();
    try {
      const count = async (sql: string) => Number(((await ds.query(sql)) as { n: string }[])[0]!.n);
      const events = async (type: string) => ((await ds.query('SELECT payload, pending_peers FROM outbox_events WHERE type = ? ORDER BY created_at, id', [type])) as { payload: unknown; pending_peers: string }[]).map((r) => ({ peers: r.pending_peers, payload: (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload) as any }));
      // ۱.۷.۰ (TiersTeacherContent)
      expect(await count('SELECT COUNT(*) AS n FROM system_roles WHERE undeletable = 1')).toBe(5);
      expect(await count('SELECT COUNT(*) AS n FROM permissions')).toBe(32);
      expect(await count("SELECT COUNT(*) AS n FROM role_permissions WHERE role_key = 'developer' AND locked = 1")).toBe(32);
      await ds.query('DELETE FROM outbox_events');
      await ds.undoLastMigration(); // TiersTeacherContent (۱.۷.۰)
      expect(await count("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'system_roles' AND column_name = 'tier'")).toBe(0);
      expect(await count("SELECT COUNT(*) AS n FROM permissions WHERE permission_key = 'session.create' AND module_key = 'sessions'")).toBe(1);
      // دادهٔ ۱.۶ پیش از ارتقا: نقش پویا با ماژول sessions، نقش پویای هم‌نام guest با دارنده، وزن‌های سفارشی
      await ds.query("INSERT INTO system_roles (role_key, title, description, undeletable) VALUES ('creator_x', 't', 'd', 0)");
      await ds.query("INSERT INTO role_modules (role_key, module_key) VALUES ('creator_x', 'sessions')");
      await ds.query("UPDATE system_roles SET undeletable = 0 WHERE role_key IN ('teacher', 'guest', 'quran_student')");
      await ds.query("DELETE FROM system_roles WHERE role_key IN ('teacher', 'guest', 'quran_student')");
      await ds.query("INSERT INTO system_roles (role_key, title, description, undeletable) VALUES ('guest', 'مهمان قدیمی', 'd', 0)");
      await ds.query("INSERT INTO user_directory (user_id, phone, first_name, last_name, status, perm_ver, created_at, updated_at) VALUES (UNHEX('00000000000000000000000000000abc'), '09120000abc', 'x', 'y', 'active', 1, NOW(3), NOW(3)) ON DUPLICATE KEY UPDATE status = 'active'");
      await ds.query("INSERT INTO user_system_roles (user_id, role_key, granted_at) VALUES (UNHEX('00000000000000000000000000000abc'), 'guest', NOW(3))");
      await ds.query("UPDATE system_settings SET eval_weights = '{\"voice\":50,\"tone\":25,\"tajweed\":25}'");
      await ds.runMigrations(); // دوباره ۱.۷.۰ روی دادهٔ موجود
      expect(await count("SELECT COUNT(*) AS n FROM role_permissions WHERE role_key = 'creator_x' AND permission_key = 'session.create'")).toBe(1);
      expect(await count("SELECT COUNT(*) AS n FROM system_modules WHERE module_key = 'sessions'")).toBe(0);
      expect(await count("SELECT COUNT(*) AS n FROM user_system_roles WHERE role_key = 'guest'")).toBe(0);
      expect(await count("SELECT COUNT(*) AS n FROM system_roles WHERE role_key = 'guest' AND undeletable = 1 AND tier = 'low'")).toBe(1);
      expect(((await ds.query('SELECT criterion_key AS k, weight AS w FROM evaluation_criteria ORDER BY sort_order')) as any[]).map((r) => [r.k, Number(r.w)])).toEqual([['voice', 50], ['tone', 25], ['tajweed', 25]]);
      const crit = await events('evaluation.criteria.changed');
      expect(crit.map((e) => [e.peers, e.payload.version, e.payload.criteria[0].id])).toEqual([['mid', 1, '00000000-0000-7000-8000-000000000001']]);
      const base = await events('tier.baseline.changed');
      expect(base).toHaveLength(1);
      expect(base[0]!.peers).toBe('low,mid');
      // نقش پویای قدیمی guest ⇒ پیش‌فرض کاشته نمی‌شود (ویرایش مالک حفظ)؛ quran_student تازه ⇒ ماژول learning
      expect(base[0]!.payload.guest).toEqual([]);
      expect(base[0]!.payload.quran_student).toEqual(['comment.post', 'gallery.view', 'points.view', 'session.browse', 'session.join']);
      expect((await events('system.role.changed')).map((e) => e.payload.userId)).toContain('00000000-0000-0000-0000-000000000abc');
      await ds.query("DELETE FROM role_permissions WHERE role_key = 'creator_x'");
      await ds.query("DELETE FROM system_roles WHERE role_key = 'creator_x'");
      await ds.query("DELETE FROM user_directory WHERE user_id = UNHEX('00000000000000000000000000000abc')");
      await ds.query("INSERT IGNORE INTO role_permissions (role_key, permission_key) VALUES ('guest', 'session.browse'), ('guest', 'gallery.view')");
      await ds.undoLastMigration(); // TiersTeacherContent
      await ds.query("DELETE FROM role_permissions WHERE role_key IN ('teacher', 'guest', 'quran_student')");
      await ds.query("DELETE FROM role_modules WHERE role_key IN ('teacher', 'guest', 'quran_student')");
      await ds.query("DELETE FROM system_roles WHERE role_key IN ('teacher', 'guest', 'quran_student')");
      expect(await count('SELECT COUNT(*) AS n FROM system_roles WHERE undeletable = 1')).toBe(2);
      expect(await count('SELECT COUNT(*) AS n FROM permissions')).toBe(19);
      expect(await count("SELECT COUNT(*) AS n FROM role_permissions WHERE role_key = 'developer' AND locked = 1")).toBe(19);
      expect(await count("SELECT COUNT(*) AS n FROM role_permissions WHERE role_key = 'super_admin' AND permission_key IN ('system.sessions.moderate','system.points.manage','system.badges.manage','system.inbox.send','system.data.export')")).toBe(0);
      expect(await count('SELECT COUNT(*) AS n FROM badges')).toBe(4);
      await ds.undoLastMigration(); // OpsExpansion (۱.۶.۰)
      expect(await count('SELECT COUNT(*) AS n FROM permissions')).toBe(14);
      expect(await count('SELECT COUNT(*) AS n FROM system_modules')).toBe(7);
      expect(await count("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('badges','badge_catalog_meta','announcements')")).toBe(0);
      // قرارداد ۱.۴: super_admin فقط sessions.view/reports.view را (بدون قفل) می‌گیرد؛ users.manage/sessions.manage را نه
      expect(await count("SELECT COUNT(*) AS n FROM role_permissions WHERE role_key = 'super_admin' AND permission_key IN ('system.sessions.view','system.reports.view') AND locked = 0")).toBe(2);
      expect(await count("SELECT COUNT(*) AS n FROM role_permissions WHERE role_key = 'super_admin' AND permission_key IN ('system.users.manage','system.sessions.manage')")).toBe(0);
      // RBAC پویا: CHECK برداشته شده؛ نقش پویا مجاز است
      await ds.query("INSERT INTO system_roles (role_key, title, description, undeletable) VALUES ('dyn_role_x', 't', 'd', 0)");
      await ds.query("INSERT INTO user_grants (user_id, grant_key, granted_at) VALUES (UNHEX('00000000000000000000000000000001'), 'session.create', NOW(3)), (UNHEX('00000000000000000000000000000001'), 'content.read', NOW(3))");
      await ds.undoLastMigration(); // DynamicRbac (داده‌ی v1 حفظ؛ پویا حذف)
      expect(await count('SELECT COUNT(*) AS n FROM permissions')).toBe(11);
      expect(await count('SELECT COUNT(*) AS n FROM system_roles')).toBe(2);
      expect(await count("SELECT COUNT(*) AS n FROM role_permissions WHERE role_key = 'super_admin'")).toBe(9);
      expect(await count('SELECT COUNT(*) AS n FROM user_grants')).toBe(1);
      expect(await count("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'permissions' AND column_name = 'perm_group'")).toBe(1);
      await expect(ds.query("INSERT INTO system_roles (role_key, title, description, undeletable) VALUES ('x', 't', 'd', 0)")).rejects.toThrow();
      await ds.query('DELETE FROM user_grants');
      await ds.runMigrations(); // دوباره بالا (روی داده‌ی موجود): DynamicRbac + OpsExpansion + TiersTeacherContent
      expect(await count('SELECT COUNT(*) AS n FROM permissions')).toBe(32);
      await ds.query("DELETE FROM system_roles WHERE role_key = 'dyn_role_x'");
      await ds.undoLastMigration(); // TiersTeacherContent
      expect(await count('SELECT COUNT(*) AS n FROM permissions')).toBe(19);
      await ds.undoLastMigration(); // OpsExpansion
      await ds.undoLastMigration(); // DynamicRbac
      await ds.undoLastMigration(); // AdminExpansion
      expect(await count('SELECT COUNT(*) AS n FROM permissions')).toBe(7);
      expect(await count("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_directory' AND column_name = 'status'")).toBe(0);
      await ds.undoLastMigration(); // RevokedSessions
      await ds.undoLastMigration(); // InitSchema
      expect(await count('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> "migrations"')).toBe(0);
      await ds.runMigrations(); // دیتابیس تازه: InitSchema → RevokedSessions → AdminExpansion → DynamicRbac
      expect(await count('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> "migrations"')).toBe(23);
      expect(await count('SELECT COUNT(*) AS n FROM system_modules')).toBe(13);
      expect(await count('SELECT COUNT(*) AS n FROM rbac_meta')).toBe(1);
      expect(await count('SELECT COUNT(*) AS n FROM system_settings')).toBe(1);
      expect(await count('SELECT COUNT(*) AS n FROM permissions')).toBe(32);
      expect(await count("SELECT COUNT(*) AS n FROM role_modules WHERE role_key = 'teacher'")).toBe(2);
      expect(await count("SELECT COUNT(*) AS n FROM role_permissions WHERE role_key = 'guest'")).toBe(2);
      expect(await count('SELECT COUNT(*) AS n FROM evaluation_criteria WHERE used = 1')).toBe(3);
      expect(await count("SELECT COUNT(*) AS n FROM system_jobs WHERE job_key = 'teacher_backfill' AND status = 'pending'")).toBe(1);
      // seed نشان‌های قدیمی + رویداد کاتالوگ (نسخهٔ ۱) فقط به mid و low
      expect(await count('SELECT COUNT(*) AS n FROM badges')).toBe(4);
      const cat = (await ds.query("SELECT payload, pending_peers FROM outbox_events WHERE type = 'badge.catalog.changed'")) as { payload: unknown; pending_peers: string }[];
      expect(cat).toHaveLength(1);
      expect(cat[0]!.pending_peers).toBe('mid,low');
      const pl = (typeof cat[0]!.payload === 'string' ? JSON.parse(cat[0]!.payload) : cat[0]!.payload) as { version: number; badges: { key: string; threshold: number; imageHash: null }[] };
      expect(pl.version).toBe(1);
      expect(pl.badges.map((b) => [b.key, b.threshold])).toEqual([['badge_50', 50], ['badge_150', 150], ['badge_300', 300], ['badge_500', 500]]);
      expect(await count("SELECT COUNT(*) AS n FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'audit_logs' AND index_name IN ('idx_audit_actor_at','idx_audit_target_at')")).toBeGreaterThanOrEqual(2);
      expect(await count("SELECT COUNT(*) AS n FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'user_directory' AND index_name = 'idx_directory_status'")).toBeGreaterThan(0);
      const uq = (await ds.query("SELECT non_unique AS nu FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'user_directory' AND index_name = 'uq_directory_phone'")) as { nu: string | number }[];
      expect(Number(uq[0]!.nu)).toBe(0);
    } finally {
      await ds.destroy();
    }
  });
});

describe('session.revoked از low', () => {
  it('توکن نشست باطل‌شده در high رد می‌شود؛ نشست دیگر سالم', async () => {
    const u = await mkUser(t, 'الف', ['developer']);
    const v = await mkUser(t, 'ب', ['developer']);
    expect((await a.get('/system/users', u)).status).toBe(200);
    const r = await send(ev('session.revoked', { sessionIds: [u.sid], expiresAt: new Date(Date.now() + 600_000).toISOString() }));
    expect(r.status).toBe(202);
    expect((await a.get('/system/users', u)).status).toBe(401);
    expect((await a.get('/system/users', v)).status).toBe(200);
  });
});

describe('overview: آخرین audit فقط با system.audit.view', () => {
  it('بدون مجوز ⇒ lastAudit خالی', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const svc = t.app.get(OverviewService);
    expect((await svc.get(false)).lastAudit).toEqual([]);
    expect(Array.isArray((await svc.get(true)).lastAudit)).toBe(true);
    expect((await a.get('/system/overview', dev)).status).toBe(200);
  });
});
