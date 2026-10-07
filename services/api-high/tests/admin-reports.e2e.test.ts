import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { uuidToBuf, uuidv7 } from '../src/common/ids';
import { type TestApp, type User, api, mkUser, rawReply, resetDb, startApp } from './helpers/app';
import { installFakeLow, installFakeMid, lowReports } from './helpers/fakes';

let t: TestApp;
let a: ReturnType<typeof api>;
let dev: User;
const hex = (id: string) => id.replace(/-/g, '');

beforeAll(async () => {
  t = await startApp({ INTERNAL_TIMEOUT_MS: '500' });
  a = api(t);
});
afterAll(async () => t.close());
beforeEach(async () => {
  await resetDb(t.ds, t.app);
  t.fake.admin.reset();
  installFakeLow(t);
  installFakeMid(t);
  lowReports(t);
  dev = await mkUser(t, 'توسعه', ['developer']);
  await t.ds.query('UPDATE user_directory SET created_at = ? WHERE user_id = UNHEX(?)', [new Date('2025-01-01T00:00:00Z'), hex(dev.id)]);
});

const at = (u: User, iso: string) => t.ds.query('UPDATE user_directory SET created_at = ? WHERE user_id = UNHEX(?)', [new Date(iso), hex(u.id)]);

describe('مجوز و اعتبارسنجی بازه', () => {
  it('reports.view: super_admin پیش‌فرض مجاز؛ بدون نقش 403؛ حذف مجوز از ماتریس ⇒ 403', async () => {
    const admin = await mkUser(t, 'مدیر', ['super_admin']);
    const nobody = await mkUser(t, 'عادی');
    for (const p of ['/overview', '/registrations', '/sessions', '/otp', '/leaderboard']) {
      expect([p, (await a.get(`/system/reports${p}`, admin)).status]).toEqual([p, 200]);
      expect([p, (await a.get(`/system/reports${p}`, nobody)).status]).toEqual([p, 403]);
    }
    await t.ds.query("DELETE FROM role_permissions WHERE role_key = 'super_admin' AND permission_key = 'system.reports.view'");
    t.flush();
    expect((await a.get('/system/reports/overview', admin)).body.error.code).toBe('AUTH_FORBIDDEN');
  });

  it('بازهٔ نامعتبر ⇒ 400 VALIDATION_FAILED: from>to، بیش از ۳۶۶ روز، تاریخ غیرواقعی، قالب غلط، interval نامعتبر', async () => {
    for (const qs of ['from=2026-05-10&to=2026-05-01', 'from=2025-01-01&to=2026-05-01', 'from=2026-02-30&to=2026-03-05', 'from=2026-5-1', 'to=abc', 'interval=year']) {
      for (const p of qs === 'interval=year' ? ['/registrations', '/sessions', '/otp'] : ['/overview', '/registrations', '/sessions', '/otp']) {
        const r = await a.get(`/system/reports${p}?${qs}`, dev);
        expect([p, qs, r.status, r.body.error?.code]).toEqual([p, qs, 400, 'VALIDATION_FAILED']);
      }
    }
    expect((await a.get('/system/reports/leaderboard?limit=0', dev)).status).toBe(400);
    expect((await a.get('/system/reports/leaderboard?limit=101', dev)).status).toBe(400);
    // دقیقاً ۳۶۶ روز مجاز؛ ۳۶۷ ⇒ رد
    expect((await a.get('/system/reports/registrations?from=2025-01-01&to=2026-01-02', dev)).status).toBe(200);
    expect((await a.get('/system/reports/registrations?from=2025-01-01&to=2026-01-03', dev)).status).toBe(400);
  });
});

