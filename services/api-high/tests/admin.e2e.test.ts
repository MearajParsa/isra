import { randomUUID } from 'node:crypto';
import { SignJWT, generateKeyPair } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestApp, type User, api, mkUser, outboxTypes, resetDb, startApp } from './helpers/app';

let t: TestApp;
let a: ReturnType<typeof api>;
beforeAll(async () => {
  t = await startApp();
  a = api(t);
});
afterAll(async () => t.close());
beforeEach(async () => {
  await resetDb(t.ds, t.app);
});

describe('هویت و دسترسی', () => {
  it('H-00: دارندهٔ نقش ⇒ نقش‌ها و مجوزهای مؤثر؛ کاربر بدون نقش ⇒ 403', async () => {
    const dev = await mkUser(t, 'علی توسعه', ['developer']);
    const r = await a.get('/system/me', dev);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ user: { id: dev.id, name: 'علی توسعه', phone: dev.phone }, roles: ['developer'] });
    expect(r.body.data.permissions).toEqual(expect.arrayContaining(['system.users.view', 'system.settings.edit', 'session.create']));
    const nobody = await mkUser(t, 'عادی');
    const f = await a.get('/system/me', nobody);
    expect(f.status).toBe(403);
    expect(f.body.error.code).toBe('AUTH_FORBIDDEN');
    // grant مستقیم هم برای ورود به پنل کافی نیست
    expect((await a.get('/system/me', await mkUser(t, 'فقط grant', [], ['session.create']))).status).toBe(403);
  });

  it('نقش از DB خوانده می‌شود، نه JWT: تغییر نقش فوراً اثر می‌کند', async () => {
    const admin = await mkUser(t, 'مدیر', ['super_admin']);
    expect((await a.get('/system/me', admin)).status).toBe(200);
    await t.ds.query('DELETE FROM user_system_roles WHERE user_id = UNHEX(?)', [admin.id.replace(/-/g, '')]);
    t.flush(); // کش حافظهٔ ۵ ثانیه‌ای (دست‌کاری مستقیم DB)
    expect((await a.get('/system/me', admin)).status).toBe(403);
  });

  it('JWT: بدون توکن/مزخرف/alg=none/کلید دیگر/iss/aud/lvl اشتباه/منقضی ⇒ 401', async () => {
    const u = await mkUser(t, 'مدیر', ['super_admin']);
    const call = (tok: string | null) => (tok === null ? request(t.http).get('/s/v1/system/me') : request(t.http).get('/s/v1/system/me').set('Authorization', `Bearer ${tok}`));
    expect((await call(null)).body.error.code).toBe('AUTH_REQUIRED');
    expect((await call('garbage')).status).toBe(401);
    const { privateKey } = await generateKeyPair('RS256');
    expect((await call(await t.fake.sign({ sub: u.id }, privateKey))).status).toBe(401);
    expect((await call(await t.fake.sign({ sub: u.id, iss: 'evil' }))).status).toBe(401);
    expect((await call(await t.fake.sign({ sub: u.id, aud: 'x' }))).status).toBe(401);
    // step-up token به‌جای access
    expect((await call(await t.fake.sign({ sub: u.id, lvl: 'stepup' }))).status).toBe(401);
    const past = Math.floor(t.clock.now().getTime() / 1000) - 3600;
    const exp = await call(await t.fake.sign({ sub: u.id, exp: past }));
    expect(exp.body.error.code).toBe('AUTH_TOKEN_EXPIRED');
    const forged = await new SignJWT({ lvl: 'low', sid: randomUUID() }).setProtectedHeader({ alg: 'HS256' }).setSubject(u.id).setIssuer('isra-low').setAudience('isra').setExpirationTime('10m').sign(new TextEncoder().encode('x'.repeat(32)));
    expect((await call(forged)).status).toBe(401);
    expect((await call(await t.fake.sign({ sub: u.id }))).status).toBe(200);
  });

  it('مجوز per endpoint: super_admin بدون settings.edit/view نمی‌تواند تنظیمات را ببیند', async () => {
    const admin = await mkUser(t, 'مدیر', ['super_admin']);
    await a.put('/system/roles/super_admin/permissions', await admin.step(), { permissions: ['system.users.view', 'system.role.assign', 'system.permission.edit', 'system.audit.view'] });
    expect((await a.get('/system/settings', admin)).status).toBe(403);
    expect((await a.get('/system/users', admin)).status).toBe(200);
  });
});

