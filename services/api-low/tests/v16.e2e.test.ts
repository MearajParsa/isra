import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ENDPOINTS, type EndpointDef, internal } from '@isra/api-types';
import { BadgesService } from '../src/badges/badges.service';
import { sha256 } from '../src/common/crypto';
import { uuidToBuf, uuidv7 } from '../src/common/ids';
import { BroadcastService } from '../src/messaging/broadcast.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { ANDROID, type Login, type TestApp, WEB_MAIN, freshIp, freshPhone, loginOtp, resetDb, startApp } from './helpers/app';
import { type FakeMid, startFakeMid } from './helpers/fake-mid';

const MID = 'test-pair-low-mid-0123456789abcdef01';
const HIGH = 'test-pair-low-high-0123456789abcdef0';
let t: TestApp;
let mid: FakeMid;
let high: FakeMid;
const def = (id: string) => (ENDPOINTS.low as readonly EndpointDef[]).find((d) => d.id === id)!;

beforeAll(async () => {
  mid = await startFakeMid();
  high = await startFakeMid();
  t = await startApp({ INTERNAL_URL_MID: mid.url, INTERNAL_URL_HIGH: high.url, INTERNAL_TIMEOUT_MS: '500' });
});
afterAll(async () => {
  await t.close();
  await mid.close();
  await high.close();
});
beforeEach(async () => {
  await resetDb(t.ds);
  t.app.get(BadgesService).invalidate();
  mid.hits.length = 0;
  high.hits.length = 0;
  mid.handler = () => undefined;
  high.handler = () => undefined;
});

type Caller = 'mid' | 'high' | 'low';
const internalCall = (method: 'get' | 'post', path: string, caller: Caller, token = caller === 'high' ? HIGH : MID) =>
  (request(t.http) as unknown as Record<string, (p: string) => request.Test>)[method]!(`/c/internal/v1${path}`).set('X-Internal-Caller', caller).set('X-Internal-Token', token).set('X-Forwarded-For', freshIp());
const event = (type: string, payload: Record<string, unknown>, eventId = randomUUID()) => ({ eventId, type, occurredAt: new Date().toISOString(), payload });
const send = (caller: 'mid' | 'high', body: unknown) => internalCall('post', '/events', caller).send(body as object);
const outbox = async (type: string): Promise<Record<string, any>[]> => {
  const rows = (await t.ds.query('SELECT payload FROM outbox_events WHERE type = ? ORDER BY created_at, id', [type])) as { payload: unknown }[];
  return rows.map((r) => (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload) as Record<string, any>);
};
const count = async (sql: string, args: unknown[] = []) => Number(((await t.ds.query(sql, args)) as { n: string | number }[])[0]!.n);
const insertUsers = async (n: number, status = 'active') => {
  const now = new Date();
  const ids: string[] = [];
  for (let i = 0; i < n; i += 500) {
    const chunk = Array.from({ length: Math.min(500, n - i) }, () => uuidv7());
    ids.push(...chunk);
    await t.ds.query(`INSERT INTO users (id, phone, status, created_at, updated_at) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?)').join(',')}`, chunk.flatMap((id) => [uuidToBuf(id), freshPhone(), status, now, now]));
  }
  return ids;
};

// ───────────────────────── internal: resolve / bulk / logoutAll ─────────────────────────
describe('LOW_INTERNAL.resolveUsers', () => {
  it('mid و high مجاز؛ فقط کاربران موجود؛ شمارهٔ ناشناس/حذف‌شده نمی‌آید', async () => {
    const a = await loginOtp(t);
    const b = await loginOtp(t);
    await t.ds.query("UPDATE users SET status = 'disabled' WHERE id = ?", [uuidToBuf(b.userId)]);
    const unknown = freshPhone();
    for (const caller of ['mid', 'high'] as const) {
      const r = await internalCall('post', '/users/resolve', caller).send({ phones: [a.phone, b.phone, unknown] });
      expect(r.status).toBe(200);
      expect(internal.LowResolveUsersResult.safeParse(r.body.data).success).toBe(true);
      const items = r.body.data.items as { phone: string; userId: string; status: string }[];
      expect(items).toHaveLength(2);
      expect(items.find((i) => i.phone === b.phone)).toMatchObject({ userId: b.userId, status: 'disabled' });
    }
  });

  it('ACL/اعتبارسنجی: فرستندهٔ low ⇒ 401، secret جفت دیگر ⇒ 401، بیش از ۵۰ شماره/فیلد اضافه ⇒ 400، GET ⇒ 404', async () => {
    expect((await internalCall('post', '/users/resolve', 'low', MID).send({ phones: [freshPhone()] })).status).toBe(401);
    expect((await internalCall('post', '/users/resolve', 'mid', HIGH).send({ phones: [freshPhone()] })).status).toBe(401);
    expect((await internalCall('post', '/users/resolve', 'mid').send({ phones: Array.from({ length: 51 }, freshPhone) })).status).toBe(400);
    expect((await internalCall('post', '/users/resolve', 'mid').send({ phones: [freshPhone()], x: 1 })).status).toBe(400);
    expect((await internalCall('get', '/users/resolve', 'mid')).status).toBe(404);
  });

  it('سقف durable ۶۰۰/دقیقه per فرستنده (فرستندهٔ دیگر تحت‌تأثیر نیست)', async () => {
    const win = Math.floor(t.clock.now().getTime() / 60_000) * 60_000;
    await t.ds.query('INSERT INTO rate_limit_counters (counter_key, window_start, hits) VALUES (?, ?, 600)', ['int:resolve:mid', new Date(win)]);
    const r = await internalCall('post', '/users/resolve', 'mid').send({ phones: [freshPhone()] });
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBeTruthy();
    expect((await internalCall('post', '/users/resolve', 'high').send({ phones: [freshPhone()] })).status).toBe(200);
  });
});

