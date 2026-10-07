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

const mkRole = (dev: User, key: string, body: object = {}) => a.post('/system/roles', dev.h, { key, title: `نقش ${key}`, ...body });
/** رویدادهای claim کاربر به ترتیب permVer (ترتیب created_at هم‌میلی‌ثانیه تضمین‌شده نیست) */
const claimsFor = async (userId: string) => (await outboxTypes(t)).filter((e) => e.type === 'system.role.changed' && e.payload.userId === userId).sort((x, y) => x.payload.permVer - y.payload.permVer);
const stepOf = async (u: User, id: string) => (await a.get('/system/me', u)).body.data.stepUp[id];

describe('نقش پویا و مجوز مؤثر (۱)', () => {
  it('ساخت نقش با مجوز صریح + ماژول ⇒ effectivePermissions؛ مجوز تازهٔ ماژول خودکار می‌رسد و claim تازه می‌شود', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    expect((await a.post('/system/modules', dev.h, { key: 'content', title: 'محتوا' })).status).toBe(200);
    expect((await a.post('/system/permissions', dev.h, { key: 'content.read', title: 'خواندن', moduleKey: 'content' })).status).toBe(200);
    const r = await mkRole(dev, 'content_editor', { permissions: ['system.users.view'], modules: ['content'] });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ key: 'content_editor', undeletable: false, holders: 0, permissions: ['system.users.view'], modules: ['content'] });
    expect(r.body.data.effectivePermissions).toEqual(['content.read', 'system.users.view']);

    const u = await mkUser(t, 'ویراستار');
    expect((await a.put(`/system/users/${u.id}/roles`, dev.h, { roles: ['content_editor'] })).status).toBe(200);
    expect((await claimsFor(u.id)).at(-1)!.payload.grants).toEqual(['content.read', 'system.users.view']);
    const before = (await claimsFor(u.id)).length;

    expect((await a.post('/system/permissions', dev.h, { key: 'content.write', title: 'نوشتن', moduleKey: 'content' })).status).toBe(200);
    const after = await claimsFor(u.id);
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)!.payload.grants).toEqual(['content.read', 'content.write', 'system.users.view']);
    expect((await a.get('/system/roles/content_editor', u)).body.data.effectivePermissions).toContain('content.write');
    // developer هم مجوز تازه را دارد
    expect((await a.get('/system/me', dev)).body.data.permissions).toContain('content.write');
  });

  it('ماژول نقش، ماتریس صریح و حذف مجوز، claim دارندگان را تازه می‌کنند (در همان تراکنش)', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    await a.post('/system/modules', dev.h, { key: 'content', title: 'محتوا' });
    await a.post('/system/permissions', dev.h, { key: 'content.read', title: 'خواندن', moduleKey: 'content' });
    await mkRole(dev, 'editor');
    const u = await mkUser(t, 'کاربر', ['editor']);
    const n0 = (await claimsFor(u.id)).length;
    await a.put('/system/roles/editor/modules', dev.h, { modules: ['content'] });
    expect((await claimsFor(u.id)).length).toBe(n0 + 1);
    await a.put('/system/roles/editor/permissions', dev.h, { permissions: ['system.users.view'] });
    expect((await claimsFor(u.id)).length).toBe(n0 + 2);
    const last = (await claimsFor(u.id)).at(-1)!.payload;
    expect(last.grants).toEqual(['content.read', 'system.users.view']);
    expect(last.permVer).toBeGreaterThan(1);
    // no-op ⇒ بدون رویداد
    await a.put('/system/roles/editor/permissions', dev.h, { permissions: ['system.users.view'] });
    expect((await claimsFor(u.id)).length).toBe(n0 + 2);
  });

  it('claim نقش پرجمعیت: همهٔ دارندگان، هر کدام یک رویداد', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    await mkRole(dev, 'big');
    const users: User[] = [];
    for (let i = 0; i < 250; i++) users.push(await mkUser(t, `کاربر ${i}`, ['big']));
    const before = (await outboxTypes(t)).filter((e) => e.type === 'system.role.changed').length;
    expect((await a.put('/system/roles/big/permissions', dev.h, { permissions: ['system.users.view'] })).status).toBe(200);
    const evs = (await outboxTypes(t)).filter((e) => e.type === 'system.role.changed');
    expect(evs.length - before).toBe(250);
    expect(new Set(evs.slice(before).map((e) => e.payload.userId)).size).toBe(250);
    const [row] = (await t.ds.query('SELECT perm_ver FROM user_directory WHERE user_id = UNHEX(?)', [users[0]!.id.replace(/-/g, '')])) as { perm_ver: number }[];
    expect(row!.perm_ver).toBe(2);
  }, 60_000);
});

