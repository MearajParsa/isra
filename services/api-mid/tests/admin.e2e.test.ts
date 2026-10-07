import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { high, internal } from '@isra/api-types';
import { uuidToBuf, uuidv7 } from '../src/common/ids';
import { MembersAccess as MembersAccessToken } from '../src/domain/access.service';
import { SessionsService } from '../src/domain/sessions.service';
import { type TestApp, type User, api, creator, join, mkSession, mkUser, sessionBody, startApp } from './helpers/app';

const LOW = 'test-pair-low-mid-0123456789abcdef01';
const HIGH = 'test-pair-mid-high-0123456789abcdef0';
const DELETED = 'کاربر حذف‌شده';

let t: TestApp;
let a: ReturnType<typeof api>;
beforeAll(async () => {
  t = await startApp();
  a = api(t);
});
afterAll(async () => t.close());

const hdr = (caller = 'high', token = HIGH) => ({ 'X-Internal-Caller': caller, 'X-Internal-Token': token });
const ad = {
  get: (p: string) => request(t.http).get(`/o/internal/v1${p}`).set(hdr()),
  post: (p: string, b: object = {}) => request(t.http).post(`/o/internal/v1${p}`).set(hdr()).send(b),
  patch: (p: string, b: object = {}) => request(t.http).patch(`/o/internal/v1${p}`).set(hdr()).send(b),
  put: (p: string, b: object = {}) => request(t.http).put(`/o/internal/v1${p}`).set(hdr()).send(b),
  del: (p: string) => request(t.http).delete(`/o/internal/v1${p}`).set(hdr())
};
const bin = (id: string) => uuidToBuf(id);
const sendEvent = (type: string, payload: object, caller: 'low' | 'high' = 'low') =>
  request(t.http)
    .post('/o/internal/v1/events')
    .set(hdr(caller, caller === 'low' ? LOW : HIGH))
    .send({ eventId: randomUUID(), type, occurredAt: new Date().toISOString(), payload });

/** جلسهٔ started با مدیر + معلم + قرآن‌آموزها */
async function room(nStudents = 2) {
  const manager = await creator(t);
  const id = await mkSession(t, manager, 'started');
  const teacher = await mkUser(t, 'استاد معلم');
  const teacherMember = await join(t, id, manager, teacher, ['teacher']);
  const students: User[] = [];
  const studentMembers: string[] = [];
  for (let i = 0; i < nStudents; i++) {
    const s = await mkUser(t, `قرآن‌آموز ${i + 1}`);
    studentMembers.push(await join(t, id, manager, s));
    students.push(s);
  }
  return { id, manager, teacher, teacherMember, students, studentMembers };
}

/** درج مستقیم جلسه با زمان‌های دلخواه (برای تست bucket) */
async function rawSession(over: { createdAt: string; updatedAt?: string; status?: string; deletedAt?: string | null; createdBy?: string }) {
  const id = uuidv7();
  const sched = JSON.stringify({ type: 'once', startsAt: '2030-01-04T18:00:00+03:30', endsAt: '2030-01-04T20:00:00+03:30' });
  await t.ds.query(
    `INSERT INTO sessions (id, title, description, status, schedule_type, schedule, next_starts_at, location_label, created_by, version, created_at, updated_at, deleted_at)
     VALUES (?, 'جلسهٔ خام', 'توضیحات جلسهٔ خام برای تست', ?, 'once', ?, NULL, 'مسجد', ?, 1, ?, ?, ?)`,
    [bin(id), over.status ?? 'draft', sched, bin(over.createdBy ?? uuidv7()), new Date(over.createdAt), new Date(over.updatedAt ?? over.createdAt), over.deletedAt ? new Date(over.deletedAt) : null]
  );
  return id;
}

describe('ACL و احراز internal (MID_ADMIN)', () => {
  it('فرستندهٔ low (حتی با secret درست خودش) ⇒ 403؛ توکن بد/نبود ⇒ 401', async () => {
    const r = await request(t.http).get('/o/internal/v1/admin/sessions').set(hdr('low', LOW));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('AUTH_FORBIDDEN');
    // همهٔ مسیرهای ادمین فقط high
    for (const [m, p] of [['get', `/admin/sessions/${randomUUID()}`], ['post', '/admin/sessions'], ['delete', `/admin/sessions/${randomUUID()}`], ['get', `/admin/users/${randomUUID()}/summary`], ['get', '/admin/reports/leaderboard']] as const) {
      const x = await request(t.http)[m](`/o/internal/v1${p}`).set(hdr('low', LOW));
      expect(x.status, `${m} ${p}`).toBe(403);
    }
    expect((await request(t.http).get('/o/internal/v1/admin/sessions').set(hdr('high', 'x'.repeat(40)))).status).toBe(401);
    expect((await request(t.http).get('/o/internal/v1/admin/sessions').set('X-Internal-Caller', 'high')).status).toBe(401);
    // secret جفت low با هویت high ⇒ 401 (secretها جدا هستند)
    expect((await request(t.http).get('/o/internal/v1/admin/sessions').set(hdr('high', LOW))).status).toBe(401);
  });

  it('JWT کاربر (حتی با perms) به مسیر internal راه ندارد', async () => {
    const u = await mkUser(t, 'ادمین قلابی', { roles: ['developer'], perms: ['system.sessions.manage'] });
    const r = await request(t.http).get('/o/internal/v1/admin/sessions').set(u.h);
    expect(r.status).toBe(401);
  });
});

