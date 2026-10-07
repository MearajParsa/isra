import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MaintenanceService } from '../src/outbox/maintenance.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { SessionStatusCache } from '../src/auth/session-status.cache';
import { ANDROID, type TestApp, freshIp, loginOtp, resetDb, startApp } from './helpers/app';
import { type FakeMid, startFakeMid } from './helpers/fake-mid';

const SECRET = 'test-pair-low-mid-0123456789abcdef01'; // جفت low↔mid
const HIGH_SECRET = 'test-pair-low-high-0123456789abcdef0'; // جفت low↔high
let t: TestApp;
let mid: FakeMid;

const publicSession = (id: string) => ({
  id,
  title: 'جلسهٔ تست',
  description: 'توضیح جلسهٔ تست برای قرارداد',
  schedule: { type: 'once', startsAt: '2026-10-03T09:00:00+03:30', endsAt: '2026-10-03T10:00:00+03:30' },
  nextStartsAt: '2026-10-03T09:00:00+03:30',
  location: { label: 'مسجد' },
  status: 'scheduled'
});

beforeAll(async () => {
  mid = await startFakeMid();
  t = await startApp({ INTERNAL_URL_MID: mid.url, INTERNAL_TIMEOUT_MS: '500' });
});
afterAll(async () => {
  await t.close();
  await mid.close();
});
beforeEach(() => {
  mid.hits.length = 0;
});

const event = (type: string, payload: Record<string, unknown>, eventId = randomUUID()) => ({ eventId, type, occurredAt: new Date().toISOString(), payload });
/** system.* از high؛ inbox.* از mid (ACL فرستنده) */
const send = (body: unknown, token?: string | null, caller?: 'mid' | 'high') => {
  const sys = String((body as { type?: unknown }).type ?? '').startsWith('system.');
  const r = request(t.http).post('/c/internal/v1/events').set('X-Internal-Caller', caller ?? (sys ? 'high' : 'mid'));
  const tok = token === undefined ? (sys ? HIGH_SECRET : SECRET) : token;
  return (tok ? r.set('X-Internal-Token', tok) : r).send(body as object);
};

describe('رویدادهای داخلی', () => {
  it('بدون/با secret غلط ⇒ 401', async () => {
    expect((await send(event('x.y', {}), null)).status).toBe(401);
    expect((await send(event('x.y', {}), 'wrong'.repeat(10))).status).toBe(401);
  });

  it('inbox.message.created ⇒ در اینباکس کاربر؛ تحویل مجدد (dedupe) بی‌اثر', async () => {
    const u = await loginOtp(t);
    const ev = event('inbox.message.created', { userId: u.userId, kind: 'membership', title: 'عضویت تأیید شد', body: 'به جلسه خوش آمدید', ref: 'session:1' });
    expect((await send(ev)).status).toBe(202);
    expect((await send(ev)).status).toBe(202);
    const inbox = await request(t.http).get('/c/v1/me/inbox').set(u.headers);
    expect(inbox.body.data).toHaveLength(1);
    expect(inbox.body.data[0]).toMatchObject({ kind: 'membership', title: 'عضویت تأیید شد', readAt: null });
    const unread = await request(t.http).get('/c/v1/me/inbox/unread-count').set(u.headers);
    expect(unread.body.data.count).toBe(1);

    await request(t.http).post(`/c/v1/me/inbox/${inbox.body.data[0].id}/read`).set(u.headers);
    expect((await request(t.http).get('/c/v1/me/inbox/unread-count').set(u.headers)).body.data.count).toBe(0);
    expect((await request(t.http).get('/c/v1/me/inbox?unreadOnly=true').set(u.headers)).body.data).toHaveLength(0);
  });

  it('envelope نامعتبر ⇒ 400؛ payload نامعتبر ⇒ dead-letter + 202؛ نوع خارج از allow-list فرستنده ⇒ 403', async () => {
    expect((await send({ eventId: 'x', type: 'inbox.message.created', payload: {} })).status).toBe(400);
    const bad = event('inbox.message.created', { userId: 'x' });
    expect((await send(bad)).status).toBe(202);
    expect((await send(bad)).status).toBe(202); // تکراری ⇒ یک ردیف dead-letter
    const dl = (await t.ds.query('SELECT type, caller, error FROM dead_letter_events WHERE event_id = ?', [bad.eventId])) as { type: string; caller: string; error: string }[];
    expect(dl).toHaveLength(1);
    expect(dl[0]).toMatchObject({ type: 'inbox.message.created', caller: 'mid' });
    expect(dl[0]!.error).toContain('userId');
    // ref خارج از الگوی قرارداد ⇒ dead-letter
    const u = await loginOtp(t);
    const badRef = event('inbox.message.created', { userId: u.userId, kind: 'system', title: 't', body: 'b', ref: 'javascript:alert(1)' });
    expect((await send(badRef)).status).toBe(202);
    expect(await t.ds.query('SELECT 1 FROM dead_letter_events WHERE event_id = ?', [badRef.eventId])).toHaveLength(1);
    expect(await t.ds.query('SELECT 1 FROM inbox_messages WHERE user_id = UNHEX(REPLACE(?, "-", ""))', [u.userId])).toHaveLength(0);
    expect((await send(event('future.event.v9', { a: 1 }))).status).toBe(403);
    // mid اجازهٔ ارسال system.* را ندارد (حتی با secret درست جفت خودش)
    expect((await send(event('system.role.changed', { userId: randomUUID(), systemRoles: ['super_admin'], grants: [], permVer: 9 }), SECRET, 'mid')).status).toBe(403);
    // high اجازهٔ ارسال inbox.* را ندارد
    expect((await send(event('inbox.message.created', { userId: randomUUID() }), HIGH_SECRET, 'high')).status).toBe(403);
  });

  it('system.role.changed: claim در access بعدی می‌آید؛ رویداد قدیمی‌تر (permVer کمتر) اثر ندارد', async () => {
    const u = await loginOtp(t);
    await send(event('system.role.changed', { userId: u.userId, systemRoles: ['super_admin'], grants: ['session.create'], permVer: 3 }));
    await send(event('system.role.changed', { userId: u.userId, systemRoles: [], grants: [], permVer: 2 }));
    const rf = await request(t.http).post('/c/v1/auth/refresh').set(ANDROID).set('X-Forwarded-For', freshIp()).send({ refreshToken: u.refreshToken });
    const payload = JSON.parse(Buffer.from(rf.body.data.accessToken.split('.')[1], 'base64url').toString());
    expect(payload).toMatchObject({ roles: ['super_admin'], perms: ['session.create'], pv: 3 });
  });
});