describe('ضد ارتقا (۲)', () => {
  it('super_admin به نقش مجوزی که ندارد نمی‌دهد؛ نقش با مجوز بیشتر را نمی‌دهد؛ developer می‌تواند', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const admin = await mkUser(t, 'مدیر', ['super_admin']);
    await a.put('/system/roles/super_admin/permissions', dev.h, { permissions: [...(await a.get('/system/roles/super_admin', dev)).body.data.permissions, 'system.role.manage'] }).then((r) => expect(r.status).toBe(200));
    // ↑ توسعه‌دهنده مجوز را به super_admin داد (E2 برای developer معاف)؛ حال admin نقش می‌سازد
    const step = await admin.step();
    // مجوزی که admin ندارد
    t.flush();
    const bad = await a.post('/system/roles', step, { key: 'sneaky', title: 'نقش x', permissions: ['system.settings.edit', 'system.sessions.manage'] });
    expect(bad.status).toBe(403);
    expect(bad.body.error.code).toBe('AUTH_FORBIDDEN');
    expect((await a.post('/system/roles', step, { key: 'okrole', title: 'نقش ok', permissions: ['system.settings.edit'] })).status).toBe(200);

    // نقشی با مجوز بیشتر از admin
    await mkRole(dev, 'powerful', { permissions: ['system.sessions.manage'] });
    const target = await mkUser(t, 'هدف');
    const give = await a.put(`/system/users/${target.id}/roles`, step, { roles: ['powerful'] });
    expect(give.status).toBe(403);
    expect((await a.put(`/system/users/${target.id}/roles`, dev.h, { roles: ['powerful'] })).status).toBe(200);
    // ماتریس: افزودن مجوز ندارد
    expect((await a.put('/system/roles/okrole/permissions', step, { permissions: ['system.sessions.manage'] })).status).toBe(403);
    // ماژول با مجوز ندارد
    expect((await a.put('/system/roles/okrole/modules', step, { modules: ['sessions_admin'] })).status).toBe(403);
    // grant
    expect((await a.put(`/system/users/${target.id}/grants`, step, { grants: ['session.create'] })).status).toBe(200);
    // E3: developer را فقط developer می‌دهد
    expect((await a.put(`/system/users/${target.id}/roles`, step, { roles: ['developer'] })).status).toBe(403);
    expect((await a.put('/system/roles/developer/permissions', dev.h, { permissions: [] })).status).toBe(403);
    expect((await a.put('/system/roles/developer/modules', dev.h, { modules: [] })).status).toBe(403);
    expect((await a.put('/system/roles/developer/step-up', dev.h, { rules: [] })).status).toBe(403);
    expect((await a.del('/system/roles/developer', dev.h)).status).toBe(403);
  });

  it('grant: فقط مجوز grantable؛ ناموجود ⇒ 404', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'کاربر');
    const r = await a.put(`/system/users/${u.id}/grants`, dev.h, { grants: ['system.users.view'] });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
    expect((await a.put(`/system/users/${u.id}/grants`, dev.h, { grants: ['nope.nothing'] })).status).toBe(404);
    expect((await a.put(`/system/users/${u.id}/roles`, dev.h, { roles: ['ghost_role'] })).status).toBe(404);
  });
});