describe('H-81 ثبت‌نام', () => {
  const seed = async () => {
    const us = await Promise.all(['الف', 'ب', 'پ', 'ت', 'ث', 'خارج یک', 'خارج دو'].map((n) => mkUser(t, `${n} کاربر`)));
    await at(us[0]!, '2026-09-30T21:00:00Z'); // تهران: 2026-10-01 ۰۰:۳۰ (پنجشنبه)
    await at(us[1]!, '2026-10-02T10:00:00Z'); // جمعه
    await at(us[2]!, '2026-10-03T09:00:00Z'); // شنبه
    await at(us[3]!, '2026-10-03T21:00:00Z'); // تهران: 2026-10-04 ۰۰:۳۰ (یک‌شنبه)
    await at(us[4]!, '2026-10-09T20:00:00Z'); // تهران: 2026-10-09 ۲۳:۳۰ (جمعه)
    await at(us[5]!, '2026-09-20T10:00:00Z'); // خارج بازه
    await at(us[6]!, '2026-10-10T20:30:00Z'); // تهران: 2026-10-11 ۰۰:۰۰ ⇒ خارج بازه
  };

  it('روزانه zero-filled با مرز روز تهران', async () => {
    await seed();
    const r = await a.get('/system/reports/registrations?from=2026-09-28&to=2026-10-10', dev);
    expect(r.status).toBe(200);
    expect(r.body.data.interval).toBe('day');
    expect(r.body.data.items).toHaveLength(13);
    expect(r.body.data.items[0]).toEqual({ bucket: '2026-09-28', count: 0 });
    const m = Object.fromEntries(r.body.data.items.map((i: any) => [i.bucket, i.count]));
    expect(m).toMatchObject({ '2026-10-01': 1, '2026-10-02': 1, '2026-10-03': 1, '2026-10-04': 1, '2026-10-09': 1, '2026-10-10': 0, '2026-09-30': 0 });
    expect(Object.values(m).reduce((s: number, x) => s + (x as number), 0)).toBe(5);
  });

  it('هفتگی با شروع شنبه و ماهانه', async () => {
    await seed();
    const w = await a.get('/system/reports/registrations?from=2026-09-28&to=2026-10-10&interval=week', dev);
    expect(w.body.data.items).toEqual([
      { bucket: '2026-09-26', count: 2 },
      { bucket: '2026-10-03', count: 3 },
      { bucket: '2026-10-10', count: 0 }
    ]);
    const mo = await a.get('/system/reports/registrations?from=2026-09-28&to=2026-10-10&interval=month', dev);
    expect(mo.body.data.items).toEqual([
      { bucket: '2026-09-01', count: 0 },
      { bucket: '2026-10-01', count: 5 }
    ]);
  });

  it('پیش‌فرض: ۳۰ روز اخیر (۳۱ سطل تا امروز تهران)؛ فقط to ⇒ from = to-30', async () => {
    const r = await a.get('/system/reports/registrations', dev);
    expect(r.status).toBe(200);
    expect(r.body.data.items).toHaveLength(31);
    const today = new Date(t.clock.now().getTime() + 210 * 60_000).toISOString().slice(0, 10);
    expect(r.body.data.items.at(-1).bucket).toBe(today);
    const only = await a.get('/system/reports/registrations?to=2026-03-31', dev);
    expect(only.body.data.items[0].bucket).toBe('2026-03-01');
    expect(only.body.data.items).toHaveLength(31);
  });
});

describe('H-80 گزارش جامع', () => {
  it('ترکیب دایرکتوری + low + mid', async () => {
    const u1 = await mkUser(t, 'مدیر یک', ['super_admin']);
    const u2 = await mkUser(t, 'غیرفعال', [], [], { status: 'disabled' });
    const u3 = await mkUser(t, 'حذف', [], [], { status: 'deleted' });
    const plain = await mkUser(t, 'عادی');
    await at(plain, '2025-06-01T10:00:00Z');
    await at(u1, '2026-10-05T10:00:00Z');
    await at(u2, '2026-10-06T10:00:00Z');
    await at(u3, '2026-09-01T10:00:00Z');
    const r = await a.get('/system/reports/overview?from=2026-10-01&to=2026-10-10', dev);
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.range).toEqual({ from: '2026-10-01', to: '2026-10-10' });
    expect(d.users.total).toBe(5); // dev + 4
    expect(d.users.registered).toBe(2);
    expect(d.users.byStatus).toEqual({ active: 3, disabled: 1, deleted: 1 });
    expect(d.users.byRole).toEqual({ developer: 1, super_admin: 1, none: 3 });
    expect(d.users.withPassword).toBe(7);
    expect(d.sessions).toEqual({ total: 9, created: 4, byStatus: { draft: 1, scheduled: 2, started: 3, ended: 3 } });
    expect(d.participation).toEqual({ attendance: 40, evaluations: 12, avgScore: 77.5, pointsAwarded: 300 });
    expect(d.messaging).toEqual({ otpRequested: 15, otpVerified: 12 });
    expect(d.clients).toEqual([{ client: 'web-admin', activeSessions: 3 }, { client: 'android-low', activeSessions: 9 }]);
    const lowCall = t.fake.admin.calls.find((c) => c.path.endsWith('/reports/users'))!;
    expect(lowCall.query).toMatchObject({ from: '2026-10-01', to: '2026-10-10' });
  });

  it('memo ۳۰ ثانیه: تکرار در همان بازه ⇒ بدون فراخوانی دوبارهٔ مبدأ؛ پس از ۳۰ ثانیه تازه', async () => {
    t.clock.advance(31_000);
    const n = () => t.fake.admin.calls.filter((c) => c.path.endsWith('/reports/overview')).length;
    const before = n();
    await a.get('/system/reports/overview?from=2026-09-01&to=2026-09-10', dev);
    await a.get('/system/reports/overview?from=2026-09-01&to=2026-09-10', dev);
    expect(n() - before).toBe(1);
    t.clock.advance(31_000);
    await a.get('/system/reports/overview?from=2026-09-01&to=2026-09-10', dev);
    expect(n() - before).toBe(2);
  });

  it('degraded: low خراب ⇒ withPassword/messaging null و clients خالی؛ mid خراب ⇒ صفر؛ همه خراب هم 200', async () => {
    await mkUser(t, 'عادی');
    t.fake.admin.on('GET', '/c/internal/v1/admin/reports/users', () => rawReply(500));
    t.fake.admin.on('GET', '/c/internal/v1/admin/reports/otp', () => rawReply(200, {}, 900)); // timeout
    t.fake.admin.on('GET', '/c/internal/v1/admin/reports/clients', () => rawReply(401, { success: false, error: { code: 'AUTH_REQUIRED', message: 'x' } }));
    t.clock.advance(31_000); // memo ۳۰ ثانیه‌ای H-80
    const r1 = await a.get('/system/reports/overview?from=2026-10-01&to=2026-10-10', dev);
    expect(r1.status).toBe(200);
    expect(r1.body.data.users.withPassword).toBeNull();
    expect(r1.body.data.messaging).toBeNull();
    expect(r1.body.data.clients).toEqual([]);
    expect(r1.body.data.users.total).toBe(2);
    expect(r1.body.data.sessions.total).toBe(9); // mid سالم
    t.fake.admin.on('GET', '/o/internal/v1/admin/reports/overview', () => rawReply(500));
    t.clock.advance(31_000);
    const r2 = await a.get('/system/reports/overview?from=2026-10-01&to=2026-10-10', dev);
    expect(r2.status).toBe(200);
    expect(r2.body.data.sessions).toEqual({ total: 0, created: 0, byStatus: { draft: 0, scheduled: 0, started: 0, ended: 0 } });
    expect(r2.body.data.participation).toEqual({ attendance: 0, evaluations: 0, avgScore: null, pointsAwarded: 0 });
    // اندازهٔ دایرکتوری از high همچنان درست است
    expect(r2.body.data.users.byRole.developer).toBe(1);
  });
});