describe('LOW_ADMIN.usersBulk / logoutAll / broadcast ACL', () => {
  it('ساخت گروهی: created/exists به ترتیب ورودی، شمارهٔ تکراری، user.registered فقط برای جدیدها؛ تکرار idempotent', async () => {
    const existing = await loginOtp(t);
    const p1 = freshPhone();
    const p2 = freshPhone();
    const body = { items: [{ phone: p1, firstName: 'علی', lastName: 'رضایی' }, { phone: existing.phone, firstName: 'حسن', lastName: 'نوری' }, { phone: p2, firstName: 'سارا', lastName: 'کریمی' }, { phone: p1, firstName: 'علی', lastName: 'رضایی' }] };
    await t.ds.query('TRUNCATE TABLE outbox_events');
    const r = await internalCall('post', '/admin/users/bulk', 'high').send(body);
    expect(r.status).toBe(200);
    expect(internal.LowAdminUsersBulkResult.safeParse(r.body.data).success).toBe(true);
    const items = r.body.data.items as { phone: string; userId: string; outcome: string }[];
    expect(items.map((i) => i.outcome)).toEqual(['created', 'exists', 'created', 'exists']);
    expect(items[1]!.userId).toBe(existing.userId);
    expect(items[3]!.userId).toBe(items[0]!.userId);
    const ev = await outbox('user.registered');
    expect(ev.map((e) => e.phone).sort()).toEqual([p1, p2].sort());
    expect(ev.find((e) => e.phone === p2)).toMatchObject({ firstName: 'سارا', lastName: 'کریمی' });
    const again = await internalCall('post', '/admin/users/bulk', 'high').send(body);
    expect((again.body.data.items as { outcome: string }[]).every((i) => i.outcome === 'exists')).toBe(true);
    expect(await outbox('user.registered')).toHaveLength(2);
    // mid مجاز نیست
    expect((await internalCall('post', '/admin/users/bulk', 'mid').send(body)).status).toBe(403);
    expect((await internalCall('get', `/admin/broadcasts/${randomUUID()}`, 'mid')).status).toBe(403);
  });

  it('logoutAll با exceptSessionId نشست جاری را نگه می‌دارد؛ بدون بدنه همه', async () => {
    const a = await loginOtp(t);
    const b = await loginOtp(t, { phone: a.phone });
    const r = await internalCall('post', `/admin/users/${a.userId}/logout-all`, 'high').send({ exceptSessionId: b.sessionId });
    expect(r.status).toBe(200);
    expect((await request(t.http).get('/c/v1/me').set(a.headers)).status).toBe(401);
    expect((await request(t.http).get('/c/v1/me').set(b.headers)).status).toBe(200);
    expect((await internalCall('post', `/admin/users/${a.userId}/logout-all`, 'high').send({ exceptSessionId: 'x' })).status).toBe(400);
    expect((await internalCall('post', `/admin/users/${a.userId}/logout-all`, 'high').send()).status).toBe(200);
    expect((await request(t.http).get('/c/v1/me').set(b.headers)).status).toBe(401);
  });
});

