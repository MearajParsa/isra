import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestApp, api, failReply, mkRoleDb, mkUser, rawReply, resetDb, startApp } from './helpers/app';
import { installFakeLow, installFakeMid } from './helpers/fakes';

let t: TestApp;
let a: ReturnType<typeof api>;
let low: ReturnType<typeof installFakeLow>;
let mid: ReturnType<typeof installFakeMid>;

beforeAll(async () => {
  t = await startApp({ INTERNAL_TIMEOUT_MS: '500' });
  a = api(t);
});
afterAll(async () => t.close());
beforeEach(async () => {
  await resetDb(t.ds, t.app);
  t.fake.admin.reset();
  low = installFakeLow(t);
  mid = installFakeMid(t);
});

const audits = async (action?: string) => {
  const rows = (await t.ds.query(`SELECT action, target_type, target_id, target_label, actor_name, meta FROM audit_logs ${action ? 'WHERE action = ?' : ''} ORDER BY at, id`, action ? [action] : [])) as any[];
  return rows.map((r) => ({ ...r, meta: typeof r.meta === 'string' ? JSON.parse(r.meta) : r.meta }));
};
const lastMid = (method: string, suffix: string) => [...t.fake.admin.calls].reverse().find((c) => c.method === method && c.path.startsWith('/o/') && c.path.endsWith(suffix));
const input = { title: 'جلسهٔ تازه قرآن', description: 'توضیح جلسهٔ تازه برای تست', schedule: { type: 'once', startsAt: '2026-11-10T10:00:00+03:30', endsAt: '2026-11-10T12:00:00+03:30' }, location: { label: 'مسجد جامع' } };
/** بدنه پس از اعتبارسنجی قرارداد ۱.۶.۰ (defaultهای joinPolicy/visibility) */
const sent = { ...input, joinPolicy: 'request', visibility: 'public', commentsEnabled: true, commentVisibility: 'public' };
const call = (m: string, p: string, h: Record<string, string>, b?: object) => (a as any)[m === 'delete' ? 'del' : m](p, h, b);

describe('ماتریس مجوز', () => {
  it('view: super_admin مجاز؛ manage: فقط developer؛ بدون نقش ⇒ 403؛ manage بدون step-up ⇒ AUTH_STEP_UP_REQUIRED', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const admin = await mkUser(t, 'مدیر', ['super_admin']);
    const nobody = await mkUser(t, 'عادی');
    const s = mid.mk({ status: 'draft' });
    const m = mid.addMember(s.id);
    const views = ['', `/${s.id}`, `/${s.id}/members`, `/${s.id}/attendance`, `/${s.id}/queue`, `/${s.id}/evaluations`];
    for (const v of views) {
      expect([v, (await a.get(`/system/sessions${v}`, dev)).status]).toEqual([v, 200]);
      expect([v, (await a.get(`/system/sessions${v}`, admin)).status]).toEqual([v, 200]);
      const n = await a.get(`/system/sessions${v}`, nobody);
      expect([v, n.status, n.body.error.code]).toEqual([v, 403, 'AUTH_FORBIDDEN']);
    }
    await mkRoleDb(t, 'sessions_mgr', ['system.sessions.manage']);
    const sm = await mkUser(t, 'مدیر جلسه', ['sessions_mgr']);
    const manage: [string, string, object?][] = [
      ['post', '/system/sessions', { session: input }],
      ['patch', `/system/sessions/${s.id}`, input],
      ['post', `/system/sessions/${s.id}/transition`, { to: 'scheduled' }],
      ['delete', `/system/sessions/${s.id}`],
      ['patch', `/system/sessions/${s.id}/members/${m.id}`, { action: 'approve' }],
      ['put', `/system/sessions/${s.id}/owner`, { userId: m.userId }],
      ['delete', `/system/sessions/${s.id}/members/${m.id}`]
    ];
    t.fake.admin.calls.length = 0;
    for (const [mm, p, b] of manage) {
      const noStep = await call(mm, p, sm.h, b); // غیر developer با مجوز manage: step-up لازم (developer معاف)
      expect([mm, p, noStep.status, noStep.body.error.code]).toEqual([mm, p, 403, 'AUTH_STEP_UP_REQUIRED']);
      const adm = await call(mm, p, await admin.step(), b);
      expect([mm, p, adm.status, adm.body.error.code]).toEqual([mm, p, 403, 'AUTH_FORBIDDEN']);
      const no = await call(mm, p, await nobody.step(), b);
      expect([mm, p, no.status]).toEqual([mm, p, 403]);
    }
    expect(t.fake.admin.calls).toHaveLength(0);
    // super_admin بدون sessions.view (ماتریس ویرایش شد) ⇒ 403
    await t.ds.query("DELETE FROM role_permissions WHERE role_key = 'super_admin' AND permission_key = 'system.sessions.view'");
    t.flush();
    expect((await a.get('/system/sessions', admin)).status).toBe(403);
  });
});

