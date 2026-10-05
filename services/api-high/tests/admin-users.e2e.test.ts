import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestApp, type User, api, failReply, mkUser, outboxTypes, rawReply, resetDb, startApp } from './helpers/app';
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
  await resetDb(t.ds);
  t.fake.admin.reset();
  low = installFakeLow(t);
  installFakeMid(t);
});

const dirRow = async (id: string) => ((await t.ds.query('SELECT status, phone, first_name, last_name FROM user_directory WHERE user_id = UNHEX(?)', [hex(id)])) as any[])[0];
const audits = async (action?: string) => {
  const rows = (await t.ds.query(`SELECT action, target_type, target_id, target_label, actor_name, summary, meta FROM audit_logs ${action ? 'WHERE action = ?' : ''} ORDER BY at, id`, action ? [action] : [])) as any[];
  return rows.map((r) => ({ ...r, meta: typeof r.meta === 'string' ? JSON.parse(r.meta) : r.meta }));
};
const count = async (sql: string, args: unknown[] = []) => Number(((await t.ds.query(sql, args)) as { n: string }[])[0]!.n);
/** super_admin با مجوز users.manage (تا حفاظت‌ها برای غیر-developer هم تست شوند) */
const grantManageToSuperAdmin = async (dev: User) => {
  const cur = ['system.users.view', 'system.role.assign', 'system.permission.edit', 'system.settings.view', 'system.settings.edit', 'system.audit.view', 'system.sessions.view', 'system.reports.view', 'session.create', 'system.users.manage'];
  const r = await a.put('/system/roles/super_admin/permissions', await dev.step(), { permissions: cur });
  expect(r.status).toBe(200);
};
const call = (m: string, p: string, h: Record<string, string>, b?: object) => (a as any)[m === 'delete' ? 'del' : m](p, h, b);

describe('ماتریس مجوز', () => {
  it('manage: developer مجاز؛ super_admin بدون manage ⇒ 403؛ بدون نقش ⇒ 403؛ view: super_admin مجاز', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const admin = await mkUser(t, 'مدیر', ['super_admin']);
    const nobody = await mkUser(t, 'عادی');
    const target = await mkUser(t, 'هدف');
    low.addUser(target);
    const sid = randomUUID();
    const manage: [string, string, object?][] = [
      ['post', '/system/users', { phone: '09121110001', firstName: 'نام', lastName: 'خانوادگی' }],
      ['patch', `/system/users/${target.id}`, { firstName: 'جدید' }],
      ['post', `/system/users/${target.id}/status`, { status: 'disabled' }],
      ['delete', `/system/users/${target.id}`],
      ['put', `/system/users/${target.id}/password`, { action: 'clear' }],
      ['post', `/system/users/${target.id}/logout-all`],
      ['delete', `/system/users/${target.id}/sessions/${sid}`]
    ];
    for (const [m, p, b] of manage) {
      const adm = await call(m, p, await admin.step(), b);
      expect([m, p, adm.status, adm.body.error?.code]).toEqual([m, p, 403, 'AUTH_FORBIDDEN']);
      const no = await call(m, p, await nobody.step(), b);
      expect([m, p, no.status]).toEqual([m, p, 403]);
    }
    expect(low.A.calls).toHaveLength(0);
    for (const [m, p, b] of manage) {
      const d = await call(m, p, await dev.step(), b); // مجوز دارد ⇒ هیچ‌وقت 403 نیست (ممکن است 404/409 باشد)
      expect([m, p, d.status === 403]).toEqual([m, p, false]);
    }
    for (const p of ['/system/users', `/system/users/${target.id}`, `/system/users/${target.id}/sessions`]) {
      expect([p, (await a.get(p, admin)).status]).toEqual([p, 200]);
      expect([p, (await a.get(p, nobody)).status]).toEqual([p, 403]);
    }
  });

  it('step-up الزامی روی همهٔ نوشتن‌ها (بدون توکن ⇒ AUTH_STEP_UP_REQUIRED)', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const target = await mkUser(t, 'هدف');
    low.addUser(target);
    const sid = randomUUID();
    const reqs: [string, string, object?][] = [
      ['post', '/system/users', { phone: '09121110001', firstName: 'نام', lastName: 'خانوادگی' }],
      ['patch', `/system/users/${target.id}`, { firstName: 'جدید' }],
      ['post', `/system/users/${target.id}/status`, { status: 'disabled' }],
      ['delete', `/system/users/${target.id}`],
      ['put', `/system/users/${target.id}/password`, { action: 'clear' }],
      ['post', `/system/users/${target.id}/logout-all`],
      ['delete', `/system/users/${target.id}/sessions/${sid}`]
    ];
    for (const [m, p, b] of reqs) {
      const r = await call(m, p, dev.h, b);
      expect([m, p, r.status, r.body.error.code]).toEqual([m, p, 403, 'AUTH_STEP_UP_REQUIRED']);
    }
    expect(low.A.calls).toHaveLength(0); // هیچ فراخوانی به مبدأ نرفته
  });
});