// ───────────────────────── رویدادهای ورودی ─────────────────────────
describe('inbox.messages.created (mid و high)', () => {
  it('درج دسته‌ای فقط برای کاربران active؛ idempotent با eventId:index؛ ref قرارداد', async () => {
    const a = await loginOtp(t);
    const d = await loginOtp(t);
    await t.ds.query("UPDATE users SET status = 'disabled' WHERE id = ?", [uuidToBuf(d.userId)]);
    const items = [
      { userId: a.userId, kind: 'session', title: 'نقش شما', body: 'معلم شدید', ref: 'session:abc' },
      { userId: d.userId, kind: 'membership', title: 'x', body: 'y', ref: null },
      { userId: randomUUID(), kind: 'system', title: 'x', body: 'y', ref: null },
      { userId: a.userId, kind: 'announcement', title: 'اطلاعیه', body: 'متن', ref: 'announcement:n1' }
    ];
    const ev = event('inbox.messages.created', { items });
    expect((await send('mid', ev)).status).toBe(202);
    expect((await send('mid', ev)).status).toBe(202);
    const rows = (await t.ds.query('SELECT source_event_id AS s, kind FROM inbox_messages ORDER BY source_event_id')) as { s: string; kind: string }[];
    expect(rows).toEqual([
      { s: `${ev.eventId}:0`, kind: 'session' },
      { s: `${ev.eventId}:3`, kind: 'announcement' }
    ]);
    const inbox = await request(t.http).get('/c/v1/me/inbox').set(a.headers);
    expect(inbox.body.data).toHaveLength(2);
    for (const it of inbox.body.data) expect(def('L-17').response.safeParse(it).success).toBe(true);

    // high هم مجاز است
    expect((await send('high', event('inbox.messages.created', { items: [{ userId: a.userId, kind: 'system', title: 't', body: 'b', ref: 'points' }] }))).status).toBe(202);
    expect(await count('SELECT COUNT(*) AS n FROM inbox_messages WHERE user_id = ?', [uuidToBuf(a.userId)])).toBe(3);
  });

  it('ref نامعتبر یا بیش از ۲۰۰ آیتم ⇒ dead-letter (202) بدون درج', async () => {
    const a = await loginOtp(t);
    const bad = event('inbox.messages.created', { items: [{ userId: a.userId, kind: 'system', title: 't', body: 'b', ref: 'https://evil' }] });
    expect((await send('mid', bad)).status).toBe(202);
    const many = event('inbox.messages.created', { items: Array.from({ length: 201 }, () => ({ userId: a.userId, kind: 'system', title: 't', body: 'b', ref: null })) });
    expect((await send('high', many)).status).toBe(202);
    expect(await count('SELECT COUNT(*) AS n FROM dead_letter_events')).toBe(2);
    expect(await count('SELECT COUNT(*) AS n FROM inbox_messages')).toBe(0);
  });
});

describe('inbox.broadcast.created (فقط high) و تحویل دسته‌ای', () => {
  const bc = (segment: unknown, broadcastId = randomUUID()) => event('inbox.broadcast.created', { broadcastId, segment, title: 'اطلاعیهٔ مهم', body: 'متن اطلاعیه', ref: `announcement:${broadcastId.slice(0, 8)}`, createdBy: randomUUID() });

  it('mid نمی‌تواند بفرستد (403)', async () => {
    expect((await send('mid', bc({ type: 'all' }))).status).toBe(403);
  });

  it('all: فقط active، چند دسته با cursor پایدار، idempotent، آمار delivered/read', async () => {
    const u = await loginOtp(t);
    await insertUsers(2300);
    await insertUsers(5, 'disabled');
    const e = bc({ type: 'all' });
    expect((await send('high', e)).status).toBe(202);
    expect((await send('high', e)).status).toBe(202); // تکراری
    expect(await count('SELECT COUNT(*) AS n FROM inbox_broadcasts')).toBe(1);
    const svc = t.app.get(BroadcastService);

    const st0 = await internalCall('get', `/admin/broadcasts/${e.payload.broadcastId}`, 'high');
    expect(st0.body.data).toEqual({ status: 'queued', targeted: null, delivered: 0, read: 0 });

    expect(await svc.deliverChunk()).toBe(true); // دستهٔ اول ۲۰۰۰
    const st1 = await internalCall('get', `/admin/broadcasts/${e.payload.broadcastId}`, 'high');
    expect(st1.body.data).toMatchObject({ status: 'sending', targeted: 2301, delivered: 2000 });
    expect(await svc.run()).toBe(1); // دستهٔ دوم و پایان
    expect(await svc.deliverChunk()).toBe(false);
    expect(await count('SELECT COUNT(*) AS n FROM inbox_messages WHERE broadcast_id = ?', [uuidToBuf(e.payload.broadcastId as string)])).toBe(2301);

    // اجرای دوباره از ابتدا (cursor صفر) هیچ پیام تکراری نمی‌سازد
    await t.ds.query("UPDATE inbox_broadcasts SET status = 'sending', cursor_id = NULL");
    await svc.run();
    expect(await count('SELECT COUNT(*) AS n FROM inbox_messages')).toBe(2301);

    const inbox = await request(t.http).get('/c/v1/me/inbox').set(u.headers);
    expect(inbox.body.data[0]).toMatchObject({ kind: 'announcement', title: 'اطلاعیهٔ مهم' });
    await request(t.http).post(`/c/v1/me/inbox/${inbox.body.data[0].id}/read`).set(u.headers);
    const st = await internalCall('get', `/admin/broadcasts/${e.payload.broadcastId}`, 'high');
    expect(internal.LowAdminBroadcastStats.safeParse(st.body.data).success).toBe(true);
    expect(st.body.data).toEqual({ status: 'done', targeted: 2301, delivered: 2301, read: 1 });
    expect((await internalCall('get', `/admin/broadcasts/${randomUUID()}`, 'high')).status).toBe(404);
  });

  it('users و role: فقط کاربران active منطبق', async () => {
    const a = await loginOtp(t);
    const b = await loginOtp(t);
    const c = await loginOtp(t);
    await t.ds.query("UPDATE users SET status = 'disabled' WHERE id = ?", [uuidToBuf(b.userId)]);
    const e1 = bc({ type: 'users', userIds: [a.userId, b.userId, randomUUID()] });
    await send('high', e1);
    await t.ds.query('INSERT INTO user_claims (user_id, system_roles, grants, perm_ver, updated_at) VALUES (?, ?, ?, 2, NOW(3)), (?, ?, ?, 2, NOW(3))', [
      uuidToBuf(c.userId),
      JSON.stringify(['super_admin']),
      '[]',
      uuidToBuf(a.userId),
      JSON.stringify(['support']),
      '[]'
    ]);
    const e2 = bc({ type: 'role', role: 'super_admin' });
    await send('high', e2);
    await t.app.get(BroadcastService).run();
    const who = async (id: string) => ((await t.ds.query('SELECT LOWER(HEX(user_id)) AS u FROM inbox_messages WHERE broadcast_id = ?', [uuidToBuf(id)])) as { u: string }[]).map((r) => r.u);
    expect(await who(e1.payload.broadcastId as string)).toEqual([a.userId.replace(/-/g, '')]);
    expect(await who(e2.payload.broadcastId as string)).toEqual([c.userId.replace(/-/g, '')]);
  });
});

