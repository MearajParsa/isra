import { describe, expect, it } from 'vitest';
import { formatCountdown, formatRelative, scheduleLabel } from './format';

describe('format', () => {
  it('شمارندهٔ معکوس', () => {
    expect(formatCountdown(120)).toBe('۲:۰۰');
    expect(formatCountdown(65)).toBe('۱:۰۵');
  });
  it('زمان نسبی', () => {
    const now = Date.parse('2026-01-10T12:00:00Z');
    expect(formatRelative('2026-01-10T11:59:40Z', now)).toBe('همین حالا');
    expect(formatRelative('2026-01-10T11:30:00Z', now)).toBe('۳۰ دقیقه پیش');
    expect(formatRelative('2026-01-10T09:00:00Z', now)).toBe('۳ ساعت پیش');
  });
  it('زمان‌بندی تکرارشونده (شنبه=۰)', () => {
    const label = scheduleLabel({ type: 'recurring', weekdays: [0, 5], timeOfDay: '18:00', durationMin: 60 });
    expect(label).toContain('شنبه');
    expect(label).toContain('پنجشنبه');
    expect(label).toContain('۱۸:۰۰');
  });
});

import { fromTehranInput, toTehranDateInput, toTehranInput } from './format';

describe('ورودی تاریخ به وقت تهران', () => {
  it('رفت‌وبرگشت', () => {
    expect(fromTehranInput('2026-10-03T09:00')).toBe('2026-10-03T05:30:00.000Z');
    expect(toTehranInput('2026-10-03T05:30:00.000Z')).toBe('2026-10-03T09:00');
    expect(toTehranDateInput('2026-10-03T05:30:00.000Z')).toBe('2026-10-03');
    expect(fromTehranInput('2026-10-03')).toBe('2026-10-02T20:30:00.000Z');
  });
  it('ورودی ناقص', () => {
    expect(fromTehranInput('')).toBe('');
    expect(fromTehranInput('abc')).toBe('');
  });
});
