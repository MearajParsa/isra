import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMS, LOCKED, permissionsOf, previewScore, touchesDeveloper, validateRolePermissions, validateSettings, wouldLeaveNoHolder } from './highRules';

const okSettings = { version: 1, evalWeights: { voice: 40, tone: 30, tajweed: 30 }, badgeThresholds: [50, 150, 300, 500] as [number, number, number, number], flags: { maintenance_mode: false, registration_open: true } };

describe('تنظیمات سراسری', () => {
  it('پیش‌فرض‌ها معتبرند (۴۰/۳۰/۳۰ و ۵۰/۱۵۰/۳۰۰/۵۰۰)', () => {
    expect(validateSettings(okSettings)).toEqual({});
  });
  it('مجموع وزن‌ها باید ۱۰۰ باشد', () => {
    expect(validateSettings({ ...okSettings, evalWeights: { voice: 50, tone: 30, tajweed: 30 } }).evalWeights).toBeTruthy();
    expect(validateSettings({ ...okSettings, evalWeights: { voice: 60, tone: 40, tajweed: 0 } })).toEqual({});
    expect(validateSettings({ ...okSettings, evalWeights: { voice: 40.5, tone: 29.5, tajweed: 30 } }).evalWeights).toBeTruthy();
    expect(validateSettings({ ...okSettings, evalWeights: { voice: -10, tone: 60, tajweed: 50 } }).evalWeights).toBeTruthy();
  });
  it('آستانه‌ها اکیداً صعودی و مثبت', () => {
    expect(validateSettings({ ...okSettings, badgeThresholds: [50, 50, 300, 500] }).badgeThresholds).toBeTruthy();
    expect(validateSettings({ ...okSettings, badgeThresholds: [50, 150, 100, 500] }).badgeThresholds).toBeTruthy();
    expect(validateSettings({ ...okSettings, badgeThresholds: [0, 150, 300, 500] }).badgeThresholds).toBeTruthy();
    expect(validateSettings({ ...okSettings, badgeThresholds: [10, 20, 30, 40] })).toEqual({});
  });
  it('پرچم ناشناخته رد می‌شود', () => {
    expect(validateSettings({ ...okSettings, flags: { ...okSettings.flags, evil: true } as never }).flags).toBeTruthy();
  });
  it('پیش‌نمایش امتیاز با وزن سفارشی', () => {
    expect(previewScore({ voice: 10, tone: 0, tajweed: 0 }, { voice: 40, tone: 30, tajweed: 30 })).toBe(40);
    expect(previewScore({ voice: 10, tone: 0, tajweed: 0 }, { voice: 50, tone: 25, tajweed: 25 })).toBe(50);
  });
});

describe('ماتریس مجوز نقش‌ها', () => {
  it('developer ثابت است', () => {
    expect(validateRolePermissions('developer', LOCKED.developer)).toMatchObject({ ok: false, reason: 'DEVELOPER_FIXED' });
  });
  it('super_admin: مجوز قفل‌شده برداشته نمی‌شود', () => {
    const r = validateRolePermissions('super_admin', ['system.settings.view']);
    expect(r).toMatchObject({ ok: false, reason: 'LOCKED_PERMISSION' });
    expect(validateRolePermissions('super_admin', DEFAULT_ROLE_PERMS.super_admin)).toEqual({ ok: true });
    // مجوزهای قفل‌نشده قابل کم‌کردن‌اند
    expect(validateRolePermissions('super_admin', LOCKED.super_admin)).toEqual({ ok: true });
  });
  it('مجوز ناشناخته', () => {
    expect(validateRolePermissions('super_admin', [...LOCKED.super_admin, 'x.y' as never])).toMatchObject({ reason: 'UNKNOWN_PERMISSION' });
  });
  it('اجتماع مجوزها', () => {
    expect(permissionsOf(['super_admin'], DEFAULT_ROLE_PERMS)).toContain('system.audit.view');
    expect(permissionsOf([], DEFAULT_ROLE_PERMS)).toEqual([]);
  });
});

describe('قفل نقش‌ها', () => {
  it('آخرین دارنده', () => {
    expect(wouldLeaveNoHolder(0)).toBe(true);
    expect(wouldLeaveNoHolder(1)).toBe(false);
  });
  it('تغییر developer', () => {
    expect(touchesDeveloper(['developer'], [])).toBe(true);
    expect(touchesDeveloper([], ['developer'])).toBe(true);
    expect(touchesDeveloper(['super_admin'], ['super_admin', 'developer'])).toBe(true);
    expect(touchesDeveloper(['super_admin'], [])).toBe(false);
  });
});