describe('badge.catalog.changed ⇒ L-32/L-33', () => {
  const badge = (o: Partial<Record<string, unknown>>) => ({ id: randomUUID(), key: 'k', title: 'عنوان', description: 'توضیح', threshold: 50, active: true, sortOrder: 0, imageHash: null, ...o });

  it('کاتالوگ کامل جایگزین می‌شود (فقط version بزرگ‌تر)؛ L-33 فقط فعال‌ها مرتب؛ L-32 badgesVersion؛ ETag/304', async () => {
    const cfg0 = await request(t.http).get('/c/v1/public/config').set('X-Forwarded-For', freshIp());
    expect(cfg0.status).toBe(200);
    expect(cfg0.body.data).toEqual({ maintenanceMode: false, registrationOpen: true, badgesVersion: 0 });
    expect(cfg0.headers['cache-control']).toBe('public, max-age=60');
    expect(cfg0.headers.etag).toBeTruthy();

    const b1 = badge({ key: 'gold', threshold: 500, sortOrder: 2 });
    const b2 = badge({ key: 'bronze', threshold: 50, sortOrder: 1, imageHash: 'ab'.repeat(32) });
    const b3 = badge({ key: 'silver', threshold: 150, sortOrder: 1 });
    const off = badge({ key: 'hidden', active: false });
    expect((await send('high', event('badge.catalog.changed', { version: 3, badges: [b1, b2, b3, off] }))).status).toBe(202);
    expect((await send('high', event('badge.catalog.changed', { version: 2, badges: [] }))).status).toBe(202); // قدیمی ⇒ بی‌اثر
    t.app.get(BadgesService).invalidate();

    const list = await request(t.http).get('/c/v1/public/badges').set('X-Forwarded-For', freshIp());
    expect(list.status).toBe(200);
    expect(list.body.data.map((b: { key: string }) => b.key)).toEqual(['bronze', 'silver', 'gold']);
    expect(list.body.data[0].image).toEqual({ hash: 'ab'.repeat(32) });
    for (const it of list.body.data) expect(def('L-33').response.safeParse(it).success).toBe(true);
    expect(list.body.meta).toMatchObject({ total: 3, page: 1 });
    expect(list.headers['cache-control']).toBe('public, max-age=300');
    const nm = await request(t.http).get('/c/v1/public/badges').set('If-None-Match', list.headers.etag!).set('X-Forwarded-For', freshIp());
    expect(nm.status).toBe(304);

    const cfg = await request(t.http).get('/c/v1/public/config').set('X-Forwarded-For', freshIp());
    expect(cfg.body.data.badgesVersion).toBe(3);
    expect(def('L-32').response.safeParse(cfg.body.data).success).toBe(true);
    expect(cfg.headers.etag).not.toBe(cfg0.headers.etag);
    // mid مجاز به فرستادن کاتالوگ نیست
    expect((await send('mid', event('badge.catalog.changed', { version: 9, badges: [] }))).status).toBe(403);
  });
});