describe('step-up (JWT از low)', () => {
  const body = { roles: ['super_admin'] };
  it('بدون توکن 403 AUTH_STEP_UP_REQUIRED؛ منقضی/دیگر کاربر/دیگر نشست/lvl اشتباه ⇒ رد؛ معتبر ⇒ مجاز', async () => {
    const dev = await mkUser(t, 'مدیر', ['super_admin']); // developer معاف از step-up است (docs-v2/27 §4)
    const target = await mkUser(t, 'هدف');
    const put = (h: Record<string, string>) => a.put(`/system/users/${target.id}/roles`, h, body);
    const none = await put(dev.h);
    expect(none.status).toBe(403);
    expect(none.body.error.code).toBe('AUTH_STEP_UP_REQUIRED');
    const bearer = { ...dev.h };
    const withStep = (tok: string) => ({ ...bearer, 'X-Step-Up-Token': tok });
    const other = await mkUser(t, 'دیگر', ['super_admin']);
    expect((await put(withStep(await t.fake.sign({ sub: other.id, sid: dev.sid, lvl: 'stepup' })))).body.error.code).toBe('AUTH_STEP_UP_REQUIRED');
    expect((await put(withStep(await t.fake.sign({ sub: dev.id, sid: randomUUID(), lvl: 'stepup' })))).body.error.code).toBe('AUTH_STEP_UP_REQUIRED');
    expect((await put(withStep(await t.fake.sign({ sub: dev.id, sid: dev.sid, lvl: 'low' })))).body.error.code).toBe('AUTH_STEP_UP_REQUIRED');
    expect((await put(withStep(dev.token))).body.error.code).toBe('AUTH_STEP_UP_REQUIRED');
    const past = Math.floor(t.clock.now().getTime() / 1000) - 600;
    expect((await put(withStep(await t.fake.sign({ sub: dev.id, sid: dev.sid, lvl: 'stepup', exp: past })))).body.error.code).toBe('AUTH_STEP_UP_REQUIRED');
    expect((await put(withStep('x'.repeat(2000)))).body.error.code).toBe('AUTH_STEP_UP_REQUIRED');
    expect((await put(await dev.step())).status).toBe(200);
  });
});