describe('H-20 فهرست و فیلتر', () => {
  it('status در DTO؛ فیلتر status/role/grant/createdFrom/To/q و مرتب‌سازی', async () => {
    const dev = await mkUser(t, 'علی اول', ['developer']);
    const u2 = await mkUser(t, 'بهزاد دوم', ['super_admin'], ['session.create'], { status: 'disabled' });
    const u3 = await mkUser(t, 'چنگیز سوم', [], ['session.create']);
    const u4 = await mkUser(t, 'داریوش چهارم', [], [], { status: 'deleted' });
    const set = (u: User, iso: string) => t.ds.query('UPDATE user_directory SET created_at = ? WHERE user_id = UNHEX(?)', [new Date(iso), hex(u.id)]);
    await set(dev, '2026-01-10T12:00:00Z');
    await set(u2, '2026-02-10T12:00:00Z');
    await set(u3, '2026-03-10T12:00:00Z');
    await set(u4, '2026-04-10T12:00:00Z');
    const list = async (qs: string) => (await a.get(`/system/users${qs}`, dev)).body;
    const names = (b: any) => b.data.map((x: any) => x.name);

    const all = await list('');
    expect(all.meta.total).toBe(4);
    expect(names(all)).toEqual(['داریوش چهارم', 'چنگیز سوم', 'بهزاد دوم', 'علی اول']); // newest
    expect(all.data.map((x: any) => x.status)).toEqual(['deleted', 'active', 'disabled', 'active']);
    expect(names(await list('?sort=oldest'))).toEqual(['علی اول', 'بهزاد دوم', 'چنگیز سوم', 'داریوش چهارم']);
    expect(names(await list('?sort=name'))).toEqual(['بهزاد دوم', 'چنگیز سوم', 'داریوش چهارم', 'علی اول']);
    expect(names(await list('?status=disabled'))).toEqual(['بهزاد دوم']);
    expect(names(await list('?status=deleted'))).toEqual(['داریوش چهارم']);
    expect(names(await list('?role=super_admin'))).toEqual(['بهزاد دوم']);
    expect(names(await list('?role=none'))).toEqual(['داریوش چهارم', 'چنگیز سوم']);
    expect(names(await list('?grant=session.create&sort=oldest'))).toEqual(['بهزاد دوم', 'چنگیز سوم']);
    expect(names(await list('?grant=none&sort=oldest'))).toEqual(['علی اول', 'داریوش چهارم']);
    // بازهٔ ایجاد (تهران): هر دو سر شامل
    expect(names(await list('?createdFrom=2026-02-10&createdTo=2026-03-10&sort=oldest'))).toEqual(['بهزاد دوم', 'چنگیز سوم']);
    expect(names(await list('?createdFrom=2026-03-11'))).toEqual(['داریوش چهارم']);
    expect(names(await list('?createdTo=2026-01-31'))).toEqual(['علی اول']);
    expect(names(await list('?q=بهزاد'))).toEqual(['بهزاد دوم']);
    expect(names(await list(`?q=${u3.phone.slice(0, 9)}`))).toContain('چنگیز سوم');
    expect(names(await list('?status=active&role=none'))).toEqual(['چنگیز سوم']);
    // SQL injection در q/ورودی‌ها اثری ندارد
    expect((await list("?q=' OR 1=1 --")).meta.total).toBe(0);
    expect((await a.get('/system/users?sort=name;DROP TABLE x', dev)).status).toBe(400);
    expect((await a.get('/system/users?createdFrom=2026-13-45x', dev)).status).toBe(400);
    expect((await list('?pageSize=2&page=2')).data).toHaveLength(2);
  });

  it('مرز روز تهران: ایجاد ۲۰:۳۰ UTC (۰۰:۰۰ تهران روز بعد) در روز بعد حساب می‌شود', async () => {
    const dev = await mkUser(t, 'علی اول', ['developer']);
    const u = await mkUser(t, 'مرزی کاربر');
    await t.ds.query('UPDATE user_directory SET created_at = ? WHERE user_id = UNHEX(?)', [new Date('2026-05-09T20:30:00Z'), hex(u.id)]);
    const n = async (qs: string) => (await a.get(`/system/users?${qs}`, dev)).body.data.filter((x: any) => x.id === u.id).length;
    expect(await n('createdTo=2026-05-09')).toBe(0);
    expect(await n('createdFrom=2026-05-10&createdTo=2026-05-10')).toBe(1);
  });
});

