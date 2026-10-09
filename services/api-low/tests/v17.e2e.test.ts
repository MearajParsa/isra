import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ENDPOINTS, type EndpointDef } from '@isra/api-types';
import { EndpointGuard } from '../src/common/guards/endpoint.guard';
import { TierBaselineService } from '../src/system/baseline.service';
import { ANDROID, type TestApp, freshIp, loginOtp, resetDb, startApp } from './helpers/app';
import { type FakeMid, startFakeMid } from './helpers/fake-mid';

const HIGH = 'test-pair-low-high-0123456789abcdef0';
const MID = 'test-pair-low-mid-0123456789abcdef01';
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
beforeEach(async () => {
  await resetDb(t.ds);
  t.app.get(TierBaselineService).invalidate();
  mid.hits.length = 0;
  mid.handler = (req) => {
    if (req.url!.startsWith('/internal/v1/public/sessions?')) return { status: 200, json: { success: true, data: [publicSession(randomUUID())], meta: { page: 1, pageSize: 20, total: 1 } } };
    const m = /^\/internal\/v1\/public\/sessions\/([0-9a-f-]{36})/.exec(req.url!);
    return m ? { status: 200, json: { success: true, data: publicSession(m[1]!) } } : undefined;
  };
});

const event = (type: string, payload: Record<string, unknown>, eventId = randomUUID()) => ({ eventId, type, occurredAt: new Date().toISOString(), payload });
const send = (body: unknown, caller: 'high' | 'mid' = 'high') =>
  request(t.http)
    .post('/c/internal/v1/events')
    .set('X-Internal-Caller', caller)
    .set('X-Internal-Token', caller === 'high' ? HIGH : MID)
    .send(body as object);
const baseline = async (version: number, guest: string[], student: string[]) => {
  expect((await send(event('tier.baseline.changed', { version, guest, quran_student: student }))).status).toBe(202);
};
const list = (headers: Record<string, string> = {}) => request(t.http).get('/c/v1/public/sessions').set(headers).set('X-Forwarded-For', freshIp());
const one = (headers: Record<string, string> = {}) => request(t.http).get(`/c/v1/public/sessions/${randomUUID()}`).set(headers).set('X-Forwarded-For', freshIp());
const stored = async () => {
  const r = (await t.ds.query("SELECT value, version FROM settings_cache WHERE setting_key = 'tier_baseline'")) as { value: unknown; version: number }[];
  return r[0] ? { version: Number(r[0].version), value: (typeof r[0].value === 'string' ? JSON.parse(r[0].value) : r[0].value) as { guest: string[]; quran_student: string[] } } : null;
};

describe('قرارداد ۱.۷.۰: L-30/L-31 نیازمند session.browse', () => {
  it('هر دو endpoint در قرارداد permission دارند (guard آن را اجرا می‌کند)', () => {
    for (const id of ['L-30', 'L-31']) expect((ENDPOINTS.low as readonly EndpointDef[]).find((d) => d.id === id)!.permission).toBe('session.browse');
  });
});

describe('tier.baseline.changed (high ⇒ low)', () => {
  it('seed migration: مهمان و قرآن‌آموز session.browse دارند (version=0)', async () => {
    const s = await stored();
    expect(s?.version).toBe(0);
    expect(s?.value.guest).toContain('session.browse');
    expect(s?.value.quran_student).toContain('session.browse');
    expect((await list()).status).toBe(200);
    expect((await one()).status).toBe(200);
  });

  it('ذخیره با version؛ نسخهٔ کوچک‌تر/مساوی no-op؛ تحویل مجدد dedupe', async () => {
    const ev = event('tier.baseline.changed', { version: 5, guest: ['gallery.view'], quran_student: ['session.browse', 'session.browse'] });
    expect((await send(ev)).status).toBe(202);
    expect((await send(ev)).status).toBe(202);
    await baseline(4, ['session.browse'], ['session.browse']);
    await baseline(5, ['session.browse'], []);
    const s = await stored();
    expect(s).toEqual({ version: 5, value: { guest: ['gallery.view'], quran_student: ['session.browse'] } });
  });

  it('payload نامعتبر ⇒ dead-letter؛ فرستندهٔ mid ⇒ 403', async () => {
    const bad = event('tier.baseline.changed', { version: 0, guest: [], quran_student: [] });
    expect((await send(bad)).status).toBe(202);
    expect(await t.ds.query('SELECT 1 FROM dead_letter_events WHERE event_id = ?', [bad.eventId])).toHaveLength(1);
    const badKey = event('tier.baseline.changed', { version: 2, guest: ['NOT A KEY'], quran_student: [] });
    expect((await send(badKey)).status).toBe(202);
    expect(await t.ds.query('SELECT 1 FROM dead_letter_events WHERE event_id = ?', [badKey.eventId])).toHaveLength(1);
    expect((await stored())?.version).toBe(0);
    expect((await send(event('tier.baseline.changed', { version: 9, guest: [], quran_student: [] }), 'mid')).status).toBe(403);
  });
});