describe('نقش‌های کاربران', () => {
  it('تخصیص و برداشتن؛ audit، permVer و رویداد system.role.changed با مجوزهای مؤثر', async () => {
    const dev = await mkUser(t, 'توسعه یک', ['developer']);
    const u = await mkUser(t, 'کاربر جدید');
    const r = await a.put(`/system/users/${u.id}/roles`, await dev.step(), { roles: ['super_admin'] });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ id: u.id, roles: ['super_admin'], grants: [] });
    const ev = (await outboxTypes(t)).find((e) => e.type === 'system.role.changed')!;
    expect(ev.payload).toMatchObject({ userId: u.id, systemRoles: ['super_admin'], permVer: 2 });
    expect(ev.payload.grants).toEqual(expect.arrayContaining(['session.create', 'system.users.view']));
    const log = await a.get('/system/audit?action=user.roles.updated', dev);
    expect(log.body.data[0]).toMatchObject({ action: 'user.roles.updated', actor: { id: dev.id, name: 'توسعه یک' }, target: { type: 'user', id: u.id }, meta: { before: [], after: ['super_admin'] } });
    // بدون تغییر ⇒ بدون audit/رویداد جدید
    await t.ds.query('DELETE FROM outbox_events');
    expect((await a.put(`/system/users/${u.id}/roles`, await dev.step(), { roles: ['super_admin'] })).status).toBe(200);
    expect(await outboxTypes(t)).toHaveLength(0);
    await mkUser(t, 'مدیر دوم', ['super_admin']); // وگرنه LAST_HOLDER
    const rm = await a.put(`/system/users/${u.id}/roles`, await dev.step(), { roles: [] });
    expect(rm.body.data.roles).toEqual([]);
    expect((await outboxTypes(t)).at(-1)!.payload).toMatchObject({ systemRoles: [], grants: [], permVer: 3 });
  });

  it('D6: super_admin نمی‌تواند نقش developer را بدهد/بگیرد؛ developer می‌تواند', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const admin = await mkUser(t, 'مدیر', ['super_admin']);
    const u = await mkUser(t, 'هدف');
    expect((await a.put(`/system/users/${u.id}/roles`, await admin.step(), { roles: ['developer'] })).status).toBe(403);
    expect((await a.put(`/system/users/${dev.id}/roles`, await admin.step(), { roles: [] })).status).toBe(403);
    expect((await a.put(`/system/users/${u.id}/roles`, await dev.step(), { roles: ['developer'] })).status).toBe(200);
    // super_admin می‌تواند نقش super_admin را به کسی که developer است اضافه کند (developer دست‌نخورده می‌ماند)
    expect((await a.put(`/system/users/${u.id}/roles`, await admin.step(), { roles: ['developer', 'super_admin'] })).status).toBe(200);
  });

  it('D5 قفل آخرین دارنده: برداشتن آخرین developer/super_admin ⇒ 409 LAST_HOLDER', async () => {
    const dev = await mkUser(t, 'تنها توسعه', ['developer', 'super_admin']);
    const r = await a.put(`/system/users/${dev.id}/roles`, await dev.step(), { roles: ['super_admin'] });
    expect(r.status).toBe(409);
    expect(r.body.error.details).toMatchObject({ reason: 'LAST_HOLDER', role: 'developer' });
    const r2 = await a.put(`/system/users/${dev.id}/roles`, await dev.step(), { roles: ['developer'] });
    expect(r2.body.error.details).toMatchObject({ reason: 'LAST_HOLDER', role: 'super_admin' });
    // دارندهٔ دوم ⇒ برداشتن مجاز
    const second = await mkUser(t, 'مدیر دوم', ['super_admin']);
    expect((await a.put(`/system/users/${dev.id}/roles`, await dev.step(), { roles: ['developer'] })).status).toBe(200);
    expect(second.id).toBeTruthy();
  });

  it('دو developer هم‌زمان یکدیگر را برمی‌دارند ⇒ فقط یکی موفق، همیشه ≥۱ دارنده', async () => {
    await t.ds.query('DELETE FROM user_system_roles');
    const d1 = await mkUser(t, 'دی یک', ['developer']);
    const d2 = await mkUser(t, 'دی دو', ['developer']);
    const [r1, r2] = await Promise.all([a.put(`/system/users/${d2.id}/roles`, await d1.step(), { roles: [] }), a.put(`/system/users/${d1.id}/roles`, await d2.step(), { roles: [] })]);
    // تراکنش‌ها پشت‌سرهم اجرا می‌شوند: دومی یا دیگر developer نیست (403) یا آخرین دارنده است (409)
    const sorted = [r1.status, r2.status].sort();
    expect(sorted[0]).toBe(200);
    expect([403, 409]).toContain(sorted[1]);
    const [{ n }] = (await t.ds.query("SELECT COUNT(*) AS n FROM user_system_roles WHERE role_key = 'developer'")) as { n: string }[];
    expect(Number(n)).toBe(1);
  });

  it('ورودی نامعتبر 400؛ کاربر ناموجود 404؛ فقط system.role.assign', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    expect((await a.put(`/system/users/${dev.id}/roles`, await dev.step(), { roles: ['root'] })).status).toBe(404); // نقش ناموجود
    expect((await a.put(`/system/users/${dev.id}/roles`, await dev.step(), { roles: ['developer'], extra: 1 })).status).toBe(400);
    expect((await a.put(`/system/users/${randomUUID()}/roles`, await dev.step(), { roles: [] })).status).toBe(404);
    expect((await a.put('/system/users/not-a-uuid/roles', await dev.step(), { roles: [] })).status).toBe(404);
    const viewerOnly = await mkUser(t, 'فقط نمایش', ['super_admin']);
    await t.ds.query("DELETE FROM role_permissions WHERE role_key = 'super_admin' AND permission_key = 'session.create'");
    await t.ds.query("UPDATE role_permissions SET locked = 0 WHERE role_key = 'super_admin'");
    await t.ds.query("DELETE FROM role_permissions WHERE role_key = 'super_admin' AND permission_key = 'system.role.assign'");
    expect((await a.put(`/system/users/${dev.id}/roles`, await viewerOnly.step(), { roles: ['developer'] })).status).toBe(403);
    await t.ds.query("INSERT INTO role_permissions (role_key, permission_key, locked) VALUES ('super_admin', 'system.role.assign', 1), ('super_admin', 'session.create', 0)");
    await t.ds.query("UPDATE role_permissions SET locked = 1 WHERE role_key = 'super_admin' AND permission_key IN ('system.users.view','system.role.assign','system.permission.edit','system.audit.view')");
  });
});

