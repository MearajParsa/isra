import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Clock } from '../src/common/clock';
import { MediaUrlSigner, contentPath } from '../src/common/media-url';
import { grantingPermission } from '../src/common/guards/endpoint.guard';
import { loadEnv } from '../src/config/env';
import { DEFAULT_ROLE_MODULES, DEFAULT_ROLE_PERMS, FIXED_ROLES, IMPLICIT_ROLES, LOCKED, NEW_V17, SEED_PERMISSIONS } from '../src/db/rbac-seed';
import { accessFromRows, hasPanelAccess } from '../src/domain/access/policy';
import { tierManagePermission } from '../src/domain/rules';
import { testEnv } from './helpers/app';
/** مقدار تصادفی در زمان اجرا (هیچ secret واقعی یا ثابت در مخزن نیست؛ gitleaks) */
const rnd = (): string => randomBytes(24).toString('base64url');
const S1 = rnd(), S2 = rnd(), S3 = rnd();

class FixedClock extends Clock {
  constructor(public t: number) {
    super();
  }
  now() {
    return new Date(this.t);
  }
}

describe('URL امضاشدهٔ رسانه', () => {
  const clock = new FixedClock(1_800_000_000_000);
  const env = testEnv({ MEDIA_URL_SECRET: S3 });
  const s = new MediaUrlSigner(env, clock);
  const path = contentPath('s1', 'g1', 'i1');
  const parse = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams);

  it('مسیر H-117 و ۶۰۰ ثانیه؛ تأیید همان کاربر', () => {
    expect(path).toBe('/s/v1/system/sessions/s1/galleries/g1/items/i1/content');
    const q = parse(s.sign(path, 'user-1'));
    expect(Number(q.exp)).toBe(1_800_000_000 + 600);
    expect(q.sig).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(s.verify('GET', path, q)).toBe('user-1');
  });
  it('دست‌کاری u/exp/مسیر/متد، انقضا، ورودی بدشکل ⇒ null', () => {
    const q = parse(s.sign(path, 'user-1'));
    expect(s.verify('GET', path, { ...q, u: 'user-2' })).toBeNull();
    expect(s.verify('GET', path, { ...q, exp: String(Number(q.exp) + 1) })).toBeNull();
    expect(s.verify('GET', `${path}x`, q)).toBeNull();
    expect(s.verify('POST', path, q)).toBeNull();
    expect(s.verify('GET', path, { ...q, sig: undefined })).toBeNull();
    expect(s.verify('GET', path, { ...q, sig: ['a'] })).toBeNull();
    clock.t += 601_000;
    expect(s.verify('GET', path, q)).toBeNull();
    clock.t -= 601_000;
    // کلید دیگر (instance دیگر بدون secret مشترک) ⇒ null
    expect(new MediaUrlSigner(testEnv(), clock).verify('GET', path, q)).toBeNull();
  });
  it('env: production بدون MEDIA_URL_SECRET یا با مقدار ضعیف ⇒ fail-fast؛ خالی در توسعه ⇒ undefined', () => {
    const prod = {
      NODE_ENV: 'production',
      DB_HOST: '127.0.0.1',
      DB_USER: 'u',
      DB_PASSWORD: 'p',
      LOW_JWKS_URL: 'https://api.example/c/jwks',
      INTERNAL_URL_LOW: 'https://api.example/c',
      INTERNAL_URL_MID: 'https://api.example/o',
      CORS_ORIGINS: 'https://admin.example',
      INTERNAL_SECRET_LOW: S1,
      INTERNAL_SECRET_MID: S2
    };
    expect(() => loadEnv(prod)).toThrow(/MEDIA_URL_SECRET/);
    expect(() => loadEnv({ ...prod, MEDIA_URL_SECRET: 'dev-media-secret-' + '0'.repeat(19) })).toThrow(/MEDIA_URL_SECRET/);
    expect(loadEnv({ ...prod, MEDIA_URL_SECRET: rnd() }).MEDIA_URL_SECRET).toBeDefined();
    expect(testEnv({ MEDIA_URL_SECRET: '' }).MEDIA_URL_SECRET).toBeUndefined();
  });
});

describe('permissionAny و ورود به پنل', () => {
  it('permission یا هر یک از permissionAny؛ via برای step-up', () => {
    const d = { permission: 'system.permission.edit', permissionAny: ['system.roles.mid.manage', 'system.roles.low.manage'] };
    expect(grantingPermission(d, ['system.roles.low.manage'])).toEqual({ ok: true, via: 'system.roles.low.manage' });
    expect(grantingPermission(d, ['system.permission.edit', 'system.roles.low.manage']).via).toBe('system.permission.edit');
    expect(grantingPermission(d, ['session.create']).ok).toBe(false);
    expect(grantingPermission({}, []).ok).toBe(true);
  });
  it('نقش high یا مجوز system.*', () => {
    expect(hasPanelAccess({ roleTiers: ['high'], permissions: [] })).toBe(true);
    expect(hasPanelAccess({ roleTiers: ['mid'], permissions: ['session.create'] })).toBe(false);
    expect(hasPanelAccess({ roleTiers: ['mid'], permissions: ['system.sessions.view'] })).toBe(true);
  });
  it('مجوز مدیریت per سطح', () => {
    expect(tierManagePermission('high', 'system.role.manage')).toBe('system.role.manage');
    expect(tierManagePermission('mid', 'system.role.manage')).toBe('system.roles.mid.manage');
    expect(tierManagePermission('low', 'system.stepup.manage')).toBe('system.roles.low.manage');
  });
  it('baseline quran_student به همه اضافه؛ tiers شامل low', () => {
    const m = accessFromRows(['u1', 'u2'], [{ uid: 'u1', t: 't', role: 'teacher', ref: 'mid', perm: null }], ['session.browse']);
    expect(m.get('u1')).toMatchObject({ roles: ['teacher'], roleTiers: ['mid'], tiers: ['mid', 'low'], permissions: ['session.browse'] });
    expect(m.get('u2')!.sources.get('session.browse')).toEqual([{ type: 'baseline', ref: 'quran_student', role: 'quran_student' }]);
    expect(accessFromRows(['u3'], []).get('u3')!.permissions).toEqual([]);
  });
});

describe('seed ۱.۷.۰', () => {
  it('نقش‌های ثابت، پیش‌فرض‌ها و قفل‌ها', () => {
    expect(FIXED_ROLES).toEqual(['developer', 'super_admin', 'teacher', 'guest', 'quran_student']);
    expect(IMPLICIT_ROLES).toEqual(['guest', 'quran_student']);
    expect(LOCKED.developer).toEqual(expect.arrayContaining(NEW_V17));
    for (const p of NEW_V17) expect(DEFAULT_ROLE_PERMS.super_admin).not.toContain(p);
    expect(DEFAULT_ROLE_MODULES.teacher).toEqual(['teaching', 'learning']);
    expect(DEFAULT_ROLE_PERMS.guest).toEqual(['session.browse', 'gallery.view']);
    const by = Object.fromEntries(SEED_PERMISSIONS.map((p) => [p.key, p]));
    expect([by['system.evaluation.manage']!.stepUp, by['system.content.moderate']!.stepUp, by['system.roles.mid.manage']!.stepUp]).toEqual(['required', 'none', 'required']);
    expect([by['session.create']!.module, by['session.create']!.legacyModule]).toEqual(['teaching', 'sessions']);
  });
});