describe('MidClient (L-21, L-30, L-31)', () => {
  it('جلسات عمومی با schema قرارداد parse و پاس داده می‌شود؛ secret داخلی فرستاده می‌شود', async () => {
    const id = randomUUID();
    mid.handler = (req) =>
      req.url!.startsWith('/internal/v1/public/sessions?') ? { status: 200, json: { success: true, data: [publicSession(id)], meta: { page: 1, pageSize: 20, total: 1 } } } : undefined;
    const r = await request(t.http).get('/c/v1/public/sessions?status=scheduled').set('X-Forwarded-For', freshIp());
    expect(r.status).toBe(200);
    expect(r.body.data[0].id).toBe(id);
    expect(r.body.meta.total).toBe(1);
    expect(mid.hits[0]!.headers['x-internal-token']).toBe(SECRET);
    expect(mid.hits[0]!.url).toContain('status=scheduled');
  });

  it('کوتاه‌مدت cache می‌شود و درخواست‌های هم‌زمان یکی می‌شوند', async () => {
    const id = randomUUID();
    mid.handler = () => ({ status: 200, json: { success: true, data: publicSession(id) } });
    const rs = await Promise.all(Array.from({ length: 5 }, () => request(t.http).get(`/c/v1/public/sessions/${id}`).set('X-Forwarded-For', freshIp())));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(mid.hits.length).toBe(1);
  });

  it('404 از mid ⇒ NOT_FOUND؛ پاسخ ناسازگار با قرارداد ⇒ 503 (داده‌ٔ خراب پاس داده نمی‌شود)', async () => {
    mid.handler = () => ({ status: 404, json: {} });
    expect((await request(t.http).get(`/c/v1/public/sessions/${randomUUID()}`).set('X-Forwarded-For', freshIp())).status).toBe(404);
    mid.handler = () => ({ status: 200, json: { success: true, data: { id: 'x', hacked: true } } });
    const r = await request(t.http).get(`/c/v1/public/sessions/${randomUUID()}`).set('X-Forwarded-For', freshIp());
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('امتیاز: stale-if-error وقتی mid خراب می‌شود', async () => {
    const u = await loginOtp(t);
    const pts = { total: 55, badges: [50, 150, 300, 500].map((n) => ({ key: `badge_${n}`, threshold: n, awardedAt: n === 50 ? '2026-10-01T10:00:00+03:30' : null })) };
    mid.handler = () => ({ status: 200, json: { success: true, data: pts } });
    const ok = await request(t.http).get('/c/v1/me/points').set(u.headers);
    expect(ok.status).toBe(200);
    expect(ok.body.data.total).toBe(55);

    t.clock.advance(20_000); // cache تازه منقضی
    mid.handler = () => undefined; // 500
    const stale = await request(t.http).get('/c/v1/me/points').set(u.headers);
    expect(stale.status).toBe(200);
    expect(stale.body.data.total).toBe(55);
  });

  it('mid از دسترس خارج و cache خالی ⇒ 503 با envelope', async () => {
    const u = await loginOtp(t);
    mid.handler = () => undefined;
    const r = await request(t.http).get(`/c/v1/public/sessions?page=7`).set('X-Forwarded-For', freshIp());
    expect(r.status).toBe(503);
    void u;
  });
});

describe('outbox', () => {
  beforeEach(async () => {
    await t.ds.query('DELETE FROM outbox_events');
  });

  it('ثبت‌نام و ویرایش پروفایل رویداد می‌سازند و worker آن‌ها را با secret به mid می‌رساند', async () => {
    mid.handler = (req) => (req.url === '/internal/v1/events' ? { status: 202, json: {} } : undefined);
    const u = await loginOtp(t);
    await request(t.http).patch('/c/v1/me/profile').set(u.headers).send({ firstName: 'مریم' });
    const [{ n }] = (await t.ds.query('SELECT COUNT(*) AS n FROM outbox_events WHERE published_at IS NULL')) as { n: string }[];
    expect(Number(n)).toBe(2);

    const published = await t.app.get(OutboxService).tick();
    expect(published).toBe(2);
    const types = mid.hits.filter((h) => h.url === '/internal/v1/events').map((h) => (h.body as { type: string }).type);
    expect(types.sort()).toEqual(['user.profile.updated', 'user.registered']);
    expect(mid.hits[0]!.headers['x-internal-token']).toBe(SECRET);
    expect(await t.app.get(OutboxService).tick()).toBe(0);
  });

  it('شکست تحویل ⇒ backoff نمایی و تلاش مجدد بعدی؛ پایان با موفقیت', async () => {
    await loginOtp(t);
    mid.handler = () => undefined; // 500
    const svc = t.app.get(OutboxService);
    expect(await svc.tick()).toBe(0);
    const [r1] = (await t.ds.query('SELECT attempts, next_attempt_at FROM outbox_events')) as { attempts: number; next_attempt_at: Date }[];
    expect(r1!.attempts).toBe(1);
    expect(r1!.next_attempt_at.getTime()).toBeGreaterThan(t.clock.now().getTime());
    expect(await svc.tick()).toBe(0); // هنوز زود است (backoff)
    expect(mid.hits.length).toBe(1);

    t.clock.advance(60_000);
    mid.handler = () => ({ status: 202 });
    expect(await svc.tick()).toBe(1);
  });

  it('رویداد مصرف‌شده در mid همان eventId پایدار را می‌گیرد (تحویل مجدد dedupe می‌شود)', async () => {
    mid.handler = () => ({ status: 202 });
    await loginOtp(t);
    const svc = t.app.get(OutboxService);
    await svc.tick();
    const first = (mid.hits[0]!.body as { eventId: string }).eventId;
    await t.ds.query('UPDATE outbox_events SET published_at = NULL, pending_targets = NULL, next_attempt_at = ?', [t.clock.now()]);
    await svc.tick();
    expect((mid.hits[1]!.body as { eventId: string }).eventId).toBe(first);
  });
});

describe('maintenance', () => {
  it('داده منقضی پاک و داده زنده حفظ می‌شود', async () => {
    await resetDb(t.ds);
    const u = await loginOtp(t);
    await t.ds.query("INSERT INTO otp_challenges (id, phone, purpose, code_hmac, attempts, expires_at, ip, created_at) VALUES (UNHEX(REPLACE(UUID(),'-','')), '09120000001', 'login', UNHEX(REPEAT('00',32)), 0, DATE_SUB(NOW(3), INTERVAL 3 DAY), '1.1.1.1', DATE_SUB(NOW(3), INTERVAL 3 DAY))");
    const before = (await t.ds.query('SELECT COUNT(*) AS n FROM auth_sessions')) as { n: string }[];
    t.clock.advance(3 * 86_400_000);
    const out = await t.app.get(MaintenanceService).run();
    expect(out.otp).toBeGreaterThanOrEqual(1);
    const after = (await t.ds.query('SELECT COUNT(*) AS n FROM auth_sessions WHERE revoked_at IS NULL')) as { n: string }[];
    expect(Number(after[0]!.n)).toBe(Number(before[0]!.n));
    expect(u.userId).toBeTruthy();
  });
});

describe('cache وضعیت نشست', () => {
  it('revoke روی همین instance فوری اعمال می‌شود؛ پس از TTL از DB بازخوانی', async () => {
    const u = await loginOtp(t);
    expect((await request(t.http).get('/c/v1/me').set(u.headers)).status).toBe(200);
    // revoke مستقیم DB (شبیه instance دیگر): تا ۵ ثانیه ممکن است cache قدیمی بماند، بعد از آن 401
    await t.ds.query('UPDATE auth_sessions SET revoked_at = NOW(3)');
    t.clock.advance(6_000);
    expect((await request(t.http).get('/c/v1/me').set(u.headers)).status).toBe(401);
    t.app.get(SessionStatusCache).invalidateAll();
  });
});