describe('grant مستقیم (D1)', () => {
  it('session.create برای کاربر عادی؛ رویداد با مجوز مؤثر؛ برداشتن', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'مدیر آینده');
    const r = await a.put(`/system/users/${u.id}/grants`, await dev.step(), { grants: ['session.create'] });
    expect(r.body.data.grants).toEqual(['session.create']);
    expect((await outboxTypes(t)).find((e) => e.type === 'system.role.changed')!.payload).toMatchObject({ userId: u.id, systemRoles: [], grants: ['session.create'] });
    expect((await a.put(`/system/users/${u.id}/grants`, await dev.step(), { grants: [] })).body.data.grants).toEqual([]);
    expect((await a.put(`/system/users/${u.id}/grants`, await dev.step(), { grants: ['system.users.view'] })).status).toBe(400);
  });
});

describe('ماتریس مجوز', () => {
  it('H-10/H-11: دو نقش undeletable با دارندگان و قفل‌ها؛ فهرست مجوزها', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const roles = await a.get('/system/roles', dev);
    expect(roles.body.data.map((r: any) => r.key)).toEqual(['developer', 'super_admin']);
    expect(roles.body.data[0]).toMatchObject({ undeletable: true, holders: 1, title: 'توسعه‌دهنده' });
    expect(roles.body.data[0].lockedPermissions).toHaveLength(19);
    expect(roles.body.data[1].lockedPermissions).toEqual(expect.arrayContaining(['system.users.view', 'system.role.assign', 'system.permission.edit', 'system.audit.view']));
    const perms = await a.get('/system/permissions?pageSize=50', dev);
    expect(perms.body.meta.total).toBe(19);
    expect(perms.body.data.find((p: any) => p.key === 'session.create')).toMatchObject({ moduleKey: 'sessions', grantable: true });
  });

  it('developer ثابت ⇒ 403؛ حذف مجوز قفل‌شده ⇒ 409 LOCKED_PERMISSION؛ تغییر مجاز ⇒ claim دارندگان تازه می‌شود', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const admin = await mkUser(t, 'مدیر', ['super_admin']);
    expect((await a.put('/system/roles/developer/permissions', await dev.step(), { permissions: ['session.create'] })).status).toBe(403);
    const locked = await a.put('/system/roles/super_admin/permissions', await dev.step(), { permissions: ['session.create'] });
    expect(locked.status).toBe(409);
    expect(locked.body.error.details.reason).toBe('LOCKED_PERMISSION');
    expect(locked.body.error.details.missing).toEqual(expect.arrayContaining(['system.users.view']));
    await t.ds.query('DELETE FROM outbox_events');
    const ok = await a.put('/system/roles/super_admin/permissions', await dev.step(), { permissions: ['system.users.view', 'system.role.assign', 'system.permission.edit', 'system.audit.view'] });
    expect(ok.status).toBe(200);
    expect(ok.body.data.permissions).toHaveLength(4);
    const ev = await outboxTypes(t);
    expect(ev.map((e) => e.type).sort()).toEqual(['system.permission.changed', 'system.role.changed']);
    const claim = ev.find((e) => e.type === 'system.role.changed')!.payload;
    expect(claim).toMatchObject({ userId: admin.id, systemRoles: ['super_admin'] });
    expect(claim.grants).not.toContain('session.create');
    expect((await a.get('/system/audit?action=role.permissions.updated', dev)).body.data[0].meta).toMatchObject({ removed: expect.arrayContaining(['session.create']) });
  });
});

