import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestApp, api, mkUser, rawReply, resetDb, startApp } from './helpers/app';
import { installFakeLow, installFakeMid } from './helpers/fakes';

let t: TestApp;
let a: ReturnType<typeof api>;
let low: ReturnType<typeof installFakeLow>;
const hex = (id: string) => id.replace(/-/g, '');

beforeAll(async () => {
  t = await startApp({ INTERNAL_TIMEOUT_MS: '500' });
  a = api(t);
});
afterAll(async () => t.close());
beforeEach(async () => {
  await resetDb(t.ds, t.app);
  t.fake.admin.reset();
  low = installFakeLow(t);
  installFakeMid(t);
});

const audits = async (action: string) => {
  const rows = (await t.ds.query('SELECT action, target_type, target_id, actor_name, meta FROM audit_logs WHERE action = ? ORDER BY at, id', [action])) as any[];
  return rows.map((r) => ({ ...r, meta: typeof r.meta === 'string' ? JSON.parse(r.meta) : r.meta }));
};
const lastCall = (method: string, suffix: string) => [...low.A.calls].reverse().find((c) => c.method === method && c.path.endsWith(suffix));

describe('H-02 حساب من', () => {
  it('اطلاعات حساب از low؛ فقط نقش سیستم لازم است (بدون permission)؛ بدون نقش ⇒ 403', async () => {
    const admin = await mkUser(t, 'مدیر نمونه', ['super_admin']);
    low.addUser(admin, { hasPassword: true });
    const r = await a.get('/system/me/account', admin);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ id: admin.id, phone: admin.phone, firstName: 'مدیر', lastName: 'نمونه', hasPassword: true, mustChangePassword: false });
    expect(lastCall('GET', `/users/${admin.id}`)).toBeTruthy();
    const nobody = await mkUser(t, 'عادی');
    low.addUser(nobody);
    expect((await a.get('/system/me/account', nobody)).body.error.code).toBe('AUTH_FORBIDDEN');
    expect((await a.get('/system/me/account', { Authorization: '' })).status).toBe(401);
    t.fake.admin.on('GET', '/c/internal/v1/admin/users/:id', () => rawReply(500));
    expect((await a.get('/system/me/account', admin)).status).toBe(503);
  });
});

describe('H-03 ویرایش پروفایل', () => {
  it('فقط روی کاربر توکن؛ low + دایرکتوری + audit؛ اعتبارسنجی', async () => {
    const admin = await mkUser(t, 'قدیمی نام', ['super_admin']);
    const other = await mkUser(t, 'دیگری نام');
    low.addUser(admin);
    low.addUser(other);
    const r = await a.patch('/system/me/profile', admin.h, { firstName: 'تازه' });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ id: admin.id, firstName: 'تازه', lastName: 'نام' });
    expect(lastCall('PATCH', `/users/${admin.id}`)!.body).toEqual({ firstName: 'تازه' });
    expect(low.users.get(other.id)!.firstName).toBe('دیگری');
    expect(((await t.ds.query('SELECT first_name FROM user_directory WHERE user_id = UNHEX(?)', [hex(admin.id)])) as any[])[0].first_name).toBe('تازه');
    const au = await audits('account.profile_update');
    expect(au).toHaveLength(1);
    expect(au[0]).toMatchObject({ target_type: 'user', target_id: admin.id, actor_name: 'تازه نام' });
    expect(au[0].meta).toEqual({ fields: ['firstName'] });
    // phone/id در بدنه ⇒ رد (strict)
    expect((await a.patch('/system/me/profile', admin.h, { phone: '09120000000' })).status).toBe(400);
    expect((await a.patch('/system/me/profile', admin.h, { id: other.id, firstName: 'هکر' })).status).toBe(400);
    expect((await a.patch('/system/me/profile', admin.h, {})).status).toBe(400);
    expect((await a.patch('/system/me/profile', (await mkUser(t, 'بی‌نقش')).h, { firstName: 'نام' })).status).toBe(403);
  });
});