describe('حذف و محافظت (۳)', () => {
  it('نقش سیستمی/دارای دارنده/ماژول غیرخالی/مجوز سیستمی حذف نمی‌شود؛ حذف مجوز پویا cascade و claim', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const sa = await a.del('/system/roles/super_admin', dev.h);
    expect(sa.status).toBe(409);
    expect(sa.body.error.details.reason).toBe('SYSTEM_PROTECTED');
    await a.post('/system/modules', dev.h, { key: 'content', title: 'محتوا' });
    await a.post('/system/permissions', dev.h, { key: 'content.read', title: 'خواندن', moduleKey: 'content', grantable: true });
    await mkRole(dev, 'editor', { permissions: ['content.read'] });
    const u = await mkUser(t, 'کاربر', ['editor'], ['content.read']);
    const inUse = await a.del('/system/roles/editor', dev.h);
    expect(inUse.status).toBe(409);
    expect(inUse.body.error.details.reason).toBe('ROLE_IN_USE');
    const notEmpty = await a.del('/system/modules/content', dev.h);
    expect(notEmpty.body.error.details.reason).toBe('MODULE_NOT_EMPTY');
    expect((await a.del('/system/modules/users', dev.h)).body.error.details.reason).toBe('SYSTEM_PROTECTED');
    expect((await a.del('/system/permissions/system.users.view', dev.h)).body.error.details.reason).toBe('SYSTEM_PROTECTED');

    await a.put('/system/roles/editor/step-up', dev.h, { rules: [{ permission: 'content.read', mode: 'none' }] });
    const n0 = (await claimsFor(u.id)).length;
    const del = await a.del('/system/permissions/content.read', dev.h);
    expect(del.status).toBe(200);
    expect(del.body.data.key).toBe('content.read');
    expect((await claimsFor(u.id)).length).toBe(n0 + 1);
    expect((await claimsFor(u.id)).at(-1)!.payload.grants).toEqual([]);
    const role = (await a.get('/system/roles/editor', dev)).body.data;
    expect(role.permissions).toEqual([]);
    expect(role.stepUpRules).toEqual({});
    expect((await t.ds.query("SELECT 1 FROM user_grants WHERE grant_key = 'content.read'")).length).toBe(0);

    // حال ماژول خالی حذف می‌شود؛ نقش پس از برداشتن از کاربر حذف می‌شود
    expect((await a.del('/system/modules/content', dev.h)).status).toBe(200);
    await a.put(`/system/users/${u.id}/roles`, dev.h, { roles: [] });
    expect((await a.del('/system/roles/editor', dev.h)).status).toBe(200);
    expect((await a.get('/system/roles/editor', dev)).status).toBe(404);
  });

  it('آخرین دارندهٔ نقش سیستمی قفل است ولی نقش پویا نه', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const adm = await mkUser(t, 'مدیر', ['super_admin']);
    const r = await a.put(`/system/users/${adm.id}/roles`, dev.h, { roles: [] });
    expect(r.status).toBe(409);
    expect(r.body.error.details.reason).toBe('LAST_HOLDER');
    await mkRole(dev, 'dyn');
    const u = await mkUser(t, 'کاربر', ['dyn']);
    expect((await a.put(`/system/users/${u.id}/roles`, dev.h, { roles: [] })).status).toBe(200);
  });

  it('H-12 حفظ قفل super_admin (LOCKED_PERMISSION)', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const r = await a.put('/system/roles/super_admin/permissions', dev.h, { permissions: ['session.create'] });
    expect(r.status).toBe(409);
    expect(r.body.error.details.reason).toBe('LOCKED_PERMISSION');
    expect((await a.get('/system/roles/super_admin', dev)).body.data.lockedPermissions).toHaveLength(4);
  });
});

