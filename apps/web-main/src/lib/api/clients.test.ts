import { ENDPOINTS, type EndpointDef } from '@isra/api-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttp } from './http';
import { createLowApi } from './lowClient';
import { createMidApi } from './midClient';
import { ApiError } from './types';

interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: unknown;
  credentials: RequestCredentials | undefined;
}

let calls: Call[] = [];
let reply: { status: number; body: unknown; headers?: Record<string, string> } = { status: 200, body: { success: true, data: {}, meta: { requestId: 'r' } } };

beforeEach(() => {
  calls = [];
  reply = { status: 200, body: { success: true, data: {}, meta: { requestId: 'r' } } };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, init: RequestInit) => {
      calls.push({ method: init.method ?? 'GET', path: url.pathname, query: url.searchParams, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined, credentials: init.credentials });
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'Content-Type': 'application/json', ...(reply.headers ?? {}) } });
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

const cfg = { base: 'http://api.test', client: 'web-main', version: '1.2.3' };
const low = createLowApi(createHttp(cfg));
const mid = createMidApi(createHttp(cfg), { baseUrl: 'http://api.test' });
const ok = (data: unknown, meta: object = {}) => (reply = { status: 200, body: { success: true, data, meta: { requestId: 'r', ...meta } } });

/** مسیر قرارداد ⇒ regex (پارامتر {x} ⇒ هر چیز) */
const matches = (def: EndpointDef, c: Call) => {
  const prefix = def.service === 'low' ? '/c/v1' : def.service === 'mid' ? '/o/v1' : '/s/v1';
  const re = new RegExp(`^${prefix}${def.path.replace(/\{[^}]+\}/g, '[^/]+')}$`);
  return def.method.toUpperCase() === c.method && re.test(c.path);
};
const def = (id: string) => (ENDPOINTS.low as readonly EndpointDef[]).concat(ENDPOINTS.mid as readonly EndpointDef[]).find((d) => d.id === id)!;

describe('هدرها و پروتکل', () => {
  it('هدرهای قرارداد: X-Isra-Client/Version، Bearer، step-up؛ بدون cookie مگر مسیرهای auth', async () => {
    ok({});
    await low.me.setPassword('TOKEN', { newPassword: 'a-long-password', stepUpToken: 'STEP' });
    const c = calls[0]!;
    expect(c.headers['X-Isra-Client']).toBe('web-main');
    expect(c.headers['X-Isra-Client-Version']).toBe('1.2.3');
    expect(c.headers.Authorization).toBe('Bearer TOKEN');
    expect(c.headers['X-Step-Up-Token']).toBe('STEP');
    expect(c.credentials).toBe('omit');
    expect(c.body).toEqual({ newPassword: 'a-long-password' });
    await low.auth.refresh();
    expect(calls[1]!.credentials).toBe('include');
  });

  it('Idempotency-Key فقط برای ساخت جلسه، transition و ارزیابی و در هر فراخوانی یکتا', async () => {
    ok({});
    await mid.sessions.create('T', { title: 'abc', description: 'x'.repeat(10), schedule: { type: 'once', startsAt: 'a', endsAt: 'b' }, location: { label: 'xx' } });
    await mid.sessions.create('T', { title: 'abc', description: 'x'.repeat(10), schedule: { type: 'once', startsAt: 'a', endsAt: 'b' }, location: { label: 'xx' } });
    await mid.sessions.transition('T', 's1', 'started');
    await mid.evaluations.submit('T', 's1', { queueItemId: 'q', scores: [{ criterionId: 'c1', score: 3 }] });
    await mid.queue.next('T', 's1');
    const keys = calls.map((c) => c.headers['Idempotency-Key']);
    expect(keys.slice(0, 4).every((k) => typeof k === 'string' && k.length >= 8)).toBe(true);
    expect(new Set(keys.slice(0, 4)).size).toBe(4);
    expect(keys[4]).toBeUndefined();
  });

  it('شناسه‌ها در مسیر encode می‌شوند (جلوگیری از path traversal)', async () => {
    ok({});
    await low.me.revokeSession('T', '../../x?y=1');
    // یک سگمنت واحد (slash و ? کدگذاری شده‌اند)؛ مسیر نمی‌تواند از آن خارج شود
    expect(calls[0]!.path.split('/').filter(Boolean)).toHaveLength(5);
    expect(calls[0]!.path).toContain('%2F');
    expect(calls[0]!.query.has('y')).toBe(false);
  });
});