describe('H-21 جزئیات', () => {
  it('ترکیب دایرکتوری + نقش/grant + low + mid؛ 404', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'کاربر نمونه', ['super_admin'], ['session.create']);
    low.addUser(u, { hasPassword: true, mustChangePassword: true, lastActiveAt: '2026-10-01T10:00:00.000Z', activeSessions: 2, sessionsByClient: { 'web-admin': 1, 'android-low': 1 } });
    const r = await a.get(`/system/users/${u.id}`, dev);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      id: u.id, name: 'کاربر نمونه', firstName: 'کاربر', lastName: 'نمونه', phone: u.phone, status: 'active', roles: ['super_admin'], grants: ['session.create'],
      hasPassword: true, mustChangePassword: true, lastActiveAt: '2026-10-01T10:00:00.000Z', activeSessions: 2, sessionsByClient: { 'web-admin': 1, 'android-low': 1 },
      points: { total: 120, badges: 2 }, sessions: { created: 3, memberships: 5, attended: 4 }
    });
    expect((await a.get(`/system/users/${randomUUID()}`, dev)).status).toBe(404);
    expect((await a.get('/system/users/not-a-uuid', dev)).status).toBe(404);
  });

  it('low یا mid خراب ⇒ degraded (صفر/null) نه خطا', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'کاربر', ['super_admin']);
    low.addUser(u, { hasPassword: true, activeSessions: 4 });
    t.fake.admin.on('GET', '/c/internal/v1/admin/users/:id', () => rawReply(500));
    const r1 = await a.get(`/system/users/${u.id}`, dev);
    expect(r1.status).toBe(200);
    expect(r1.body.data).toMatchObject({ roles: ['super_admin'], hasPassword: false, mustChangePassword: false, lastActiveAt: null, activeSessions: 0, sessionsByClient: {}, points: { total: 120, badges: 2 } });
    t.fake.admin.on('GET', '/o/internal/v1/admin/users/:id/summary', () => rawReply(200, 'not json'));
    const r2 = await a.get(`/system/users/${u.id}`, dev);
    expect(r2.status).toBe(200);
    expect(r2.body.data).toMatchObject({ points: { total: 0, badges: 0 }, sessions: { created: 0, memberships: 0, attended: 0 } });
    t.fake.admin.on('GET', '/c/internal/v1/admin/users/:id', () => rawReply(200, {}, 900)); // timeout
    expect((await a.get(`/system/users/${u.id}`, dev)).status).toBe(200);
  });
});