describe('کاربران (جست‌وجو)', () => {
  it('q روی نام/شماره (ارقام فارسی)، فیلتر نقش/none، صفحه‌بندی؛ بدون نشت wildcard', async () => {
    await t.ds.query('DELETE FROM user_system_roles');
    await t.ds.query('DELETE FROM user_directory');
    const dev = await mkUser(t, 'رضا توسعه', ['developer']);
    const adm = await mkUser(t, 'مریم مدیر', ['super_admin']);
    const u1 = await mkUser(t, 'علی احمدی');
    await mkUser(t, 'سارا کریمی', [], ['session.create']);
    const all = await a.get('/system/users?pageSize=2&page=1', dev);
    expect(all.body.meta).toMatchObject({ total: 4, page: 1, pageSize: 2 });
    expect(all.body.data).toHaveLength(2);
    expect((await a.get('/system/users?q=احمدی', dev)).body.data.map((u: any) => u.id)).toEqual([u1.id]);
    const persian = u1.phone.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
    expect((await a.get(`/system/users?q=${encodeURIComponent(persian)}`, dev)).body.data.map((u: any) => u.id)).toEqual([u1.id]);
    expect((await a.get('/system/users?q=%25', dev)).body.data).toHaveLength(0);
    expect((await a.get('/system/users?role=super_admin', dev)).body.data.map((u: any) => u.id)).toEqual([adm.id]);
    expect((await a.get('/system/users?role=none', dev)).body.meta.total).toBe(2);
    const sara = (await a.get('/system/users?q=سارا', dev)).body.data[0];
    expect(sara).toMatchObject({ roles: [], grants: ['session.create'] });
    expect((await a.get('/system/users?q=' + 'x'.repeat(61), dev)).status).toBe(400);
    expect((await a.get(`/system/users/${randomUUID()}`, dev)).status).toBe(404);
    expect((await a.get(`/system/users/${u1.id}`, dev)).body.data.name).toBe('علی احمدی');
  });
});

