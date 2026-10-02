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
    ['H-30', () => api.system.settings('T')],
    ['H-31', () => api.system.updateSettings('T', { version: 1, evalWeights: { voice: 40, tone: 30, tajweed: 30 }, badgeThresholds: [1, 2, 3, 4], flags: { maintenance_mode: false, registration_open: true } }, 'SU')],
    ['H-40', () => api.system.audit('T', { action: 'settings.updated' })]
  ];

  it.each(cases)('%s', async (id, fn) => {
    const d = def(id);
    ok(d.list ? [] : {}, d.list ? { page: 1, pageSize: 20, total: 0 } : {});
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
    await api.auth.refresh();
    expect(calls[1]!.credentials).toBe('include');
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