describe('H-24 ساخت کاربر', () => {
  it('low ساخته می‌شود؛ دایرکتوری فوراً upsert (active)؛ نقش/grant با claim؛ audit بدون رمز', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const r = await a.post('/system/users', await dev.step(), { phone: '09121110001', firstName: 'نوین', lastName: 'کاربر', password: 'TempPass#123', roles: ['super_admin'], grants: ['session.create'] });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ phone: '09121110001', name: 'نوین کاربر', status: 'active', roles: ['super_admin'], grants: ['session.create'], hasPassword: true, mustChangePassword: true });
    const id = r.body.data.id as string;
    expect(await dirRow(id)).toMatchObject({ status: 'active', phone: '09121110001', first_name: 'نوین' });
    // به low فقط فیلدهای حساب رفته (نه نقش/grant) و با هدرهای internal جفت low
    const c = low.A.calls.find((x) => x.method === 'POST' && x.path.endsWith('/admin/users'))!;
    expect(Object.keys(c.body).sort()).toEqual(['firstName', 'lastName', 'password', 'phone']);
    expect(c.headers['x-internal-caller']).toBe('high');
    expect(c.headers['x-internal-token']).toBe(t.env.INTERNAL_SECRET_LOW);
    expect((await outboxTypes(t)).filter((e) => e.type === 'system.role.changed').length).toBeGreaterThanOrEqual(1);
    const create = await audits('user.create');
    expect(create).toHaveLength(1);
    expect(create[0]).toMatchObject({ target_type: 'user', target_id: id, target_label: 'نوین کاربر', actor_name: 'توسعه' });
    expect(create[0].meta).toEqual({ roles: ['super_admin'], grants: ['session.create'], withPassword: true });
    expect(JSON.stringify(await audits())).not.toContain('TempPass');
  });

  it('رویداد user.registered بعدی status را عوض نمی‌کند', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const r = await a.post('/system/users', await dev.step(), { phone: '09121110002', firstName: 'نوین', lastName: 'کاربر' });
    const id = r.body.data.id as string;
    await a.post(`/system/users/${id}/status`, await dev.step(), { status: 'disabled' });
    const send = await request(t.http)
      .post('/s/internal/v1/events')
      .set({ 'X-Internal-Caller': 'low', 'X-Internal-Token': t.env.INTERNAL_SECRET_LOW })
      .send({ eventId: randomUUID(), type: 'user.registered', occurredAt: new Date().toISOString(), payload: { userId: id, phone: '09121110002', firstName: 'نوین', lastName: 'کاربر' } });
    expect(send.status).toBe(202);
    expect((await dirRow(id)).status).toBe('disabled');
  });

  it('PHONE_TAKEN از low با همان code/reason؛ اعتبارسنجی؛ 5xx/timeout ⇒ 503 بدون اثر محلی', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const body = { phone: '09121110003', firstName: 'نوین', lastName: 'کاربر' };
    expect((await a.post('/system/users', await dev.step(), body)).status).toBe(200);
    const dup = await a.post('/system/users', await dev.step(), body);
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'CONFLICT', details: { reason: 'PHONE_TAKEN' } });
    expect((await a.post('/system/users', await dev.step(), { ...body, phone: '123' })).status).toBe(400);
    expect((await a.post('/system/users', await dev.step(), { ...body, password: 'short' })).status).toBe(400);
    expect((await a.post('/system/users', await dev.step(), { ...body, extra: 1 })).status).toBe(400);
    const before = await count('SELECT COUNT(*) AS n FROM user_directory');
    const auditBefore = (await audits()).length;
    t.fake.admin.on('POST', '/c/internal/v1/admin/users', () => rawReply(500, { success: false, error: { code: 'INTERNAL_ERROR', message: 'secret internals' } }));
    const e5 = await a.post('/system/users', await dev.step(), { ...body, phone: '09121110004' });
    expect(e5.status).toBe(503);
    expect(e5.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(e5.body)).not.toContain('secret internals');
    t.fake.admin.on('POST', '/c/internal/v1/admin/users', () => rawReply(200, {}, 900));
    expect((await a.post('/system/users', await dev.step(), { ...body, phone: '09121110005' })).status).toBe(503);
    expect(await count('SELECT COUNT(*) AS n FROM user_directory')).toBe(before);
    expect((await audits()).length).toBe(auditBefore);
  });

  it('origin: 401/403 ⇒ 503؛ VALIDATION_FAILED با details می‌رسد؛ جواب نامعتبر ⇒ 503', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const body = { phone: '09121110006', firstName: 'نوین', lastName: 'کاربر' };
    t.fake.admin.on('POST', '/c/internal/v1/admin/users', () => failReply(401, 'AUTH_REQUIRED'));
    expect((await a.post('/system/users', await dev.step(), body)).status).toBe(503);
    t.fake.admin.on('POST', '/c/internal/v1/admin/users', () => failReply(403, 'AUTH_FORBIDDEN'));
    expect((await a.post('/system/users', await dev.step(), body)).status).toBe(503);
    t.fake.admin.on('POST', '/c/internal/v1/admin/users', () => failReply(400, 'VALIDATION_FAILED', 'نامعتبر', { fields: { phone: 'بد' } }));
    const v = await a.post('/system/users', await dev.step(), body);
    expect(v.status).toBe(400);
    expect(v.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'نامعتبر', details: { fields: { phone: 'بد' } } });
    t.fake.admin.on('POST', '/c/internal/v1/admin/users', () => ({ some: 'garbage' }));
    expect((await a.post('/system/users', await dev.step(), body)).status).toBe(503);
  });

  it('D6: دادن نقش developer فقط با developer (اگر مدیر manage داشته باشد)', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const admin = await mkUser(t, 'مدیر', ['super_admin']);
    await grantManageToSuperAdmin(dev);
    const r = await a.post('/system/users', await admin.step(), { phone: '09121110007', firstName: 'نوین', lastName: 'کاربر', roles: ['developer'] });
    expect(r.status).toBe(403);
    expect(low.A.calls).toHaveLength(0);
  });
});