// ───────────────────────── L-34 تصویر ─────────────────────────
describe('L-34 تصویر نشان', () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('IHDR-fake-png-body')]);
  const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 data')]);
  const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const hex = (b: Buffer) => sha256(b).toString('hex');

  const catalog = async (badges: { id: string; imageHash: string | null }[], version = 1) => {
    await send('high', event('badge.catalog.changed', { version, badges: badges.map((b, i) => ({ key: `b${i}x`, title: 't', description: '', threshold: 10 + i, active: true, sortOrder: i, ...b })) }));
    t.app.get(BadgesService).invalidate();
  };

  it('v=hash ⇒ immutable؛ نوع از magic bytes؛ nosniff؛ کش LRU (یک fetch)؛ ETag/304؛ v دیگر ⇒ کوتاه‌مدت', async () => {
    const id = randomUUID();
    await catalog([{ id, imageHash: hex(PNG) }]);
    high.handler = (req) => (req.url === `/internal/v1/badges/${id}/image` ? { status: 200, raw: PNG, type: 'image/webp' } : undefined);
    const r = await request(t.http).get(`/c/v1/public/badges/${id}/image?v=${hex(PNG)}`).set('X-Forwarded-For', freshIp());
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('image/png'); // از magic bytes، نه هدر high
    expect(r.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(r.body as Buffer).equals(PNG)).toBe(true);
    expect(high.hits[0]!.headers['x-internal-token']).toBe(HIGH);
    expect(high.hits[0]!.headers['x-internal-caller']).toBe('low');

    const nm = await request(t.http).get(`/c/v1/public/badges/${id}/image?v=${hex(PNG)}`).set('If-None-Match', r.headers.etag!).set('X-Forwarded-For', freshIp());
    expect(nm.status).toBe(304);
    const noV = await request(t.http).get(`/c/v1/public/badges/${id}/image`).set('X-Forwarded-For', freshIp());
    expect(noV.status).toBe(200);
    expect(noV.headers['cache-control']).toBe('public, max-age=300');
    expect(high.hits).toHaveLength(1); // LRU per hash
  });

  it('webp پذیرفته؛ SVG/بایت ناشناخته ⇒ 404؛ نشان ناشناخته/بدون تصویر ⇒ 404؛ high خراب ⇒ 503؛ v نامعتبر ⇒ 400', async () => {
    const w = randomUUID();
    const s = randomUUID();
    const none = randomUUID();
    const down = randomUUID();
    await catalog([
      { id: w, imageHash: hex(WEBP) },
      { id: s, imageHash: hex(SVG) },
      { id: none, imageHash: null },
      { id: down, imageHash: 'cd'.repeat(32) }
    ]);
    high.handler = (req) => (req.url!.includes(w) ? { status: 200, raw: WEBP, type: 'image/webp' } : req.url!.includes(s) ? { status: 200, raw: SVG, type: 'image/svg+xml' } : undefined);
    const rw = await request(t.http).get(`/c/v1/public/badges/${w}/image?v=${hex(WEBP)}`).set('X-Forwarded-For', freshIp());
    expect(rw.status).toBe(200);
    expect(rw.headers['content-type']).toBe('image/webp');
    const rs = await request(t.http).get(`/c/v1/public/badges/${s}/image`).set('X-Forwarded-For', freshIp());
    expect(rs.status).toBe(404);
    expect(rs.headers['content-type']).toContain('application/json');
    expect((await request(t.http).get(`/c/v1/public/badges/${none}/image`).set('X-Forwarded-For', freshIp())).status).toBe(404);
    expect((await request(t.http).get(`/c/v1/public/badges/${randomUUID()}/image`).set('X-Forwarded-For', freshIp())).status).toBe(404);
    expect((await request(t.http).get(`/c/v1/public/badges/${down}/image`).set('X-Forwarded-For', freshIp())).status).toBe(503);
    expect((await request(t.http).get(`/c/v1/public/badges/${w}/image?v=<script>`).set('X-Forwarded-For', freshIp())).status).toBe(400);
  });

  it('بایت‌های ناهم‌خوان با hash کاتالوگ ⇒ کش immutable نمی‌گیرد', async () => {
    const id = randomUUID();
    await catalog([{ id, imageHash: 'ef'.repeat(32) }]);
    high.handler = () => ({ status: 200, raw: PNG, type: 'image/png' });
    const r = await request(t.http).get(`/c/v1/public/badges/${id}/image?v=${'ef'.repeat(32)}`).set('X-Forwarded-For', freshIp());
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=300');
  });
});