describe('جلسه: فهرست/جزئیات/ساخت/ویرایش/transition', () => {
  it('ساخت برای creatorId: draft، سازنده session_manager، خروجی مطابق قرارداد high.AdminSession', async () => {
    const creatorUser = await mkUser(t, 'سازندهٔ ویژه'); // بدون مجوز session.create در JWT؛ ادمین دور می‌زند
    const r = await ad.post('/admin/sessions', { creatorId: creatorUser.id, session: sessionBody({ title: 'ساخت از ادمین' }) });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    const s = high.AdminSession.parse(r.body.data);
    expect(s.status).toBe('draft');
    expect(s.createdBy).toEqual({ id: creatorUser.id, name: 'سازندهٔ ویژه' });
    expect(s.counts).toEqual({ members: 1, pending: 0, attendance: 0, evaluations: 0, managers: 1, occurrences: 0 });
    expect(s.deletedAt).toBeNull();
    const me = await a.get(`/sessions/${s.id}/me`, creatorUser);
    expect(me.status).toBe(200);
    expect(me.body.data.membership).toEqual({ status: 'approved', roles: ['session_manager'] });
    expect(me.body.data.permissions).toContain('session.edit');
    const detail = await ad.get(`/admin/sessions/${s.id}`);
    expect(high.AdminSession.parse(detail.body.data).id).toBe(s.id);
  });

  it('اعتبارسنجی: بدنهٔ ناقص/فیلد اضافه/creatorId بد ⇒ 400؛ id نامعتبر یا ناشناس ⇒ 404', async () => {
    const u = await mkUser(t, 'کاربر');
    expect((await ad.post('/admin/sessions', { session: sessionBody() })).status).toBe(400);
    expect((await ad.post('/admin/sessions', { creatorId: 'bad', session: sessionBody() })).status).toBe(400);
    expect((await ad.post('/admin/sessions', { creatorId: u.id, session: sessionBody(), extra: 1 })).status).toBe(400);
    expect((await ad.post('/admin/sessions', { creatorId: u.id, session: sessionBody({ title: 'x' }) })).status).toBe(400);
    expect((await ad.get('/admin/sessions?status=zzz')).status).toBe(400);
    expect((await ad.get('/admin/sessions?pageSize=1000')).status).toBe(400);
    expect((await ad.get('/admin/sessions?from=2026-13-40')).status).toBe(400);
    for (const id of [randomUUID(), 'not-a-uuid']) {
      expect((await ad.get(`/admin/sessions/${id}`)).body.error.code).toBe('NOT_FOUND');
      expect((await ad.patch(`/admin/sessions/${id}`, sessionBody())).status).toBe(404);
      expect((await ad.post(`/admin/sessions/${id}/transition`, { to: 'scheduled' })).status).toBe(404);
      expect((await ad.del(`/admin/sessions/${id}`)).status).toBe(404);
      expect((await ad.get(`/admin/sessions/${id}/members`)).status).toBe(404);
      expect((await ad.get(`/admin/sessions/${id}/attendance`)).status).toBe(404);
      expect((await ad.get(`/admin/sessions/${id}/queue`)).status).toBe(404);
      expect((await ad.get(`/admin/sessions/${id}/evaluations`)).status).toBe(404);
    }
  });

  it('فهرست: فیلتر q/status/creatorId/from-to (تاریخ تهران)، مرتب‌سازی، صفحه‌بندی و meta', async () => {
    const c1 = await mkUser(t, 'سازندهٔ الف');
    const c2 = await mkUser(t, 'سازندهٔ ب');
    const mk = async (creatorId: string, title: string, startsAt: string, endsAt: string, location = 'مسجد فهرست') => (t.clock.advance(5), await ad.post('/admin/sessions', { creatorId, session: sessionBody({ title, schedule: { type: 'once', startsAt, endsAt }, location: { label: location } }) })).body.data.id as string;
    // ۲۰۳۱-۰۳-۰۱ ساعت ۰۰:۱۰ تهران = ۲۰۳۱-۰۲-۲۸ ۲۰:۴۰Z ⇒ روز تهران ۰۳-۰۱ (نه ۰۲-۲۸)
    const s1 = await mk(c1.id, 'فهرست آلفا', '2031-03-01T00:10:00+03:30', '2031-03-01T02:00:00+03:30');
    const s2 = await mk(c1.id, 'فهرست بتا', '2031-03-01T23:50:00+03:30', '2031-03-02T01:00:00+03:30', 'خانهٔ فرهنگ');
    const s3 = await mk(c2.id, 'فهرست گاما', '2031-03-03T10:00:00+03:30', '2031-03-03T12:00:00+03:30');
    await ad.post(`/admin/sessions/${s3}/transition`, { to: 'scheduled' });
    const ids = (r: request.Response) => (r.body.data as { id: string }[]).map((x) => x.id);

    const all = await ad.get('/admin/sessions?q=فهرست&sort=nextStart');
    expect(ids(all)).toEqual([s1, s2, s3]);
    expect(all.body.meta).toEqual({ page: 1, pageSize: 20, total: 3 });
    expect(ids(await ad.get('/admin/sessions?q=فهرست&sort=title'))).toEqual([s1, s2, s3]); // آلفا < بتا < گاما
    expect(ids(await ad.get('/admin/sessions?q=فهرست&sort=oldest'))).toEqual([s1, s2, s3]);
    expect(ids(await ad.get('/admin/sessions?q=فهرست&sort=newest'))).toEqual([s3, s2, s1]);
    expect(ids(await ad.get('/admin/sessions?q=خانهٔ'))).toEqual([s2]); // روی location هم
    expect(ids(await ad.get(`/admin/sessions?creatorId=${c2.id}`))).toEqual([s3]);
    expect(ids(await ad.get('/admin/sessions?q=فهرست&status=scheduled'))).toEqual([s3]);
    // مرز روز تهران: s1 در 03-01 تهران، s2 هم 03-01 (۲۳:۵۰)، s3 در 03-03
    expect(ids(await ad.get('/admin/sessions?q=فهرست&from=2031-03-01&to=2031-03-01&sort=nextStart'))).toEqual([s1, s2]);
    expect(ids(await ad.get('/admin/sessions?q=فهرست&from=2031-03-02&sort=nextStart'))).toEqual([s3]);
    expect(ids(await ad.get('/admin/sessions?q=فهرست&to=2031-02-28'))).toEqual([]);
    expect((await ad.get('/admin/sessions?from=2031-03-05&to=2031-03-01')).status).toBe(400);
    const p2 = await ad.get('/admin/sessions?q=فهرست&sort=oldest&page=2&pageSize=2');
    expect(ids(p2)).toEqual([s3]);
    expect(p2.body.meta).toEqual({ page: 2, pageSize: 2, total: 3 });
    // % و _ در q حرفی‌اند، نه wildcard
    expect(ids(await ad.get('/admin/sessions?q=%25'))).toEqual([]);
    for (const x of all.body.data) high.AdminSession.parse(x);
  });

  it('ویرایش: draft/scheduled مجاز (بدون عضویت)، started/ended ⇒ 409 SESSION_LOCKED؛ بدنهٔ نامعتبر ⇒ 400', async () => {
    const u = await mkUser(t, 'سازندهٔ ویرایش');
    const id = (await ad.post('/admin/sessions', { creatorId: u.id, session: sessionBody() })).body.data.id as string;
    const p = await ad.patch(`/admin/sessions/${id}`, sessionBody({ title: 'عنوان تازه', location: { label: 'جای تازه', routeUrl: 'https://nshn.ir/x' } }));
    expect(p.status).toBe(200);
    expect(p.body.data.title).toBe('عنوان تازه');
    expect(p.body.data.location).toEqual({ label: 'جای تازه', routeUrl: 'https://nshn.ir/x' });
    await ad.post(`/admin/sessions/${id}/transition`, { to: 'scheduled' });
    expect((await ad.patch(`/admin/sessions/${id}`, sessionBody({ title: 'باز هم تازه' }))).status).toBe(200);
    expect((await ad.patch(`/admin/sessions/${id}`, { title: 'ناقص' })).status).toBe(400);
    await ad.post(`/admin/sessions/${id}/transition`, { to: 'started' });
    const locked = await ad.patch(`/admin/sessions/${id}`, sessionBody());
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('CONFLICT');
    expect(locked.body.error.details.reason).toBe('SESSION_LOCKED');
    await ad.post(`/admin/sessions/${id}/transition`, { to: 'ended' });
    expect((await ad.patch(`/admin/sessions/${id}`, sessionBody())).body.error.details.reason).toBe('SESSION_LOCKED');
  });

  it('transition: فقط یک قدم رو‌به‌جلو؛ پرش/عقب/تکرار ⇒ 409 SESSION_INVALID_TRANSITION؛ to نامعتبر ⇒ 400؛ رویداد live', async () => {
    const u = await mkUser(t, 'سازندهٔ انتقال');
    const id = (await ad.post('/admin/sessions', { creatorId: u.id, session: sessionBody() })).body.data.id as string;
    const emit = vi.spyOn(t.live, 'emit');
    try {
      const bad = await ad.post(`/admin/sessions/${id}/transition`, { to: 'started' });
      expect(bad.status).toBe(409);
      expect(bad.body.error.code).toBe('SESSION_INVALID_TRANSITION');
      expect((await ad.post(`/admin/sessions/${id}/transition`, { to: 'draft' })).status).toBe(400);
      expect((await ad.post(`/admin/sessions/${id}/transition`, {})).status).toBe(400);
      const s = await ad.post(`/admin/sessions/${id}/transition`, { to: 'scheduled' });
      expect(s.body.data.status).toBe('scheduled');
      expect((await ad.post(`/admin/sessions/${id}/transition`, { to: 'scheduled' })).status).toBe(409);
      await ad.post(`/admin/sessions/${id}/transition`, { to: 'started' });
      await ad.post(`/admin/sessions/${id}/transition`, { to: 'ended' });
      expect((await ad.post(`/admin/sessions/${id}/transition`, { to: 'started' })).status).toBe(409);
      expect(emit.mock.calls.filter((c) => c[0] === id && c[1] === 'session.state').map((c) => (c[2] as { status: string }).status)).toEqual(['scheduled', 'started', 'ended']);
    } finally {
      emit.mockRestore();
    }
  });
});