describe('step-up (۴)', () => {
  it('developer هیچ‌جا؛ super_admin با پیش‌فرض می‌خواهد؛ none برای نقش ⇒ نمی‌خواهد؛ چند نقش ⇒ یکی required کافی', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const admin = await mkUser(t, 'مدیر', ['super_admin']);
    const target = await mkUser(t, 'هدف');
    // developer: بدون توکن
    expect((await a.put(`/system/users/${target.id}/grants`, dev.h, { grants: [] })).status).toBe(200);
    // super_admin: system.role.assign پیش‌فرض required
    const need = await a.put(`/system/users/${target.id}/grants`, admin.h, { grants: ['session.create'] });
    expect(need.status).toBe(403);
    expect(need.body.error.code).toBe('AUTH_STEP_UP_REQUIRED');
    expect((await a.get('/system/me', admin)).body.data).toMatchObject({ stepUpExempt: false });
    expect(await stepOf(admin, 'system.role.assign')).toBe('required');
    expect(await stepOf(admin, 'system.users.view')).toBe('none');
    expect((await a.get('/system/me', dev)).body.data).toMatchObject({ stepUpExempt: true });
    expect(Object.values((await a.get('/system/me', dev)).body.data.stepUp).every((v) => v === 'none')).toBe(true);

    // override none برای super_admin
    const set = await a.put('/system/roles/super_admin/step-up', dev.h, { rules: [{ permission: 'system.role.assign', mode: 'none' }] });
    expect(set.status).toBe(200);
    expect(set.body.data.stepUpRules).toEqual({ 'system.role.assign': 'none' });
    expect(await stepOf(admin, 'system.role.assign')).toBe('none');
    expect((await a.put(`/system/users/${target.id}/grants`, admin.h, { grants: ['session.create'] })).status).toBe(200);

    // چند نقش: نقش دوم پیش‌فرض (required) ⇒ لازم
    await mkRole(dev, 'assigner', { permissions: ['system.role.assign'] });
    await a.put(`/system/users/${admin.id}/roles`, dev.h, { roles: ['assigner', 'super_admin'] });
    expect(await stepOf(admin, 'system.role.assign')).toBe('required');
    expect((await a.put(`/system/users/${target.id}/grants`, admin.h, { grants: [] })).body.error.code).toBe('AUTH_STEP_UP_REQUIRED');
    await a.put('/system/roles/assigner/step-up', dev.h, { rules: [{ permission: 'system.role.assign', mode: 'none' }] });
    expect(await stepOf(admin, 'system.role.assign')).toBe('none');
    // inherit حذف override
    await a.put('/system/roles/assigner/step-up', dev.h, { rules: [{ permission: 'system.role.assign', mode: 'inherit' }] });
    expect(await stepOf(admin, 'system.role.assign')).toBe('required');
  });

  it('H-04 (بدون permission): غیر developer لازم؛ developer معاف', async () => {
    const admin = await mkUser(t, 'مدیر', ['super_admin']);
    expect((await a.put('/system/me/password', admin.h, { newPassword: 'abcdefgh1' })).status).toBeLessThan(500);
    const r = await a.put('/system/me/password', admin.h, { newPassword: 'abcdefgh1' });
    expect(r.body.error?.code).toBe('AUTH_STEP_UP_REQUIRED');
  });

  it('H-04: حتی developer برای تغییر رمز خودش step-up می‌خواهد (تصمیم مالک)', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const r = await a.put('/system/me/password', dev.h, { newPassword: 'abcdefgh1' });
    expect(r.status).toBe(403);
    expect(r.body.error?.code).toBe('AUTH_STEP_UP_REQUIRED');
    const ok = await a.put('/system/me/password', await dev.step(), { newPassword: 'abcdefgh1' });
    // با step-up از guard رد می‌شود (کاربر آزمایشی حساب low ندارد ⇒ 404 از origin، نه 403)
    expect(ok.body.error?.code).not.toBe('AUTH_STEP_UP_REQUIRED');
  });

  it('تغییر قاعده فقط با system.stepup.manage؛ step_up مجوز هم همین‌طور', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    await a.post('/system/modules', dev.h, { key: 'content', title: 'محتوا' });
    await a.post('/system/permissions', dev.h, { key: 'content.read', title: 'خواندن', moduleKey: 'content' });
    await mkRole(dev, 'rule_mgr', { permissions: ['system.role.manage'] });
    const mgr = await mkUser(t, 'مدیر نقش', ['rule_mgr']);
    const tgt = await a.put('/system/roles/rule_mgr/step-up', await mgr.step(), { rules: [] });
    expect(tgt.status).toBe(403);
    expect(tgt.body.error.code).toBe('AUTH_FORBIDDEN');
    // مدیر نقش که permission.manage دارد ولی stepup.manage ندارد، step_up مجوز را نمی‌تواند عوض کند
    await a.put('/system/roles/rule_mgr/permissions', dev.h, { permissions: ['system.role.manage', 'system.permission.manage'] });
    const s = await mgr.step();
    expect((await a.patch('/system/permissions/content.read', s, { stepUp: 'none' })).status).toBe(403);
    expect((await a.patch('/system/permissions/content.read', s, { title: 'عنوان تازه' })).status).toBe(200);
    expect((await a.post('/system/permissions', s, { key: 'content.x', title: 'ایکس', moduleKey: 'content', stepUp: 'none' })).status).toBe(403);
    await a.put('/system/roles/rule_mgr/permissions', dev.h, { permissions: ['system.role.manage', 'system.permission.manage', 'system.stepup.manage'] });
    expect((await a.put('/system/roles/rule_mgr/step-up', await mgr.step(), { rules: [{ permission: 'system.users.view', mode: 'required' }] })).status).toBe(200);
    expect((await a.patch('/system/permissions/content.read', await mgr.step(), { stepUp: 'none' })).body.data.stepUp).toBe('none');
  });
});

