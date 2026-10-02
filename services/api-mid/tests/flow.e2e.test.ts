import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestApp, type User, api, creator, join, mkSession, mkUser, sessionBody, startApp } from './helpers/app';

let t: TestApp;
let a: ReturnType<typeof api>;
beforeAll(async () => {
  t = await startApp();
  a = api(t);
});
afterAll(async () => t.close());

describe('جلسه: ساخت، دیده‌شدن و چرخهٔ حیات', () => {
  it('ساخت نیازمند session.create؛ کاربر عادی 403، با grant یا نقش سیستم مجاز', async () => {
    const plain = await mkUser(t, 'عادی');
    expect((await a.post('/sessions', plain, sessionBody())).status).toBe(403);
    expect((await a.post('/sessions', await mkUser(t, 'ادمین', { roles: ['super_admin'] }), sessionBody())).status).toBe(200);
    const m = await creator(t);
    const r = await a.post('/sessions', m, sessionBody());
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ status: 'draft', title: 'جلسهٔ آزمایشی قرآن', location: { label: 'مسجد نمونه' } });
    expect(r.body.data.nextStartsAt).toBe('2030-01-04T18:00:00+03:30');
    // سازنده خودکار manager
    const me = await a.get(`/sessions/${r.body.data.id}/me`, m);
    expect(me.body.data.membership).toEqual({ status: 'approved', roles: ['session_manager'] });
    expect(me.body.data.permissions).toEqual(expect.arrayContaining(['session.edit', 'session.transition']));
    expect(me.body.data.permissions).not.toContain('eval.submit');
  });

  it('اعتبارسنجی بدنه: عنوان کوتاه، پایان قبل از شروع، فیلد اضافه', async () => {
    const m = await creator(t);
    expect((await a.post('/sessions', m, sessionBody({ title: 'ab' }))).status).toBe(400);
    const bad = await a.post('/sessions', m, sessionBody({ schedule: { type: 'once', startsAt: '2030-01-04T20:00:00+03:30', endsAt: '2030-01-04T18:00:00+03:30' } }));
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields['schedule.endsAt']).toBeTruthy();
    expect((await a.post('/sessions', m, { ...sessionBody(), createdBy: 'x' })).status).toBe(400);
  });

  it('draft برای غیرعضو NOT_FOUND و در فهرست عمومی نیست؛ پس از انتشار دیده می‌شود', async () => {
    const m = await creator(t);
    const other = await mkUser(t, 'دیگری');
    const id = await mkSession(t, m, 'draft');
    expect((await a.get(`/sessions/${id}/me`, other)).status).toBe(404);
    expect((await a.post(`/sessions/${id}/members`, other)).status).toBe(404);
    const pub = (await a.get('/me/sessions', m)).body.data.map((x: any) => x.session.id);
    expect(pub).toContain(id);
    await a.post(`/sessions/${id}/transition`, m, { to: 'scheduled' });
    const me = await a.get(`/sessions/${id}/me`, other);
    expect(me.status).toBe(200);
    expect(me.body.data.membership).toBeNull();
    expect(me.body.data.permissions).toEqual([]);
  });

  it('فقط یک قدم رو به جلو: پرش/برگشت ⇒ 409 SESSION_INVALID_TRANSITION', async () => {
    const m = await creator(t);
    const id = await mkSession(t, m, 'draft');
    const skip = await a.post(`/sessions/${id}/transition`, m, { to: 'started' });
    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe('SESSION_INVALID_TRANSITION');
    expect((await a.post(`/sessions/${id}/transition`, m, { to: 'scheduled' })).body.data.status).toBe('scheduled');
    expect((await a.post(`/sessions/${id}/transition`, m, { to: 'draft' })).status).toBe(400); // خارج enum
    expect((await a.post(`/sessions/${id}/transition`, m, { to: 'started' })).body.data.status).toBe('started');
    expect((await a.post(`/sessions/${id}/transition`, m, { to: 'scheduled' })).body.error.code).toBe('SESSION_INVALID_TRANSITION');
    expect((await a.post(`/sessions/${id}/transition`, m, { to: 'ended' })).body.data.status).toBe('ended');
    expect((await a.post(`/sessions/${id}/transition`, m, { to: 'ended' })).status).toBe(409);
  });

  it('فقط مدیر transition/edit می‌کند؛ ویرایش فقط draft/scheduled', async () => {
    const m = await creator(t);
    const sup = await mkUser(t, 'پشتیبان');
    const id = await mkSession(t, m, 'scheduled');
    await join(t, id, m, sup, ['session_supporter']);
    expect((await a.post(`/sessions/${id}/transition`, sup, { to: 'started' })).status).toBe(403);
    expect((await a.patch(`/sessions/${id}`, sup, sessionBody())).status).toBe(403);
    const ok = await a.patch(`/sessions/${id}`, m, sessionBody({ title: 'عنوان جدید جلسه' }));
    expect(ok.body.data.title).toBe('عنوان جدید جلسه');
    await a.post(`/sessions/${id}/transition`, m, { to: 'started' });
    const locked = await a.patch(`/sessions/${id}`, m, sessionBody());
    expect(locked.status).toBe(409);
    expect(locked.body.error.details.reason).toBe('SESSION_LOCKED');
  });

  it('M-00 قابلیت‌ها و M-01 فهرست من با scope و pendingCount', async () => {
    const m = await creator(t);
    const stu = await mkUser(t, 'قرآن آموز');
    expect((await a.get('/me', m)).body.data).toEqual({ canCreateSession: true, hasStaffRole: false });
    const id = await mkSession(t, m, 'scheduled');
    expect((await a.get('/me', m)).body.data.hasStaffRole).toBe(true);
    await a.post(`/sessions/${id}/members`, stu);
    const mine = await a.get('/me/sessions?scope=staff', m);
    expect(mine.body.data.find((x: any) => x.session.id === id)).toMatchObject({ roles: ['session_manager'], membership: 'approved', pendingCount: 1 });
    const stuList = await a.get('/me/sessions', stu);
    expect(stuList.body.data[0]).toMatchObject({ membership: 'pending', roles: [] });
    expect(stuList.body.data[0].pendingCount).toBeUndefined();
    expect((await a.get('/me/sessions?scope=staff', stu)).body.data).toHaveLength(0);
  });
});