describe('H-60/H-61 فهرست و جزئیات', () => {
  it('فیلترها به mid می‌رسند؛ meta صفحه‌بندی عبور می‌کند؛ جزئیات با includeDeleted؛ 404', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    for (let i = 0; i < 3; i++) mid.mk({ title: `جلسه ${i + 1} آزمایشی` });
    const r = await a.get('/system/sessions?q=قرآن&status=draft&creatorId=abc&from=2026-01-01&to=2026-12-01&includeDeleted=true&sort=title&page=2&pageSize=1', dev);
    expect(r.status).toBe(200);
    expect(r.body.meta).toMatchObject({ page: 2, pageSize: 1, total: 3 });
    expect(r.body.data).toHaveLength(1);
    expect(lastMid('GET', '/admin/sessions')!.query).toEqual({ q: 'قرآن', status: 'draft', creatorId: 'abc', from: '2026-01-01', to: '2026-12-01', includeDeleted: 'true', sort: 'title', page: '2', pageSize: '1' });
    expect(lastMid('GET', '/admin/sessions')!.headers['x-internal-token']).toBe(t.env.INTERNAL_SECRET_MID);
    expect((await a.get('/system/sessions?status=bogus', dev)).status).toBe(400);
    expect((await a.get('/system/sessions?pageSize=500', dev)).status).toBe(400);
    const s = mid.mk({ deletedAt: new Date().toISOString() });
    const one = await a.get(`/system/sessions/${s.id}`, dev);
    expect(one.status).toBe(200);
    expect(one.body.data.deletedAt).not.toBeNull();
    expect(lastMid('GET', `/admin/sessions/${s.id}`)!.query.includeDeleted).toBe('true');
    expect((await a.get(`/system/sessions/${randomUUID()}`, dev)).body.error.code).toBe('NOT_FOUND');
  });

  it('mid خراب/timeout ⇒ 503', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    t.fake.admin.on('GET', '/o/internal/v1/admin/sessions', () => rawReply(500));
    const r = await a.get('/system/sessions', dev);
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('SERVICE_UNAVAILABLE');
    t.fake.admin.on('GET', '/o/internal/v1/admin/sessions', () => rawReply(200, {}, 900));
    expect((await a.get('/system/sessions', dev)).status).toBe(503);
  });
});