describe('ماتریس و دسترسی مؤثر (۵)', () => {
  it('H-92: ETag/304 و version با تغییر بالا می‌رود', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const r1 = await a.get('/system/rbac/matrix', dev);
    expect(r1.status).toBe(200);
    expect(r1.body.data.modules.length).toBeGreaterThanOrEqual(7);
    expect(r1.body.data.permissions).toHaveLength(19);
    const etag = r1.headers.etag!;
    expect(etag).toBeTruthy();
    const r2 = await a.get('/system/rbac/matrix', { ...dev.h, 'If-None-Match': etag });
    expect(r2.status).toBe(304);
    await mkRole(dev, 'newrole');
    const r3 = await a.get('/system/rbac/matrix', { ...dev.h, 'If-None-Match': etag });
    expect(r3.status).toBe(200);
    expect(r3.body.data.version).toBeGreaterThan(r1.body.data.version);
    expect(r3.body.data.roles.map((r: { key: string }) => r.key)).toEqual(['developer', 'super_admin', 'newrole']);
  });

  it('H-93/H-94: منابع (role/module/grant) و stepUp نهایی', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    await mkRole(dev, 'mixed', { permissions: ['system.users.view'], modules: ['reports'] });
    const u = await mkUser(t, 'کاربر', ['mixed'], ['session.create']);
    // نقش باید هم‌چنان panel بدهد
    const r = await a.get(`/system/rbac/effective/${u.id}`, dev);
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d).toMatchObject({ userId: u.id, roles: ['mixed'], grants: ['session.create'], stepUpExempt: false });
    const by = (k: string) => d.permissions.find((p: { key: string }) => p.key === k);
    expect(by('system.users.view').sources).toEqual([{ type: 'role', ref: 'mixed', stepUp: 'none' }]);
    expect(by('system.reports.view').sources).toEqual([{ type: 'module', ref: 'reports', stepUp: 'none' }]);
    expect(by('session.create').sources).toEqual([{ type: 'grant', ref: 'session.create', stepUp: 'none' }]);
    const mine = await a.get('/system/me/access', u);
    expect(mine.status).toBe(200);
    expect(mine.body.data.permissions.map((p: { key: string }) => p.key)).toEqual(['session.create', 'system.reports.view', 'system.users.view']);
    expect((await a.get(`/system/rbac/effective/${crypto.randomUUID()}`, dev)).status).toBe(404);
    const devAccess = (await a.get('/system/me/access', dev)).body.data;
    expect(devAccess.stepUpExempt).toBe(true);
    expect(devAccess.permissions.every((p: { stepUp: string }) => p.stepUp === 'none')).toBe(true);
  });

  it('H-00 شامل stepUp/stepUpExempt؛ H-10/H-11/H-88/H-14 پویا', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    await mkRole(dev, 'viewer', { permissions: ['system.users.view'] });
    const roles = await a.get('/system/roles?pageSize=10', dev);
    expect(roles.body.meta.total).toBe(3);
    expect(roles.body.data[0]).toMatchObject({ key: 'developer', undeletable: true });
    expect(roles.body.data.find((r: { key: string }) => r.key === 'viewer').holders).toBe(0);
    const perms = await a.get('/system/permissions?pageSize=50', dev);
    expect(perms.body.meta.total).toBe(19);
    expect(perms.body.data.find((p: { key: string }) => p.key === 'session.create')).toMatchObject({ grantable: true, moduleKey: 'sessions', isSystem: true, stepUp: 'none' });
    expect((await a.get('/system/modules', dev)).body.meta.total).toBe(10);
    // نقش بدون مجوز ⇒ H-14 ممنوع، H-88 مجاز
    await mkRole(dev, 'empty');
    const e = await mkUser(t, 'خالی', ['empty']);
    expect((await a.get('/system/roles/viewer', e)).status).toBe(403);
    expect((await a.get('/system/modules', e)).status).toBe(200);
  });
});

