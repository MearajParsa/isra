import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMS, LOCKED } from '../src/db/rbac-seed';
import { missingLocked, sameSet, touchesDeveloper } from '../src/domain/rules';

describe('قواعد نقش/مجوز', () => {
  it('developer همه‌چیز قفل؛ super_admin فقط ۴ مجوز قفل', () => {
    expect(LOCKED.developer).toEqual(ALL_PERMISSIONS);
    expect([...LOCKED.super_admin].sort()).toEqual(['system.audit.view', 'system.permission.edit', 'system.role.assign', 'system.users.view']);
  });
  it('پیش‌فرض‌ها شامل مجوزهای قفل‌اند', () => {
    for (const r of ['developer', 'super_admin'] as const) expect(missingLocked(LOCKED[r]!, DEFAULT_ROLE_PERMS[r]!)).toEqual([]);
  });
  it('missingLocked مجوزهای حذف‌شده را برمی‌گرداند', () => {
    expect(missingLocked(LOCKED.super_admin!, ['session.create'])).toHaveLength(4);
    expect(missingLocked(LOCKED.super_admin!, [...DEFAULT_ROLE_PERMS.super_admin!].filter((p) => p !== 'session.create'))).toEqual([]);
  });
  it('touchesDeveloper و sameSet', () => {
    expect(touchesDeveloper([], ['developer'])).toBe(true);
    expect(touchesDeveloper(['developer'], ['developer', 'super_admin'])).toBe(false);
    expect(touchesDeveloper(['developer'], ['super_admin'])).toBe(true);
    expect(sameSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameSet(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('env (fail-fast)', () => {
  it('LOW_JWKS_URL و secret اجباری', () => expect(() => loadEnv({ NODE_ENV: 'test' })).toThrow(/LOW_JWKS_URL|DB_HOST/));
  it('production: INTERNAL_URL_LOW/MID و CORS الزامی؛ شمارهٔ راه‌انداز معتبر باشد', () => {
    const base = { DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p', LOW_JWKS_URL: 'https://api.israapp.ir/c/.well-known/jwks.json', INTERNAL_SECRET_LOW: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', INTERNAL_SECRET_MID: 'f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1' };
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(/INTERNAL_URL_LOW|INTERNAL_URL_MID|CORS_ORIGINS/);
    expect(() => loadEnv({ ...base, NODE_ENV: 'test', BOOTSTRAP_DEVELOPER_PHONE: '123' })).toThrow(/BOOTSTRAP_DEVELOPER_PHONE/);
    expect(loadEnv({ ...base, NODE_ENV: 'test', BOOTSTRAP_DEVELOPER_PHONE: '09121234567' }).BOOTSTRAP_DEVELOPER_PHONE).toBe('09121234567');
  });
});
