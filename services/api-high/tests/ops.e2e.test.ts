import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ENDPOINTS, type EndpointDef, mid as midTypes } from '@isra/api-types';
import { seedRbac } from '../src/db/rbac-seed';
import { csvCell } from '../src/domain/export.service';
import { type TestApp, api, failReply, mkRoleDb, mkUser, outboxTypes, rawReply, resetDb, startApp } from './helpers/app';
import { installFakeLow, installFakeMid } from './helpers/fakes';

let t: TestApp;
let a: ReturnType<typeof api>;
let low: ReturnType<typeof installFakeLow>;
let mid: ReturnType<typeof installFakeMid>;
const defs = ENDPOINTS.high as readonly EndpointDef[];
const def = (id: string) => defs.find((d) => d.id === id)!;
const LOW_SECRET = 'test-pair-low-high-0123456789abcdef0';
const MID_SECRET = 'test-pair-mid-high-0123456789abcdef0';

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
  t.clock.advance(3_700_000); // پنجره‌های rate-limit (۱ ساعت) بین تست‌ها
});

const audits = async (action?: string) => {
  const rows = (await t.ds.query(`SELECT action, target_type, target_id, target_label, meta FROM audit_logs ${action ? 'WHERE action = ?' : ''} ORDER BY at, id`, action ? [action] : [])) as any[];
  return rows.map((r) => ({ ...r, meta: typeof r.meta === 'string' ? JSON.parse(r.meta) : r.meta }));
};
const midCalls = (method: string, suffix: string) => t.fake.admin.calls.filter((c) => c.method === method && c.path.startsWith('/o/') && c.path.endsWith(suffix));
const call = (m: string, p: string, h: Record<string, string>, b?: object) => (a as any)[m === 'delete' ? 'del' : m](p, h, b);
const check = (id: string, body: any) => {
  expect(body.success, JSON.stringify(body)).toBe(true);
  const d = def(id);
  for (const it of d.list ? body.data : [body.data]) {
    const r = d.response.safeParse(it);
    expect(r.success, `${id}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(true);
  }
};
const withKey = (h: Record<string, string>, key: string) => ({ ...h, 'Idempotency-Key': key });

// ───── تصاویر حداقلی (فقط سرآیند؛ اعتبارسنجی high فقط هدر را می‌خواند) ─────
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const png = (w: number, h: number, pad = 0) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), u32(13), Buffer.from('IHDR'), u32(w), u32(h), Buffer.from([8, 6, 0, 0, 0]), u32(0), Buffer.alloc(pad)]);
const jpeg = (w: number, h: number) => {
  const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0'), Buffer.alloc(9)]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
};
const webp = (w: number, h: number) => {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(22, 4);
  b.write('WEBP', 8, 'latin1');
  b.write('VP8X', 12, 'latin1');
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
};
const img = (contentType: string, buf: Buffer) => ({ contentType, dataBase64: buf.toString('base64') });

describe('ماتریس مجوز endpointهای ۱.۶.۰', () => {
  it('developer بدون step-up؛ super_admin (پیش‌فرض بدون مجوزهای تازه) 403؛ نقش با مجوز required ⇒ AUTH_STEP_UP_REQUIRED؛ moderate (none) بدون step-up', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const admin = await mkUser(t, 'مدیر', ['super_admin']);
    const nobody = await mkUser(t, 'عادی');
    const s = mid.mk({ title: 'جلسهٔ مجوز' });
    const u = await mkUser(t, 'هدف');
    const writes: [string, string, string, object?][] = [
      ['system.sessions.manage', 'post', `/system/sessions/${s.id}/members`, { items: [{ user: { userId: u.id } }] }],
      ['system.sessions.manage', 'put', `/system/sessions/${s.id}/owner`, { userId: u.id }],
      ['system.sessions.manage', 'post', `/system/sessions/${s.id}/members/decide`, { memberIds: [randomUUID()], action: 'approve' }],
      ['system.sessions.manage', 'post', `/system/sessions/${s.id}/attendance/${u.id}/revoke`, { reason: 'اشتباه ثبت شد' }],
      ['system.sessions.manage', 'post', `/system/sessions/${s.id}/evaluations/${randomUUID()}/void`, { reason: 'نمرهٔ اشتباه' }],
      ['system.sessions.manage', 'patch', `/system/sessions/${s.id}/evaluations/${randomUUID()}`, { note: 'اصلاح', reason: 'اصلاح نمره' }],
      ['system.points.manage', 'post', `/system/users/${u.id}/points/adjust`, { delta: 5, reason: 'جبران خطا' }],
      ['system.badges.manage', 'post', '/system/badges', { key: 'perm_test', title: 'نشان آزمون', threshold: 10 }],
      ['system.inbox.send', 'post', '/system/announcements', { audience: { type: 'users', userIds: [u.id] }, title: 'سلام', body: 'پیام آزمون' }]
    ];
    for (const [perm, m, p, b] of writes) {
      const ok = await call(m, p, dev.h, b); // developer: بدون هدر step-up
      expect([p, ok.status], JSON.stringify(ok.body)).toEqual([p, 200]);
      const adm = await call(m, p, await admin.step(), b);
      expect([p, adm.status, adm.body.error?.code]).toEqual([p, 403, 'AUTH_FORBIDDEN']);
      expect((await call(m, p, await nobody.step(), b)).status).toBe(403);
      const role = `r_${perm.replace(/\W/g, '_')}`.slice(0, 32);
      await t.ds.query('DELETE FROM role_permissions WHERE role_key = ?', [role]);
      await t.ds.query('DELETE FROM system_roles WHERE role_key = ?', [role]);
      await mkRoleDb(t, role, [perm]);
      const holder = await mkUser(t, 'دارنده', [role]);
      const ns = await call(m, p, holder.h, b);
      expect([p, ns.status, ns.body.error?.code]).toEqual([p, 403, 'AUTH_STEP_UP_REQUIRED']);
    }
    // system.sessions.moderate: step-up پیش‌فرض none ⇒ بدون هدر step-up مجاز
    await mkRoleDb(t, 'moderator', ['system.sessions.moderate']);
    const mod = await mkUser(t, 'ناظر', ['moderator']);
    expect((await a.post(`/system/sessions/${s.id}/attendance`, mod.h, { userIds: [u.id], reason: 'ثبت دستی حضور' })).status).toBe(200);
    expect((await a.post(`/system/sessions/${s.id}/queue/next`, mod.h, {})).status).toBe(200);
    expect((await a.patch(`/system/sessions/${s.id}/queue/${randomUUID()}`, mod.h, { action: 'up' })).status).toBe(200);
    expect((await a.post(`/system/sessions/${s.id}/attendance`, admin.h, { userIds: [u.id], reason: 'ثبت دستی حضور' })).status).toBe(403);
    // خواندنی‌ها
    for (const p of [`/system/sessions/${s.id}/occurrences`, `/system/users/${u.id}/memberships`]) expect((await a.get(p, admin)).status).toBe(200);
    expect((await a.get(`/system/users/${u.id}/points`, admin)).status).toBe(200);
    for (const p of ['/system/badges', '/system/session-roles']) expect((await a.get(p, admin)).status).toBe(200); // بدون permission: هر نقش سیستمی
    for (const p of ['/system/badges', '/system/session-roles']) expect((await a.get(p, nobody)).status).toBe(403);
    expect((await a.get('/system/announcements', admin)).status).toBe(403);
  });

  it('guard: کاربر غیرفعال/حذف‌شده در دایرکتوری ⇒ AUTH_ACCOUNT_DISABLED (همان query دسترسی)', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    await t.ds.query("UPDATE user_directory SET status = 'disabled' WHERE user_id = UNHEX(?)", [dev.id.replace(/-/g, '')]);
    t.flush();
    const r = await a.get('/system/me', dev);
    expect([r.status, r.body.error.code]).toEqual([403, 'AUTH_ACCOUNT_DISABLED']);
  });
});

describe('H-73 افزودن مستقیم اعضا', () => {
  it('شماره از دایرکتوری؛ شماره هرگز به mid/audit نمی‌رود؛ not_found/not_active؛ تکراری ⇒ unchanged؛ شمارش‌ها کامل', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const s = mid.mk({ title: 'جلسهٔ افزودن' });
    const u1 = await mkUser(t, 'عضو یک');
    const u2 = await mkUser(t, 'عضو دو');
    const off = await mkUser(t, 'غیرفعال', [], [], { status: 'disabled' });
    const r = await a.post(`/system/sessions/${s.id}/members`, await dev.step(), {
      items: [{ user: { phone: u1.phone } }, { user: { userId: u2.id } }, { user: { phone: '09130000001' } }, { user: { phone: off.phone } }, { user: { userId: u1.id } }]
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    check('H-73', r.body);
    expect(r.body.data.items.map((i: any) => i.outcome)).toEqual(['added', 'added', 'not_found', 'not_active', 'unchanged']);
    expect(r.body.data.items[0].member.phone).toBe(u1.phone);
    expect(r.body.data.counts).toMatchObject({ added: 2, not_found: 1, not_active: 1, unchanged: 1, failed: 0 });
    expect(Object.keys(r.body.data.counts).sort()).toEqual([...midTypes.AddMemberOutcome.options].sort());
    const calls = midCalls('POST', '/members/add');
    expect(calls).toHaveLength(1); // یک فراخوانی mid
    expect(calls[0]!.body.items.map((i: any) => i.userId)).toEqual([u1.id, u2.id]);
    expect(calls[0]!.body.items[1].roles).toBeUndefined(); // ۱.۷.۰: فقط عضو
    expect(calls[0]!.body.onExisting).toBeUndefined();
    expect(calls[0]!.body.actorId).toBe(dev.id);
    expect(JSON.stringify(calls[0]!.body)).not.toMatch(/09\d{9}/);
    expect(t.fake.admin.calls.some((c) => c.path.startsWith('/c/'))).toBe(false); // بدون createMissing ⇒ بدون low
    const au = await audits('session.members_add');
    expect(au).toHaveLength(1);
    expect(au[0]).toMatchObject({ target_type: 'session', target_id: s.id });
    expect(JSON.stringify(au[0])).not.toMatch(/09\d{9}/);
  });

  it('createMissing: نیازمند system.users.manage؛ یک usersBulk سپس یک membersAdd؛ created_and_added؛ دایرکتوری به‌روز', async () => {
    const s = mid.mk();
    await mkRoleDb(t, 'sess_only', ['system.sessions.manage']);
    const sm = await mkUser(t, 'مدیر جلسه', ['sess_only']);
    const body = { items: [{ user: { phone: '09130000002' }, firstName: 'نرگس', lastName: 'تازه' }, { user: { phone: '09130000999' }, firstName: 'خطا', lastName: 'دار' }, { user: { phone: '09130000003' } }], createMissing: true };
    const no = await a.post(`/system/sessions/${s.id}/members`, await sm.step(), body);
    expect([no.status, no.body.error.code]).toEqual([403, 'AUTH_FORBIDDEN']);
    expect(t.fake.admin.calls).toHaveLength(0);
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const r = await a.post(`/system/sessions/${s.id}/members`, withKey(dev.h, 'add-key-0001'), body);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.items.map((i: any) => [i.outcome, i.code])).toEqual([
      ['created_and_added', null],
      ['failed', 'PHONE_TAKEN'],
      ['failed', 'NAME_REQUIRED']
    ]);
    const bulk = t.fake.admin.calls.filter((c) => c.path.endsWith('/admin/users/bulk'));
    expect(bulk).toHaveLength(1);
    expect(bulk[0]!.body.items.map((i: any) => i.phone)).toEqual(['09130000002', '09130000999']);
    expect(bulk[0]!.headers['idempotency-key']).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(midCalls('POST', '/members/add')).toHaveLength(1);
    const dir = (await t.ds.query("SELECT first_name, status FROM user_directory WHERE phone = '09130000002'")) as any[];
    expect(dir[0]).toMatchObject({ first_name: 'نرگس', status: 'active' });
    expect((await audits('session.members_add'))[0].meta.createdUserIds).toHaveLength(1);
  });

  it('idempotency: کلید مشتق‌شده به low و mid؛ ۵xx ⇒ کلید unknown می‌ماند و retry با همان کلید دوباره به mid می‌رود (دوباره‌سازی نه)؛ موفق ⇒ پاسخ ذخیره‌شده', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const s = mid.mk();
    const body = { items: [{ user: { phone: '09130000004' }, firstName: 'پویا', lastName: 'نو' }], createMissing: true };
    let fail = true;
    t.fake.admin.on('POST', '/o/internal/v1/admin/sessions/:id/members/add', (c) => (fail ? ((fail = false), rawReply(500)) : okAdd(c)));
    const okAdd = (c: any) => ({ __reply: true, status: 200, body: { success: true, data: { items: c.body.items.map((i: any) => ({ userId: i.userId, outcome: 'added', member: null })) } } });
    const h = withKey(dev.h, 'retry-key-0001');
    const r1 = await a.post(`/system/sessions/${s.id}/members`, h, body);
    expect(r1.status).toBe(503);
    const row = (await t.ds.query("SELECT status FROM idempotency_keys WHERE idem_key LIKE 'H-73:%'")) as any[];
    expect(row[0].status).toBe('unknown');
    const r2 = await a.post(`/system/sessions/${s.id}/members`, h, body);
    expect(r2.status).toBe(200);
    const adds = midCalls('POST', '/members/add');
    expect(adds).toHaveLength(2);
    expect(adds[0]!.headers['idempotency-key']).toBe(adds[1]!.headers['idempotency-key']);
    // کاربر ساخته‌شده در تلاش اول در دایرکتوری high نشسته ⇒ تلاش دوم دیگر low را صدا نمی‌زند
    const bulks = t.fake.admin.calls.filter((c) => c.path.endsWith('/users/bulk'));
    expect(bulks).toHaveLength(1);
    expect(bulks[0]!.headers['idempotency-key']).not.toBe(adds[0]!.headers['idempotency-key']);
    expect([...low.users.values()].filter((u) => u.phone === '09130000004')).toHaveLength(1); // ساخت دوباره نشد
    // بار سوم: پاسخ ذخیره‌شده بدون هیچ فراخوانی مبدأ
    const n = t.fake.admin.calls.length;
    const r3 = await a.post(`/system/sessions/${s.id}/members`, h, body);
    expect(r3.body.data).toEqual(r2.body.data);
    expect(t.fake.admin.calls.length).toBe(n);
    // 4xx قطعی ⇒ کلید آزاد
    t.fake.admin.on('POST', '/o/internal/v1/admin/sessions/:id/members/add', () => failReply(409, 'CONFLICT', 'قفل', { reason: 'SESSION_LOCKED' }));
    const r4 = await a.post(`/system/sessions/${s.id}/members`, withKey(dev.h, 'retry-key-0002'), { items: [{ user: { userId: dev.id } }] });
    expect([r4.status, r4.body.error.details.reason]).toEqual([409, 'SESSION_LOCKED']);
    expect(((await t.ds.query("SELECT 1 FROM idempotency_keys WHERE idem_key LIKE '%retry-key-0002'")) as any[]).length).toBe(0);
  });

  it('H-62 و H-98 هم کلید مشتق‌شده را به mid می‌فرستند', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'هدف');
    await a.post(`/system/users/${u.id}/points/adjust`, withKey(dev.h, 'adj-key-0001'), { delta: -5, reason: 'اصلاح خطا' });
    await a.post(`/system/users/${u.id}/points/adjust`, withKey(dev.h, 'adj-key-0001'), { delta: -5, reason: 'اصلاح خطا' });
    const adj = t.fake.admin.calls.filter((c) => c.path.endsWith('/points/adjust'));
    expect(adj).toHaveLength(1); // دومی از کش high
    expect(adj[0]!.headers['idempotency-key']).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const input = { title: 'جلسهٔ تازه قرآن', description: 'توضیح جلسهٔ تازه برای تست', schedule: { type: 'once', startsAt: '2026-11-10T10:00:00+03:30', endsAt: '2026-11-10T12:00:00+03:30' }, location: { label: 'مسجد جامع' } };
    await a.post('/system/sessions', withKey(dev.h, 'ses-key-0001'), { session: input });
    expect(midCalls('POST', '/admin/sessions')[0]!.headers['idempotency-key']).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('H-74/H-53/H-75..H-79/H-95/H-96 عبور به mid + audit', () => {
  it('پاسخ‌ها با schema قرارداد؛ نام‌های audit؛ ۴xx با همان reason؛ ۵xx ⇒ 503 بدون audit', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const s = mid.mk({ title: 'جلسهٔ اصلاح' });
    const u = await mkUser(t, 'عضو');
    const m = mid.addMember(s.id, { userId: u.id });
    const off = await mkUser(t, 'غیرفعال', [], [], { status: 'disabled' });
    const step = await dev.step();
    const ev = randomUUID();
    check('H-74', (await a.put(`/system/sessions/${s.id}/owner`, step, { userId: u.id, previousOwner: 'supporter' })).body);
    expect(midCalls('PUT', '/owner')[0]!.body).toMatchObject({ actorId: dev.id, userId: u.id, previousOwner: 'supporter', firstName: 'عضو' });
    expect((await a.put(`/system/sessions/${s.id}/manager`, step, { userId: u.id })).status).toBe(404); // مسیر قدیمی حذف شد
    const na = await a.put(`/system/sessions/${s.id}/owner`, step, { userId: off.id });
    expect([na.status, na.body.error.details.reason]).toEqual([409, 'USER_NOT_ACTIVE']);
    check('H-53', (await a.post(`/system/sessions/${s.id}/members/decide`, step, { memberIds: [m.id, randomUUID()], action: 'approve' })).body);
    check('H-75', (await a.get(`/system/sessions/${s.id}/occurrences`, dev)).body);
    check('H-76', (await a.post(`/system/sessions/${s.id}/attendance`, step, { userIds: [u.id], reason: 'اصلاح حضور' })).body);
    check('H-77', (await a.post(`/system/sessions/${s.id}/attendance/${u.id}/revoke`, step, { reason: 'حضور اشتباه' })).body);
    check('H-78', (await a.post(`/system/sessions/${s.id}/queue/next`, step, {})).body);
    check('H-79', (await a.patch(`/system/sessions/${s.id}/queue/${randomUUID()}`, step, { action: 'down', expectPosition: 2 })).body);
    check('H-95', (await a.post(`/system/sessions/${s.id}/evaluations/${ev}/void`, step, { reason: 'ارزیابی تکراری' })).body);
    check('H-96', (await a.patch(`/system/sessions/${s.id}/evaluations/${ev}`, step, { scores: [{ criterionId: '00000000-0000-7000-8000-000000000001', score: 6 }], reason: 'اصلاح نمره' })).body);
    check('H-70', (await a.get(`/system/sessions/${s.id}/attendance?occurrenceId=${randomUUID()}`, dev)).body);
    expect(midCalls('GET', '/attendance')[0]!.query.occurrenceId).toBeTruthy();
    for (const name of ['session.owner_transfer', 'session.members_decide', 'session.attendance_add', 'session.attendance_revoke', 'session.queue_next', 'session.queue_act', 'session.evaluation_void', 'session.evaluation_patch']) {
      const au = await audits(name);
      expect([name, au.length]).toEqual([name, 1]);
      expect(au[0]).toMatchObject({ target_type: 'session', target_id: s.id });
    }
    expect((await audits('session.evaluation_patch'))[0].meta).toMatchObject({ evalId: ev, fields: ['scores'], reason: 'اصلاح نمره' });
    const stale = await a.post(`/system/sessions/${s.id}/queue/next`, step, { expectCurrentItemId: 'stale-00' });
    expect([stale.status, stale.body.error.details.reason]).toEqual([409, 'QUEUE_STATE_CHANGED']);
    t.fake.admin.on('POST', '/o/internal/v1/admin/sessions/:id/evaluations/:evalId/void', () => rawReply(502));
    expect((await a.post(`/system/sessions/${s.id}/evaluations/${ev}/void`, step, { reason: 'ارزیابی تکراری' })).status).toBe(503);
    expect(await audits('session.evaluation_void')).toHaveLength(1);
    expect(await audits('session.queue_next')).toHaveLength(1);
  });

  it('H-66: q شماره ⇒ userId (شماره به mid نمی‌رود)؛ نام ⇒ q', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const s = mid.mk();
    const u = await mkUser(t, 'عضو');
    await a.get(`/system/sessions/${s.id}/members?q=${u.phone}&status=approved`, dev);
    expect(midCalls('GET', '/members').at(-1)!.query).toMatchObject({ userId: u.id, status: 'approved' });
    await a.get(`/system/sessions/${s.id}/members?role=teacher`, dev);
    expect(midCalls('GET', '/members').at(-1)!.query.role).toBeUndefined(); // ۱.۷.۰: فیلتر role حذف شد (به mid نمی‌رود)
    expect(midCalls('GET', '/members').at(-1)!.query.q).toBeUndefined();
    const n = midCalls('GET', '/members').length;
    expect((await a.get(`/system/sessions/${s.id}/members?q=09139999999`, dev)).body.meta.total).toBe(0);
    expect(midCalls('GET', '/members').length).toBe(n);
    await a.get(`/system/sessions/${s.id}/members?q=${encodeURIComponent('علی')}`, dev);
    expect(midCalls('GET', '/members').at(-1)!.query.q).toBe('علی');
  });
});

describe('H-52/H-97/H-98 کاربر', () => {
  it('404 برای کاربر ناموجود؛ points.adjust با audit؛ schema', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'هدف');
    check('H-52', (await a.get(`/system/users/${u.id}/memberships?status=approved`, dev)).body);
    check('H-97', (await a.get(`/system/users/${u.id}/points`, dev)).body);
    expect((await a.get(`/system/users/${randomUUID()}/points`, dev)).status).toBe(404);
    const r = await a.post(`/system/users/${u.id}/points/adjust`, await dev.step(), { delta: 15, reason: 'جبران امتیاز' });
    check('H-98', r.body);
    expect(t.fake.admin.calls.find((c) => c.path.endsWith('/points/adjust'))!.body).toEqual({ actorId: dev.id, delta: 15, reason: 'جبران امتیاز' });
    const au = (await audits('points.adjust'))[0];
    expect(au).toMatchObject({ target_type: 'user', target_id: u.id });
    expect(au.meta).toMatchObject({ delta: 15, total: 135 });
    expect((await a.post(`/system/users/${u.id}/points/adjust`, await dev.step(), { delta: 0, reason: 'صفر' })).status).toBe(400);
  });
});

describe('نشان‌ها H-32..H-37', () => {
  it('فهرست seed؛ holders از mid (خطا ⇒ ۰)؛ ساخت/ویرایش/حذف ⇒ نسخه +۱ و رویداد کاتالوگ فقط به mid/low؛ KEY_TAKEN؛ audit', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const l1 = await a.get('/system/badges', dev);
    check('H-32', l1.body);
    expect(l1.body.data.map((b: any) => b.key)).toEqual(['badge_50', 'badge_150', 'badge_300', 'badge_500']);
    mid.holders.set(l1.body.data[0].id, 7);
    expect((await a.get('/system/badges', dev)).body.data[0].holders).toBe(7);
    t.fake.admin.on('GET', '/o/internal/v1/admin/badges/holders', () => rawReply(200, {}, 1500)); // کند ⇒ timeout کوتاه
    const slow = await a.get('/system/badges', dev);
    expect(slow.status).toBe(200);
    expect(slow.body.data[0].holders).toBe(0);
    const c = await a.post('/system/badges', dev.h, { key: 'hafez_bronze', title: 'حافظ برنزی', threshold: 1000, sortOrder: 50 });
    check('H-33', c.body);
    const id = c.body.data.id as string;
    expect((await a.post('/system/badges', dev.h, { key: 'hafez_bronze', title: 'تکراری', threshold: 5 })).body.error.details.reason).toBe('KEY_TAKEN');
    check('H-34', (await a.patch(`/system/badges/${id}`, dev.h, { threshold: 900, active: false })).body);
    expect((await a.patch(`/system/badges/${randomUUID()}`, dev.h, { title: 'هیچ' })).status).toBe(404);
    const del = await a.del(`/system/badges/${l1.body.data[3].id}`, dev.h);
    check('H-35', del.body);
    const ev = (await outboxTypes(t)).filter((e) => e.type === 'badge.catalog.changed').sort((x, y) => x.payload.version - y.payload.version);
    expect(ev.map((e) => e.payload.version)).toEqual([2, 3, 4]);
    expect(ev[2]!.payload.badges.map((b: any) => b.key)).toEqual(['badge_50', 'badge_150', 'badge_300', 'hafez_bronze']);
    expect(ev[2]!.payload.badges[3]).toMatchObject({ threshold: 900, active: false, imageHash: null });
    const peers = (await t.ds.query("SELECT DISTINCT pending_peers FROM outbox_events WHERE type = 'badge.catalog.changed'")) as any[];
    expect(peers.map((p) => p.pending_peers)).toEqual(['mid,low']);
    expect((await audits()).filter((x) => x.action.startsWith('badge.')).map((x) => [x.action, x.target_type]).sort()).toEqual([
      ['badge.create', 'badge'],
      ['badge.delete', 'badge'],
      ['badge.update', 'badge']
    ]);
    expect((await audits('badge.update'))[0].meta.changes).toMatchObject({ threshold: { from: 1000, to: 900 }, active: { from: true, to: false } });
  });

  it('حداکثر ۵۰ نشان ⇒ LIMIT_REACHED', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    for (let i = 0; i < 46; i++) await t.ds.query("INSERT INTO badges (id, badge_key, title, description, threshold, active, sort_order, created_at, updated_at) VALUES (UNHEX(REPLACE(UUID(),'-','')), ?, 'ن', '', 1, 1, 1, NOW(3), NOW(3))", [`b_${i}`]);
    const r = await a.post('/system/badges', dev.h, { key: 'one_more', title: 'یکی دیگر', threshold: 3 });
    expect([r.status, r.body.error.details.reason]).toEqual([409, 'LIMIT_REACHED']);
  });

  it('تصویر: PNG/JPEG/WebP با ابعاد؛ نوع جعلی/SVG ⇒ 415؛ بزرگ ⇒ 413؛ ابعاد > ۱۰۲۴ ⇒ 400؛ internal فقط low با Content-Type دقیق', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const id = (await a.get('/system/badges', dev)).body.data[0].id as string;
    const p = await a.put(`/system/badges/${id}/image`, dev.h, img('image/png', png(256, 128)));
    check('H-36', p.body);
    expect(p.body.data.image).toMatchObject({ contentType: 'image/png', width: 256, height: 128 });
    expect(p.body.data.image.hash).toMatch(/^[a-f0-9]{64}$/);
    expect((await a.put(`/system/badges/${id}/image`, dev.h, img('image/jpeg', jpeg(300, 200)))).body.data.image).toMatchObject({ contentType: 'image/jpeg', width: 300, height: 200 });
    expect((await a.put(`/system/badges/${id}/image`, dev.h, img('image/webp', webp(512, 512)))).body.data.image).toMatchObject({ contentType: 'image/webp', width: 512, height: 512 });
    const spoof = await a.put(`/system/badges/${id}/image`, dev.h, img('image/webp', png(10, 10)));
    expect([spoof.status, spoof.body.error.code]).toEqual([415, 'UNSUPPORTED_MEDIA_TYPE']);
    const svg = await a.put(`/system/badges/${id}/image`, dev.h, img('image/png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')));
    expect([svg.status, svg.body.error.code]).toEqual([415, 'UNSUPPORTED_MEDIA_TYPE']);
    expect((await a.put(`/system/badges/${id}/image`, dev.h, { contentType: 'image/svg+xml', dataBase64: 'PHN2Zz48L3N2Zz4=AAAA' })).status).toBe(400);
    const big = await a.put(`/system/badges/${id}/image`, dev.h, img('image/png', png(10, 10, 205 * 1024)));
    expect([big.status, big.body.error.code]).toEqual([413, 'PAYLOAD_TOO_LARGE']);
    const huge = await a.put(`/system/badges/${id}/image`, dev.h, img('image/png', png(2000, 10)));
    expect([huge.status, huge.body.error.code]).toEqual([400, 'VALIDATION_FAILED']);
    // سقف بدنهٔ ۳۰۰KB فقط برای H-36؛ بقیه همچنان ۱۶KB
    expect((await a.patch(`/system/badges/${id}`, dev.h, { title: 'x'.repeat(20_000) })).status).toBe(413);
    // internal: فقط low
    const raw = await request(t.http).get(`/s/internal/v1/badges/${id}/image`).set('X-Internal-Caller', 'low').set('X-Internal-Token', LOW_SECRET).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(raw.status).toBe(200);
    expect(raw.headers['content-type']).toBe('image/webp');
    expect(raw.headers['x-content-type-options']).toBe('nosniff');
    expect((raw.body as Buffer).equals(webp(512, 512))).toBe(true);
    expect((await request(t.http).get(`/s/internal/v1/badges/${id}/image`).set('X-Internal-Caller', 'mid').set('X-Internal-Token', MID_SECRET)).status).toBe(403);
    expect((await request(t.http).get(`/s/internal/v1/badges/${id}/image`)).status).toBe(401);
    check('H-37', (await a.del(`/system/badges/${id}/image`, dev.h)).body);
    expect((await request(t.http).get(`/s/internal/v1/badges/${id}/image`).set('X-Internal-Caller', 'low').set('X-Internal-Token', LOW_SECRET)).status).toBe(404);
    const last = (await outboxTypes(t)).filter((e) => e.type === 'badge.catalog.changed').sort((x, y) => x.payload.version - y.payload.version).at(-1)!;
    expect(last.payload.badges[0].imageHash).toBeNull();
    expect(JSON.stringify(await outboxTypes(t))).not.toContain(webp(512, 512).toString('base64'));
  });
});

describe('پیام همگانی H-41/H-42/H-46', () => {
  it('all/users/role ⇒ inbox.broadcast.created فقط به low؛ session ⇒ MID_ADMIN.notify بدون outbox؛ آمار از low؛ audit', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'گیرنده');
    const r1 = await a.post('/system/announcements', dev.h, { audience: { type: 'users', userIds: [u.id, u.id] }, title: 'اطلاعیه', body: 'متن اطلاعیه', ref: 'points' });
    check('H-41', r1.body);
    expect(r1.body.data).toMatchObject({ status: 'queued', recipients: 1 });
    const r2 = await a.post('/system/announcements', dev.h, { audience: { type: 'role', role: 'developer' }, title: 'اطلاعیه نقش', body: 'متن نقش' });
    expect(r2.body.data.recipients).toBe(1);
    expect((await a.post('/system/announcements', dev.h, { audience: { type: 'role', role: 'ghost_role' }, title: 'نقش', body: 'متن' })).status).toBe(404);
    const ev = (await outboxTypes(t)).filter((e) => e.type === 'inbox.broadcast.created');
    expect(ev).toHaveLength(2);
    expect(ev.find((e) => e.payload.broadcastId === r1.body.data.id)!.payload).toMatchObject({ broadcastId: r1.body.data.id, segment: { type: 'users', userIds: [u.id] }, title: 'اطلاعیه', ref: 'points', createdBy: dev.id });
    const peers = (await t.ds.query("SELECT DISTINCT pending_peers FROM outbox_events WHERE type = 'inbox.broadcast.created'")) as any[];
    expect(peers.map((p) => p.pending_peers)).toEqual(['low']);
    const s = mid.mk();
    mid.addMember(s.id);
    mid.addMember(s.id);
    const r3 = await a.post('/system/announcements', withKey(dev.h, 'ann-key-0001'), { audience: { type: 'session', sessionId: s.id, roles: ['member'] }, title: 'به اعضا', body: 'متن جلسه' });
    expect(r3.body.data).toMatchObject({ status: 'done', recipients: 2 });
    const n = t.fake.admin.calls.find((c) => c.path.endsWith('/notify'))!;
    expect(n.body).toMatchObject({ actorId: dev.id, broadcastId: r3.body.data.id, roles: ['member'], title: 'به اعضا', ref: null });
    expect(n.headers['idempotency-key']).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await outboxTypes(t)).filter((e) => e.type === 'inbox.broadcast.created')).toHaveLength(2);
    // جلسهٔ ناموجود ⇒ 404 بدون ردیف
    expect((await a.post('/system/announcements', dev.h, { audience: { type: 'session', sessionId: randomUUID() }, title: 'هیچ', body: 'متن' })).status).toBe(404);
    const list = await a.get('/system/announcements', dev);
    check('H-42', list.body);
    expect(list.body.meta.total).toBe(3);
    low.broadcasts.set(r1.body.data.id, { status: 'done', targeted: 1, delivered: 1, read: 1 });
    const g = await a.get(`/system/announcements/${r1.body.data.id}`, dev);
    check('H-46', g.body);
    expect(g.body.data).toMatchObject({ status: 'done', delivered: 1, read: 1 });
    expect((await a.get(`/system/announcements/${r2.body.data.id}`, dev)).body.data).toMatchObject({ status: 'queued', delivered: 0 });
    t.fake.admin.on('GET', '/c/internal/v1/admin/broadcasts/:id', () => rawReply(500));
    expect((await a.get(`/system/announcements/${r1.body.data.id}`, dev)).status).toBe(503);
    const au = await audits('announcement.send');
    expect(au).toHaveLength(3);
    expect(au.find((x) => x.target_id === r1.body.data.id)).toMatchObject({ target_type: 'announcement', target_label: 'اطلاعیه' });
    expect(au.every((x) => x.target_type === 'announcement')).toBe(true);
  });

  it('audience=all حداکثر ۲ در ساعت per کاربر (جدا از سقف ۱۰)', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    for (let i = 0; i < 2; i++) expect((await a.post('/system/announcements', dev.h, { audience: { type: 'all' }, title: `همه ${i}`, body: 'متن همگانی' })).status).toBe(200);
    const r = await a.post('/system/announcements', dev.h, { audience: { type: 'all' }, title: 'سومی', body: 'متن همگانی' });
    expect([r.status, r.body.error.code]).toEqual([429, 'RATE_LIMITED']);
    expect((await a.post('/system/announcements', dev.h, { audience: { type: 'role', role: 'developer' }, title: 'نقش', body: 'متن نقش' })).status).toBe(200);
  });
});

describe('خروجی CSV H-43..H-45', () => {
  const parseCsv = (text: string) => text.replace(/^﻿/, '').trimEnd().split('\r\n');

  it('H-43: BOM، Content-Disposition، خنثی‌سازی فرمول، شمارهٔ کامل، مجوز دوم، audit بدون شماره، فیلترها', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    await mkUser(t, '=HYPERLINK("x") بد');
    await mkUser(t, '+۱ مثبت');
    const r = await request(t.http).get('/s/v1/system/users/export?status=active').set(dev.h).buffer(true);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="users-\d{8}\.csv"$/);
    expect(r.text.charCodeAt(0)).toBe(0xfeff);
    const lines = parseCsv(r.text);
    expect(lines[0]).toBe('id,firstName,lastName,phone,status,roles,grants,createdAt');
    expect(lines).toHaveLength(4);
    expect(lines.some((l) => l.includes(`"'=HYPERLINK(""x"")"`))).toBe(true);
    expect(lines.some((l) => l.includes(`,'+۱,`))).toBe(true);
    expect(lines.some((l) => l.includes(dev.phone))).toBe(true);
    const au = (await audits('export.users'))[0];
    expect(au.meta).toMatchObject({ rows: 3, filters: { status: 'active' } });
    expect(JSON.stringify(au)).not.toMatch(/09\d{9}/);
    // مجوز دوم: data.export بدون users.view ⇒ 403
    await mkRoleDb(t, 'exporter', ['system.data.export']);
    const ex = await mkUser(t, 'خروجی‌گیر', ['exporter']);
    const no = await request(t.http).get('/s/v1/system/users/export').set(await ex.step());
    expect([no.status, no.body.error.code]).toEqual([403, 'AUTH_FORBIDDEN']);
    // step-up لازم برای غیر developer
    expect((await request(t.http).get('/s/v1/system/users/export').set(ex.h)).body.error.code).toBe('AUTH_STEP_UP_REQUIRED');
  });

  it('H-43: keyset چند دسته (بدون OFFSET) و ترتیب پایدار', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const rows: unknown[] = [];
    for (let i = 0; i < 1203; i++) rows.push(`(UNHEX(REPLACE(UUID(),'-','')), '0915${String(1_000_000 + i).slice(-7)}', 'انبوه', '${i}', 'active', 1, DATE_SUB(NOW(3), INTERVAL ${i % 7} SECOND), NOW(3))`);
    await t.ds.query(`INSERT INTO user_directory (user_id, phone, first_name, last_name, status, perm_ver, created_at, updated_at) VALUES ${rows.join(',')}`);
    const r = await request(t.http).get('/s/v1/system/users/export?sort=oldest').set(dev.h).buffer(true);
    const lines = parseCsv(r.text).slice(1);
    expect(lines).toHaveLength(1204);
    expect(new Set(lines.map((l) => l.split(',')[0])).size).toBe(1204);
  });

  it('H-45 audit و H-44 جلسه؛ مجوز دوم؛ 404 جلسه به‌صورت JSON', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    await t.ds.query("INSERT INTO audit_logs (id, at, actor_id, actor_name, action, summary, meta) VALUES (UNHEX(REPLACE(UUID(),'-','')), NOW(3), NULL, 'سیستم', 'test.inject', '@SUM(A1)', '{}')");
    const r = await request(t.http).get('/s/v1/system/audit/export?action=test.').set(dev.h).buffer(true);
    expect(r.status).toBe(200);
    const lines = parseCsv(r.text);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(`'@SUM(A1)`);
    expect((await audits('export.audit'))[0].meta).toMatchObject({ rows: 1, filters: { action: 'test.' } });
    const s = mid.mk({ title: 'جلسهٔ خروجی' });
    const u = await mkUser(t, 'عضو');
    mid.addMember(s.id, { userId: u.id, name: '-عضو منفی', status: 'approved' });
    const m = await request(t.http).get(`/s/v1/system/sessions/${s.id}/export?kind=members`).set(dev.h).buffer(true);
    expect(m.status).toBe(200);
    expect(m.headers['content-disposition']).toMatch(/session-members-\d{8}\.csv/);
    const ml = parseCsv(m.text);
    expect(ml[1]).toContain(`'-عضو منفی`);
    expect(ml[1]).toContain(u.phone);
    expect((await audits('export.session'))[0]).toMatchObject({ target_type: 'session', target_id: s.id, target_label: 'جلسهٔ خروجی' });
    expect((await request(t.http).get(`/s/v1/system/sessions/${s.id}/export?kind=attendance`).set(dev.h)).status).toBe(200);
    expect((await request(t.http).get(`/s/v1/system/sessions/${s.id}/export?kind=evaluations`).set(dev.h)).status).toBe(200);
    const nf = await request(t.http).get(`/s/v1/system/sessions/${randomUUID()}/export`).set(dev.h);
    expect([nf.status, nf.body.error.code]).toEqual([404, 'NOT_FOUND']);
    await mkRoleDb(t, 'exp2', ['system.data.export', 'system.users.view']);
    const ex = await mkUser(t, 'خروجی', ['exp2']);
    expect((await request(t.http).get('/s/v1/system/audit/export').set(await ex.step())).status).toBe(403);
  });

  it('csvCell: خنثی‌سازی همهٔ پیشوندهای خطرناک و quoting', () => {
    expect(['=1', '+1', '-1', '@x', '\tx', '\rx', 'ok', 'a,b', 'q"q', null].map(csvCell)).toEqual(["'=1", "'+1", "'-1", "'@x", "'\tx", `"'\rx"`, 'ok', '"a,b"', '"q""q"', '']);
  });
});