describe('نگاشت به endpointهای قرارداد (مسیر + متد)', () => {
  const cases: [string, () => Promise<unknown>][] = [
    ['L-01', () => low.auth.requestOtp('09121234567')],
    ['L-02', () => low.auth.verifyOtp({ challengeId: 'c', code: '12345', deviceId: 'd', deviceLabel: 'l' })],
    ['L-03', () => low.auth.loginPassword({ phone: '09121234567', password: 'p', deviceId: 'd', deviceLabel: 'l' })],
    ['L-04', () => low.auth.refresh()],
    ['L-05', () => low.auth.logout()],
    ['L-06', () => low.auth.stepUpRequest('T')],
    ['L-07', () => low.auth.stepUpVerify('T', { challengeId: 'c', code: '12345' })],
    ['L-10', () => low.me.get('T')],
    ['L-12', () => low.me.updateProfile('T', { firstName: 'a' })],
    ['L-13', () => low.me.setPassword('T', { newPassword: 'x' })],
    ['L-14', () => low.me.listSessions('T')],
    ['L-15', () => low.me.revokeSession('T', 'id1')],
    ['L-16', () => low.me.revokeOthers('T')],
    ['L-17', () => low.me.inbox('T')],
    ['L-18', () => low.me.unreadCount('T')],
    ['L-19', () => low.me.markRead('T', 'id1')],
    ['L-20', () => low.me.markAllRead('T')],
    ['L-21', () => low.me.points('T')],
    ['L-30', () => low.publicContent.listSessions()],
    ['L-31', () => low.publicContent.getSession('s1')],
    ['M-00', () => mid.me.get('T')],
    ['M-01', () => mid.me.sessions('T')],
    ['M-02', () => mid.sessions.me('T', 's1')],
    ['M-03', () => mid.sessions.create('T', { title: 'abc', description: 'x'.repeat(10), schedule: { type: 'once', startsAt: 'a', endsAt: 'b' }, location: { label: 'xx' } })],
    ['M-04', () => mid.sessions.update('T', 's1', { title: 'abc', description: 'x'.repeat(10), schedule: { type: 'once', startsAt: 'a', endsAt: 'b' }, location: { label: 'xx' } })],
    ['M-05', () => mid.sessions.transition('T', 's1', 'scheduled')],
    ['M-10', () => mid.members.request('T', 's1')],
    ['M-11', () => mid.members.list('T', 's1')],
    ['M-12', () => mid.members.decide('T', 's1', 'm1', 'approve')],
    ['M-20', () => mid.attendance.checkIn('T', 's1')],
    ['M-21', () => mid.attendance.list('T', 's1')],
    ['M-30', () => mid.queue.join('T', 's1')],
    ['M-31', () => mid.queue.leave('T', 's1')],
    ['M-32', () => mid.queue.state('T', 's1')],
    ['M-33', () => mid.queue.next('T', 's1')],
    ['M-34', () => mid.queue.act('T', 's1', 'i1', 'up')],
    ['M-40', () => mid.evaluations.submit('T', 's1', { queueItemId: 'q', scores: [{ criterionId: 'c1', score: 3 }] })],
    ['M-41', () => mid.evaluations.list('T', 's1')],
    ['M-45', () => mid.evaluations.criteria('T')]
  ];

  it.each(cases)('%s', async (id, fn) => {
    const d = def(id);
    // پاسخ سازگار برای فهرست‌ها (آرایه) و بقیه (شیء)
    ok(d.list ? [] : id === 'L-18' ? { count: 0 } : {}, d.list ? { page: 1, pageSize: 50, total: 0 } : {});
    await fn();
    const c = calls.at(-1)!;
    expect(matches(d, c), `${id}: ${c.method} ${c.path}`).toBe(true);
    if (d.auth === 'bearer') expect(c.headers.Authorization).toBe('Bearer T');
  });

  it('M-42 و L-11 در UI مستقیم استفاده نمی‌شوند ولی در قرارداد هستند', () => {
    expect(def('M-42')).toBeTruthy();
    expect(def('L-11')).toBeTruthy();
  });
});