describe('H-62..H-65 نوشتن جلسه + audit', () => {
  it('ساخت: creatorId پیش‌فرض = ادمین؛ صریح هم می‌شود؛ audit با target session و label=title', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const r = await a.post('/system/sessions', await dev.step(), { session: input });
    expect(r.status).toBe(200);
    expect(lastMid('POST', '/admin/sessions')!.body).toEqual({ creatorId: dev.id, session: sent });
    const id = r.body.data.id as string;
    const au = await audits('session.create');
    expect(au).toHaveLength(1);
    expect(au[0]).toMatchObject({ target_type: 'session', target_id: id, target_label: 'جلسهٔ تازه قرآن', actor_name: 'توسعه' });
    const who = await mkUser(t, 'سازنده دیگر');
    await a.post('/system/sessions', await dev.step(), { creatorId: who.id, session: input });
    expect(lastMid('POST', '/admin/sessions')!.body.creatorId).toBe(who.id);
    expect((await a.post('/system/sessions', await dev.step(), { session: { ...input, title: 'x' } })).status).toBe(400);
    expect((await a.post('/system/sessions', await dev.step(), { session: input, extra: 1 })).status).toBe(400);
    // ۱.۶.۰ (امنیت ۳): creatorId ناموجود ⇒ NOT_FOUND و غیرفعال ⇒ USER_NOT_ACTIVE، هر دو بدون فراخوانی mid
    const before = t.fake.admin.calls.length;
    const nf = await a.post('/system/sessions', await dev.step(), { creatorId: randomUUID(), session: input });
    expect([nf.status, nf.body.error.code]).toEqual([404, 'NOT_FOUND']);
    const off = await mkUser(t, 'غیرفعال', [], [], { status: 'disabled' });
    const na = await a.post('/system/sessions', await dev.step(), { creatorId: off.id, session: input });
    expect([na.status, na.body.error.details.reason]).toEqual([409, 'USER_NOT_ACTIVE']);
    expect(t.fake.admin.calls.length).toBe(before);
    // خطای mid همان‌طور عبور می‌کند
    t.fake.admin.on('POST', '/o/internal/v1/admin/sessions', () => failReply(404, 'NOT_FOUND', 'سازنده پیدا نشد.'));
    expect((await a.post('/system/sessions', await dev.step(), { session: input })).status).toBe(404);
    expect(await audits('session.create')).toHaveLength(2); // فقط دو موفق
  });

  it('ویرایش/transition/حذف: audit؛ SESSION_LOCKED عبور می‌کند و audit ندارد؛ حذف label را از mid می‌گیرد', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const s = mid.mk({ title: 'عنوان اولیه جلسه' });
    const up = await a.patch(`/system/sessions/${s.id}`, await dev.step(), input);
    expect(up.status).toBe(200);
    expect(lastMid('PATCH', `/admin/sessions/${s.id}`)!.body).toEqual(sent);
    const upd = (await audits('session.update'))[0];
    expect(upd).toMatchObject({ target_type: 'session', target_id: s.id, target_label: 'جلسهٔ تازه قرآن' });
    // ۱.۶.۰ (امنیت ۵): diff فیلدها
    expect(upd.meta.changes).toMatchObject({ title: { from: 'عنوان اولیه جلسه', to: 'جلسهٔ تازه قرآن' }, schedule: 'changed', location: 'changed' });
    const tr = await a.post(`/system/sessions/${s.id}/transition`, await dev.step(), { to: 'started' });
    expect(tr.body.data.status).toBe('started');
    expect((await audits('session.transition'))[0].meta).toEqual({ from: 'draft', to: 'started' });
    expect((await a.post(`/system/sessions/${s.id}/transition`, await dev.step(), { to: 'draft' })).status).toBe(400);
    const locked = await a.patch(`/system/sessions/${s.id}`, await dev.step(), input);
    expect(locked.status).toBe(409);
    expect(locked.body.error.details.reason).toBe('SESSION_LOCKED');
    expect(await audits('session.update')).toHaveLength(1);
    t.fake.admin.on('POST', '/o/internal/v1/admin/sessions/:id/transition', () => failReply(409, 'SESSION_INVALID_TRANSITION', 'نامعتبر'));
    const bad = await a.post(`/system/sessions/${s.id}/transition`, await dev.step(), { to: 'ended' });
    expect([bad.status, bad.body.error.code]).toEqual([409, 'SESSION_INVALID_TRANSITION']);
    expect(await audits('session.transition')).toHaveLength(1);
    const del = await a.del(`/system/sessions/${s.id}`, await dev.step());
    expect(del.status).toBe(200);
    expect((await audits('session.delete'))[0]).toMatchObject({ target_type: 'session', target_id: s.id, target_label: 'جلسهٔ تازه قرآن' });
    expect((await a.del(`/system/sessions/${randomUUID()}`, await dev.step())).status).toBe(404);
    expect(await audits('session.delete')).toHaveLength(1);
    t.fake.admin.on('DELETE', '/o/internal/v1/admin/sessions/:id', () => rawReply(500));
    expect((await a.del(`/system/sessions/${s.id}`, await dev.step())).status).toBe(503);
    expect(await audits('session.delete')).toHaveLength(1);
  });
});