describe('H-25 ویرایش', () => {
  it('نام/شماره در low و دایرکتوری؛ audit؛ PHONE_TAKEN؛ 404؛ حذف‌شده/غیرفعال ⇒ USER_NOT_ACTIVE', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'قدیمی کاربر');
    low.addUser(u);
    const other = await mkUser(t, 'دیگر کاربر');
    low.addUser(other);
    const r = await a.patch(`/system/users/${u.id}`, await dev.step(), { firstName: 'جدید', phone: '09129998877' });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ name: 'جدید کاربر', firstName: 'جدید', phone: '09129998877' });
    expect(await dirRow(u.id)).toMatchObject({ first_name: 'جدید', phone: '09129998877' });
    const au = await audits('user.update');
    expect(au).toHaveLength(1);
    expect(au[0]).toMatchObject({ target_type: 'user', target_id: u.id });
    expect(au[0].meta).toEqual({ fields: ['firstName', 'phone'] });
    const dup = await a.patch(`/system/users/${u.id}`, await dev.step(), { phone: other.phone });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details.reason).toBe('PHONE_TAKEN');
    expect((await a.patch(`/system/users/${u.id}`, await dev.step(), {})).status).toBe(400);
    expect((await a.patch(`/system/users/${randomUUID()}`, await dev.step(), { firstName: 'نام' })).status).toBe(404);
    for (const status of ['deleted', 'disabled']) {
      await t.ds.query('UPDATE user_directory SET status = ? WHERE user_id = UNHEX(?)', [status, hex(u.id)]);
      const n = await a.patch(`/system/users/${u.id}`, await dev.step(), { firstName: 'دیگر' });
      expect(n.status).toBe(409);
      expect(n.body.error.details.reason).toBe('USER_NOT_ACTIVE');
    }
  });
});

describe('H-26 وضعیت و حفاظت‌ها', () => {
  it('غیرفعال/فعال: low فراخوانی، دایرکتوری و audit', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'کاربر');
    low.addUser(u);
    const off = await a.post(`/system/users/${u.id}/status`, await dev.step(), { status: 'disabled' });
    expect(off.status).toBe(200);
    expect(off.body.data.status).toBe('disabled');
    expect(low.users.get(u.id)!.status).toBe('disabled');
    expect((await dirRow(u.id)).status).toBe('disabled');
    expect((await a.get('/system/users?status=disabled', dev)).body.meta.total).toBe(1);
    expect((await a.post(`/system/users/${u.id}/status`, await dev.step(), { status: 'active' })).body.data.status).toBe('active');
    const au = await audits('user.status_change');
    expect(au).toHaveLength(2); // (TestClock ثابت است ⇒ ترتیب هم‌میلی‌ثانیه تضمین‌شده نیست)
    expect(au.map((x) => x.meta)).toEqual(expect.arrayContaining([{ before: 'active', after: 'disabled' }, { before: 'disabled', after: 'active' }]));
    expect(au[0]).toMatchObject({ target_type: 'user', target_id: u.id });
    expect((await a.post(`/system/users/${u.id}/status`, await dev.step(), { status: 'deleted' })).status).toBe(400);
  });

  it('SELF_PROTECTED: غیرفعال‌کردن/حذف خود؛ LAST_HOLDER: آخرین developer فعال', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    low.addUser(dev);
    const self = await a.post(`/system/users/${dev.id}/status`, await dev.step(), { status: 'disabled' });
    expect(self.status).toBe(409);
    expect(self.body.error.details.reason).toBe('SELF_PROTECTED');
    expect((await a.del(`/system/users/${dev.id}`, await dev.step())).body.error.details.reason).toBe('SELF_PROTECTED');
    // مدیر با manage، آخرین developer را نمی‌تواند غیرفعال/حذف کند
    const admin = await mkUser(t, 'مدیر', ['super_admin']);
    await grantManageToSuperAdmin(dev);
    const off = await a.post(`/system/users/${dev.id}/status`, await admin.step(), { status: 'disabled' });
    expect(off.status).toBe(409);
    expect(off.body.error.details.reason).toBe('LAST_HOLDER');
    expect((await a.del(`/system/users/${dev.id}`, await admin.step())).body.error.details.reason).toBe('LAST_HOLDER');
    expect(low.users.get(dev.id)!.status).toBe('active');
    // developer دوم فعال ⇒ مجاز؛ سپس دومی آخرین فعال است
    const dev2 = await mkUser(t, 'توسعه دو', ['developer']);
    low.addUser(dev2);
    expect((await a.post(`/system/users/${dev.id}/status`, await admin.step(), { status: 'disabled' })).status).toBe(200);
    expect((await a.post(`/system/users/${dev2.id}/status`, await admin.step(), { status: 'disabled' })).body.error.details.reason).toBe('LAST_HOLDER');
    expect((await audits('user.status_change')).length).toBe(1);
  });
});

