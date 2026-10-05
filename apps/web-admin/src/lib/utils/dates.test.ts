import { describe, expect, it } from 'vitest';
import { addDays, detectPreset, diffDays, isValidIsoDate, presetRange, todayTehran, validateRange } from './dates';

describe('dates', () => {
  it('امروز به وقت تهران (UTC+3:30)', () => {
    expect(todayTehran(new Date('2026-10-05T21:00:00Z'))).toBe('2026-10-06');
    expect(todayTehran(new Date('2026-10-05T10:00:00Z'))).toBe('2026-10-05');
  });
  it('addDays/diffDays از مرز ماه و سال', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-01-01', '2026-12-31')).toBe(364);
  });
  it('پیش‌تنظیم‌ها شامل امروز', () => {
    expect(presetRange('7d', '2026-10-05')).toEqual({ from: '2026-09-29', to: '2026-10-05' });
    expect(presetRange('30d', '2026-10-05').from).toBe('2026-09-06');
    expect(diffDays(presetRange('year', '2026-10-05').from, '2026-10-05') + 1).toBe(365);
  });
  it('تشخیص پیش‌تنظیم', () => {
    const t = '2026-10-05';
    expect(detectPreset('2026-09-06', t, t)).toBe('30d');
    expect(detectPreset('2026-09-06', '2026-10-04', t)).toBe('custom');
    expect(detectPreset('2026-01-01', t, t)).toBe('custom');
  });
  it('اعتبار تاریخ', () => {
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('x')).toBe(false);
  });
  it('اعتبارسنجی بازه: ترتیب و سقف ۳۶۶', () => {
    expect(validateRange('2026-01-01', '2026-01-31').ok).toBe(true);
    expect(validateRange('2026-02-01', '2026-01-31').ok).toBe(false);
    expect(validateRange('2026-01-01', '2027-01-01').ok).toBe(true); // ۳۶۶ روز
    expect(validateRange('2026-01-01', '2027-01-02').ok).toBe(false);
    expect(validateRange('', '2026-01-02').ok).toBe(false);
  });
});