describe('حذف نرم: جلسهٔ حذف‌شده برای همهٔ APIهای عادی وجود ندارد', () => {
  it('idempotent؛ فقط MID_ADMIN با includeDeleted می‌بیند؛ رویداد live یک‌بار', async () => {
    const r = await room(1);
    const emit = vi.spyOn(t.live, 'emit');
    try {
      const d1 = await ad.del(`/admin/sessions/${r.id}`);
      expect(d1.status).toBe(200);
      expect(high.AdminSession.parse(d1.body.data).deletedAt).toBeTruthy();
      const d2 = await ad.del(`/admin/sessions/${r.id}`);
      expect(d2.status).toBe(200);
      expect(d2.body.data.deletedAt).toBe(d1.body.data.deletedAt);
      const calls = emit.mock.calls.filter((c) => c[0] === r.id && c[1] === 'session.state');
      expect(calls).toHaveLength(1);
      expect(calls[0]![2]).toEqual({ status: 'started', deleted: true });
    } finally {
      emit.mockRestore();
    }
    const ids = async (q: string) => ((await ad.get(`/admin/sessions?${q}`)).body.data as { id: string }[]).map((x) => x.id);
    expect(await ids('')).not.toContain(r.id);
    expect(await ids('includeDeleted=false')).not.toContain(r.id);
    expect(await ids('includeDeleted=true')).toContain(r.id);
    expect((await ad.get(`/admin/sessions/${r.id}`)).body.data.deletedAt).toBeTruthy();
    // خواندن‌های ادمین روی جلسهٔ حذف‌شده
    expect((await ad.get(`/admin/sessions/${r.id}/members`)).body.meta.total).toBe(3);
    expect((await ad.get(`/admin/sessions/${r.id}/attendance`)).status).toBe(200);
    expect((await ad.get(`/admin/sessions/${r.id}/queue`)).status).toBe(200);
    expect((await ad.get(`/admin/sessions/${r.id}/evaluations`)).status).toBe(200);
    // تغییر در جلسهٔ حذف‌شده ⇒ 404
    expect((await ad.patch(`/admin/sessions/${r.id}`, sessionBody())).status).toBe(404);
    expect((await ad.post(`/admin/sessions/${r.id}/transition`, { to: 'ended' })).status).toBe(404);
    expect((await ad.patch(`/admin/sessions/${r.id}/members/${r.studentMembers[0]}`, { action: 'approve' })).status).toBe(404);
    expect((await ad.put(`/admin/sessions/${r.id}/members/${r.studentMembers[0]}/roles`, { roles: ['teacher'] })).status).toBe(404);
    expect((await ad.del(`/admin/sessions/${r.id}/members/${r.studentMembers[0]}`)).status).toBe(404);
  });

  it('لیست عمومی/جزئیات عمومی (internal low)، stats، «جلسه‌های من»، me، join، حضور، صف، ارزیابی ⇒ 404/حذف از شمارش', async () => {
    const r = await room(1);
    const s = r.students[0]!;
    await a.post(`/sessions/${r.id}/attendance`, s);
    await a.post(`/sessions/${r.id}/queue`, s);
    const pub = (p: string) => request(t.http).get(`/o/internal/v1${p}`).set(hdr('low', LOW));
    const stats = () => request(t.http).get('/o/internal/v1/stats/sessions').set(hdr('high', HIGH));
    const startedBefore = (await stats()).body.data.started as number;
    expect(((await pub('/public/sessions?pageSize=50')).body.data as { id: string }[]).map((x) => x.id)).toContain(r.id);
    expect((await pub(`/public/sessions/${r.id}`)).status).toBe(200);
    expect((await a.get('/me/sessions', s)).body.data).toHaveLength(1);
    expect((await a.get('/me', r.teacher)).body.data.hasStaffRole).toBe(true);

    await ad.del(`/admin/sessions/${r.id}`);

    expect((await pub(`/public/sessions/${r.id}`)).status).toBe(404);
    expect(((await pub('/public/sessions?pageSize=50')).body.data as { id: string }[]).map((x) => x.id)).not.toContain(r.id);
    const pubTotal = (await pub('/public/sessions?status=started')).body.meta.total as number;
    expect(pubTotal).toBe(startedBefore - 1);
    expect((await stats()).body.data.started).toBe(startedBefore - 1);
    const mine = await a.get('/me/sessions', s);
    expect(mine.body.data).toHaveLength(0);
    expect(mine.body.meta.total).toBe(0);
    expect((await a.get('/me/sessions?scope=staff', r.teacher)).body.meta.total).toBe(0);
    expect((await a.get('/me', r.teacher)).body.data.hasStaffRole).toBe(false);
    for (const [fn, u] of [['get', r.manager], ['get', s]] as const) expect((await a[fn](`/sessions/${r.id}/me`, u)).status).toBe(404);
    expect((await a.post(`/sessions/${r.id}/members`, await mkUser(t, 'تازه‌وارد'))).status).toBe(404);
    expect((await a.get(`/sessions/${r.id}/members`, r.manager)).status).toBe(404);
    expect((await a.post(`/sessions/${r.id}/attendance`, s)).status).toBe(404);
    expect((await a.get(`/sessions/${r.id}/attendance`, r.teacher)).status).toBe(404);
    expect((await a.post(`/sessions/${r.id}/queue`, s)).status).toBe(404);
    expect((await a.get(`/sessions/${r.id}/queue`, s)).status).toBe(404);
    expect((await a.del(`/sessions/${r.id}/queue/me`, s)).status).toBe(404);
    expect((await a.post(`/sessions/${r.id}/queue/next`, r.teacher)).status).toBe(404);
    expect((await a.post(`/sessions/${r.id}/evaluations`, r.teacher, { queueItemId: randomUUID(), voice: 5, tone: 5, tajweed: 5 })).status).toBe(404);
    expect((await a.get(`/sessions/${r.id}/evaluations`, r.teacher)).status).toBe(404);
    expect((await a.patch(`/sessions/${r.id}`, r.manager, sessionBody())).status).toBe(404);
    expect((await a.post(`/sessions/${r.id}/transition`, r.manager, { to: 'ended' })).status).toBe(404);
    // Socket: عضو تأییدشدهٔ جلسهٔ حذف‌شده دیگر عضو اتاق نمی‌شود
    expect(await t.app.get(MembersAccessToken).isApprovedMember(r.id, s.id)).toBe(false);
  });

  it('job تازه‌سازی snapshot جلسهٔ حذف‌شده را لمس نمی‌کند', async () => {
    const u = await mkUser(t, 'سازندهٔ تکرار');
    const rec = sessionBody({ schedule: { type: 'recurring', weekdays: [0, 1, 2, 3, 4, 5, 6], timeOfDay: '21:00', durationMin: 60 } });
    const mk = async () => {
      const id = (await ad.post('/admin/sessions', { creatorId: u.id, session: rec })).body.data.id as string;
      await ad.post(`/admin/sessions/${id}/transition`, { to: 'scheduled' });
      await t.ds.query('UPDATE sessions SET next_starts_at = ? WHERE id = ?', [new Date('2020-01-01T00:00:00Z'), bin(id)]);
      return id;
    };
    const live = await mk();
    const gone = await mk();
    await ad.del(`/admin/sessions/${gone}`);
    await t.app.get(SessionsService).refreshSnapshots();
    const at = async (id: string) => ((await t.ds.query('SELECT next_starts_at AS n FROM sessions WHERE id = ?', [bin(id)])) as { n: Date }[])[0]!.n.getUTCFullYear();
    expect(await at(live)).toBeGreaterThan(2020);
    expect(await at(gone)).toBe(2020);
  });
});