describe('H-27 حذف', () => {
  it('ناشناس‌سازی، برداشتن نقش/grant با claim، audit؛ idempotent؛ ویرایش بعدی ⇒ USER_NOT_ACTIVE', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    await mkUser(t, 'مدیر دو', ['super_admin']); // تا آخرین دارنده نباشد
    const u = await mkUser(t, 'حذف‌شونده', ['super_admin'], ['session.create']);
    low.addUser(u);
    await t.ds.query('DELETE FROM outbox_events');
    const r = await a.del(`/system/users/${u.id}`, await dev.step());
    expect(r.status).toBe(200);
    expect(low.users.get(u.id)!.status).toBe('deleted');
    expect(await dirRow(u.id)).toMatchObject({ status: 'deleted', phone: `d${hex(u.id).slice(-10)}`, first_name: '', last_name: '' });
    expect(await count('SELECT COUNT(*) AS n FROM user_system_roles WHERE user_id = UNHEX(?)', [hex(u.id)])).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM user_grants WHERE user_id = UNHEX(?)', [hex(u.id)])).toBe(0);
    expect((await outboxTypes(t)).find((e) => e.type === 'system.role.changed')!.payload).toMatchObject({ userId: u.id, systemRoles: [], grants: [] });
    const au = await audits('user.delete');
    expect(au).toHaveLength(1);
    expect(au[0]).toMatchObject({ target_type: 'user', target_id: u.id, target_label: 'حذف‌شونده' });
    // idempotent: بار دوم موفق و بدون audit/فراخوانی تازه
    const calls = low.A.calls.length;
    expect((await a.del(`/system/users/${u.id}`, await dev.step())).status).toBe(200);
    expect(low.A.calls.length).toBe(calls);
    expect((await audits('user.delete')).length).toBe(1);
    expect((await a.patch(`/system/users/${u.id}`, await dev.step(), { firstName: 'ابدا' })).body.error.details.reason).toBe('USER_NOT_ACTIVE');
    expect((await a.put(`/system/users/${u.id}/roles`, await dev.step(), { roles: ['super_admin'] })).body.error.details.reason).toBe('USER_NOT_ACTIVE');
    expect((await a.put(`/system/users/${u.id}/grants`, await dev.step(), { grants: ['session.create'] })).body.error.details.reason).toBe('USER_NOT_ACTIVE');
    expect((await a.del(`/system/users/${randomUUID()}`, await dev.step())).status).toBe(404);
  });

  it('آخرین دارندهٔ super_admin قابل‌حذف نیست (D5)؛ خطای مبدأ ⇒ بدون تغییر محلی', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const sa = await mkUser(t, 'تک مدیر', ['super_admin']);
    low.addUser(sa);
    const r = await a.del(`/system/users/${sa.id}`, await dev.step());
    expect(r.status).toBe(409);
    expect(r.body.error.details).toMatchObject({ reason: 'LAST_HOLDER', role: 'super_admin' });
    const plain = await mkUser(t, 'عادی');
    low.addUser(plain);
    t.fake.admin.on('DELETE', '/c/internal/v1/admin/users/:id', () => rawReply(502));
    expect((await a.del(`/system/users/${plain.id}`, await dev.step())).status).toBe(503);
    expect((await dirRow(plain.id)).status).toBe('active');
    expect(await audits('user.delete')).toHaveLength(0);
  });
});

