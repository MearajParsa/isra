import { beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '../types';
import { markReady } from './control';
import { adminMockApi as api } from './adminMock';
import { load } from './db';

const dev = { deviceId: 'd', deviceLabel: 'T' };
let sa = ''; // super_admin
let dv = ''; // developer
let plain = '';

async function step(t: string) {
  const ch = await api.auth.stepUpRequest(t);
  return (await api.auth.stepUpVerify(t, { challengeId: ch.challengeId, code: '12345' })).stepUpToken;
}
async function code(p: Promise<unknown>) {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return e instanceof ApiError ? (e.details.reason ? `${e.code}:${e.details.reason}` : e.code) : 'ERR';
  }
}

beforeAll(async () => {
  markReady();
  sa = (await api.auth.loginPassword({ phone: '09121234567', password: 'isra1234', ...dev })).accessToken;
  dv = (await api.auth.loginPassword({ phone: '09123333333', password: 'isra1234', ...dev })).accessToken;
  plain = (await api.auth.loginPassword({ phone: '09125555555', password: 'isra1234', ...dev })).accessToken;
});

describe('دسترسی', () => {
  it('کاربر بدون نقش سیستم وارد پنل نمی‌شود', async () => {
    expect(await code(api.system.me(plain))).toBe('AUTH_FORBIDDEN');
    expect(await code(api.system.users(plain))).toBe('AUTH_FORBIDDEN');
    expect(await code(api.system.settings(plain))).toBe('AUTH_FORBIDDEN');
    expect(await code(api.system.audit(plain))).toBe('AUTH_FORBIDDEN');
  });
  it('super_admin و developer هویت سیستمی دارند', async () => {
    expect((await api.system.me(sa)).roles).toEqual(['super_admin']);
    expect((await api.system.me(dv)).permissions).toContain('system.settings.edit');
  });
});

describe('step-up روی writeها', () => {
  it('بدون توکن step-up هیچ write مجاز نیست', async () => {
    const u = (await api.system.users(sa)).items[5];
    expect(await code(api.system.setUserRoles(sa, u.id, ['super_admin'], ''))).toBe('AUTH_STEP_UP_REQUIRED');
    expect(await code(api.system.setUserGrants(sa, u.id, [], 'bogus'))).toBe('AUTH_STEP_UP_REQUIRED');
    const s = await api.system.settings(sa);
    expect(await code(api.system.updateSettings(sa, { ...s }, ''))).toBe('AUTH_STEP_UP_REQUIRED');
    expect(await code(api.system.setRolePermissions(sa, 'super_admin', [], ''))).toBe('AUTH_STEP_UP_REQUIRED');
  });
  it('توکن step-up نشست دیگر پذیرفته نمی‌شود', async () => {
    const su = await step(dv);
    const u = (await api.system.users(sa)).items[5];
    expect(await code(api.system.setUserGrants(sa, u.id, ['session.create'], su))).toBe('AUTH_STEP_UP_REQUIRED');
  });
});