// ───────────────────────── امتیاز ─────────────────────────
describe('L-21 / L-23 و points.changed', () => {
  const view = (id: string, threshold: number, awardedAt: string | null) => ({ id, key: `badge_${threshold}`, title: `نشان ${threshold}`, description: 'd', threshold, image: null, awardedAt });

  it('شکل پویا پاس داده می‌شود؛ points.changed کش را باطل می‌کند', async () => {
    const u = await loginOtp(t);
    let total = 10;
    mid.handler = (req) => (req.url === `/internal/v1/users/${u.userId}/points` ? { status: 200, json: { success: true, data: { total, badges: [view(randomUUID(), 50, null)] } } } : undefined);
    const a = await request(t.http).get('/c/v1/me/points').set(u.headers);
    expect(a.status).toBe(200);
    expect(def('L-21').response.safeParse(a.body.data).success).toBe(true);
    expect(a.body.data.total).toBe(10);
    total = 60;
    expect((await request(t.http).get('/c/v1/me/points').set(u.headers)).body.data.total).toBe(10); // cache
    expect((await send('mid', event('points.changed', { userId: u.userId, total: 60 }))).status).toBe(202);
    expect((await request(t.http).get('/c/v1/me/points').set(u.headers)).body.data.total).toBe(60);
    expect((await send('high', event('points.changed', { userId: u.userId, total: 1 }))).status).toBe(403);
  });

  it('شکل قدیمی mid (۴ نشان ثابت) با کاتالوگ نگاشت می‌شود', async () => {
    const u = await loginOtp(t);
    const bid = randomUUID();
    await send('high', event('badge.catalog.changed', { version: 1, badges: [{ id: bid, key: 'badge_50', title: 'آغاز', description: 'اولین', threshold: 50, active: true, sortOrder: 0, imageHash: 'aa'.repeat(32) }] }));
    t.app.get(BadgesService).invalidate();
    const legacy = { total: 55, badges: [50, 150].map((n) => ({ key: `badge_${n}`, threshold: n, awardedAt: n === 50 ? '2026-10-01T10:00:00+03:30' : null })) };
    mid.handler = () => ({ status: 200, json: { success: true, data: legacy } });
    const r = await request(t.http).get('/c/v1/me/points').set(u.headers);
    expect(r.status).toBe(200);
    expect(def('L-21').response.safeParse(r.body.data).success).toBe(true);
    expect(r.body.data.badges[0]).toMatchObject({ id: bid, title: 'آغاز', image: { hash: 'aa'.repeat(32) }, awardedAt: '2026-10-01T10:00:00+03:30' });
    expect(r.body.data.badges[1]).toMatchObject({ key: 'badge_150', threshold: 150, awardedAt: null, image: null });
  });

  it('L-23: proxy به MID_FOR_LOW.pointsLedger با صفحه‌بندی و cache خصوصی', async () => {
    const u = await loginOtp(t);
    const item = { id: randomUUID(), points: -5, reason: 'attendance_reversal', session: { id: randomUUID(), title: 'جلسه' }, note: null, createdAt: '2026-10-01T10:00:00+03:30' };
    mid.handler = (req) => (req.url!.startsWith(`/internal/v1/users/${u.userId}/points/ledger?`) ? { status: 200, json: { success: true, data: [item], meta: { page: 2, pageSize: 10, total: 11 } } } : undefined);
    const r = await request(t.http).get('/c/v1/me/points/history?page=2&pageSize=10').set(u.headers);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([item]);
    expect(r.body.meta).toMatchObject({ page: 2, pageSize: 10, total: 11 });
    expect(r.headers['cache-control']).toBe('private, max-age=15');
    expect(mid.hits[0]!.url).toContain('page=2');
    await request(t.http).get('/c/v1/me/points/history?page=2&pageSize=10').set(u.headers);
    expect(mid.hits).toHaveLength(1);
    mid.handler = () => ({ status: 200, json: { success: true, data: [{ ...item, reason: 'bogus' }], meta: { page: 1, pageSize: 20, total: 1 } } });
    expect((await request(t.http).get('/c/v1/me/points/history').set(u.headers)).status).toBe(503);
  });
});

describe('MidClient: negative-cache L-31 و pageSize مجاز', () => {
  it('404 جلسهٔ عمومی ۳۰ ثانیه cache می‌شود', async () => {
    mid.handler = () => ({ status: 404, json: {} });
    const id = randomUUID();
    expect((await request(t.http).get(`/c/v1/public/sessions/${id}`).set('X-Forwarded-For', freshIp())).status).toBe(404);
    expect((await request(t.http).get(`/c/v1/public/sessions/${id}`).set('X-Forwarded-For', freshIp())).status).toBe(404);
    expect(mid.hits).toHaveLength(1);
    t.clock.advance(31_000);
    await request(t.http).get(`/c/v1/public/sessions/${id}`).set('X-Forwarded-For', freshIp());
    expect(mid.hits).toHaveLength(2);
  });

  it('pageSize غیرمجاز به مقدار مجاز بعدی گرد می‌شود (کلید cache محدود)', async () => {
    mid.handler = () => ({ status: 200, json: { success: true, data: [], meta: { page: 1, pageSize: 10, total: 0 } } });
    const r = await request(t.http).get('/c/v1/public/sessions?pageSize=7').set('X-Forwarded-For', freshIp());
    expect(r.status).toBe(200);
    expect(mid.hits[0]!.url).toContain('pageSize=10');
  });
});