describe('اعمال session.browse روی L-30/L-31', () => {
  it('مهمان بدون session.browse ⇒ 403 AUTH_FORBIDDEN؛ کاربر ثبت‌نام‌کرده با baseline قرآن‌آموز ⇒ 200', async () => {
    const u = await loginOtp(t);
    await baseline(2, ['gallery.view'], ['session.browse']);
    const g = await list();
    expect(g.status).toBe(403);
    expect(g.body.error.code).toBe('AUTH_FORBIDDEN');
    expect((await one()).status).toBe(403);
    expect(mid.hits).toHaveLength(0); // پیش از هر hop به mid رد می‌شود
    expect((await list(u.headers)).status).toBe(200);
    expect((await one(u.headers)).status).toBe(200);
  });

  it('توکن نامعتبر/نشست revoke‌شده در مسیر عمومی ⇒ مهمان (نه 401)', async () => {
    await baseline(2, ['session.browse'], []);
    expect((await list({ Authorization: 'Bearer not-a-jwt' })).status).toBe(200);
    await baseline(3, [], ['session.browse']);
    expect((await list({ Authorization: 'Bearer not-a-jwt' })).status).toBe(403);
    const u = await loginOtp(t);
    expect((await list(u.headers)).status).toBe(200);
    await request(t.http).post('/c/v1/auth/logout').set(u.headers).send({});
    expect((await list(u.headers)).status).toBe(403);
  });

  it('claim صریح perms کاربر بدون baseline کافی است؛ بدون claim و baseline ⇒ 403', async () => {
    await baseline(2, [], []);
    const u = await loginOtp(t);
    expect((await list(u.headers)).status).toBe(403);
    await send(event('system.role.changed', { userId: u.userId, systemRoles: ['custom'], grants: ['session.browse'], permVer: 2 }));
    const rf = await request(t.http).post('/c/v1/auth/refresh').set(ANDROID).set('X-Forwarded-For', freshIp()).send({ refreshToken: u.refreshToken });
    expect(rf.status).toBe(200);
    expect((await list({ ...ANDROID, Authorization: `Bearer ${rf.body.data.accessToken}` })).status).toBe(200);
  });

  it('نبود ردیف baseline ⇒ fail-closed (مهمان و کاربر هر دو 403)', async () => {
    await t.ds.query("DELETE FROM settings_cache WHERE setting_key = 'tier_baseline'");
    t.app.get(TierBaselineService).invalidate();
    const u = await loginOtp(t);
    expect((await list()).status).toBe(403);
    expect((await list(u.headers)).status).toBe(403);
  });

  it('پاسخ cache‌پذیر عمومی Vary: Authorization دارد (CDN بین مهمان و کاربر نشت ندهد)', async () => {
    const r = await list();
    expect(r.status).toBe(200);
    expect(r.headers.vary).toContain('Authorization');
  });

  it('L-32 (بدون permission) بی‌تأثیر از baseline', async () => {
    await baseline(2, [], []);
    expect((await request(t.http).get('/c/v1/public/config').set('X-Forwarded-For', freshIp())).status).toBe(200);
  });
});

describe('EndpointGuard.authorize (permission/permissionAny؛ fail-closed)', () => {
  const guard = () => t.app.get(EndpointGuard) as unknown as { authorize: (d: Partial<EndpointDef>, r: unknown, a?: { perms: string[] }) => Promise<void> };
  const req = { header: () => undefined };
  const base = { id: 'X', auth: 'bearer' } as const;

  it('permissionAny: هر یک کافی است؛ هیچ ⇒ 403؛ آرایهٔ خالی ⇒ 403', async () => {
    await baseline(2, [], []);
    await expect(guard().authorize({ ...base, permissionAny: ['a.x', 'b.y'] }, req, { perms: ['b.y'] })).resolves.toBeUndefined();
    await expect(guard().authorize({ ...base, permission: 'a.x', permissionAny: ['b.y'] }, req, { perms: ['a.x'] })).resolves.toBeUndefined();
    await expect(guard().authorize({ ...base, permissionAny: ['a.x'] }, req, { perms: ['c.z'] })).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
    await expect(guard().authorize({ ...base, permissionAny: [] }, req, { perms: ['a.x'] })).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
    await expect(guard().authorize({ ...base }, req, undefined)).resolves.toBeUndefined();
  });

  it('مسیر bearer بدون کاربر ⇒ baseline مهمان؛ کاربر ⇒ baseline قرآن‌آموز ∪ perms', async () => {
    await baseline(2, ['g.only'], ['s.only']);
    await expect(guard().authorize({ ...base, auth: 'bearerOrCookie', permission: 'g.only' }, req, undefined)).resolves.toBeUndefined();
    await expect(guard().authorize({ ...base, permission: 'g.only' }, req, { perms: [] })).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
    await expect(guard().authorize({ ...base, permission: 's.only' }, req, { perms: [] })).resolves.toBeUndefined();
  });
});
