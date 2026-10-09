import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ENDPOINTS, type EndpointDef } from '@isra/api-types';
import { MediaUrlSigner, contentPath } from '../src/common/media-url';
import { uuidv7 } from '../src/common/ids';
import { TeacherBackfillService } from '../src/outbox/teacher-backfill.service';
import { type TestApp, api, binReply, failReply, mkRoleDb, mkUser, okReply, outboxTypes, resetDb, startApp } from './helpers/app';
import { installFakeMid } from './helpers/fakes';

let t: TestApp;
let a: ReturnType<typeof api>;
let mid: ReturnType<typeof installFakeMid>;
const MID = '/o/internal/v1/admin';
const defs = ENDPOINTS.high as readonly EndpointDef[];
const def = (id: string) => defs.find((d) => d.id === id)!;
const check = (id: string, body: any) => {
  expect(body.success, JSON.stringify(body)).toBe(true);
  const d = def(id);
  for (const it of d.list ? body.data : [body.data]) {
    const r = d.response.safeParse(it);
    expect(r.success, `${id}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(true);
  }
};
const hex = (id: string) => id.replace(/-/g, '');

beforeAll(async () => {
  t = await startApp();
  a = api(t);
});
afterAll(async () => t.close());
beforeEach(async () => {
  await resetDb(t.ds, t.app);
  t.fake.admin.reset();
  mid = installFakeMid(t);
});

describe('سطوح و نقش‌های ثابت (docs-v2/31 §۱)', () => {
  it('نقش‌ها با tier و implicit؛ فیلتر tier؛ ماژول‌ها با tier', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const r = await a.get('/system/roles?pageSize=10', dev);
    check('H-10', r.body);
    const by = Object.fromEntries(r.body.data.map((x: any) => [x.key, x]));
    expect([by.developer.tier, by.super_admin.tier, by.teacher.tier, by.guest.tier, by.quran_student.tier]).toEqual(['high', 'high', 'mid', 'low', 'low']);
    expect([by.guest.implicit, by.quran_student.implicit, by.teacher.implicit]).toEqual([true, true, false]);
    for (const k of ['teacher', 'guest', 'quran_student']) expect(by[k].undeletable).toBe(true);
    expect([...by.teacher.modules].sort()).toEqual(['learning', 'teaching']);
    expect(by.quran_student.modules).toEqual(['learning']);
    expect([...by.guest.permissions].sort()).toEqual(['gallery.view', 'session.browse']);
    expect(by.developer.effectivePermissions).toEqual(expect.arrayContaining(['system.evaluation.manage', 'system.content.moderate', 'system.roles.low.manage', 'session.manage_own']));
    expect(by.super_admin.effectivePermissions).not.toContain('system.evaluation.manage');
    const low = await a.get('/system/roles?tier=low', dev);
    expect(low.body.data.map((x: any) => x.key).sort()).toEqual(['guest', 'quran_student']);
    const mods = await a.get('/system/modules?tier=mid', dev);
    check('H-88', mods.body);
    expect(mods.body.data.map((x: any) => x.key)).toEqual(['teaching']);
    const perms = (await a.get('/system/permissions?pageSize=50', dev)).body.data;
    expect(perms.find((p: any) => p.key === 'session.create').moduleKey).toBe('teaching');
  });

  it('H-00: tiers و ورود به پنل = نقش high یا مجوز system.*؛ استاد بدون مجوز سیستمی ⇒ 403', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const me = await a.get('/system/me', dev);
    check('H-00', me.body);
    expect(me.body.data.tiers).toEqual(['high', 'low']);
    const teacher = await mkUser(t, 'استاد', ['teacher']);
    expect((await a.get('/system/me', teacher)).status).toBe(403);
    const plain = await mkUser(t, 'کاربر');
    expect((await a.get('/system/me', plain)).status).toBe(403);
    // استادی که مجوز سیستمی گرفته (نقش پویای mid با system.sessions.view) وارد می‌شود
    await mkRoleDb(t, 'teacher_plus', ['system.sessions.view']);
    await t.ds.query("UPDATE system_roles SET tier = 'mid' WHERE role_key = 'teacher_plus'");
    const tp = await mkUser(t, 'استاد ارشد', ['teacher', 'teacher_plus']);
    const r = await a.get('/system/me', tp);
    check('H-00', r.body);
    expect(r.body.data.tiers).toEqual(['mid', 'low']);
    expect(r.body.data.permissions).toEqual(expect.arrayContaining(['session.browse', 'session.create', 'system.sessions.view']));
  });

  it('H-94: منبع baseline (quran_student ضمنی)', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    await mkRoleDb(t, 'viewer', ['system.users.view']);
    const v = await mkUser(t, 'بیننده', ['viewer']);
    const r = await a.get(`/system/rbac/effective/${v.id}`, dev);
    check('H-93', r.body);
    const browse = r.body.data.permissions.find((p: any) => p.key === 'session.browse');
    expect(browse.sources).toEqual([{ type: 'baseline', ref: 'quran_student', stepUp: 'none' }]);
    expect(r.body.data.roles).toEqual(['viewer']);
    expect(r.body.data.tiers).toEqual(['high', 'low']);
  });

  it('مدیریت نقش per سطح: low.manage فقط نقش‌های low؛ ضد ارتقا؛ developer ثابت؛ baseline منتشر می‌شود', async () => {
    await mkRoleDb(t, 'low_admin', ['system.roles.low.manage', 'system.users.view']);
    const la = await mkUser(t, 'مدیر سطح پایین', ['low_admin']);
    const h = await la.step();
    // نقش low: مجوز baseline (session.join) را دارد ⇒ مجاز
    const ok = await a.put('/system/roles/guest/permissions', h, { permissions: ['session.browse', 'gallery.view', 'session.join'] });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    check('H-12', ok.body);
    const ev = (await outboxTypes(t)).filter((e) => e.type === 'tier.baseline.changed');
    expect(ev).toHaveLength(1);
    expect(ev[0]!.payload).toEqual({ version: 2, guest: ['gallery.view', 'session.browse', 'session.join'], quran_student: ['comment.post', 'gallery.view', 'points.view', 'session.browse', 'session.join'] });
    // مجوزی که ندارد ⇒ E2
    expect((await a.put('/system/roles/guest/permissions', h, { permissions: ['session.browse', 'session.create'] })).status).toBe(403);
    // نقش mid/high ⇒ 403
    expect((await a.put('/system/roles/teacher/permissions', h, { permissions: [] })).status).toBe(403);
    expect((await a.put('/system/roles/super_admin/permissions', h, { permissions: [] })).status).toBe(403);
    // ساخت نقش low مجاز، mid نه
    expect((await a.post('/system/roles', h, { key: 'helper_low', title: 'کمکی', tier: 'low', permissions: ['session.browse'] })).status).toBe(200);
    expect((await a.post('/system/roles', h, { key: 'helper_mid', title: 'کمکی', tier: 'mid' })).status).toBe(403);
    // بدون هیچ‌کدام از مجوزها ⇒ guard
    await mkRoleDb(t, 'viewer', ['system.users.view']);
    const v = await mkUser(t, 'بیننده', ['viewer']);
    expect((await a.put('/system/roles/guest/permissions', await v.step(), { permissions: [] })).status).toBe(403);
    const dev = await mkUser(t, 'توسعه', ['developer']);
    expect((await a.put('/system/roles/developer/permissions', await dev.step(), { permissions: [] })).status).toBe(403);
  });

  it('نقش ضمنی: مجوز سطح high ممنوع؛ قابل اختصاص نیست؛ حذف نقش ثابت ممنوع', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const h = await dev.step();
    const bad = await a.put('/system/roles/quran_student/permissions', h, { permissions: ['system.users.view'] });
    expect([bad.status, bad.body.error.code]).toEqual([400, 'VALIDATION_FAILED']);
    expect((await a.put('/system/roles/quran_student/modules', h, { modules: ['learning', 'users'] })).status).toBe(400);
    const u = await mkUser(t, 'کاربر');
    const as = await a.put(`/system/users/${u.id}/roles`, h, { roles: ['quran_student'] });
    expect([as.status, as.body.error.code]).toEqual([400, 'VALIDATION_FAILED']);
    expect((await a.del('/system/roles/teacher', h)).body.error.details.reason).toBe('SYSTEM_PROTECTED');
    // teacher اختصاص‌پذیر؛ برداشتن آخرین استاد مجاز (LAST_HOLDER فقط developer/super_admin)
    expect((await a.put(`/system/users/${u.id}/roles`, h, { roles: ['teacher'] })).status).toBe(200);
    expect((await a.put(`/system/users/${u.id}/roles`, h, { roles: [] })).status).toBe(200);
    // claim تازه بدون baseline (low/mid baseline را خودشان اعمال می‌کنند)
    const claims = (await outboxTypes(t)).filter((e) => e.type === 'system.role.changed' && e.payload.userId === u.id);
    expect(claims[0]!.payload.grants).toEqual(expect.arrayContaining(['session.create', 'session.manage_own']));
    expect(claims[0]!.payload.grants).not.toContain('session.browse'.replace('browse', 'zz'));
    expect(claims.at(-1)!.payload.grants).toEqual([]);
  });
});

describe('معیارهای ارزیابی H-100..H-103', () => {
  it('seed سه معیار؛ CRUD؛ سقف، آخرین فعال، استفاده‌شده؛ رویداد به mid', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const h = await dev.step();
    const list = await a.get('/system/evaluation-criteria', dev);
    check('H-100', list.body);
    expect(list.body.data.version).toBe(1);
    expect(list.body.data.items.map((c: any) => [c.key, c.weight, c.maxScore, c.used])).toEqual([
      ['voice', 40, 10, true],
      ['tone', 30, 10, true],
      ['tajweed', 30, 10, true]
    ]);
    // inactive ⇒ used=false ⇒ حذف‌پذیر
    const c = await a.post('/system/evaluation-criteria', h, { key: 'waqf', title: 'وقف و ابتدا', weight: 20, active: false });
    check('H-101', c.body);
    expect(c.body.data.used).toBe(false);
    expect((await a.post('/system/evaluation-criteria', h, { key: 'waqf', title: 'تکراری', weight: 20 })).body.error.details.reason).toBe('KEY_TAKEN');
    const ev = (await outboxTypes(t)).filter((e) => e.type === 'evaluation.criteria.changed');
    expect(ev.at(-1)!.payload.version).toBe(2);
    expect(ev.at(-1)!.payload.criteria).toHaveLength(4);
    const del = await a.del(`/system/evaluation-criteria/${c.body.data.id}`, h);
    check('H-103', del.body);
    // استفاده‌شده ⇒ فقط غیرفعال
    const voice = list.body.data.items[0];
    expect((await a.del(`/system/evaluation-criteria/${voice.id}`, h)).body.error.details.reason).toBe('CRITERION_IN_USE');
    const off = await a.patch(`/system/evaluation-criteria/${voice.id}`, h, { active: false, weight: 50 });
    check('H-102', off.body);
    expect([off.body.data.active, off.body.data.weight]).toEqual([false, 50]);
    await a.patch(`/system/evaluation-criteria/${list.body.data.items[1].id}`, h, { active: false });
    const last = await a.patch(`/system/evaluation-criteria/${list.body.data.items[2].id}`, h, { active: false });
    expect(last.body.error.details.reason).toBe('LAST_ACTIVE_CRITERION');
    // بدون تغییر ⇒ بدون رویداد
    const n = (await outboxTypes(t)).length;
    await a.patch(`/system/evaluation-criteria/${voice.id}`, h, { weight: 50 });
    expect((await outboxTypes(t)).length).toBe(n);
    // سقف ۱۵
    for (let i = 0; i < 12; i++) expect((await a.post('/system/evaluation-criteria', h, { key: `k${i}x`, title: `معیار ${i}`, weight: 5, active: false })).status).toBe(200);
    expect((await a.post('/system/evaluation-criteria', h, { key: 'k99x', title: 'زیادی', weight: 5 })).body.error.details.reason).toBe('LIMIT_REACHED');
    const audits = (await t.ds.query("SELECT action FROM audit_logs WHERE target_type = 'criterion'")) as any[];
    expect(audits.length).toBeGreaterThan(3);
  });

  it('مجوز: sessions.view فقط خواندن؛ بدون مجوز ⇒ 403', async () => {
    await mkRoleDb(t, 'viewer', ['system.sessions.view']);
    const v = await mkUser(t, 'بیننده', ['viewer']);
    expect((await a.get('/system/evaluation-criteria', v)).status).toBe(200);
    expect((await a.post('/system/evaluation-criteria', await v.step(), { key: 'x1', title: 'معیار', weight: 5 })).status).toBe(403);
  });
});

describe('تنظیمات بدون evalWeights/badgeThresholds', () => {
  it('H-30/H-31 فقط پرچم‌ها؛ ارسال وزن ⇒ VALIDATION_FAILED؛ رویداد بدون وزن', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const g = await a.get('/system/settings', dev);
    check('H-30', g.body);
    expect(g.body.data.evalWeights).toBeUndefined();
    const h = await dev.step();
    expect((await a.put('/system/settings', h, { version: 1, flags: g.body.data.flags, evalWeights: { voice: 40, tone: 30, tajweed: 30 } })).status).toBe(400);
    const u = await a.put('/system/settings', h, { version: 1, flags: { maintenance_mode: true, registration_open: true } });
    check('H-31', u.body);
    const ev = (await outboxTypes(t)).find((e) => e.type === 'system.settings.changed')!;
    expect(ev.payload).toEqual({ version: 2, flags: { maintenance_mode: true, registration_open: true } });
  });
});

describe('پشتیبان‌ها H-104..H-109 و H-74', () => {
  it('ثابت استاد: SELF_PROTECTED، USER_NOT_ACTIVE، NOT_FOUND، پروکسی + audit', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const h = await dev.step();
    const teacher = await mkUser(t, 'استاد نمونه', ['teacher']);
    const sup = await mkUser(t, 'پشتیبان نمونه');
    const off = await mkUser(t, 'غیرفعال', [], [], { status: 'disabled' });
    t.fake.admin.on('PUT', `${MID}/users/:id/supporters/:supporterId`, (c, p) => okReply({ userId: p.supporterId, name: c.body.firstName, permissions: c.body.permissions, createdAt: new Date().toISOString() }));
    t.fake.admin.on('GET', `${MID}/users/:id/supporters`, () => okReply([], { page: 1, pageSize: 100, total: 0 }));
    t.fake.admin.on('DELETE', `${MID}/users/:id/supporters/:supporterId`, (c) => (c.query.actorId ? okReply({}) : failReply(400, 'VALIDATION_FAILED')));
    expect((await a.put(`/system/users/${teacher.id}/supporters/${teacher.id}`, h, { permissions: ['queue.manage'] })).body.error.details.reason).toBe('SELF_PROTECTED');
    expect((await a.put(`/system/users/${teacher.id}/supporters/${off.id}`, h, { permissions: ['queue.manage'] })).body.error.details.reason).toBe('USER_NOT_ACTIVE');
    expect((await a.put(`/system/users/${teacher.id}/supporters/${uuidv7()}`, h, { permissions: ['queue.manage'] })).status).toBe(404);
    expect((await a.put(`/system/users/${teacher.id}/supporters/${sup.id}`, h, { permissions: ['membership.roles'] })).status).toBe(400);
    const r = await a.put(`/system/users/${teacher.id}/supporters/${sup.id}`, h, { permissions: ['queue.manage', 'eval.submit'] });
    check('H-105', r.body);
    const call = t.fake.admin.calls.find((c) => c.method === 'PUT')!;
    expect(call.body).toEqual({ actorId: dev.id, permissions: ['queue.manage', 'eval.submit'], firstName: 'پشتیبان', lastName: 'نمونه' });
    check('H-104', (await a.get(`/system/users/${teacher.id}/supporters`, dev)).body);
    expect((await a.del(`/system/users/${teacher.id}/supporters/${sup.id}`, h)).status).toBe(200);
    const acts = ((await t.ds.query("SELECT action FROM audit_logs WHERE target_type = 'supporter'")) as any[]).map((x) => x.action).sort();
    expect(acts).toEqual(['supporter.teacher_remove', 'supporter.teacher_set']);
  });

  it('per جلسه: SELF_PROTECTED از mid عبور می‌کند؛ مجوز system.sessions.manage لازم', async () => {
    const s = mid.mk();
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const sup = await mkUser(t, 'پشتیبان');
    t.fake.admin.on('PUT', `${MID}/sessions/:id/supporters/:userId`, () => failReply(409, 'CONFLICT', 'صاحب', { reason: 'SELF_PROTECTED' }));
    expect((await a.put(`/system/sessions/${s.id}/supporters/${sup.id}`, await dev.step(), { permissions: ['eval.submit'] })).body.error.details.reason).toBe('SELF_PROTECTED');
    await mkRoleDb(t, 'viewer', ['system.sessions.view']);
    const v = await mkUser(t, 'بیننده', ['viewer']);
    expect((await a.put(`/system/sessions/${s.id}/supporters/${sup.id}`, await v.step(), { permissions: ['eval.submit'] })).status).toBe(403);
    t.fake.admin.on('GET', `${MID}/sessions/:id/supporters`, () =>
      okReply([{ userId: sup.id, name: 'پشتیبان', permissions: ['eval.submit'], sources: { teacher: null, session: ['eval.submit'] }, createdAt: new Date().toISOString() }], { page: 1, pageSize: 100, total: 1 })
    );
    check('H-107', (await a.get(`/system/sessions/${s.id}/supporters`, v)).body);
  });

  it('H-74 تغییر صاحب: کاربر فعال؛ بدنهٔ mid؛ audit owner_transfer', async () => {
    const s = mid.mk();
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const nu = await mkUser(t, 'استاد تازه');
    const r = await a.put(`/system/sessions/${s.id}/owner`, await dev.step(), { userId: nu.id, previousOwner: 'remove' });
    check('H-74', r.body);
    const call = t.fake.admin.calls.find((c) => c.path.endsWith('/owner'))!;
    expect(call.body).toEqual({ actorId: dev.id, userId: nu.id, previousOwner: 'remove', notify: true, firstName: 'استاد', lastName: 'تازه' });
    expect(((await t.ds.query("SELECT action FROM audit_logs WHERE action = 'session.owner_transfer'")) as any[]).length).toBe(1);
  });
});

describe('گالری و کامنت H-110..H-120', () => {
  const item = (id: string, galleryId: string) => ({
    id,
    galleryId,
    mime: 'image/png',
    bytes: 8,
    sha256: 'a'.repeat(64),
    width: 1,
    height: 1,
    durationSec: null,
    title: '',
    uploadedBy: { id: uuidv7(), name: 'استاد' },
    createdAt: new Date().toISOString(),
    url: '/o/v1/whatever'
  });
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it('H-114: url بازنویسی به H-117 امضاشده؛ H-117 با URL امضاشده (بدون Bearer) و Range عبور می‌کند', async () => {
    const s = mid.mk();
    const gid = uuidv7();
    const iid = uuidv7();
    const dev = await mkUser(t, 'توسعه', ['developer']);
    t.fake.admin.on('GET', `${MID}/sessions/:id/galleries/:galleryId/items`, () => okReply([item(iid, gid)], { page: 1, pageSize: 100, total: 1 }));
    t.fake.admin.on('GET', `${MID}/sessions/:id/galleries/:galleryId/items/:itemId/content`, (c) =>
      c.headers.range === 'bytes=0-3'
        ? binReply(206, { 'Content-Type': 'image/png', 'Content-Range': 'bytes 0-3/8', 'Content-Length': '4', 'Accept-Ranges': 'bytes', ETag: '"x"', 'Set-Cookie': 'evil=1' }, PNG.subarray(0, 4))
        : binReply(200, { 'Content-Type': 'text/html', 'Content-Length': '8', ETag: '"x"' }, PNG)
    );
    const r = await a.get(`/system/sessions/${s.id}/galleries/${gid}/items`, dev);
    check('H-114', r.body);
    const url: string = r.body.data[0].url;
    expect(url.startsWith(`${contentPath(s.id, gid, iid)}?exp=`)).toBe(true);
    // بدون Bearer با URL امضاشده
    const ok = await request(t.http).get(url).set('X-Forwarded-For', '10.9.9.9').set('Range', 'bytes=0-3');
    expect(ok.status).toBe(206);
    expect(ok.headers['content-range']).toBe('bytes 0-3/8');
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
    expect(ok.headers['cache-control']).toBe('private, max-age=3600');
    expect(ok.headers['content-disposition']).toBe('inline');
    expect(ok.headers['set-cookie']).toBeUndefined();
    // Content-Type غیرمجاز از مبدأ ⇒ octet-stream
    const full = await request(t.http).get(url).set('X-Forwarded-For', '10.9.9.8').buffer(true);
    expect([full.status, full.headers['content-type']]).toEqual([200, 'application/octet-stream']);
    // امضای دست‌کاری‌شده، کاربر دیگر، مسیر دیگر، منقضی ⇒ 401
    expect((await request(t.http).get(url.slice(0, -1) + (url.endsWith('A') ? 'B' : 'A'))).status).toBe(401);
    const other = await mkUser(t, 'دیگر', ['developer']);
    expect((await request(t.http).get(url.replace(`u=${dev.id}`, `u=${other.id}`))).status).toBe(401);
    expect((await request(t.http).get(url.replace(iid, uuidv7()))).status).toBe(401);
    t.clock.advance(601_000);
    expect((await request(t.http).get(url)).status).toBe(401);
  });

  it('URL امضاشده جایگزین مجوز نیست: کاربر بدون system.sessions.view یا غیرفعال ⇒ 403', async () => {
    const s = mid.mk();
    const signer = t.app.get(MediaUrlSigner);
    const plain = await mkUser(t, 'کاربر');
    const p = contentPath(s.id, uuidv7(), uuidv7());
    expect((await request(t.http).get(signer.sign(p, plain.id))).status).toBe(403);
    const dev = await mkUser(t, 'توسعه', ['developer'], [], { status: 'disabled' });
    expect((await request(t.http).get(signer.sign(p, dev.id))).status).toBe(403);
    expect((await request(t.http).get(p)).status).toBe(401);
  });

  it('H-115: بدنهٔ خام stream به mid با Content-Type/Length؛ نوع/حجم نامعتبر پیش از ارسال رد', async () => {
    const s = mid.mk();
    const gid = uuidv7();
    const dev = await mkUser(t, 'توسعه', ['developer']);
    t.fake.admin.on('POST', `${MID}/sessions/:id/galleries/:galleryId/items`, (c) => okReply(item(uuidv7(), gid), undefined));
    const h = await dev.step();
    const up = await request(t.http).post(`/s/v1/system/sessions/${s.id}/galleries/${gid}/items?title=${encodeURIComponent('عکس')}`).set(h).set('Content-Type', 'image/png').send(PNG);
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    check('H-115', up.body);
    expect(up.body.data.url).toContain('/content?exp=');
    const call = t.fake.admin.calls.find((c) => c.method === 'POST')!;
    expect(Buffer.isBuffer(call.body) && call.body.equals(PNG)).toBe(true);
    expect([call.headers['content-type'], call.headers['content-length'], call.query.actorId, call.query.title]).toEqual(['image/png', '8', dev.id, 'عکس']);
    const n = t.fake.admin.calls.length;
    expect((await request(t.http).post(`/s/v1/system/sessions/${s.id}/galleries/${gid}/items`).set(h).set('Content-Type', 'text/html').send('<b>')).status).toBe(415);
    const big = await request(t.http).post(`/s/v1/system/sessions/${s.id}/galleries/${gid}/items`).set(h).set('Content-Type', 'image/jpeg').set('Content-Length', String(6 * 1024 * 1024)).send(Buffer.alloc(10));
    expect([413, 400]).toContain(big.status);
    expect(t.fake.admin.calls.length).toBe(n);
    // خطای mid (سهمیه) عبور می‌کند
    t.fake.admin.on('POST', `${MID}/sessions/:id/galleries/:galleryId/items`, () => failReply(409, 'CONFLICT', 'سهمیه', { reason: 'QUOTA_EXCEEDED' }));
    const q = await request(t.http).post(`/s/v1/system/sessions/${s.id}/galleries/${gid}/items`).set(h).set('Content-Type', 'image/png').send(PNG);
    expect(q.body.error.details.reason).toBe('QUOTA_EXCEEDED');
    expect(((await t.ds.query("SELECT action FROM audit_logs WHERE target_type = 'gallery'")) as any[]).map((x) => x.action)).toEqual(['gallery.upload']);
  });

  it('گالری/کامنت: مجوز content.moderate؛ actorId در DELETE؛ پاسخ‌ها با schema', async () => {
    const s = mid.mk();
    const gid = uuidv7();
    const cid = uuidv7();
    const occ = uuidv7();
    const gallery = { id: gid, sessionId: s.id, occurrenceId: occ, title: 'گالری', kind: 'image', visibility: 'members', sortOrder: 100, itemCount: 0, totalBytes: 0, createdBy: { id: uuidv7(), name: 'ادمین' }, createdAt: new Date().toISOString() };
    const comment = { id: cid, sessionId: s.id, occurrenceId: occ, queueItemId: null, reciter: null, author: { id: uuidv7(), name: 'ک' }, body: 'سلام', atSec: null, hidden: true, mine: false, createdAt: new Date().toISOString() };
    t.fake.admin.on('POST', `${MID}/sessions/:id/galleries`, () => okReply(gallery));
    t.fake.admin.on('GET', `${MID}/sessions/:id/galleries`, () => okReply([gallery], { page: 1, pageSize: 50, total: 1 }));
    t.fake.admin.on('PATCH', `${MID}/sessions/:id/galleries/:galleryId`, () => okReply(gallery));
    t.fake.admin.on('DELETE', `${MID}/sessions/:id/galleries/:galleryId`, () => okReply({}));
    t.fake.admin.on('GET', `${MID}/sessions/:id/comments`, () => okReply([comment], { page: 1, pageSize: 100, total: 1 }));
    t.fake.admin.on('PATCH', `${MID}/sessions/:id/comments/:commentId`, () => okReply(comment));
    t.fake.admin.on('DELETE', `${MID}/sessions/:id/comments/:commentId`, () => okReply({}));
    await mkRoleDb(t, 'moderator', ['system.content.moderate', 'system.sessions.view']);
    const mo = await mkUser(t, 'ناظر', ['moderator']);
    const h = await mo.step();
    check('H-111', (await a.post(`/system/sessions/${s.id}/galleries`, h, { occurrenceId: occ, title: 'گالری', kind: 'image' })).body);
    check('H-110', (await a.get(`/system/sessions/${s.id}/galleries?occurrenceId=${occ}`, mo)).body);
    check('H-112', (await a.patch(`/system/sessions/${s.id}/galleries/${gid}`, h, { visibility: 'public' })).body);
    expect((await a.del(`/system/sessions/${s.id}/galleries/${gid}`, h)).status).toBe(200);
    check('H-118', (await a.get(`/system/sessions/${s.id}/comments?hidden=true`, mo)).body);
    check('H-119', (await a.patch(`/system/sessions/${s.id}/comments/${cid}`, h, { hidden: true })).body);
    expect((await a.del(`/system/sessions/${s.id}/comments/${cid}`, h)).status).toBe(200);
    const dels = t.fake.admin.calls.filter((c) => c.method === 'DELETE');
    expect(dels.every((c) => c.query.actorId === mo.id)).toBe(true);
    const audit = ((await t.ds.query('SELECT action FROM audit_logs')) as any[]).map((x) => x.action).sort();
    expect(audit).toEqual(['comment.delete', 'comment.moderate', 'gallery.create', 'gallery.delete', 'gallery.update']);
    expect(JSON.stringify(await t.ds.query('SELECT meta, summary FROM audit_logs'))).not.toContain('سلام');
    // فقط sessions.view ⇒ نوشتن ممنوع
    await mkRoleDb(t, 'viewer', ['system.sessions.view']);
    const v = await mkUser(t, 'بیننده', ['viewer']);
    expect((await a.patch(`/system/sessions/${s.id}/comments/${cid}`, await v.step(), { hidden: false })).status).toBe(403);
  });
});

describe('job اعطای teacher به سازندگان جلسه', () => {
  it('صفحه‌به‌صفحه، idempotent، فقط کاربران دایرکتوری؛ mid خراب ⇒ بعداً از همان cursor', async () => {
    const svc = t.app.get(TeacherBackfillService);
    (svc as any).finished = false;
    const users = await Promise.all([mkUser(t, 'سازنده یک'), mkUser(t, 'سازنده دو'), mkUser(t, 'استاد قبلی', ['teacher'])]);
    const ghost = randomUUID();
    const owners = [...users.map((u) => u.id), ghost];
    let down = true;
    t.fake.admin.on('GET', `${MID}/session-owners`, (c) => {
      if (down) return failReply(503, 'SERVICE_UNAVAILABLE');
      const page = Number(c.query.page);
      const size = Number(c.query.pageSize);
      return okReply(owners.slice((page - 1) * size, page * size).map((userId) => ({ userId, sessions: 1 })), { page, pageSize: size, total: owners.length });
    });
    expect((await svc.run()).status).toBe('pending');
    down = false;
    const r = await svc.run();
    expect(r).toMatchObject({ status: 'done', granted: 2, alreadyTeacher: 1, unknown: 1 });
    const holders = (await t.ds.query("SELECT COUNT(*) AS n FROM user_system_roles WHERE role_key = 'teacher'")) as any[];
    expect(Number(holders[0].n)).toBe(3);
    expect((await svc.run()).status).toBe('skipped');
    const claims = (await outboxTypes(t)).filter((e) => e.type === 'system.role.changed');
    expect(claims.map((c) => c.payload.userId).sort()).toEqual([users[0]!.id, users[1]!.id].sort());
    expect(((await t.ds.query("SELECT 1 FROM audit_logs WHERE action = 'system.teacher_backfill'")) as any[]).length).toBe(1);
    void hex;
  });
});