// ───────────────────────── L-22 / L-28 / L-15 ─────────────────────────
describe('L-22 حذف حساب من', () => {
  const stepUp = async (l: Login) => {
    const rq = await request(t.http).post('/c/v1/auth/step-up/otp/request').set(l.headers).send();
    const sv = await request(t.http).post('/c/v1/auth/step-up/otp/verify').set(l.headers).send({ challengeId: rq.body.data.challengeId, code: t.sms.lastCode(l.phone) });
    return sv.body.data.stepUpToken as string;
  };

  it('بدون OTP تازه/step-up ⇒ AUTH_STEP_UP_REQUIRED؛ با step-up ⇒ حذف، cookie پاک، رویداد source=self', async () => {
    const l = await loginOtp(t, { client: WEB_MAIN });
    t.clock.advance(6 * 60_000);
    const no = await request(t.http).delete('/c/v1/me').set(l.headers);
    expect(no.body.error.code).toBe('AUTH_STEP_UP_REQUIRED');
    const tok = await stepUp(l);
    await t.ds.query('TRUNCATE TABLE outbox_events');
    const r = await request(t.http).delete('/c/v1/me').set(l.headers).set('X-Step-Up-Token', tok).set('Content-Type', 'application/json').send({ reason: 'دیگر لازم ندارم' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, data: {} });
    const cookies = ([] as string[]).concat((r.headers['set-cookie'] as unknown as string[] | undefined) ?? []);
    expect(cookies.some((c) => c.startsWith('isra_rt_main=;') || /^isra_rt[^=]*=;/.test(c))).toBe(true);
    const ev = await outbox('user.status.changed');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ userId: l.userId, status: 'deleted', source: 'self' });
    expect(ev[0]!.anonymizedPhone).toMatch(/^d[0-9a-f]{10}$/);
    expect((await outbox('session.revoked')).flatMap((e) => e.sessionIds as string[])).toContain(l.sessionId);
    const [u] = (await t.ds.query('SELECT status, phone FROM users WHERE id = ?', [uuidToBuf(l.userId)])) as { status: string; phone: string }[];
    expect(u).toMatchObject({ status: 'deleted' });
    expect(u!.phone).not.toBe(l.phone);
    expect((await request(t.http).get('/c/v1/me').set(l.headers)).body.error.code).toBe('AUTH_ACCOUNT_DISABLED');
  });

  it('دارندهٔ نقش سیستمی ⇒ 409 SYSTEM_PROTECTED (حساب سالم می‌ماند)؛ بدنهٔ نامعتبر ⇒ 400', async () => {
    const l = await loginOtp(t);
    await t.ds.query('INSERT INTO user_claims (user_id, system_roles, grants, perm_ver, updated_at) VALUES (?, ?, ?, 2, NOW(3))', [uuidToBuf(l.userId), JSON.stringify(['developer']), '[]']);
    const r = await request(t.http).delete('/c/v1/me').set(l.headers);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'CONFLICT', details: { reason: 'SYSTEM_PROTECTED' } });
    expect((await request(t.http).get('/c/v1/me').set(l.headers)).status).toBe(200);
    expect((await request(t.http).delete('/c/v1/me').set(l.headers).set('Content-Type', 'application/json').send({ reason: 'x', extra: 1 })).status).toBe(400);
  });
});

describe('L-28 / L-15', () => {
  it('L-28: حذف پیام خودم؛ پیام دیگران/تکرار ⇒ 404', async () => {
    const a = await loginOtp(t);
    const b = await loginOtp(t);
    const id = uuidv7();
    await t.ds.query("INSERT INTO inbox_messages (id, user_id, kind, title, body, created_at) VALUES (?, ?, 'system', 't', 'b', NOW(3))", [uuidToBuf(id), uuidToBuf(a.userId)]);
    expect((await request(t.http).delete(`/c/v1/me/inbox/${id}`).set(b.headers)).status).toBe(404);
    const r = await request(t.http).delete(`/c/v1/me/inbox/${id}`).set(a.headers);
    expect(r.status).toBe(200);
    expect(await count('SELECT COUNT(*) AS n FROM inbox_messages')).toBe(0);
    expect((await request(t.http).delete(`/c/v1/me/inbox/${id}`).set(a.headers)).status).toBe(404);
  });

  it('L-15 روی نشست revoke‌شدهٔ خودم idempotent (200)؛ نشست دیگران همچنان 404', async () => {
    const a = await loginOtp(t);
    const a2 = await loginOtp(t, { phone: a.phone });
    expect((await request(t.http).delete(`/c/v1/me/sessions/${a2.sessionId}`).set(a.headers)).status).toBe(200);
    expect((await request(t.http).delete(`/c/v1/me/sessions/${a2.sessionId}`).set(a.headers)).status).toBe(200);
    const other = await loginOtp(t);
    expect((await request(t.http).delete(`/c/v1/me/sessions/${other.sessionId}`).set(a.headers)).status).toBe(404);
  });
});

// ───────────────────────── OTP ─────────────────────────
describe('OTP: cooldown اتمیک و گزارش failed/verified', () => {
  it('درخواست هم‌زمان برای یک شماره ⇒ دقیقاً یک ارسال', async () => {
    const phone = freshPhone();
    const rs = await Promise.all(Array.from({ length: 6 }, () => request(t.http).post('/c/v1/auth/otp/request').set(ANDROID).set('X-Forwarded-For', freshIp()).send({ phone })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 429)).toHaveLength(5);
    expect(t.sms.sent.filter((m) => m.phone === phone)).toHaveLength(1);
  });

  it('ارسال ناموفق ⇒ failed و هرگز verified؛ فیلتر purpose', async () => {
    const phone = freshPhone();
    t.sms.failNext = true;
    expect((await request(t.http).post('/c/v1/auth/otp/request').set(ANDROID).set('X-Forwarded-For', freshIp()).send({ phone })).status).toBe(503);
    const l = await loginOtp(t, { phone }); // ارسال بعدی بلافاصله مجاز (cooldown آزاد شد) و verify
    await request(t.http).post('/c/v1/auth/step-up/otp/request').set(l.headers).send();
    const day = new Date(t.clock.now().getTime() + 210 * 60_000).toISOString().slice(0, 10);
    const r = await internalCall('get', `/admin/reports/otp?from=${day}&to=${day}`, 'high');
    expect(r.status).toBe(200);
    expect(r.body.data.items).toEqual([{ bucket: day, requested: 3, verified: 1, failed: 1 }]);
    expect(internal.LowAdminOtpSeries.safeParse(r.body.data).success).toBe(true);
    const login = await internalCall('get', `/admin/reports/otp?from=${day}&to=${day}&purpose=login`, 'high');
    expect(login.body.data.items).toEqual([{ bucket: day, requested: 2, verified: 1, failed: 1 }]);
    expect((await internalCall('get', `/admin/reports/otp?from=${day}&to=${day}&purpose=x`, 'high')).status).toBe(400);
  });
});