describe('اعتبارسنجی و کلیدها (۶)', () => {
  it('کلید نامعتبر، system. برای مجوز پویا، none رزرو، کلید تکراری، ماژول ناموجود', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    expect((await a.post('/system/roles', dev.h, { key: 'Bad Key', title: 'xx' })).body.error.code).toBe('VALIDATION_FAILED');
    expect((await a.post('/system/roles', dev.h, { key: 'none', title: 'xx' })).body.error.details.fields.key).toBeTruthy();
    const sys = await a.post('/system/permissions', dev.h, { key: 'system.evil.thing', title: 'xx', moduleKey: 'users' });
    expect(sys.status).toBe(400);
    expect(sys.body.error.details.fields.key).toBeTruthy();
    expect((await a.post('/system/permissions', dev.h, { key: 'x', title: 'xx', moduleKey: 'users' })).status).toBe(400);
    const dup = await a.post('/system/roles', dev.h, { key: 'developer', title: 'xx' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details.reason).toBe('KEY_TAKEN');
    expect((await a.post('/system/modules', dev.h, { key: 'users', title: 'xx' })).body.error.details.reason).toBe('KEY_TAKEN');
    expect((await a.post('/system/permissions', dev.h, { key: 'session.create', title: 'xx', moduleKey: 'users' })).body.error.details.reason).toBe('KEY_TAKEN');
    expect((await a.post('/system/permissions', dev.h, { key: 'foo.bar', title: 'xx', moduleKey: 'nope' })).status).toBe(404);
    expect((await a.post('/system/roles', dev.h, { key: 'rr_role', title: 'xx', permissions: ['no.such'] })).status).toBe(404);
    expect((await a.post('/system/roles', dev.h, { key: 'rr_role', title: 'xx', modules: ['nomod'] })).status).toBe(404);
    expect((await a.put('/system/roles/developer/step-up', dev.h, { rules: [{ permission: 'x.y', mode: 'bad' }] })).status).toBe(400);
  });

  it('مجوز سیستمی: ماژول ثابت؛ title/stepUp/grantable قابل ویرایش؛ grantable=false grantها را می‌برد', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'کاربر', [], ['session.create']);
    const mv = await a.patch('/system/permissions/system.users.view', dev.h, { moduleKey: 'audit' });
    expect(mv.status).toBe(409);
    expect(mv.body.error.details.reason).toBe('SYSTEM_PROTECTED');
    const n0 = (await claimsFor(u.id)).length;
    const r = await a.patch('/system/permissions/session.create', dev.h, { grantable: false, title: 'ساخت جلسهٔ تازه' });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ grantable: false, title: 'ساخت جلسهٔ تازه' });
    expect((await t.ds.query("SELECT 1 FROM user_grants WHERE grant_key = 'session.create'")).length).toBe(0);
    expect((await claimsFor(u.id)).length).toBe(n0 + 1);
  });

  it('جابه‌جایی ماژول مجوز پویا: claim نقش‌های هر دو ماژول', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    await a.post('/system/modules', dev.h, { key: 'm1', title: 'یک' });
    await a.post('/system/modules', dev.h, { key: 'm2', title: 'دو' });
    await a.post('/system/permissions', dev.h, { key: 'm1.act', title: 'عمل', moduleKey: 'm1' });
    await mkRole(dev, 'role_one', { modules: ['m1'] });
    await mkRole(dev, 'role_two', { modules: ['m2'] });
    const u1 = await mkUser(t, 'یک', ['role_one']);
    const u2 = await mkUser(t, 'دو', ['role_two']);
    const n1 = (await claimsFor(u1.id)).length;
    const n2 = (await claimsFor(u2.id)).length;
    expect((await a.patch('/system/permissions/m1.act', dev.h, { moduleKey: 'm2' })).status).toBe(200);
    expect((await claimsFor(u1.id)).length).toBe(n1 + 1);
    expect((await claimsFor(u2.id)).length).toBe(n2 + 1);
    expect((await claimsFor(u2.id)).at(-1)!.payload.grants).toEqual(['m1.act']);
  });
});