describe('عضویت', () => {
  let m: User;
  let id: string;
  beforeAll(async () => {
    m = await creator(t);
    id = await mkSession(t, m, 'scheduled');
  });

  it('درخواست، تکراری ⇒ 409 ALREADY_MEMBER؛ جلسهٔ ended ⇒ 409', async () => {
    const u = await mkUser(t, 'علی رضایی');
    const r = await a.post(`/sessions/${id}/members`, u);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ userId: u.id, name: 'علی رضایی', status: 'pending', roles: [] });
    const dup = await a.post(`/sessions/${id}/members`, u);
    expect(dup.status).toBe(409);
    expect(dup.body.error.details.reason).toBe('ALREADY_MEMBER');
    const ended = await mkSession(t, m, 'ended');
    expect((await a.post(`/sessions/${ended}/members`, await mkUser(t, 'دیر'))).body.error.details.reason).toBe('SESSION_LOCKED');
  });

  it('درخواست‌های موازی هم‌زمان ⇒ یک عضو', async () => {
    const u = await mkUser(t, 'موازی');
    const rs = await Promise.all(Array.from({ length: 6 }, () => a.post(`/sessions/${id}/members`, u)));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(5);
  });

  it('فهرست/تأیید فقط membership.approve (manager/supporter)؛ قرآن‌آموز و معلم نه', async () => {
    const stu = await mkUser(t, 'دانش');
    const teach = await mkUser(t, 'معلم');
    const sup = await mkUser(t, 'پشتیبان');
    const target = await mkUser(t, 'هدف');
    await join(t, id, m, stu);
    await join(t, id, m, teach, ['teacher']);
    await join(t, id, m, sup, ['session_supporter']);
    const req = await a.post(`/sessions/${id}/members`, target);
    const mid = req.body.data.id;
    expect((await a.get(`/sessions/${id}/members`, stu)).status).toBe(403);
    expect((await a.get(`/sessions/${id}/members`, teach)).status).toBe(403);
    expect((await a.patch(`/sessions/${id}/members/${mid}`, teach, { action: 'approve' })).status).toBe(403);
    const ok = await a.patch(`/sessions/${id}/members/${mid}`, sup, { action: 'approve' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: 'approved', roles: ['quran_student'] });
    expect((await a.patch(`/sessions/${id}/members/${mid}`, sup, { action: 'reject' })).body.error.details.reason).toBe('ALREADY_DECIDED');
    const list = await a.get(`/sessions/${id}/members?status=approved&pageSize=50`, m);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(4);
  });

  it('رد ⇒ rejected؛ نقش‌ها: فقط manager، نقش مدیر ثابت، خالی = فقط قرآن‌آموز', async () => {
    const u = await mkUser(t, 'رد شده');
    const sup = await mkUser(t, 'پ');
    await join(t, id, m, sup, ['session_supporter']);
    const mid = (await a.post(`/sessions/${id}/members`, u)).body.data.id;
    expect((await a.patch(`/sessions/${id}/members/${mid}`, m, { action: 'reject' })).body.data.status).toBe('rejected');
    expect((await a.put(`/sessions/${id}/members/${mid}/roles`, m, { roles: ['teacher'] })).body.error.details.reason).toBe('NOT_APPROVED');

    const x = await mkUser(t, 'ایکس');
    const xm = await join(t, id, m, x);
    expect((await a.put(`/sessions/${id}/members/${xm}/roles`, sup, { roles: ['teacher'] })).status).toBe(403);
    expect((await a.put(`/sessions/${id}/members/${xm}/roles`, m, { roles: ['session_manager'] })).status).toBe(400);
    const set = await a.put(`/sessions/${id}/members/${xm}/roles`, m, { roles: ['teacher', 'session_supporter'] });
    expect(set.body.data.roles).toEqual(['session_supporter', 'teacher']);
    expect((await a.put(`/sessions/${id}/members/${xm}/roles`, m, { roles: [] })).body.data.roles).toEqual(['quran_student']);
    // مدیر تغییرناپذیر
    const mgrMember = (await a.get(`/sessions/${id}/members?pageSize=100`, m)).body.data.find((x: any) => x.roles.includes('session_manager')).id;
    expect((await a.put(`/sessions/${id}/members/${mgrMember}/roles`, m, { roles: ['teacher'] })).status).toBe(403);
  });

  it('عضو جلسهٔ دیگر مجوز ندارد (مرز جلسه‌ها)', async () => {
    const other = await creator(t, 'مدیر دیگر');
    const otherSession = await mkSession(t, other, 'scheduled');
    expect((await a.get(`/sessions/${id}/members`, other)).status).toBe(403);
    expect((await a.get(`/sessions/${otherSession}/members`, m)).status).toBe(403);
  });
});

describe('تنظیم نقش درون جلسه فقط از عضویت (نه از JWT)', () => {
  it('JWT با perms جعلی درون‌جلسه‌ای اثری ندارد', async () => {
    const m = await creator(t);
    const id = await mkSession(t, m, 'scheduled');
    const fake = await mkUser(t, 'جاعل', { perms: ['eval.submit', 'queue.manage', 'membership.approve'] });
    expect((await a.get(`/sessions/${id}/members`, fake)).status).toBe(403);
  });
});