describe('system.permission.changed', () => {
  it('از high پذیرفته و no-op (202، بدون dead-letter)؛ از mid ⇒ 403', async () => {
    expect((await send('high', event('system.permission.changed', { permission: 'x.y', anything: true }))).status).toBe(202);
    expect(await count('SELECT COUNT(*) AS n FROM dead_letter_events')).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM inbox_events')).toBe(1);
    expect((await send('mid', event('system.permission.changed', {}))).status).toBe(403);
  });
});

// ───────────────────────── outbox مسیریابی ─────────────────────────
describe('outbox: مسیریابی per نوع و وضعیت per مقصد', () => {
  const bodies = (f: FakeMid) => f.hits.filter((h) => h.url === '/internal/v1/events').map((h) => h.body as { type: string; payload: Record<string, unknown>; eventId: string });

  it('user.registered: mid بدون شماره، high با شماره؛ user.phone.changed فقط high', async () => {
    mid.handler = () => ({ status: 202 });
    high.handler = () => ({ status: 202 });
    const l = await loginOtp(t);
    const np = freshPhone();
    await internalCall('post', '/admin/users/bulk', 'high').send({ items: [{ phone: freshPhone(), firstName: 'علی', lastName: 'رضایی' }] });
    await (request(t.http) as unknown as Record<string, (p: string) => request.Test>).patch!(`/c/internal/v1/admin/users/${l.userId}`).set('X-Internal-Caller', 'high').set('X-Internal-Token', HIGH).send({ phone: np });
    const svc = t.app.get(OutboxService);
    expect(await svc.tick()).toBe(3);
    const m = bodies(mid);
    const h = bodies(high);
    expect(m.map((b) => b.type).sort()).toEqual(['user.registered', 'user.registered']);
    expect(m.every((b) => !('phone' in b.payload))).toBe(true);
    expect(JSON.stringify(m)).not.toContain(l.phone);
    expect(JSON.stringify(m)).not.toContain(np);
    expect(h.map((b) => b.type).sort()).toEqual(['user.phone.changed', 'user.registered', 'user.registered']);
    expect(h.find((b) => b.type === 'user.phone.changed')!.payload.phone).toBe(np);
    expect(await count('SELECT COUNT(*) AS n FROM outbox_events WHERE published_at IS NULL')).toBe(0);
  });

  it('شکست یک مقصد ⇒ فقط همان مقصد دوباره (pending_targets)؛ claim کوتاه با lease', async () => {
    mid.handler = () => undefined; // 500
    high.handler = () => ({ status: 202 });
    await loginOtp(t);
    const svc = t.app.get(OutboxService);
    expect(await svc.tick()).toBe(0);
    const [row] = (await t.ds.query('SELECT pending_targets AS p, attempts FROM outbox_events')) as { p: string; attempts: number }[];
    expect(row).toEqual({ p: 'mid', attempts: 1 });
    expect(bodies(high)).toHaveLength(1);
    t.clock.advance(60_000);
    mid.handler = () => ({ status: 202 });
    expect(await svc.tick()).toBe(1);
    expect(bodies(high)).toHaveLength(1); // high دوباره دریافت نکرد
    expect(bodies(mid)).toHaveLength(2);
    expect(bodies(mid)[0]!.eventId).toBe(bodies(mid)[1]!.eventId);
  });

  it('user.status.changed: anonymizedPhone فقط به high', async () => {
    mid.handler = () => ({ status: 202 });
    high.handler = () => ({ status: 202 });
    const l = await loginOtp(t);
    await t.ds.query('TRUNCATE TABLE outbox_events');
    await internalCall('get', `/admin/users/${l.userId}`, 'high');
    await (request(t.http) as unknown as Record<string, (p: string) => request.Test>).delete!(`/c/internal/v1/admin/users/${l.userId}`).set('X-Internal-Caller', 'high').set('X-Internal-Token', HIGH);
    await t.app.get(OutboxService).tick();
    const m = bodies(mid).find((b) => b.type === 'user.status.changed')!;
    const h = bodies(high).find((b) => b.type === 'user.status.changed')!;
    expect(m.payload).not.toHaveProperty('anonymizedPhone');
    expect(m.payload).toMatchObject({ status: 'deleted', source: 'admin' });
    expect(h.payload.anonymizedPhone).toMatch(/^d[0-9a-f]{10}$/);
  });
});
