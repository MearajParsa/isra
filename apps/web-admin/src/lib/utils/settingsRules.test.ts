import { describe, expect, it } from 'vitest';
import { validateSettings } from './settingsRules';

const okSettings = { version: 1, flags: { maintenance_mode: false, registration_open: true } };

describe('تنظیمات سراسری (۱.۷.۰: فقط پرچم‌ها)', () => {
  it('پرچم‌های مجاز معتبرند', () => {
    expect(validateSettings(okSettings)).toEqual({});
  });
  it('پرچم ناشناخته رد می‌شود', () => {
    expect(validateSettings({ ...okSettings, flags: { ...okSettings.flags, evil: true } as never }).flags).toBeTruthy();
  });
});