describe('H-48 کاتالوگ مجوزهای پشتیبان', () => {
  it('از SESSION_DELEGABLE_PERMISSIONS با عنوان فارسی؛ ETag', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const r = await a.get('/system/session-roles', dev);
    check('H-48', r.body);
    expect(r.body.data.permissions.map((x: any) => x.key)).toEqual(midTypes.SESSION_DELEGABLE_PERMISSIONS.map((p) => p.key));
    expect(r.body.data.permissions.every((p: any) => /[؀-ۿ]/.test(p.title))).toBe(true);
    expect((await a.get('/system/session-roles', { ...dev.h, 'If-None-Match': r.headers.etag! })).status).toBe(304);
  });
});

describe('اصلاحات امنیتی', () => {
  const mgrRole = async () => {
    await mkRoleDb(t, 'user_mgr', ['system.users.view', 'system.users.manage']);
  };

  it('ضد تصاحب: H-25..H-29/H-51 روی دارندهٔ نقش سیستمی فقط اگر actor همهٔ مجوزهایش را دارد؛ کاربر عادی آزاد؛ developer همه', async () => {
    await mgrRole();
    const mgr = await mkUser(t, 'مدیر کاربران', ['user_mgr']);
    const admin = await mkUser(t, 'مدیر کل', ['super_admin']);
    const plain = await mkUser(t, 'کاربر عادی');
    const dev = await mkUser(t, 'توسعه', ['developer']);
    for (const x of [admin, plain, dev]) low.addUser(x);
    const sess = low.addSession(admin.id);
    const ops: [string, (id: string) => string, object?][] = [
      ['patch', (id) => `/system/users/${id}`, { firstName: 'تغییر' }],
      ['post', (id) => `/system/users/${id}/status`, { status: 'disabled' }],
      ['put', (id) => `/system/users/${id}/password`, { action: 'set', password: 'Temp-pass-123' }],
      ['post', (id) => `/system/users/${id}/logout-all`],
      ['delete', (id) => `/system/users/${id}/sessions/${sess.id}`],
      ['delete', (id) => `/system/users/${id}`]
    ];
    t.fake.admin.calls.length = 0;
    for (const [m, p, b] of ops) {
      const r = await call(m, p(admin.id), await mgr.step(), b);
      expect([m, r.status, r.body.error?.code]).toEqual([m, 403, 'AUTH_FORBIDDEN']);
      expect((await call(m, p(dev.id), await mgr.step(), b)).status).toBe(403);
    }
    expect(t.fake.admin.calls).toHaveLength(0); // هیچ اثری به low نرسید
    // کاربر بدون نقش ⇒ مجاز
    expect((await a.post(`/system/users/${plain.id}/logout-all`, await mgr.step())).status).toBe(200);
    // developer روی super_admin ⇒ مجاز
    expect((await a.post(`/system/users/${admin.id}/logout-all`, await dev.step())).status).toBe(200);
  });

  it('E2 روی برداشتن نقش: نقشی را که همهٔ مجوزهایش را ندارید نمی‌توانید بردارید', async () => {
    await mkRoleDb(t, 'assigner', ['system.role.assign', 'system.users.view']);
    await mkRoleDb(t, 'powerful', ['system.settings.edit']);
    const as = await mkUser(t, 'تخصیص‌دهنده', ['assigner']);
    const target = await mkUser(t, 'هدف', ['powerful']);
    const r = await a.put(`/system/users/${target.id}/roles`, await as.step(), { roles: [] });
    expect([r.status, r.body.error.code]).toEqual([403, 'AUTH_FORBIDDEN']);
    expect(r.body.error.details.missing).toEqual(['system.settings.edit']);
    const dev = await mkUser(t, 'توسعه', ['developer']);
    expect((await a.put(`/system/users/${target.id}/roles`, await dev.step(), { roles: [] })).status).toBe(200);
  });

  it('audit target برای permission/module (کلید نقطه‌دار دقیق)', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    await a.post('/system/modules', dev.h, { key: 'content', title: 'محتوا' });
    await a.post('/system/permissions', dev.h, { key: 'content.edit', title: 'ویرایش محتوا', moduleKey: 'content' });
    const p = (await audits('permission.create'))[0];
    expect(p).toMatchObject({ target_type: 'permission', target_id: 'content.edit', target_label: 'ویرایش محتوا' });
    expect(p.meta.key).toBe('content.edit');
    expect((await audits('module.create'))[0]).toMatchObject({ target_type: 'module', target_id: 'content' });
    check('H-40', (await a.get('/system/audit?targetType=permission', dev)).body);
  });

  it('seed مجوزها ویرایش مالک (step_up/grantable/عنوان) را overwrite نمی‌کند', async () => {
    await t.ds.query("UPDATE permissions SET step_up = 'none', title = 'عنوان مالک' WHERE permission_key = 'system.badges.manage'");
    await seedRbac(t.ds, new Date());
    const r = (await t.ds.query("SELECT step_up, title, module_key FROM permissions WHERE permission_key = 'system.badges.manage'")) as any[];
    expect(r[0]).toEqual({ step_up: 'none', title: 'عنوان مالک', module_key: 'gamification' });
    expect(((await t.ds.query("SELECT 1 FROM role_permissions WHERE role_key = 'super_admin' AND permission_key = 'system.badges.manage'")) as any[]).length).toBe(0);
  });

  it('H-20: q عددی ⇒ جست‌وجوی پیشوندی شماره (۹… ⇒ ۰۹…)', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'شماره‌دار');
    expect((await a.get(`/system/users?q=${u.phone.slice(1, 8)}`, dev)).body.data.map((x: any) => x.id)).toContain(u.id);
    expect((await a.get(`/system/users?q=${u.phone.slice(4)}`, dev)).body.data.map((x: any) => x.id)).not.toContain(u.id); // فقط پیشوند
  });
});


describe('مهاجرت روی DB تازه', () => {
  it('پیش‌فرض‌های مجوز سیستمی درست کاشته می‌شوند (session.create قابل‌دادن؛ مجوزهای دیدن بدون step-up)', async () => {
    const rows = (await t.ds.query("SELECT permission_key, grantable, step_up FROM permissions WHERE permission_key IN ('session.create','system.users.view','system.users.manage')")) as { permission_key: string; grantable: number; step_up: string }[];
    const by = Object.fromEntries(rows.map((r) => [r.permission_key, r]));
    expect(Number(by['session.create']!.grantable)).toBe(1);
    expect(by['session.create']!.step_up).toBe('none');
    expect(by['system.users.view']!.step_up).toBe('none');
    expect(by['system.users.manage']!.step_up).toBe('required');
  });
});