describe('H-66..H-72 اعضا و نمای فقط‌خواندنی', () => {
  it('اعضا: شمارهٔ دایرکتوری پر می‌شود؛ حذف‌شده/ناشناس/ناموجود ⇒ null؛ meta و فیلتر status', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u1 = await mkUser(t, 'عضو یک');
    const u2 = await mkUser(t, 'عضو دو', [], [], { status: 'deleted' });
    await t.ds.query('UPDATE user_directory SET phone = ? WHERE user_id = UNHEX(?)', ['d0123456789', u2.id.replace(/-/g, '')]);
    const s = mid.mk();
    mid.addMember(s.id, { userId: u1.id, name: 'عضو یک', status: 'approved' });
    mid.addMember(s.id, { userId: u2.id, name: 'کاربر حذف‌شده' });
    mid.addMember(s.id, { userId: randomUUID(), name: 'ناشناس' });
    const r = await a.get(`/system/sessions/${s.id}/members?pageSize=50`, dev);
    expect(r.status).toBe(200);
    expect(r.body.meta).toMatchObject({ total: 3 });
    expect(r.body.data.map((m: any) => m.phone)).toEqual([u1.phone, null, null]);
    expect((await a.get(`/system/sessions/${s.id}/members?status=approved`, dev)).body.data).toHaveLength(1);
    expect(lastMid('GET', `/admin/sessions/${s.id}/members`)!.query).toMatchObject({ status: 'approved' });
    expect((await a.get(`/system/sessions/${s.id}/members?status=zzz`, dev)).status).toBe(400);
    expect((await a.get(`/system/sessions/${randomUUID()}/members`, dev)).status).toBe(404);
  });

  it('تأیید/نقش/حذف عضو: پاسخ با شماره؛ audit session.member_*؛ حذف مدیر ⇒ 409 بدون audit', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'عضو یک');
    const s = mid.mk({ title: 'جلسهٔ عضویت' });
    const m = mid.addMember(s.id, { userId: u.id });
    const d = await a.patch(`/system/sessions/${s.id}/members/${m.id}`, await dev.step(), { action: 'approve' });
    expect(d.status).toBe(200);
    expect(d.body.data).toMatchObject({ status: 'approved', phone: u.phone });
    const ad = (await audits('session.member_decide'))[0];
    // ۱.۶.۰: بدون GET اضافهٔ جلسه پیش از نوشتن عضو ⇒ عنوان از کش (هنوز دیده نشده ⇒ برچسب عمومی)
    expect(ad).toMatchObject({ target_type: 'session', target_id: s.id, target_label: 'جلسه' });
    expect(t.fake.admin.calls.filter((c) => c.method === 'GET' && c.path.endsWith(`/admin/sessions/${s.id}`))).toHaveLength(0);
    await a.get(`/system/sessions/${s.id}`, dev); // عنوان در کش
    expect(ad.meta).toMatchObject({ memberId: m.id, action: 'approve' });
    expect((await a.patch(`/system/sessions/${s.id}/members/${m.id}`, await dev.step(), { action: 'maybe' })).status).toBe(400);
    // ۱.۷.۰: H-68 حذف شد ⇒ مسیر وجود ندارد
    expect((await a.put(`/system/sessions/${s.id}/members/${m.id}/roles`, await dev.step(), { roles: ['teacher'] })).status).toBe(404);
    expect(await audits('session.member_remove')).toHaveLength(0);
    expect((await a.del(`/system/sessions/${s.id}/members/${m.id}`, await dev.step())).status).toBe(200);
    const rm = (await audits('session.member_remove'))[0];
    expect(rm).toMatchObject({ target_type: 'session', target_id: s.id });
    expect(rm.meta).toEqual({ memberId: m.id, userId: u.id }); // ۱.۶.۰: userId از پاسخ حذف mid
    expect((await a.del(`/system/sessions/${s.id}/members/${randomUUID()}`, await dev.step())).status).toBe(404);
    // جلسهٔ ناموجود ⇒ 404 و بدون audit
    expect((await a.patch(`/system/sessions/${randomUUID()}/members/${m.id}`, await dev.step(), { action: 'approve' })).status).toBe(404);
  });

  it('attendance/queue/evaluations: عبور مستقیم؛ 404 و 503', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const s = mid.mk();
    expect((await a.get(`/system/sessions/${s.id}/attendance`, dev)).body.data).toEqual({ items: [], total: 0, occurrenceId: null });
    expect((await a.get(`/system/sessions/${s.id}/queue`, dev)).body.data).toMatchObject({ waitingCount: 0, current: null });
    expect((await a.get(`/system/sessions/${s.id}/evaluations`, dev)).body.data).toEqual({ items: [], total: 0 });
    expect((await a.get(`/system/sessions/${randomUUID()}/queue`, dev)).status).toBe(404);
    t.fake.admin.on('GET', '/o/internal/v1/admin/sessions/:id/queue', () => rawReply(503));
    expect((await a.get(`/system/sessions/${s.id}/queue`, dev)).status).toBe(503);
    expect(low.A.calls.some((c) => c.path.startsWith('/c/'))).toBe(false); // هیچ فراخوانی به low نرفته
  });
});