describe('نقش‌ها و کاربران', () => {
  it('تخصیص و برداشتن نقش + audit', async () => {
    const su = await step(sa);
    const target = load().users.find((u) => u.firstName && u.roles.length === 0 && u.password === null)!;
    const n0 = load().audit.length;
    const r = await api.system.setUserRoles(sa, target.id, ['super_admin'], su);
    expect(r.roles).toEqual(['super_admin']);
    expect(load().audit.length).toBe(n0 + 1);
    expect(load().audit[0].action).toBe('system.role.assigned');
    await api.system.setUserRoles(sa, target.id, [], su);
    expect(load().audit[0].action).toBe('system.role.removed');
  });
  it('آخرین دارندهٔ developer قفل است؛ super_admin نقش developer را عوض نمی‌کند', async () => {
    const su = await step(sa);
    const devUser = load().users.find((u) => u.roles.includes('developer'))!;
    expect(await code(api.system.setUserRoles(sa, devUser.id, ['developer' as const], su))).toBe('OK');
    const su2 = await step(sa);
    const other = load().users.find((u) => u.roles.length === 0)!;
    expect(await code(api.system.setUserRoles(sa, other.id, ['developer'], su2))).toBe('AUTH_FORBIDDEN');
    const suDev = await step(dv);
    // developer فقط وقتی دارندهٔ دیگری باشد می‌تواند نقشش را بردارد؛ اینجا آخرین دارنده است
    expect(await code(api.system.setUserRoles(dv, devUser.id, [], suDev))).toBe('CONFLICT:LAST_HOLDER');
  });
  it('آخرین super_admin قفل است', async () => {
    const su = await step(dv);
    const admins = load().users.filter((u) => u.roles.includes('super_admin'));
    // همه جز یکی را بردار
    for (const a of admins.slice(1)) await api.system.setUserRoles(dv, a.id, a.roles.filter((r) => r !== 'super_admin'), su);
    expect(await code(api.system.setUserRoles(dv, admins[0].id, [], su))).toBe('CONFLICT:LAST_HOLDER');
  });
  it('grant ساخت جلسه', async () => {
    const su = await step(sa);
    const u = load().users.find((x) => x.grants.length === 0 && x.roles.length === 0)!;
    expect((await api.system.setUserGrants(sa, u.id, ['session.create'], su)).grants).toEqual(['session.create']);
    expect(await code(api.system.setUserGrants(sa, u.id, ['x' as never], su))).toBe('VALIDATION_FAILED');
  });
  it('جست‌وجو و فیلتر', async () => {
    const all = await api.system.users(sa, { pageSize: 100 });
    expect(all.total).toBe(40);
    const byPhone = await api.system.users(sa, { q: '09123333333' });
    expect(byPhone.total).toBe(1);
    const none = await api.system.users(sa, { role: 'none', pageSize: 100 });
    expect(none.items.every((u) => u.roles.length === 0)).toBe(true);
  });
});

describe('ماتریس مجوز', () => {
  it('developer ثابت؛ super_admin بدون مجوز قفل رد می‌شود', async () => {
    const su = await step(sa);
    expect(await code(api.system.setRolePermissions(sa, 'developer', [], su))).toBe('AUTH_FORBIDDEN');
    expect(await code(api.system.setRolePermissions(sa, 'super_admin', ['session.create'], su))).toBe('CONFLICT:LOCKED_PERMISSION');
    const ok = await api.system.setRolePermissions(sa, 'super_admin', ['system.users.view', 'system.role.assign', 'system.permission.edit', 'system.audit.view'], su);
    expect(ok.permissions).not.toContain('system.settings.edit');
    // اثر فوری: super_admin دیگر تنظیمات را نمی‌بیند
    expect(await code(api.system.settings(sa))).toBe('AUTH_FORBIDDEN');
    expect((await api.system.settings(dv)).version).toBeGreaterThan(0);
    await api.system.setRolePermissions(dv, 'super_admin', ['system.users.view', 'system.role.assign', 'system.permission.edit', 'system.settings.view', 'system.settings.edit', 'system.audit.view', 'session.create'], await step(dv));
  });
});

describe('تنظیمات', () => {
  it('به‌روزرسانی با نسخه؛ نسخهٔ قدیمی رد؛ اعتبارسنجی', async () => {
    const su = await step(sa);
    const s = await api.system.settings(sa);
    expect(s.evalWeights).toEqual({ voice: 40, tone: 30, tajweed: 30 });
    expect(s.badgeThresholds).toEqual([50, 150, 300, 500]);
    const next = await api.system.updateSettings(sa, { ...s, evalWeights: { voice: 50, tone: 25, tajweed: 25 } }, su);
    expect(next.version).toBe(s.version + 1);
    expect(load().audit[0].action).toBe('system.settings.changed');
    expect(await code(api.system.updateSettings(sa, { ...s, evalWeights: { voice: 10, tone: 10, tajweed: 10 } }, su))).toBe('CONFLICT:VERSION_MISMATCH');
    expect(await code(api.system.updateSettings(sa, { ...next, evalWeights: { voice: 10, tone: 10, tajweed: 10 } }, su))).toBe('VALIDATION_FAILED');
    expect(await code(api.system.updateSettings(sa, { ...next, badgeThresholds: [5, 5, 6, 7] }, su))).toBe('VALIDATION_FAILED');
  });
  it('audit قابل فیلتر و صفحه‌بندی', async () => {
    const p = await api.system.audit(sa, { pageSize: 5 });
    expect(p.items.length).toBe(5);
    const only = await api.system.audit(sa, { action: 'system.settings.changed', pageSize: 100 });
    expect(only.items.every((a) => a.action === 'system.settings.changed')).toBe(true);
  });
});