describe('Idempotency-Key و audit', () => {
  it('H-13/H-85/H-89: تکرار همان کلید ⇒ همان پاسخ بدون اثر دوباره؛ بدنهٔ دیگر ⇒ 409', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const h = { ...dev.h, 'Idempotency-Key': 'key-12345678' };
    const r1 = await a.post('/system/roles', h, { key: 'idem_role', title: 'نقش' });
    const r2 = await a.post('/system/roles', h, { key: 'idem_role', title: 'نقش' });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.body.data).toEqual(r1.body.data);
    expect((await t.ds.query("SELECT 1 FROM audit_logs WHERE action = 'role.create'")).length).toBe(1);
    const r3 = await a.post('/system/roles', h, { key: 'other_role', title: 'نقش' });
    expect(r3.status).toBe(409);
    expect(r3.body.error.details.reason).toBe('IDEMPOTENCY_KEY_REUSED');
    const h2 = { ...dev.h, 'Idempotency-Key': 'key-abcdefgh' };
    expect((await a.post('/system/modules', h2, { key: 'idm', title: 'ماژول' })).status).toBe(200);
    expect((await a.post('/system/modules', h2, { key: 'idm', title: 'ماژول' })).status).toBe(200);
    const h3 = { ...dev.h, 'Idempotency-Key': 'key-zzzzzzzz' };
    expect((await a.post('/system/permissions', h3, { key: 'idm.act', title: 'عمل', moduleKey: 'idm' })).status).toBe(200);
    expect((await a.post('/system/permissions', h3, { key: 'idm.act', title: 'عمل', moduleKey: 'idm' })).status).toBe(200);
    expect((await a.post('/system/roles', { ...dev.h, 'Idempotency-Key': 'x' }, { key: 'abc_role', title: 'نقش' })).status).toBe(400);
  });

  it('audit برای هر نوشتن، بدون PII/secret', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    await a.post('/system/modules', dev.h, { key: 'aud', title: 'ماژول' });
    await a.patch('/system/modules/aud', dev.h, { title: 'ماژول ۲' });
    await a.post('/system/permissions', dev.h, { key: 'aud.read', title: 'خواندن', moduleKey: 'aud' });
    await a.patch('/system/permissions/aud.read', dev.h, { title: 'خواندن ۲' });
    await mkRole(dev, 'aud_role');
    await a.patch('/system/roles/aud_role', dev.h, { title: 'عنوان تازه' });
    await a.put('/system/roles/aud_role/modules', dev.h, { modules: ['aud'] });
    await a.put('/system/roles/aud_role/permissions', dev.h, { permissions: ['system.users.view'] });
    await a.put('/system/roles/aud_role/step-up', dev.h, { rules: [{ permission: 'aud.read', mode: 'none' }] });
    await a.del('/system/roles/aud_role', dev.h);
    await a.del('/system/permissions/aud.read', dev.h);
    await a.del('/system/modules/aud', dev.h);
    const actions = ((await t.ds.query('SELECT action, meta, summary FROM audit_logs ORDER BY at, id')) as { action: string }[]).map((r) => r.action);
    expect([...actions].sort()).toEqual([...['module.create', 'module.update', 'permission.create', 'permission.update', 'role.create', 'role.update', 'role.modules.updated', 'role.permissions.updated', 'role.stepup.updated', 'role.delete', 'permission.delete', 'module.delete']].sort());
    const all = JSON.stringify(await t.ds.query('SELECT meta, summary FROM audit_logs'));
    expect(all).not.toMatch(/Bearer|token|password|09\d{9}/i);
  });
});

