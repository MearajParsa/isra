import { describe, expect, it } from 'vitest';
import { defaultSchedule, mapServerFields, normalizeSession, validateSession } from './sessionForm';
import type { SessionInput } from '$lib/api/high-types';

const ok = (): SessionInput => ({
  title: 'جلسهٔ هفتگی',
  description: 'توضیحات کافی برای جلسه',
  schedule: { type: 'once', startsAt: '2026-10-10T14:30:00.000Z', endsAt: '2026-10-10T15:30:00.000Z' },
  location: { label: 'مسجد', routeUrl: 'https://balad.ir/x' }
});

describe('validateSession', () => {
  it('ورودی درست خطا ندارد', () => {
    expect(validateSession(ok())).toEqual({});
  });
  it('حدود متن', () => {
    const e = validateSession({ ...ok(), title: 'ab', description: 'کوتاه', location: { label: 'x' } });
    expect(Object.keys(e).sort()).toEqual(['description', 'location', 'title']);
  });
  it('لینک باید https باشد', () => {
    expect(validateSession({ ...ok(), location: { label: 'مسجد', routeUrl: 'http://x.ir' } })['location.routeUrl']).toBeTruthy();
    expect(validateSession({ ...ok(), location: { label: 'مسجد', routeUrl: 'javascript:alert(1)' } })['location.routeUrl']).toBeTruthy();
    expect(validateSession({ ...ok(), location: { label: 'مسجد', routeUrl: '' } })['location.routeUrl']).toBeUndefined();
  });
  it('once: پایان بعد از شروع', () => {
    const v = ok();
    v.schedule = { type: 'once', startsAt: '2026-10-10T15:30:00.000Z', endsAt: '2026-10-10T15:30:00.000Z' };
    expect(validateSession(v).endsAt).toBeTruthy();
  });
  it('recurring: روز، ساعت و مدت', () => {
    const e = validateSession({ ...ok(), schedule: { type: 'recurring', weekdays: [], timeOfDay: '25:00', durationMin: 5 } });
    expect(Object.keys(e).sort()).toEqual(['durationMin', 'timeOfDay', 'weekdays']);
  });
  it('range: ترتیب تاریخ', () => {
    const e = validateSession({ ...ok(), schedule: { type: 'range', rangeFrom: '2026-10-10T00:00:00.000Z', rangeTo: '2026-10-01T00:00:00.000Z', weekdays: [1], timeOfDay: '18:00', durationMin: 60 } });
    expect(e.rangeTo).toBeTruthy();
  });
});

describe('کمکی‌ها', () => {
  it('normalize: فاصله‌ها و لینک خالی', () => {
    const n = normalizeSession({ ...ok(), title: '  عنوان  ', location: { label: ' م ک ', routeUrl: '  ' } });
    expect(n.title).toBe('عنوان');
    expect(n.location).toEqual({ label: 'م ک', routeUrl: null });
  });
  it('mapServerFields', () => {
    expect(mapServerFields({ 'schedule.endsAt': 'x', 'location.label': 'y' })).toMatchObject({ endsAt: 'x', location: 'y' });
  });
  it('defaultSchedule', () => {
    expect(defaultSchedule('once', 0).type).toBe('once');
    expect(defaultSchedule('range', 0).type).toBe('range');
  });
});
