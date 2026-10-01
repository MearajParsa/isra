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