describe('تست امنیت guard (۸) و مهاجرت (۷)', () => {
  it('نبود مجوز ⇒ 403 برای همهٔ endpointهای نوشتن', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    await mkRole(dev, 'plain', { permissions: ['system.users.view'] });
    const u = await mkUser(t, 'ساده', ['plain']);
    const s = await u.step();
    for (const [m, p, b] of [
      ['post', '/system/roles', { key: 'zzz_role', title: 'نقش' }],
      ['patch', '/system/roles/plain', { title: 'نقش ۲' }],
      ['delete', '/system/roles/plain', undefined],
      ['put', '/system/roles/plain/modules', { modules: [] }],
      ['put', '/system/roles/plain/step-up', { rules: [] }],
      ['post', '/system/permissions', { key: 'a.b', title: 'عنوان', moduleKey: 'users' }],
      ['patch', '/system/permissions/session.create', { title: 'عنوان' }],
      ['delete', '/system/permissions/session.create', undefined],
      ['post', '/system/modules', { key: 'zz', title: 'عنوان' }],
      ['patch', '/system/modules/users', { title: 'عنوان' }],
      ['delete', '/system/modules/users', undefined]
    ] as const) {
      const r = m === 'delete' ? await a.del(p, s) : await a[m](p, s, b);
      expect([m, p, r.status]).toEqual([m, p, 403]);
      expect(r.body.error.code).toBe('AUTH_FORBIDDEN');
    }
  });

  it('seed مهاجرت: ۷ ماژول، ۱۴ مجوز، نقش‌های قبلی سالم، سه مجوز تازه فقط developer', async () => {
    const rows = (q: string) => t.ds.query(q) as Promise<Record<string, any>[]>;
    expect((await rows('SELECT module_key FROM system_modules WHERE is_system = 1')).length).toBe(10);
    expect((await rows('SELECT permission_key FROM permissions WHERE is_system = 1')).length).toBe(19);
    const sa = (await rows("SELECT permission_key FROM role_permissions WHERE role_key = 'super_admin'")).map((r) => r.permission_key);
    expect(sa).toHaveLength(9);
    for (const p of ['system.role.manage', 'system.permission.manage', 'system.stepup.manage', 'system.sessions.moderate', 'system.points.manage', 'system.badges.manage', 'system.inbox.send', 'system.data.export']) {
      expect(sa).not.toContain(p);
      expect((await rows(`SELECT locked FROM role_permissions WHERE role_key = 'developer' AND permission_key = '${p}'`))[0]!.locked).toBe(1);
    }
    expect((await rows("SELECT undeletable FROM system_roles ORDER BY role_key")).map((r) => r.undeletable)).toEqual([1, 1]);
    expect(Number((await rows('SELECT version FROM rbac_meta'))[0]!.version)).toBe(1);
  });

  it('کش دسترسی: تغییر محلی فوراً، تغییر مستقیم DB پس از TTL', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'مدیر', ['super_admin']);
    expect((await a.get('/system/me', u)).status).toBe(200);
    await t.ds.query('DELETE FROM user_system_roles WHERE user_id = UNHEX(?)', [u.id.replace(/-/g, '')]);
    expect((await a.get('/system/me', u)).status).toBe(200); // هنوز کش
    t.clock.advance(6_000);
    expect((await a.get('/system/me', u)).status).toBe(403);
    void dev;
  });
});