describe('نگاشت پاسخ و خطا', () => {
  it('لیست صفحه‌بندی‌شده از meta؛ listAll همهٔ صفحه‌ها را می‌خواند', async () => {
    ok([{ id: 'a' }], { page: 1, pageSize: 20, total: 41 });
    const inbox = await low.me.inbox('T', { page: 1, pageSize: 20 });
    expect(inbox).toEqual({ items: [{ id: 'a' }], page: 1, pageSize: 20, total: 41 });
    let n = 0;
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: URL) => {
      n++;
      const page = Number(url.searchParams.get('page'));
      return new Response(JSON.stringify({ success: true, data: [{ id: `p${page}` }], meta: { page, pageSize: 1, total: 3 } }), { status: 200 });
    });
    expect(await low.me.listSessions('T')).toEqual([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
    expect(n).toBe(3);
  });

  it('خطای envelope ⇒ ApiError با code/status/details/retryAfter', async () => {
    reply = { status: 429, body: { success: false, error: { code: 'RATE_LIMITED', message: 'زیاد', details: {} }, meta: {} }, headers: { 'Retry-After': '42' } };
    const e = await low.auth.requestOtp('09121234567').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ code: 'RATE_LIMITED', status: 429, retryAfterSec: 42 });
    reply = { status: 400, body: { success: false, error: { code: 'AUTH_OTP_INVALID', message: 'نادرست', details: { attemptsLeft: 2 } } } };
    expect(await low.auth.verifyOtp({ challengeId: 'c', code: '1', deviceId: 'd', deviceLabel: 'l' }).catch((x: ApiError) => x.attemptsLeft)).toBe(2);
    reply = { status: 400, body: { success: false, error: { code: 'VALIDATION_FAILED', message: 'x', details: { fields: { phone: 'نامعتبر' } } } } };
    expect(((await low.auth.requestOtp('x').catch((x: unknown) => x)) as ApiError).details).toEqual({ fields: { phone: 'نامعتبر' } });
  });

  it('کد ناشناخته ⇒ INTERNAL_ERROR؛ 502/503 بدون JSON ⇒ SERVICE_UNAVAILABLE؛ قطع شبکه ⇒ NETWORK_ERROR', async () => {
    reply = { status: 500, body: { success: false, error: { code: 'WEIRD', message: 'm' } } };
    expect(await low.me.get('T').catch((x: ApiError) => x.code)).toBe('INTERNAL_ERROR');
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response('<html>Bad Gateway</html>', { status: 502 }));
    expect(await low.me.get('T').catch((x: ApiError) => x.code)).toBe('SERVICE_UNAVAILABLE');
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await low.me.get('T').catch((x: ApiError) => x.code)).toBe('NETWORK_ERROR');
  });

  it('پاسخ 200 بدون envelope موفق پذیرفته نمی‌شود', async () => {
    reply = { status: 200, body: { hello: 'world' } };
    expect(await low.me.get('T').catch((x: ApiError) => x.code)).toBe('INTERNAL_ERROR');
  });

  it('رمز موقت: currentPassword در بدنه و بدون step-up؛ کدهای تازهٔ خطا شناخته می‌شوند', async () => {
    ok({});
    await low.me.setPassword('TOKEN', { newPassword: 'a-long-password', currentPassword: 'temp-pass' });
    const c = calls.at(-1)!;
    expect(c.body).toEqual({ newPassword: 'a-long-password', currentPassword: 'temp-pass' });
    expect(c.headers['X-Step-Up-Token']).toBeUndefined();
    reply = { status: 403, body: { success: false, error: { code: 'AUTH_PASSWORD_CHANGE_REQUIRED', message: 'رمز موقت' } } };
    expect(await low.me.get('T').catch((x: ApiError) => x.code)).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
    reply = { status: 403, body: { success: false, error: { code: 'AUTH_ACCOUNT_DISABLED', message: 'غیرفعال' } } };
    expect(await low.auth.loginPassword({ phone: '09121234567', password: 'p', deviceId: 'd', deviceLabel: 'l' }).catch((x: ApiError) => x.code)).toBe('AUTH_ACCOUNT_DISABLED');
  });
});