describe('H-82/H-83/H-84 پروکسی', () => {
  it('H-82 از mid و H-83 مستقیم از low با بازهٔ حل‌شده؛ H-84 limit', async () => {
    const s = await a.get('/system/reports/sessions?from=2026-10-01&to=2026-10-10&interval=week', dev);
    expect(s.status).toBe(200);
    expect(s.body.data).toEqual({ interval: 'week', items: [{ bucket: '2026-10-01', created: 1, held: 1, attendance: 5 }] });
    expect(t.fake.admin.calls.find((c) => c.path === '/o/internal/v1/admin/reports/sessions')!.query).toEqual({ from: '2026-10-01', to: '2026-10-10', interval: 'week' });
    const o = await a.get('/system/reports/otp?from=2026-10-01&to=2026-10-10', dev);
    expect(o.body.data.interval).toBe('day');
    expect(o.body.data.items[0]).toEqual({ bucket: '2026-10-01', requested: 10, verified: 8 });
    expect(t.fake.admin.calls.find((c) => c.path === '/c/internal/v1/admin/reports/otp')!.query).toEqual({ from: '2026-10-01', to: '2026-10-10', interval: 'day' });
    // پیش‌فرض بازه: from/to به مبدأ پر می‌شود
    await a.get('/system/reports/otp', dev);
    const q = [...t.fake.admin.calls].reverse().find((c) => c.path === '/c/internal/v1/admin/reports/otp')!.query;
    expect(q.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(q.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const l = await a.get('/system/reports/leaderboard?limit=5', dev);
    expect(l.body.data.items[0]).toMatchObject({ name: 'برتر', points: 500 });
    expect(t.fake.admin.calls.find((c) => c.path.endsWith('/reports/leaderboard'))!.query).toEqual({ limit: '5' });
  });

  it('خطای مبدأ ⇒ 503 طبق قرارداد (نه degraded)', async () => {
    t.fake.admin.on('GET', '/o/internal/v1/admin/reports/sessions', () => rawReply(500));
    t.fake.admin.on('GET', '/c/internal/v1/admin/reports/otp', () => rawReply(200, {}, 900));
    t.fake.admin.on('GET', '/o/internal/v1/admin/reports/leaderboard', () => rawReply(502));
    for (const p of ['/sessions', '/otp', '/leaderboard']) {
      const r = await a.get(`/system/reports${p}`, dev);
      expect([p, r.status, r.body.error.code]).toEqual([p, 503, 'SERVICE_UNAVAILABLE']);
    }
  });
});

describe('H-40 فیلترهای audit', () => {
  const ins = async (o: { at: string; actor?: User | null; action: string; tt?: string; tid?: string; label?: string; summary?: string }) =>
    t.ds.query('INSERT INTO audit_logs (id, at, actor_id, actor_name, action, target_type, target_id, target_label, summary, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      uuidToBuf(uuidv7(new Date(o.at).getTime())),
      new Date(o.at),
      o.actor ? uuidToBuf(o.actor.id) : null,
      o.actor?.name ?? 'سیستم',
      o.action,
      o.tt ?? null,
      o.tid ?? null,
      o.label ?? null,
      o.summary ?? 'خلاصه',
      '{}'
    ]);

  it('action دقیق/پیشوند، actorId، targetType/Id، بازهٔ تاریخ (تهران، شامل) و ترکیب؛ پارامتری', async () => {
    const x = await mkUser(t, 'عامل ایکس', ['developer']);
    const y = await mkUser(t, 'عامل ایگرگ', ['developer']);
    const sid = randomUUID();
    await ins({ at: '2026-10-01T10:00:00Z', actor: x, action: 'user.create', tt: 'user', tid: 'u1' });
    await ins({ at: '2026-10-02T10:00:00Z', actor: x, action: 'user.update', tt: 'user', tid: 'u1' });
    await ins({ at: '2026-10-03T10:00:00Z', actor: y, action: 'session.create', tt: 'session', tid: sid, label: 'جلسه' });
    await ins({ at: '2026-10-03T21:00:00Z', actor: y, action: 'session.member_decide', tt: 'session', tid: sid }); // تهران: 10-04
    await ins({ at: '2026-10-05T10:00:00Z', actor: null, action: 'system.bootstrap', tt: 'role', tid: 'developer' });
    await ins({ at: '2026-10-06T10:00:00Z', actor: x, action: 'userXupdate', tt: 'settings', tid: 's' }); // نباید با پیشوند 'user.' بیاید
    const q = async (qs: string) => (await a.get(`/system/audit?${qs}`, dev)).body;
    const acts = (b: any) => b.data.map((e: any) => e.action).sort();

    expect(acts(await q('action=user.create'))).toEqual(['user.create']);
    expect(acts(await q('action=user.'))).toEqual(['user.create', 'user.update']);
    expect(acts(await q('action=session.'))).toEqual(['session.create', 'session.member_decide']);
    expect((await q('action=session.member_')).meta.total).toBe(0); // دقیق، نه پیشوند
    expect((await q('action=%')).meta.total).toBe(0);
    expect((await q('action=user.%25.')).meta.total).toBe(0);
    expect((await q(`actorId=${x.id}`)).meta.total).toBe(3);
    expect(acts(await q(`actorId=${y.id}`))).toEqual(['session.create', 'session.member_decide']);
    expect((await q('actorId=not-a-uuid')).meta.total).toBe(0);
    expect(acts(await q('targetType=session'))).toEqual(['session.create', 'session.member_decide']);
    expect(acts(await q(`targetType=session&targetId=${sid}`))).toEqual(['session.create', 'session.member_decide']);
    expect(acts(await q('targetId=u1'))).toEqual(['user.create', 'user.update']);
    expect((await q('targetType=user&targetId=zzz')).meta.total).toBe(0);
    expect(acts(await q('from=2026-10-04&to=2026-10-05'))).toEqual(['session.member_decide', 'system.bootstrap']);
    expect(acts(await q('from=2026-10-06'))).toEqual(['userXupdate']);
    expect(acts(await q('to=2026-10-01'))).toEqual(['user.create']);
    expect(acts(await q(`action=session.&actorId=${y.id}&from=2026-10-04`))).toEqual(['session.member_decide']);
    expect((await q("action=' OR 1=1 --")).meta.total).toBe(0);
    expect((await a.get("/system/audit?targetId=' OR '1'='1", dev)).status).toBe(400); // Id الگوی امن دارد
    expect((await a.get('/system/audit?from=2026-1-1', dev)).status).toBe(400);
    expect((await a.get('/system/audit?targetType=bogus', dev)).status).toBe(400);
    // q قبلی هنوز کار می‌کند و با فیلترهای تازه ترکیب می‌شود
    expect((await q('q=جلسه&targetType=session')).meta.total).toBe(1);
    // ترتیب: جدیدترین اول و صفحه‌بندی
    const all = await q('pageSize=2&page=1');
    expect(all.data[0].action).toBe('userXupdate');
    expect(all.meta).toMatchObject({ page: 1, pageSize: 2 });
    expect((await q('action=system.bootstrap')).data[0].actor).toEqual({ id: 'system', name: 'سیستم' });
  });
});
