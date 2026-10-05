import { ENDPOINTS, type EndpointDef } from '@isra/api-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminApi } from './highClient';
import { createHttp } from './http';
import { ApiError } from './types';

interface Call {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: unknown;
  credentials: RequestCredentials | undefined;
}
let calls: Call[] = [];
let reply: unknown = { success: true, data: {}, meta: {} };
let status = 200;

beforeEach(() => {
  calls = [];
  reply = { success: true, data: {}, meta: {} };
  status = 200;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, init: RequestInit) => {
      calls.push({ method: init.method ?? 'GET', url, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined, credentials: init.credentials });
      return new Response(JSON.stringify(reply), { status });
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

const mk = (base: string) => createHttp({ base, client: 'web-admin', version: '9.9.9' });
const api = createAdminApi(mk('http://low.test'), mk('http://high.test'));
const defs = (ENDPOINTS.high as readonly EndpointDef[]).concat(ENDPOINTS.low as readonly EndpointDef[]);
const def = (id: string) => defs.find((d) => d.id === id)!;
const matches = (d: EndpointDef, c: Call) => {
  const prefix = d.service === 'low' ? '/c/v1' : '/s/v1';
  return d.method.toUpperCase() === c.method && new RegExp(`^${prefix}${d.path.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(c.url.pathname);
};
const ok = (data: unknown, meta: object = {}) => (reply = { success: true, data, meta });

describe('نگاشت به قرارداد', () => {
  const cases: [string, () => Promise<unknown>][] = [
    ['L-01', () => api.auth.requestOtp('09121234567')],
    ['L-02', () => api.auth.verifyOtp({ challengeId: 'c', code: '12345', deviceId: 'd', deviceLabel: 'l' })],
    ['L-03', () => api.auth.loginPassword({ phone: '09121234567', password: 'p', deviceId: 'd', deviceLabel: 'l' })],
    ['L-04', () => api.auth.refresh()],
    ['L-05', () => api.auth.logout()],
    ['L-06', () => api.auth.stepUpRequest('T')],
    ['L-07', () => api.auth.stepUpVerify('T', { challengeId: 'c', code: '12345' })],
    ['H-00', () => api.system.me('T')],
    ['H-01', () => api.system.overview('T')],
    ['H-10', () => api.system.roles('T')],
    ['H-11', () => api.system.permissions('T')],
    ['H-12', () => api.system.setRolePermissions('T', 'super_admin', ['system.users.view'], 'SU')],
    ['H-20', () => api.system.users('T', { q: 'علی', role: 'none' })],
    ['H-21', () => api.system.user('T', 'u1')],
    ['H-22', () => api.system.setUserRoles('T', 'u1', ['developer'], 'SU')],
    ['H-23', () => api.system.setUserGrants('T', 'u1', ['session.create'], 'SU')],
    ['H-02', () => api.system.account('T')],
    ['H-03', () => api.system.updateProfile('T', { firstName: 'علی' })],
    ['H-04', () => api.system.setMyPassword('T', { newPassword: '12345678' }, 'SU')],
    ['H-05', () => api.system.mySessions('T')],
    ['H-06', () => api.system.revokeMySession('T', 's1')],
    ['H-07', () => api.system.revokeOtherSessions('T')],
    ['H-24', () => api.system.createUser('T', { phone: '09121234567', firstName: 'علی', lastName: 'رضایی' }, 'SU')],
    ['H-25', () => api.system.updateUser('T', 'u1', { firstName: 'علی' }, 'SU')],
    ['H-26', () => api.system.setUserStatus('T', 'u1', 'disabled', 'SU')],
    ['H-27', () => api.system.deleteUser('T', 'u1', 'SU')],
    ['H-28', () => api.system.setUserPassword('T', 'u1', { action: 'clear' }, 'SU')],
    ['H-29', () => api.system.logoutUserEverywhere('T', 'u1', 'SU')],
    ['H-50', () => api.system.userSessions('T', 'u1')],
    ['H-51', () => api.system.revokeUserSession('T', 'u1', 's1', 'SU')],
    ['H-60', () => api.system.sessions('T', { q: 'x', includeDeleted: true })],
    ['H-61', () => api.system.session('T', 's1')],
    ['H-62', () => api.system.createSession('T', { session: {} as never }, 'SU')],
    ['H-63', () => api.system.updateSession('T', 's1', {} as never, 'SU')],
    ['H-64', () => api.system.transitionSession('T', 's1', 'started', 'SU')],
    ['H-65', () => api.system.deleteSession('T', 's1', 'SU')],
    ['H-66', () => api.system.sessionMembers('T', 's1', { status: 'pending' })],
    ['H-67', () => api.system.decideMember('T', 's1', 'm1', 'approve', 'SU')],
    ['H-68', () => api.system.setMemberRoles('T', 's1', 'm1', ['teacher'], 'SU')],
    ['H-69', () => api.system.removeMember('T', 's1', 'm1', 'SU')],
    ['H-70', () => api.system.sessionAttendance('T', 's1')],
    ['H-71', () => api.system.sessionQueue('T', 's1')],
    ['H-72', () => api.system.sessionEvaluations('T', 's1')],
    ['H-80', () => api.system.reportOverview('T', { from: '2026-09-01', to: '2026-10-01' })],
    ['H-81', () => api.system.reportRegistrations('T', { interval: 'week' })],
    ['H-82', () => api.system.reportSessions('T', {})],
    ['H-83', () => api.system.reportOtp('T', {})],
    ['H-84', () => api.system.reportLeaderboard('T', 10)],
    ['H-30', () => api.system.settings('T')],
    ['H-31', () => api.system.updateSettings('T', { version: 1, evalWeights: { voice: 40, tone: 30, tajweed: 30 }, badgeThresholds: [1, 2, 3, 4], flags: { maintenance_mode: false, registration_open: true } }, 'SU')],
    ['H-40', () => api.system.audit('T', { action: 'settings.updated' })]
  ];

  it.each(cases)('%s', async (id, fn) => {
    const d = def(id);
    ok(d.list ? [] : id === 'H-84' ? { items: [] } : {}, d.list ? { page: 1, pageSize: 20, total: 0 } : {});
    await fn();
    const c = calls.at(-1)!;
    expect(matches(d, c), `${id}: ${c.method} ${c.url.pathname}`).toBe(true);
    expect(c.url.origin).toBe(d.service === 'low' ? 'http://low.test' : 'http://high.test');
    expect(c.headers['X-Isra-Client']).toBe('web-admin');
    if (d.auth === 'bearer' && id !== 'L-01') expect(c.headers.Authorization).toBe('Bearer T');
    if (d.stepUp) expect(c.headers['X-Step-Up-Token']).toBe('SU');
  });

  it('فقط auth در low: هیچ فراخوانی غیر-auth به low نمی‌رود', async () => {
    ok({}, {});
    for (const [, fn] of cases) await fn().catch(() => undefined);
    for (const c of calls.filter((x) => x.url.origin === 'http://low.test')) expect(c.url.pathname.startsWith('/c/v1/auth/')).toBe(true);
  });

  it('cookie فقط برای verify/login/refresh/logout؛ فیلترهای کاربران در query', async () => {
    ok([], { page: 1, pageSize: 20, total: 0 });
    await api.system.users('T', { q: 'علی', role: 'super_admin', page: 2 });
    const c = calls[0]!;
    expect(c.credentials).toBe('omit');
    expect(Object.fromEntries(c.url.searchParams)).toEqual({ q: 'علی', role: 'super_admin', page: '2', pageSize: '20' });
    await api.system.users('T', { status: 'disabled', grant: 'none', createdFrom: '2026-01-01', createdTo: '2026-02-01', sort: 'name' });
    expect(Object.fromEntries(calls.at(-1)!.url.searchParams)).toMatchObject({ status: 'disabled', grant: 'none', createdFrom: '2026-01-01', createdTo: '2026-02-01', sort: 'name' });
    await api.system.audit('T', { actorId: 'a', targetType: 'session', targetId: 's', from: '2026-01-01' });
    expect(Object.fromEntries(calls.at(-1)!.url.searchParams)).toMatchObject({ actorId: 'a', targetType: 'session', targetId: 's', from: '2026-01-01' });
    await api.auth.refresh();
    expect(calls.at(-1)!.credentials).toBe('include');
  });

  it('خطای 403 step-up و 409 قفل‌ها به ApiError با details', async () => {
    status = 403;
    reply = { success: false, error: { code: 'AUTH_STEP_UP_REQUIRED', message: 'تأیید هویت' }, meta: {} };
    expect(await api.system.setUserRoles('T', 'u', [], 'x').catch((e: ApiError) => e.code)).toBe('AUTH_STEP_UP_REQUIRED');
    status = 409;
    reply = { success: false, error: { code: 'CONFLICT', message: 'قفل', details: { reason: 'LAST_HOLDER', role: 'developer' } }, meta: {} };
    const e = (await api.system.setUserRoles('T', 'u', [], 'x').catch((x: unknown) => x)) as ApiError;
    expect(e.details).toEqual({ reason: 'LAST_HOLDER', role: 'developer' });
  });
});

describe('نوشتن‌های مدیریتی', () => {
  it('ساخت کاربر/جلسه: Idempotency-Key و step-up', async () => {
    ok({});
    await api.system.createUser('T', { phone: '09121234567', firstName: 'علی', lastName: 'رضایی', password: 'abcdefgh1' }, 'SU');
    expect(calls[0]!.headers['Idempotency-Key']).toBeTruthy();
    expect(calls[0]!.headers['X-Step-Up-Token']).toBe('SU');
    expect(calls[0]!.body).toMatchObject({ password: 'abcdefgh1' });
  });
  it('تغییر رمز اجباری: بدون step-up با currentPassword', async () => {
    ok({});
    await api.system.setMyPassword('T', { newPassword: 'newpass123', currentPassword: 'tmp' });
    expect(calls[0]!.headers['X-Step-Up-Token']).toBeUndefined();
    expect(calls[0]!.body).toEqual({ newPassword: 'newpass123', currentPassword: 'tmp' });
  });
  it('خطاهای تازه به ApiError نگاشت می‌شوند', async () => {
    status = 403;
    reply = { success: false, error: { code: 'AUTH_PASSWORD_CHANGE_REQUIRED', message: 'رمز موقت' }, meta: {} };
    expect(await api.system.overview('T').catch((e: ApiError) => e.code)).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
    reply = { success: false, error: { code: 'AUTH_ACCOUNT_DISABLED', message: 'غیرفعال' }, meta: {} };
    expect(await api.system.overview('T').catch((e: ApiError) => e.code)).toBe('AUTH_ACCOUNT_DISABLED');
    status = 409;
    reply = { success: false, error: { code: 'CONFLICT', message: 'تکراری', details: { reason: 'PHONE_TAKEN' } }, meta: {} };
    const e = (await api.system.updateUser('T', 'u', { phone: '09121234567' }, 'x').catch((x: unknown) => x)) as ApiError;
    expect(e.reason).toBe('PHONE_TAKEN');
  });
});