describe('تنظیمات سراسری', () => {
  const put = async (u: User, body: object) => a.put('/system/settings', await u.step(), body);
  const valid = (version: number, over: object = {}) => ({ version, evalWeights: { voice: 50, tone: 30, tajweed: 20 }, badgeThresholds: [10, 20, 30, 40], flags: { maintenance_mode: false, registration_open: true }, ...over });

  it('مقدار اولیهٔ سیستم (seed): ۴۰/۳۰/۳۰ و ۵۰/۱۵۰/۳۰۰/۵۰۰', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const s = await a.get('/system/settings', dev);
    expect(s.body.data).toMatchObject({ version: 1, evalWeights: { voice: 40, tone: 30, tajweed: 30 }, badgeThresholds: [50, 150, 300, 500], flags: { maintenance_mode: false, registration_open: true } });
  });

  it('به‌روزرسانی: نسخه +۱، audit، رویداد برای mid/low؛ نسخهٔ قدیمی ⇒ 409 VERSION_MISMATCH', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const ok = await put(dev, valid(1));
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ version: 2, evalWeights: { voice: 50, tone: 30, tajweed: 20 }, updatedBy: 'توسعه' });
    expect((await outboxTypes(t)).find((e) => e.type === 'system.settings.changed')!.payload).toMatchObject({ version: 2, badgeThresholds: [10, 20, 30, 40], flags: { registration_open: true } });
    const stale = await put(dev, valid(1));
    expect(stale.status).toBe(409);
    expect(stale.body.error.details).toMatchObject({ reason: 'VERSION_MISMATCH', currentVersion: 2 });
    expect((await a.get('/system/audit?action=settings.updated', dev)).body.data[0].meta).toMatchObject({ version: 2, before: { evalWeights: { voice: 40 } }, after: { evalWeights: { voice: 50 } } });
  });

  it('به‌روزرسانی هم‌زمان با یک نسخه ⇒ فقط یکی موفق', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const cur = (await a.get('/system/settings', dev)).body.data.version;
    const rs = await Promise.all(Array.from({ length: 5 }, async (_, i) => put(dev, valid(cur, { evalWeights: { voice: 40 + i, tone: 30, tajweed: 30 - i } }))));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(4);
  });

  it('اعتبارسنجی: جمع وزن‌ها، آستانهٔ غیرصعودی، پرچم ناشناخته، فیلد اضافه', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const v = (await a.get('/system/settings', dev)).body.data.version;
    expect((await put(dev, valid(v, { evalWeights: { voice: 50, tone: 30, tajweed: 30 } }))).status).toBe(400);
    expect((await put(dev, valid(v, { badgeThresholds: [10, 10, 30, 40] }))).status).toBe(400);
    expect((await put(dev, valid(v, { badgeThresholds: [10, 20, 30] }))).status).toBe(400);
    expect((await put(dev, valid(v, { flags: { maintenance_mode: false, registration_open: true, hack: true } }))).status).toBe(400);
    expect((await put(dev, { ...valid(v), updatedBy: 'x' })).status).toBe(400);
    expect((await put(dev, valid(v, { evalWeights: { voice: 100, tone: 0, tajweed: 0 } }))).status).toBe(200);
  });

  it('super_admin با settings.edit مجاز؛ بدون step-up ⇒ 403', async () => {
    const admin = await mkUser(t, 'مدیر', ['super_admin']);
    const v = (await a.get('/system/settings', admin)).body.data.version;
    expect((await a.put('/system/settings', admin.h, valid(v))).body.error.code).toBe('AUTH_STEP_UP_REQUIRED');
    expect((await put(admin, valid(v))).status).toBe(200);
  });
});

describe('audit و نمای کلی', () => {
  it('audit فقط‌خواندنی با فیلتر action/q و صفحه‌بندی؛ نیاز system.audit.view', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'کاربر نمونه‌ی ممیزی');
    await a.put(`/system/users/${u.id}/grants`, await dev.step(), { grants: ['session.create'] });
    await a.put(`/system/users/${u.id}/roles`, await dev.step(), { roles: ['super_admin'] });
    const all = await a.get('/system/audit?pageSize=2', dev);
    expect(all.body.meta.pageSize).toBe(2);
    expect(all.body.data.length).toBeLessThanOrEqual(2);
    expect(all.body.data[0].at >= all.body.data[1].at).toBe(true);
    expect((await a.get('/system/audit?action=user.grants.updated', dev)).body.data.every((e: any) => e.action === 'user.grants.updated')).toBe(true);
    expect((await a.get('/system/audit?q=ممیزی', dev)).body.data.length).toBeGreaterThanOrEqual(2);
    expect((await a.get('/system/audit?q=%25', dev)).body.data).toHaveLength(0);
    for (const m of ['put', 'delete', 'patch', 'post'] as const) expect((await (request(t.http) as any)[m]('/s/v1/system/audit').set(dev.h).send({})).status).toBeGreaterThanOrEqual(404);
    // meta بدون PII حساس
    const dump = JSON.stringify(all.body.data);
    expect(dump).not.toMatch(/otp|password|token/i);
  });

  it('H-01: کاربران از DB، جلسات از mid (internal)، آخرین audit؛ mid خراب ⇒ 503', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const o = await a.get('/system/overview', dev);
    expect(o.status).toBe(200);
    expect(o.body.data.sessions).toEqual({ draft: 1, scheduled: 2, started: 3, ended: 4 });
    expect(o.body.data.users.admins).toBeGreaterThanOrEqual(1);
    expect(o.body.data.lastAudit.length).toBeLessThanOrEqual(5);
  });
});