describe('H-28 رمز و H-29 خروج اجباری', () => {
  it('set/clear ⇒ low و audit بدون رمز؛ logout-all', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'کاربر');
    low.addUser(u);
    expect((await a.put(`/system/users/${u.id}/password`, await dev.step(), { action: 'set', password: 'Sup3rSecret!!' })).status).toBe(200);
    expect(low.users.get(u.id)).toMatchObject({ hasPassword: true, mustChangePassword: true });
    expect((await a.put(`/system/users/${u.id}/password`, await dev.step(), { action: 'set', password: 'short' })).status).toBe(400);
    expect((await a.put(`/system/users/${u.id}/password`, await dev.step(), { action: 'nope' })).status).toBe(400);
    expect((await a.put(`/system/users/${u.id}/password`, await dev.step(), { action: 'clear' })).status).toBe(200);
    expect(low.users.get(u.id)).toMatchObject({ hasPassword: false, mustChangePassword: false });
    expect((await audits('user.password_set'))[0]).toMatchObject({ target_type: 'user', target_id: u.id });
    expect(await audits('user.password_clear')).toHaveLength(1);
    expect(JSON.stringify(await audits())).not.toContain('Sup3rSecret');
    expect((await a.put(`/system/users/${randomUUID()}/password`, await dev.step(), { action: 'clear' })).status).toBe(404);

    const s = low.addSession(u.id);
    expect((await a.post(`/system/users/${u.id}/logout-all`, await dev.step())).status).toBe(200);
    expect(s.revokedAt).not.toBeNull();
    expect(await audits('user.logout_all')).toHaveLength(1);
    t.fake.admin.on('POST', '/c/internal/v1/admin/users/:id/logout-all', () => rawReply(500));
    expect((await a.post(`/system/users/${u.id}/logout-all`, await dev.step())).status).toBe(503);
    expect(await audits('user.logout_all')).toHaveLength(1);
  });
});

describe('H-50/H-51 نشست‌های کاربر', () => {
  it('ipMasked، صفحه‌بندی؛ revoke با audit؛ 404 مبدأ', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'کاربر');
    low.addUser(u);
    const s1 = low.addSession(u.id, { ip: '192.168.10.77' });
    low.addSession(u.id, { ip: '2001:db8:85a3::8a2e:370:7334', client: 'android-low', platform: 'android' });
    low.addSession(u.id, { ip: '::ffff:10.20.30.40' });
    const r = await a.get(`/system/users/${u.id}/sessions?pageSize=2`, dev);
    expect(r.status).toBe(200);
    expect(r.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(r.body.data).toHaveLength(2);
    expect(r.body.data[0]).toMatchObject({ id: s1.id, ipMasked: '192.168.*.*', current: false, platform: 'web', client: 'web-admin' });
    expect(r.body.data[0].ip).toBeUndefined();
    expect(r.body.data[1].ipMasked).toBe('2001:db8:85a3:0:0:8a2e:*:*');
    expect((await a.get(`/system/users/${u.id}/sessions?page=2&pageSize=2`, dev)).body.data[0].ipMasked).toBe('10.20.*.*');
    expect((await a.get(`/system/users/${randomUUID()}/sessions`, dev)).status).toBe(404);
    const del = await a.del(`/system/users/${u.id}/sessions/${s1.id}`, await dev.step());
    expect(del.status).toBe(200);
    expect(s1.revokedAt).not.toBeNull();
    const au = await audits('user.session_revoke');
    expect(au[0]).toMatchObject({ target_type: 'user', target_id: u.id });
    expect(au[0].meta).toEqual({ sessionId: s1.id });
    expect((await a.del(`/system/users/${u.id}/sessions/${randomUUID()}`, await dev.step())).status).toBe(404);
    expect(await audits('user.session_revoke')).toHaveLength(1);
    t.fake.admin.on('GET', '/c/internal/v1/admin/users/:id/sessions', () => rawReply(500));
    expect((await a.get(`/system/users/${u.id}/sessions`, dev)).status).toBe(503);
  });
});