describe('اعضا (ادمین)', () => {
  it('فهرست: phone=null، decidedAt، فیلتر status و صفحه‌بندی، مطابق AdminMember', async () => {
    const r = await room(0);
    const p1 = await mkUser(t, 'متقاضی یک');
    const p2 = await mkUser(t, 'متقاضی دو');
    await a.post(`/sessions/${r.id}/members`, p1);
    await a.post(`/sessions/${r.id}/members`, p2);
    const all = await ad.get(`/admin/sessions/${r.id}/members`);
    expect(all.body.meta).toEqual({ page: 1, pageSize: 20, total: 4 });
    for (const m of all.body.data) {
      const parsed = high.AdminMember.parse(m);
      expect(parsed.phone).toBeNull();
    }
    const pending = await ad.get(`/admin/sessions/${r.id}/members?status=pending`);
    expect(pending.body.meta.total).toBe(2);
    expect(pending.body.data[0].decidedAt).toBeNull();
    const approved = await ad.get(`/admin/sessions/${r.id}/members?status=approved`);
    expect(approved.body.data.every((m: { decidedAt: string | null }) => m.decidedAt)).toBe(true);
    const pg = await ad.get(`/admin/sessions/${r.id}/members?pageSize=1&page=2`);
    expect(pg.body.data).toHaveLength(1);
    expect(pg.body.meta).toEqual({ page: 2, pageSize: 1, total: 4 });
    expect((await ad.get(`/admin/sessions/${r.id}/members?status=zzz`)).status).toBe(400);
  });

  it('تأیید/رد: قواعد دامنه + پیام اینباکس؛ تصمیم دوباره ⇒ 409 ALREADY_DECIDED؛ عضو ناشناس 404؛ action بد 400', async () => {
    const r = await room(0);
    const u1 = await mkUser(t, 'پذیرفته');
    const u2 = await mkUser(t, 'ردشده');
    const m1 = (await a.post(`/sessions/${r.id}/members`, u1)).body.data.id as string;
    const m2 = (await a.post(`/sessions/${r.id}/members`, u2)).body.data.id as string;
    const inbox = async (uid: string) => (await t.ds.query("SELECT payload FROM outbox_events WHERE type = 'inbox.messages.created' AND JSON_VALUE(payload, '$.items[0].userId') = ? AND JSON_VALUE(payload, '$.items[0].kind') = 'membership'", [uid])) as { payload: unknown }[];
    const ok = await ad.patch(`/admin/sessions/${r.id}/members/${m1}`, { action: 'approve' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('approved');
    expect(ok.body.data.roles).toEqual(['quran_student']);
    expect(ok.body.data.phone).toBeNull();
    const no = await ad.patch(`/admin/sessions/${r.id}/members/${m2}`, { action: 'reject' });
    expect(no.body.data.status).toBe('rejected');
    expect(no.body.data.roles).toEqual([]);
    expect(await inbox(u1.id)).toHaveLength(1);
    expect(await inbox(u2.id)).toHaveLength(1);
    const again = await ad.patch(`/admin/sessions/${r.id}/members/${m1}`, { action: 'reject' });
    expect(again.status).toBe(409);
    expect(again.body.error.details.reason).toBe('ALREADY_DECIDED');
    expect(await inbox(u1.id)).toHaveLength(1);
    expect((await ad.patch(`/admin/sessions/${r.id}/members/${randomUUID()}`, { action: 'approve' })).status).toBe(404);
    expect((await ad.patch(`/admin/sessions/${r.id}/members/zzz`, { action: 'approve' })).status).toBe(404);
    expect((await ad.patch(`/admin/sessions/${r.id}/members/${m1}`, { action: 'nope' })).status).toBe(400);
    expect((await ad.patch(`/admin/sessions/${r.id}/members/${m1}`, {})).status).toBe(400);
    // عضو جلسهٔ دیگر در این جلسه پیدا نمی‌شود
    const other = await room(1);
    expect((await ad.patch(`/admin/sessions/${r.id}/members/${other.studentMembers[0]}`, { action: 'approve' })).status).toBe(404);
  });

  it('نقش‌ها (H-68، ۱.۶.۰): دقیقاً همین نقش‌ها (مدیر هم)؛ غیرتأییدشده 409؛ آخرین مدیر LAST_HOLDER؛ ورودی نامعتبر 400', async () => {
    const r = await room(1);
    const mid = r.studentMembers[0]!;
    const set = await ad.put(`/admin/sessions/${r.id}/members/${mid}/roles`, { roles: ['teacher', 'session_supporter'], actorId: randomUUID() });
    expect(set.status).toBe(200);
    expect(set.body.data.roles).toEqual(['session_supporter', 'teacher']);
    expect((await ad.put(`/admin/sessions/${r.id}/members/${mid}/roles`, { roles: ['quran_student'] })).body.data.roles).toEqual(['quran_student']);
    expect((await ad.put(`/admin/sessions/${r.id}/members/${mid}/roles`, { roles: [] })).status).toBe(400);
    expect((await ad.put(`/admin/sessions/${r.id}/members/${mid}/roles`, {})).status).toBe(400);
    expect((await ad.put(`/admin/sessions/${r.id}/members/${randomUUID()}/roles`, { roles: ['teacher'] })).status).toBe(404);
    const pend = await mkUser(t, 'در انتظار');
    const pm = (await a.post(`/sessions/${r.id}/members`, pend)).body.data.id as string;
    const na = await ad.put(`/admin/sessions/${r.id}/members/${pm}/roles`, { roles: ['teacher'] });
    expect(na.status).toBe(409);
    expect(na.body.error.details.reason).toBe('NOT_APPROVED');
    // مدیر: برداشتن آخرین مدیر ⇒ LAST_HOLDER؛ هم‌مدیر ⇒ سپس مجاز
    const mgr = ((await ad.get(`/admin/sessions/${r.id}/members`)).body.data as { id: string; roles: string[] }[]).find((m) => m.roles.includes('session_manager'))!;
    const last = await ad.put(`/admin/sessions/${r.id}/members/${mgr.id}/roles`, { roles: ['teacher'] });
    expect(last.status).toBe(409);
    expect(last.body.error.details.reason).toBe('LAST_HOLDER');
    expect((await ad.put(`/admin/sessions/${r.id}/members/${mgr.id}/roles`, { roles: ['session_manager', 'teacher'] })).body.data.roles).toEqual(['session_manager', 'teacher']);
    expect((await ad.put(`/admin/sessions/${r.id}/members/${mid}/roles`, { roles: ['session_manager'] })).body.data.roles).toEqual(['session_manager']);
    expect((await ad.put(`/admin/sessions/${r.id}/members/${mgr.id}/roles`, { roles: ['teacher'] })).body.data.roles).toEqual(['teacher']);
  });

  it('حذف عضو: مدیر ⇒ 409 CONFLICT؛ عضو عادی حذف با نقش‌ها و صف؛ درخواست دوباره ممکن؛ ناشناس 404', async () => {
    const r = await room(2);
    const [s1, s2] = r.students as [User, User];
    for (const s of [s1, s2]) {
      await a.post(`/sessions/${r.id}/attendance`, s);
      await a.post(`/sessions/${r.id}/queue`, s);
    }
    const mgr = ((await ad.get(`/admin/sessions/${r.id}/members`)).body.data as { id: string; roles: string[] }[]).find((m) => m.roles.includes('session_manager'))!;
    const refused = await ad.del(`/admin/sessions/${r.id}/members/${mgr.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('CONFLICT');
    expect(((await ad.get(`/admin/sessions/${r.id}/members`)).body.data as unknown[]).length).toBe(4);

    const emit = vi.spyOn(t.live, 'emit');
    try {
      expect((await ad.del(`/admin/sessions/${r.id}/members/${r.studentMembers[0]}`)).status).toBe(200);
      expect(emit.mock.calls.some((c) => c[0] === r.id && c[1] === 'queue.updated')).toBe(true);
    } finally {
      emit.mockRestore();
    }
    const left = ((await t.ds.query('SELECT COUNT(*) AS n FROM session_member_roles WHERE member_id = ?', [bin(r.studentMembers[0]!)])) as { n: string }[])[0]!.n;
    expect(Number(left)).toBe(0);
    const q = (await ad.get(`/admin/sessions/${r.id}/queue`)).body.data;
    expect(q.waiting.map((w: { userId: string }) => w.userId)).toEqual([s2.id]);
    expect((await a.get(`/sessions/${r.id}/me`, s1)).body.data.membership).toBeNull();
    expect((await ad.del(`/admin/sessions/${r.id}/members/${r.studentMembers[0]}`)).status).toBe(404);
    expect((await a.post(`/sessions/${r.id}/members`, s1)).status).toBe(200);
  });
});

describe('حضور/صف/ارزیابی (نمای کامل فقط‌خواندنی)', () => {
  it('صف: userId/name همهٔ ردیف‌ها بدون ماسک D4؛ ارزیابی‌ها و حضور کامل؛ مطابق قرارداد', async () => {
    const r = await room(3);
    const [s1, s2, s3] = r.students as [User, User, User];
    for (const s of [s1, s2, s3]) {
      await a.post(`/sessions/${r.id}/attendance`, s);
      await a.post(`/sessions/${r.id}/queue`, s);
    }
    const nx = (await a.post(`/sessions/${r.id}/queue/next`, r.teacher)).body.data;
    const cur = nx.current.id as string;
    const ev = await a.post(`/sessions/${r.id}/evaluations`, r.teacher, { queueItemId: cur, voice: 8, tone: 6, tajweed: 7 });
    expect(ev.status).toBe(200);

    // نمای عمومی غیرکادر: ماسک
    const pubView = (await a.get(`/sessions/${r.id}/queue`, s3)).body.data;
    expect(pubView.waiting).toEqual([]);

    const qr = await ad.get(`/admin/sessions/${r.id}/queue`);
    expect(qr.status).toBe(200);
    const q = internal.MidAdminQueue.parse(qr.body.data);
    expect(q.current?.userId).toBe(s1.id);
    expect(q.waiting.map((w) => w.userId)).toEqual([s2.id, s3.id]);
    expect(q.waiting.map((w) => w.name)).toEqual(['قرآن‌آموز 2', 'قرآن‌آموز 3']);
    expect(q.waiting.map((w) => w.position)).toEqual([1, 2]);
    expect(q.myItem).toBeNull();
    expect(q.waitingCount).toBe(2);
    expect(q.current?.evaluated).toBe(true);

    await a.post(`/sessions/${r.id}/queue/next`, r.teacher);
    const q2 = internal.MidAdminQueue.parse((await ad.get(`/admin/sessions/${r.id}/queue`)).body.data);
    expect(q2.done.map((d) => d.userId)).toEqual([s1.id]);
    expect(q2.done[0]!.name).toBe('قرآن‌آموز 1');

    const evs = internal.MidAdminEvaluations.parse((await ad.get(`/admin/sessions/${r.id}/evaluations`)).body.data);
    expect(evs.total).toBe(1);
    expect(evs.items[0]!.userId).toBe(s1.id);
    expect(evs.items[0]!.evaluatorName).toBe('استاد معلم');
    const att = internal.MidAdminAttendance.parse((await ad.get(`/admin/sessions/${r.id}/attendance`)).body.data);
    expect(att.total).toBe(3);
    expect(att.items.map((x) => x.userId).sort()).toEqual([s1.id, s2.id, s3.id].sort());
    // خواندن‌ها اثری ندارند (فقط‌خواندنی): مسیر نوشتن وجود ندارد
    expect((await request(t.http).post(`/o/internal/v1/admin/sessions/${r.id}/queue`).set(hdr()).send({})).status).toBe(404);
    expect((await ad.post(`/admin/sessions/${r.id}/evaluations`, {})).status).toBe(404);
  });

  it('manager به‌تنهایی ارزیابی نمی‌کند (قفل #15 دست‌نخورده)؛ جلسهٔ بدون داده ⇒ خالی', async () => {
    const r = await room(1);
    await a.post(`/sessions/${r.id}/attendance`, r.students[0]!);
    await a.post(`/sessions/${r.id}/queue`, r.students[0]!);
    const item = (await a.post(`/sessions/${r.id}/queue/next`, r.teacher)).body.data.current.id as string;
    expect((await a.post(`/sessions/${r.id}/evaluations`, r.manager, { queueItemId: item, voice: 5, tone: 5, tajweed: 5 })).status).toBe(403);
    const empty = await room(0);
    expect((await ad.get(`/admin/sessions/${empty.id}/evaluations`)).body.data).toEqual({ items: [], total: 0 });
    // once+started ⇒ نوبت #۱ باز است (بدون حضور)
    expect((await ad.get(`/admin/sessions/${empty.id}/attendance`)).body.data).toMatchObject({ items: [], total: 0 });
    const q = (await ad.get(`/admin/sessions/${empty.id}/queue`)).body.data;
    expect(q).toMatchObject({ current: null, waiting: [], done: [], waitingCount: 0 });
  });
});

describe('خلاصهٔ کاربر', () => {
  it('امتیاز/نشان و شمارش جلسه‌ها (بدون جلسهٔ حذف‌شده)؛ کاربر بدون فعالیت صفر؛ id بد 404', async () => {
    const r = await room(1);
    const s = r.students[0]!;
    await a.post(`/sessions/${r.id}/attendance`, s);
    const sum = internal.MidAdminUserSummary.parse((await ad.get(`/admin/users/${s.id}/summary`)).body.data);
    expect(sum).toEqual({ points: { total: 5, badges: 0 }, sessions: { created: 0, memberships: 1, attended: 1 } });
    const mgr = internal.MidAdminUserSummary.parse((await ad.get(`/admin/users/${r.manager.id}/summary`)).body.data);
    expect(mgr.sessions).toEqual({ created: 1, memberships: 1, attended: 0 });
    await t.ds.query('INSERT INTO badge_awards (user_id, badge_id, awarded_at) VALUES (?, ?, NOW(3))', [bin(s.id), bin(uuidv7())]);
    expect((await ad.get(`/admin/users/${s.id}/summary`)).body.data.points.badges).toBe(1);
    await ad.del(`/admin/sessions/${r.id}`);
    expect((await ad.get(`/admin/users/${s.id}/summary`)).body.data.sessions).toEqual({ created: 0, memberships: 0, attended: 0 });
    expect((await ad.get(`/admin/users/${r.manager.id}/summary`)).body.data.sessions.created).toBe(0);
    expect((await ad.get(`/admin/users/${randomUUID()}/summary`)).body.data).toEqual({ points: { total: 0, badges: 0 }, sessions: { created: 0, memberships: 0, attended: 0 } });
    expect((await ad.get('/admin/users/zzz/summary')).status).toBe(404);
  });
});

describe('گزارش‌ها', () => {
  // دادهٔ تست‌های قبلی (created_at=اکنون) نباید در شمارش bucketها دخالت کند
  beforeAll(async () => {
    await t.ds.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const tb of ['sessions', 'session_members', 'session_member_roles', 'attendance_entries', 'queue_items', 'evaluations', 'point_ledger', 'user_points', 'badge_awards']) await t.ds.query(`TRUNCATE TABLE ${tb}`);
    await t.ds.query('SET FOREIGN_KEY_CHECKS = 1');
  });
  const sessionsSeries = async (from: string, to: string, interval = 'day') => ad.get(`/admin/reports/sessions?from=${from}&to=${to}&interval=${interval}`);
  const ts = (iso: string) => iso;

  it('اعتبارسنجی بازه: تاریخ غیرواقعی/معکوس/بیش از ۳۶۶ روز/نبودن from-to ⇒ 400؛ ۳۶۶ روز دقیقاً مجاز', async () => {
    for (const p of ['/admin/reports/overview', '/admin/reports/sessions']) {
      expect((await ad.get(`${p}?from=2026-02-31&to=2026-03-01`)).status, p).toBe(400);
      expect((await ad.get(`${p}?from=2026-03-02&to=2026-03-01`)).status, p).toBe(400);
      expect((await ad.get(`${p}?from=2025-01-01&to=2026-03-01`)).status, p).toBe(400);
      expect((await ad.get(`${p}?to=2026-03-01`)).status, p).toBe(400);
      expect((await ad.get(`${p}?from=1405/01/01&to=2026-03-01`)).status, p).toBe(400);
    }
    expect((await sessionsSeries('2025-03-01', '2026-03-01', 'month')).status).toBe(200); // ۳۶۶ روز
    expect((await sessionsSeries('2025-02-28', '2026-03-01')).status).toBe(400); // ۳۶۷ روز
    expect((await sessionsSeries('2026-03-01', '2026-03-02', 'year')).status).toBe(400);
  });

  it('سری روزانه: صفرپرشده؛ مرز روز تهران (۲۰:۳۰Z)؛ بیرون بازه شمرده نمی‌شود؛ حذف‌شده نه', async () => {
    const mk = (createdAt: string, over: object = {}) => rawSession({ createdAt, ...over });
    await mk(ts('2031-10-01T20:29:59.999Z')); // ۱۱ مهر… : تهران ۳۰ سپتامبر ۲۳:۵۹ ⇒ روز 2031-10-01? دقت: ۲۰:۲۹Z + ۳:۳۰ = ۲۳:۵۹ همان روز
    await mk(ts('2031-10-01T20:30:00Z')); // تهران 2031-10-02 00:00
    await mk(ts('2031-10-02T05:00:00Z'));
    await mk(ts('2031-10-04T10:00:00Z'), { deletedAt: '2031-10-05T00:00:00Z' }); // حذف‌شده
    await mk(ts('2031-09-30T10:00:00Z')); // قبل از بازه
    await mk(ts('2031-10-03T20:30:00Z')); // تهران 10-04 ⇒ خارج از بازه (to=10-03)
    const r = await sessionsSeries('2031-10-01', '2031-10-03');
    expect(r.status).toBe(200);
    const d = internal.MidAdminSessionsSeries.parse(r.body.data);
    expect(d.interval).toBe('day');
    expect(d.items).toEqual([
      { bucket: '2031-10-01', created: 1, held: 0, attendance: 0 },
      { bucket: '2031-10-02', created: 2, held: 0, attendance: 0 },
      { bucket: '2031-10-03', created: 0, held: 0, attendance: 0 }
    ]);
    // بازهٔ تک‌روزه بدون رخداد ⇒ یک bucket صفر
    expect((await sessionsSeries('2040-01-01', '2040-01-01')).body.data.items).toEqual([{ bucket: '2040-01-01', created: 0, held: 0, attendance: 0 }]);
  });

  it('سری هفتگی: هفته از شنبه (تهران)؛ مرز جمعه/شنبه؛ bucket اول به شنبهٔ قبل از from می‌رسد', async () => {
    // ۲۰۲۶-۱۰-۰۳ شنبه، ۲۰۲۶-۱۰-۰۹ جمعه، ۲۰۲۶-۱۰-۱۰ شنبه
    await rawSession({ createdAt: '2026-10-02T20:29:59.999Z' }); // جمعه 10-02 ⇒ هفتهٔ 09-26
    await rawSession({ createdAt: '2026-10-02T20:30:00Z' }); // شنبه 10-03 ⇒ هفتهٔ 10-03
    await rawSession({ createdAt: '2026-10-09T20:29:59.999Z' }); // جمعه 10-09 ⇒ هفتهٔ 10-03
    await rawSession({ createdAt: '2026-10-09T20:30:00Z' }); // شنبه 10-10 ⇒ هفتهٔ 10-10
    await rawSession({ createdAt: '2026-09-27T09:00:00Z' }); // یکشنبه 09-27 ⇒ هفتهٔ 09-26
    const r = await sessionsSeries('2026-09-28', '2026-10-12', 'week'); // دوشنبه تا سه‌شنبه
    const d = internal.MidAdminSessionsSeries.parse(r.body.data);
    expect(d.interval).toBe('week');
    // 09-27 قبل از from است ⇒ شمرده نمی‌شود؛ 10-02 (جمعه) داخل بازه و در هفتهٔ 09-26
    expect(d.items.map((i) => [i.bucket, i.created])).toEqual([
      ['2026-09-26', 1],
      ['2026-10-03', 2],
      ['2026-10-10', 1]
    ]);
    const all = await sessionsSeries('2026-10-03', '2026-10-09', 'week');
    expect(all.body.data.items).toEqual([{ bucket: '2026-10-03', created: 2, held: 0, attendance: 0 }]);
  });

  it('سری ماهانه (ماه میلادی به‌وقت تهران)؛ held بر پایهٔ آخرین transition؛ attendance بدون جلسهٔ حذف‌شده', async () => {
    await rawSession({ createdAt: '2027-02-28T20:29:59Z' }); // تهران 02-28 ⇒ ماه 02
    await rawSession({ createdAt: '2027-02-28T20:30:00Z' }); // تهران 03-01 ⇒ ماه 03
    const startedS = await rawSession({ createdAt: '2027-01-10T00:00:00Z', status: 'started', updatedAt: '2027-03-05T10:00:00Z' });
    const endedS = await rawSession({ createdAt: '2027-01-10T00:00:00Z', status: 'ended', updatedAt: '2027-02-10T10:00:00Z' });
    await rawSession({ createdAt: '2027-01-10T00:00:00Z', status: 'scheduled', updatedAt: '2027-03-05T10:00:00Z' }); // held نیست
    await rawSession({ createdAt: '2027-01-10T00:00:00Z', status: 'ended', updatedAt: '2027-03-06T10:00:00Z', deletedAt: '2027-03-07T00:00:00Z' }); // حذف‌شده
    const deletedS = await rawSession({ createdAt: '2027-01-10T00:00:00Z', status: 'started', updatedAt: '2027-03-05T10:00:00Z', deletedAt: '2027-03-07T00:00:00Z' });
    const att = (sid: string, u: string, at: string) => t.ds.query('INSERT INTO attendance_entries (id, session_id, occurrence_id, user_id, entered_at) VALUES (?, ?, ?, ?, ?)', [bin(uuidv7()), bin(sid), bin(uuidv7()), bin(u), new Date(at)]);
    await att(startedS, uuidv7(), '2027-03-05T10:00:00Z');
    await att(startedS, uuidv7(), '2027-03-05T11:00:00Z');
    await att(endedS, uuidv7(), '2027-02-10T10:00:00Z');
    await att(deletedS, uuidv7(), '2027-03-05T10:00:00Z');
    const r = await sessionsSeries('2027-02-01', '2027-04-30', 'month');
    expect(r.body.data.items).toEqual([
      { bucket: '2027-02-01', created: 1, held: 1, attendance: 1 },
      { bucket: '2027-03-01', created: 1, held: 1, attendance: 2 },
      { bucket: '2027-04-01', created: 0, held: 0, attendance: 0 }
    ]);
  });

  it('overview: شمارش جلسه‌ها per وضعیت (بدون حذف‌شده)، created در بازه، مشارکت، میانگین ارزیابی و امتیاز ledger', async () => {
    await t.ds.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const tb of ['sessions', 'session_members', 'session_member_roles', 'attendance_entries', 'queue_items', 'evaluations', 'point_ledger', 'user_points', 'badge_awards']) await t.ds.query(`TRUNCATE TABLE ${tb}`);
    await t.ds.query('SET FOREIGN_KEY_CHECKS = 1');
    const empty = await ad.get('/admin/reports/overview?from=2026-01-01&to=2026-12-31');
    expect(internal.MidAdminOverview.parse(empty.body.data)).toEqual({ sessions: { total: 0, created: 0, byStatus: { draft: 0, scheduled: 0, started: 0, ended: 0 } }, participation: { attendance: 0, evaluations: 0, avgScore: null, pointsAwarded: 0 } });

    const r = await room(2);
    const [s1, s2] = r.students as [User, User];
    for (const s of [s1, s2]) {
      await a.post(`/sessions/${r.id}/attendance`, s);
      await a.post(`/sessions/${r.id}/queue`, s);
    }
    const q1 = (await a.post(`/sessions/${r.id}/queue/next`, r.teacher)).body.data.current.id as string;
    await a.post(`/sessions/${r.id}/evaluations`, r.teacher, { queueItemId: q1, voice: 10, tone: 10, tajweed: 10 }); // 100 ⇒ 10 امتیاز
    const q2 = (await a.post(`/sessions/${r.id}/queue/next`, r.teacher)).body.data.current.id as string;
    await a.post(`/sessions/${r.id}/evaluations`, r.teacher, { queueItemId: q2, voice: 5, tone: 5, tajweed: 6 }); // میانگین وزنی: (20+15+18)/10... = 53 ⇒ 5 امتیاز
    const gone = await rawSession({ createdAt: new Date().toISOString(), status: 'ended' });
    await ad.del(`/admin/sessions/${gone}`);
    await rawSession({ createdAt: '2020-01-01T00:00:00Z', status: 'draft' }); // قدیمی؛ در total هست، در created بازه نه

    const today = new Date(t.clock.now().getTime() + 3.5 * 3_600_000).toISOString().slice(0, 10);
    const from = new Date(Date.parse(`${today}T00:00:00Z`) - 5 * 86_400_000).toISOString().slice(0, 10);
    const to = new Date(Date.parse(`${today}T00:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10);
    const o = internal.MidAdminOverview.parse((await ad.get(`/admin/reports/overview?from=${from}&to=${to}`)).body.data);
    expect(o.sessions).toEqual({ total: 2, created: 1, byStatus: { draft: 1, scheduled: 0, started: 1, ended: 0 } });
    expect(o.participation.attendance).toBe(2);
    expect(o.participation.evaluations).toBe(2);
    expect(o.participation.avgScore).toBe(76.5);
    expect(o.participation.pointsAwarded).toBe(5 + 5 + 10 + 5);
    // بازهٔ دور از امروز ⇒ مشارکت صفر
    const past = (await ad.get('/admin/reports/overview?from=2020-01-01&to=2020-01-31')).body.data;
    expect(past.participation).toEqual({ attendance: 0, evaluations: 0, avgScore: null, pointsAwarded: 0 });
    expect(past.sessions.created).toBe(1);
  });

  it('leaderboard: ترتیب امتیاز، نشان‌ها، limit؛ کاربر حذف‌شده «کاربر حذف‌شده»؛ پارامتر نامعتبر 400', async () => {
    const r = await room(3);
    const [s1, s2, s3] = r.students as [User, User, User];
    const put = async (u: User, total: number, badges: number) => {
      await t.ds.query('INSERT INTO user_points (user_id, total, updated_at) VALUES (?, ?, NOW(3)) ON DUPLICATE KEY UPDATE total = VALUES(total)', [bin(u.id), total]);
      for (let i = 0; i < badges; i++) await t.ds.query('INSERT INTO badge_awards (user_id, badge_id, awarded_at) VALUES (?, ?, NOW(3))', [bin(u.id), bin(uuidv7())]);
    };
    await put(s1, 120, 2);
    await put(s2, 400, 3);
    await put(s3, 60, 1);
    expect((await sendEvent('user.status.changed', { userId: s3.id, status: 'deleted', changedAt: new Date().toISOString(), anonymizedPhone: 'd0123456789' })).status).toBe(202);
    const lb = internal.MidAdminLeaderboard.parse((await ad.get('/admin/reports/leaderboard?limit=100')).body.data);
    const mine = lb.items.filter((i) => [s1.id, s2.id, s3.id].includes(i.userId));
    expect(mine.map((i) => [i.userId, i.name, i.points, i.badges])).toEqual([
      [s2.id, 'قرآن‌آموز 2', 400, 3],
      [s1.id, 'قرآن‌آموز 1', 120, 2],
      [s3.id, DELETED, 60, 1]
    ]);
    const one = await ad.get('/admin/reports/leaderboard?limit=1');
    expect(one.body.data.items).toHaveLength(1);
    expect(one.body.data.items[0].points).toBeGreaterThanOrEqual(400);
    expect((await ad.get('/admin/reports/leaderboard')).status).toBe(200); // پیش‌فرض ۲۰
    expect((await ad.get('/admin/reports/leaderboard?limit=0')).status).toBe(400);
    expect((await ad.get('/admin/reports/leaderboard?limit=101')).status).toBe(400);
  });
});

describe('رویداد user.status.changed / user.phone.changed', () => {
  const ev = (userId: string, status: string) => ({ userId, status, changedAt: new Date().toISOString(), ...(status === 'deleted' ? { anonymizedPhone: 'dabcdef0123' } : {}) });
  const dir = async (id: string) => ((await t.ds.query('SELECT first_name AS f, last_name AS l, deleted AS d FROM user_directory WHERE user_id = ?', [bin(id)])) as { f: string; l: string; d: number }[])[0];

  it('deleted ⇒ نام پاک + علامت حذف؛ «کاربر حذف‌شده» در اعضا/حضور/صف/ارزیابی؛ active/disabled بی‌اثر؛ تکرار idempotent', async () => {
    const r = await room(1);
    const s = r.students[0]!;
    await a.post(`/sessions/${r.id}/attendance`, s);
    await a.post(`/sessions/${r.id}/queue`, s);
    const item = (await a.post(`/sessions/${r.id}/queue/next`, r.teacher)).body.data.current.id as string;
    await a.post(`/sessions/${r.id}/evaluations`, r.teacher, { queueItemId: item, voice: 7, tone: 7, tajweed: 7 });
    for (const st of ['disabled', 'active']) {
      expect((await sendEvent('user.status.changed', ev(s.id, st))).status).toBe(202);
      expect(await dir(s.id)).toMatchObject({ f: 'قرآن‌آموز', l: '1', d: 0 });
    }
    const e = ev(s.id, 'deleted');
    expect((await sendEvent('user.status.changed', e)).status).toBe(202);
    expect(await dir(s.id)).toEqual({ f: '', l: '', d: 1 });
    expect((await sendEvent('user.status.changed', e)).status).toBe(202);
    const members = (await ad.get(`/admin/sessions/${r.id}/members`)).body.data as { userId: string; name: string }[];
    expect(members.find((m) => m.userId === s.id)!.name).toBe(DELETED);
    expect(members.filter((m) => m.name === DELETED)).toHaveLength(1);
    expect((await ad.get(`/admin/sessions/${r.id}/attendance`)).body.data.items[0].name).toBe(DELETED);
    // ۱.۶.۰: آیتم فعال صف کاربر حذف‌شده برداشته می‌شود
    expect((await ad.get(`/admin/sessions/${r.id}/queue`)).body.data.current).toBeNull();
    expect((await ad.get(`/admin/sessions/${r.id}/evaluations`)).body.data.items[0].userName).toBe(DELETED);
    // مسیر عادی هم (فهرست حضور برای معلم)
    expect((await a.get(`/sessions/${r.id}/attendance`, r.teacher)).body.data.items[0].name).toBe(DELETED);
    // به‌روزرسانی دیرهنگام پروفایل کاربر حذف‌شده را زنده نمی‌کند
    await sendEvent('user.profile.updated', { userId: s.id, firstName: 'برگشت', lastName: 'نباید' });
    expect(await dir(s.id)).toEqual({ f: '', l: '', d: 1 });
    // سازندهٔ حذف‌شده در فهرست جلسه‌ها
    await sendEvent('user.status.changed', ev(r.manager.id, 'deleted'));
    expect((await ad.get(`/admin/sessions/${r.id}`)).body.data.createdBy).toEqual({ id: r.manager.id, name: DELETED });
  });

  it('کاربر بدون ردیف دایرکتوری هم علامت می‌خورد؛ payload نامعتبر 400؛ phone.changed پذیرفته و بی‌اثر', async () => {
    const ghost = uuidv7();
    expect((await sendEvent('user.status.changed', ev(ghost, 'deleted'))).status).toBe(202);
    expect(await dir(ghost)).toEqual({ f: '', l: '', d: 1 });
    expect((await sendEvent('user.status.changed', { userId: ghost, status: 'weird', changedAt: new Date().toISOString() })).status).toBe(400);
    expect((await sendEvent('user.status.changed', { userId: 'bad', status: 'deleted', changedAt: new Date().toISOString() })).status).toBe(400);
    const u = await mkUser(t, 'نام ثابت');
    expect((await sendEvent('user.phone.changed', { userId: u.id, phone: '09120000000', changedAt: new Date().toISOString() })).status).toBe(202);
    expect(await dir(u.id)).toMatchObject({ f: 'نام', l: 'ثابت', d: 0 });
  });

  it('ACL: low فقط انواع مجاز؛ high نمی‌تواند user.* بفرستد؛ نوع ناشناس رد می‌شود', async () => {
    expect((await sendEvent('system.settings.changed', {}, 'low')).status).toBe(403);
    expect((await sendEvent('system.role.changed', {}, 'low')).status).toBe(403);
    expect((await sendEvent('user.status.changed', ev(uuidv7(), 'deleted'), 'high')).status).toBe(403);
    expect((await sendEvent('user.phone.changed', {}, 'high')).status).toBe(403);
    expect((await sendEvent('totally.unknown', {}, 'low')).status).toBe(403);
  });
});

describe('JWT با claim mcp (رمز موقت)', () => {
  it('mcp=true ⇒ 403 AUTH_PASSWORD_CHANGE_REQUIRED روی همهٔ مسیرهای mid؛ mcp=false/نبود ⇒ عادی', async () => {
    const m = await creator(t);
    const id = await mkSession(t, m, 'scheduled');
    const sub = m.id;
    const bad = { Authorization: `Bearer ${await t.low.sign({ sub, perms: ['session.create'], mcp: true })}` };
    for (const [method, p] of [['get', '/me'], ['get', '/me/sessions'], ['get', `/sessions/${id}/me`], ['get', '/me/points'], ['post', '/sessions'], ['post', `/sessions/${id}/members`]] as const) {
      const r = await request(t.http)[method](`/o/v1${p}`).set(bad).send(method === 'post' ? sessionBody() : undefined);
      expect(r.status, `${method} ${p}`).toBe(403);
      expect(r.body.error.code).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
    }
    const fine = { Authorization: `Bearer ${await t.low.sign({ sub, perms: ['session.create'], mcp: false })}` };
    expect((await request(t.http).get('/o/v1/me').set(fine)).status).toBe(200);
    expect((await request(t.http).get('/o/v1/me').set(m.h)).status).toBe(200);
  });
});