describe('H-04 رمز من', () => {
  it('با step-up ⇒ verified=stepup و نشست جاری می‌ماند؛ audit بدون رمز', async () => {
    const admin = await mkUser(t, 'مدیر نمونه', ['super_admin']);
    low.addUser(admin, { hasPassword: true });
    const cur = low.addSession(admin.id, { id: admin.sid });
    const other = low.addSession(admin.id);
    const r = await a.put('/system/me/password', await admin.step(), { newPassword: 'N3wStrongPass!' });
    expect(r.status).toBe(200);
    expect(lastCall('POST', '/change-password')!.body).toEqual({ newPassword: 'N3wStrongPass!', verified: 'stepup', keepSessionId: admin.sid });
    expect(cur.revokedAt).toBeNull();
    expect(other.revokedAt).not.toBeNull();
    const au = await audits('account.password_change');
    expect(au).toHaveLength(1);
    expect(au[0]).toMatchObject({ target_type: 'user', target_id: admin.id });
    expect(JSON.stringify(await t.ds.query('SELECT * FROM audit_logs'))).not.toContain('N3wStrongPass');
    // بدون step-up (کاربر عادی بدون mcp) ⇒ 403 حتی با currentPassword
    const no = await a.put('/system/me/password', admin.h, { newPassword: 'N3wStrongPass!', currentPassword: 'x' });
    expect(no.status).toBe(403);
    expect(no.body.error.code).toBe('AUTH_STEP_UP_REQUIRED');
    expect((await a.put('/system/me/password', await admin.step(), { newPassword: 'short' })).status).toBe(400);
  });

  it('استثنای mcp: currentPassword به‌جای step-up؛ غلط ⇒ 401 AUTH_INVALID_CREDENTIALS از low؛ بدون currentPassword ⇒ step-up الزامی', async () => {
    const u = await mkUser(t, 'رمز موقت', ['super_admin'], [], { mcp: true });
    low.addUser(u, { hasPassword: true, mustChangePassword: true, _password: 'TempPass#123' });
    // فقط H-04 با currentPassword (به‌جای step-up) باز است
    const bad = await a.put('/system/me/password', u.h, { newPassword: 'N3wStrongPass!', currentPassword: 'wrong-pass' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(low.users.get(u.id)!.mustChangePassword).toBe(true);
    expect(await audits('account.password_change')).toHaveLength(0);
    const missing = await a.put('/system/me/password', u.h, { newPassword: 'N3wStrongPass!' });
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe('AUTH_STEP_UP_REQUIRED');
    const empty = await a.put('/system/me/password', u.h, { newPassword: 'N3wStrongPass!', currentPassword: '' });
    expect(empty.status).toBe(403);
    expect(empty.body.error.code).toBe('AUTH_STEP_UP_REQUIRED');
    const s = low.addSession(u.id, { id: u.sid });
    const o = low.addSession(u.id);
    const ok = await a.put('/system/me/password', u.h, { newPassword: 'N3wStrongPass!', currentPassword: 'TempPass#123' });
    expect(ok.status).toBe(200);
    expect(lastCall('POST', '/change-password')!.body).toEqual({ newPassword: 'N3wStrongPass!', verified: 'current', currentPassword: 'TempPass#123', keepSessionId: u.sid });
    expect(low.users.get(u.id)!.mustChangePassword).toBe(false);
    expect(s.revokedAt).toBeNull();
    expect(o.revokedAt).not.toBeNull();
    const au = await audits('account.password_change');
    expect(au[0]!.meta).toEqual({ via: 'current' });
    expect(JSON.stringify(await t.ds.query('SELECT * FROM audit_logs'))).not.toContain('TempPass');
  });

  it('mcp + step-up نامعتبر + currentPassword ⇒ همان استثنا؛ اعتبارسنجی بدنه هنوز اجراست؛ استثنا فقط H-04', async () => {
    const u = await mkUser(t, 'رمز موقت', ['super_admin'], [], { mcp: true });
    low.addUser(u, { hasPassword: true, mustChangePassword: true, _password: 'TempPass#123' });
    const bad = { ...u.h, 'X-Step-Up-Token': 'garbage' };
    expect((await a.put('/system/me/password', bad, { newPassword: 'short', currentPassword: 'TempPass#123' })).status).toBe(400);
    expect((await a.put('/system/me/password', bad, { newPassword: 'N3wStrongPass!', currentPassword: 'TempPass#123' })).status).toBe(200);
    // currentPassword روی مسیر دیگری (مثلاً H-12) استثنا نمی‌دهد
    const r = await a.put('/system/roles/super_admin/permissions', u.h, { permissions: [], currentPassword: 'x' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
  });
});

describe('claim mcp (رمز موقت)', () => {
  it('فقط H-00/H-02/H-04 مجازند؛ بقیهٔ high ⇒ 403 AUTH_PASSWORD_CHANGE_REQUIRED؛ بدون نقش ⇒ AUTH_FORBIDDEN', async () => {
    const u = await mkUser(t, 'رمز موقت', ['developer'], [], { mcp: true });
    low.addUser(u, { mustChangePassword: true });
    expect((await a.get('/system/me', u)).status).toBe(200);
    expect((await a.get('/system/me/account', u)).status).toBe(200);
    const blocked = ['/system/overview', '/system/users', '/system/roles', '/system/settings', '/system/audit', '/system/sessions', '/system/reports/overview', '/system/me/sessions', '/system/permissions', '/health'];
    for (const p of blocked.slice(0, -1)) {
      const r = await a.get(p, u);
      expect([p, r.status, r.body.error?.code]).toEqual([p, 403, 'AUTH_PASSWORD_CHANGE_REQUIRED']);
    }
    for (const [m, p] of [['patch', '/system/me/profile'], ['post', '/system/me/sessions/revoke-others'], ['delete', `/system/me/sessions/${randomUUID()}`]] as const) {
      const r = await (a as any)[m === 'delete' ? 'del' : m](p, u.h, m === 'patch' ? { firstName: 'نام' } : undefined);
      expect([p, r.status, r.body.error?.code]).toEqual([p, 403, 'AUTH_PASSWORD_CHANGE_REQUIRED']);
    }
    const w = await a.post('/system/users', await u.step(), { phone: '09121110001', firstName: 'نام', lastName: 'خانوادگی' });
    expect(w.body.error.code).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
    // بدون نقش: همان رفتار قبلی
    const nobody = await mkUser(t, 'بی‌نقش', [], [], { mcp: true });
    expect((await a.get('/system/me', nobody)).body.error.code).toBe('AUTH_FORBIDDEN');
    // توکن بدون mcp ⇒ همه مجاز
    const ok = await mkUser(t, 'عادی مدیر', ['developer']);
    expect((await a.get('/system/users', ok)).status).toBe(200);
  });
});

describe('H-05..H-07 نشست‌های من', () => {
  it('current با sid توکن؛ صفحه‌بندی؛ ipMasked', async () => {
    const admin = await mkUser(t, 'مدیر', ['super_admin']);
    low.addUser(admin);
    low.addSession(admin.id, { id: admin.sid, ip: '1.2.3.4' });
    low.addSession(admin.id, { ip: '5.6.7.8' });
    low.addSession(admin.id, { ip: '9.9.9.9' });
    const r = await a.get('/system/me/sessions?pageSize=2', admin);
    expect(r.status).toBe(200);
    expect(r.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(r.body.data.map((s: any) => s.current)).toEqual([true, false]);
    expect(r.body.data[0].ipMasked).toBe('1.2.*.*');
    expect(lastCall('GET', '/sessions')!.query).toMatchObject({ page: '1', pageSize: '2' });
    expect((await a.get('/system/me/sessions?page=2&pageSize=2', admin)).body.data).toHaveLength(1);
  });

  it('H-06: revoke یکی با audit؛ ناموجود ⇒ 404 بدون audit؛ فقط روی خودم', async () => {
    const admin = await mkUser(t, 'مدیر', ['super_admin']);
    const other = await mkUser(t, 'دیگری', ['super_admin']);
    low.addUser(admin);
    low.addUser(other);
    low.addSession(admin.id, { id: admin.sid });
    const mine = low.addSession(admin.id);
    const theirs = low.addSession(other.id);
    expect((await a.del(`/system/me/sessions/${mine.id}`, admin.h)).status).toBe(200);
    expect(mine.revokedAt).not.toBeNull();
    expect(lastCall('DELETE', `/sessions/${mine.id}`)!.path).toContain(`/users/${admin.id}/`);
    const au = await audits('account.session_revoke');
    expect(au).toHaveLength(1);
    expect(au[0]).toMatchObject({ target_type: 'user', target_id: admin.id });
    expect(au[0].meta).toEqual({ sessionId: mine.id });
    const nf = await a.del(`/system/me/sessions/${theirs.id}`, admin.h); // نشست دیگری برای من وجود ندارد
    expect(nf.status).toBe(404);
    expect(theirs.revokedAt).toBeNull();
    expect(await audits('account.session_revoke')).toHaveLength(1);
  });

  it('H-07: همهٔ نشست‌های دیگر revoke و جاری می‌ماند؛ audit', async () => {
    const admin = await mkUser(t, 'مدیر', ['super_admin']);
    low.addUser(admin);
    const cur = low.addSession(admin.id, { id: admin.sid });
    const others = [low.addSession(admin.id), low.addSession(admin.id), low.addSession(admin.id)];
    const r = await a.post('/system/me/sessions/revoke-others', admin.h);
    expect(r.status).toBe(200);
    expect(cur.revokedAt).toBeNull();
    expect(others.every((s) => s.revokedAt !== null)).toBe(true);
    const au = await audits('account.session_revoke');
    expect(au[0]!.meta).toEqual({ others: true });
    // ۱.۶.۰: یک فراخوانی logout-all با exceptSessionId (نه فهرست + revoke تک‌تک)
    const calls = t.fake.admin.calls.filter((c) => c.path.startsWith('/c/'));
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`POST /c/internal/v1/admin/users/${admin.id}/logout-all`]);
    expect(calls[0]!.body).toEqual({ exceptSessionId: admin.sid });
    t.fake.admin.on('POST', '/c/internal/v1/admin/users/:id/logout-all', () => rawReply(500));
    expect((await a.post('/system/me/sessions/revoke-others', admin.h)).status).toBe(503);
  });
});