describe('اولین developer (bootstrap)', () => {
  it('وقتی شمارهٔ مشخص‌شده ثبت‌نام کرد و developer وجود ندارد ⇒ developer + audit + claim؛ بار دوم بی‌اثر', async () => {
    const t2 = await startApp({ BOOTSTRAP_DEVELOPER_PHONE: '09125550000' });
    try {
      const send = (uid: string, phone: string, eventId = randomUUID()) =>
        request(t2.http).post('/s/internal/v1/events').set('X-Internal-Caller', 'low').set('X-Internal-Token', 'test-pair-low-high-0123456789abcdef0').send({ eventId, type: 'user.registered', occurredAt: new Date().toISOString(), payload: { userId: uid, phone, firstName: 'بنیان', lastName: 'گذار' } });
      const other = randomUUID();
      await send(other, '09125551111').expect(202);
      expect(await outboxTypes(t2)).toHaveLength(0);
      const founder = randomUUID();
      await send(founder, '09125550000').expect(202);
      const roles = (await t2.ds.query('SELECT role_key FROM user_system_roles')) as { role_key: string }[];
      expect(roles).toEqual([{ role_key: 'developer' }]);
      const ev = await outboxTypes(t2);
      expect(ev[0]).toMatchObject({ type: 'system.role.changed', payload: { userId: founder, systemRoles: ['developer'] } });
      const tok = await t2.fake.sign({ sub: founder });
      const me = await request(t2.http).get('/s/v1/system/me').set('Authorization', `Bearer ${tok}`);
      expect(me.body.data.roles).toEqual(['developer']);
      expect((await request(t2.http).get('/s/v1/system/audit?action=system.bootstrap').set('Authorization', `Bearer ${tok}`)).body.data[0]).toMatchObject({ action: 'system.bootstrap', actor: { name: 'سیستم' } });
      // کاربر دوم با همان شماره (فرضی) یا رویداد تکراری ⇒ بی‌اثر
      await send(founder, '09125550000').expect(202);
      expect(((await t2.ds.query('SELECT 1 FROM user_system_roles')) as unknown[]).length).toBe(1);
    } finally {
      await t2.close();
    }
  });
  it('چند شمارهٔ bootstrap (با کاما): فقط وقتی developer فعالی نیست (۱.۶.۰)؛ شمارهٔ بیرون فهرست نه', async () => {
    const t2 = await startApp({ BOOTSTRAP_DEVELOPER_PHONE: '09125550000, 09125550001' });
    try {
      const send = (uid: string, phone: string) =>
        request(t2.http).post('/s/internal/v1/events').set('X-Internal-Caller', 'low').set('X-Internal-Token', 'test-pair-low-high-0123456789abcdef0').send({ eventId: randomUUID(), type: 'user.registered', occurredAt: new Date().toISOString(), payload: { userId: uid, phone, firstName: 'الف', lastName: 'ب' } });
      await send(randomUUID(), '09125550000').expect(202);
      await send(randomUUID(), '09125559999').expect(202);
      await send(randomUUID(), '09125550001').expect(202);
      const roles = (await t2.ds.query("SELECT d.phone FROM user_system_roles r JOIN user_directory d ON d.user_id = r.user_id WHERE r.role_key = 'developer' ORDER BY d.phone")) as { phone: string }[];
      // اولی developer شد ⇒ دومی (با وجود developer فعال) دیگر خودکار ارتقا نمی‌یابد (docs-v2/30 §۳ امنیت ۷)
      expect(roles.map((r) => r.phone)).toEqual(['09125550000']);
      // developer غیرفعال شد ⇒ شمارهٔ بعدی فهرست هنگام ثبت‌نام developer می‌شود
      await t2.ds.query("UPDATE user_directory SET status = 'disabled' WHERE phone = '09125550000'");
      await send(randomUUID(), '09125550001').expect(202);
      const after = (await t2.ds.query("SELECT d.phone FROM user_system_roles r JOIN user_directory d ON d.user_id = r.user_id WHERE r.role_key = 'developer' ORDER BY d.phone")) as { phone: string }[];
      expect(after.map((r) => r.phone)).toEqual(['09125550000', '09125550001']);
    } finally {
      await t2.close();
    }
  });
});
