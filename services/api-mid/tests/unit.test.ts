import { describe, expect, it } from 'vitest';
import { ATTENDANCE_POINTS, canTransition, computeScore, evalPoints, permissionsFor } from '../src/domain/rules';
import { type Schedule, nextStartMs, nextStartsAt, toTehranIso } from '../src/domain/schedule';
import { loadEnv } from '../src/config/env';

describe('مجوزها (قفل #15)', () => {
  it('manager به‌تنهایی eval.submit ندارد؛ با teacher/supporter دارد', () => {
    expect(permissionsFor(['session_manager'])).not.toContain('eval.submit');
    expect(permissionsFor(['session_manager', 'teacher'])).toContain('eval.submit');
    expect(permissionsFor(['session_manager', 'session_supporter'])).toContain('eval.submit');
  });
  it('جدول مجوزها', () => {
    expect(permissionsFor(['quran_student'])).toEqual([]);
    expect(permissionsFor(['teacher']).sort()).toEqual(['attendance.manage', 'attendance.view', 'eval.submit', 'occurrence.manage', 'queue.manage']);
    expect(permissionsFor(['session_supporter'])).toContain('membership.approve');
    expect(permissionsFor(['teacher'])).not.toContain('membership.approve');
    expect(permissionsFor(['session_manager'])).toEqual(expect.arrayContaining(['session.edit', 'session.transition', 'membership.roles']));
  });
});

describe('چرخهٔ حیات', () => {
  it('فقط یک قدم رو به جلو', () => {
    expect(canTransition('draft', 'scheduled')).toBe(true);
    expect(canTransition('scheduled', 'started')).toBe(true);
    expect(canTransition('started', 'ended')).toBe(true);
    expect(canTransition('draft', 'started')).toBe(false);
    expect(canTransition('started', 'scheduled')).toBe(false);
    expect(canTransition('ended', 'started')).toBe(false);
    expect(canTransition('draft', 'draft')).toBe(false);
  });
});

describe('امتیاز', () => {
  it('وزن پیش‌فرض ۴۰/۳۰/۳۰', () => {
    expect(computeScore({ voice: 10, tone: 10, tajweed: 10 })).toBe(100);
    expect(computeScore({ voice: 0, tone: 0, tajweed: 0 })).toBe(0);
    expect(computeScore({ voice: 8, tone: 6, tajweed: 7 })).toBe(4 * 8 + 3 * 6 + 3 * 7);
  });
  it('وزن سفارشی (فقط صوت)', () => {
    expect(computeScore({ voice: 9, tone: 1, tajweed: 1 }, { voice: 100, tone: 0, tajweed: 0 })).toBe(90);
  });
  it('امتیاز ارزیابی = round(score/10)؛ حضور +۵', () => {
    expect(evalPoints(100)).toBe(10);
    expect(evalPoints(74)).toBe(7);
    expect(evalPoints(75)).toBe(8);
    expect(ATTENDANCE_POINTS).toBe(5);
  });
});

describe('زمان‌بندی (Asia/Tehran، شنبه=۰)', () => {
  it('toTehranIso', () => expect(toTehranIso(Date.UTC(2030, 0, 4, 14, 30))).toBe('2030-01-04T18:00:00+03:30'));

  it('once: آینده ⇒ startsAt؛ گذشته ⇒ null', () => {
    const s: Schedule = { type: 'once', startsAt: '2030-01-04T18:00:00+03:30', endsAt: '2030-01-04T20:00:00+03:30' };
    expect(nextStartsAt(s, new Date('2029-12-01T00:00:00Z'))).toBe('2030-01-04T18:00:00+03:30');
    expect(nextStartsAt(s, new Date('2030-02-01T00:00:00Z'))).toBeNull();
  });

  it('recurring: جمعه‌ها ۲۱:۰۰ — از چهارشنبه ۱۴۰۸/... بعدی جمعه است', () => {
    // 2030-01-02 چهارشنبه (UTC)؛ جمعه بعدی = 2030-01-04
    const s: Schedule = { type: 'recurring', weekdays: [6], timeOfDay: '21:00', durationMin: 90 };
    expect(nextStartsAt(s, new Date('2030-01-02T10:00:00Z'))).toBe('2030-01-04T21:00:00+03:30');
  });

  it('recurring: همان روز ولی ساعت گذشته ⇒ هفتهٔ بعد', () => {
    const s: Schedule = { type: 'recurring', weekdays: [6], timeOfDay: '08:00', durationMin: 60 };
    // جمعه 2030-01-04 ۲۰:۰۰ به وقت تهران (۱۶:۳۰ UTC) گذشته از ۰۸:۰۰
    expect(nextStartsAt(s, new Date('2030-01-04T16:30:00Z'))).toBe('2030-01-11T08:00:00+03:30');
  });

  it('شنبه=۰: شنبهٔ ۲۰۳۰-۰۱-۰۵', () => {
    const s: Schedule = { type: 'recurring', weekdays: [0], timeOfDay: '10:00', durationMin: 60 };
    expect(nextStartsAt(s, new Date('2030-01-02T10:00:00Z'))).toBe('2030-01-05T10:00:00+03:30');
  });

  it('range: بیرون بازه ⇒ null؛ داخل بازه ⇒ اولین روز مجاز', () => {
    const s: Schedule = { type: 'range', rangeFrom: '2030-02-01T00:00:00+03:30', rangeTo: '2030-02-28T23:59:00+03:30', weekdays: [6], timeOfDay: '18:00', durationMin: 60 };
    expect(nextStartMs(s, Date.parse('2030-03-10T00:00:00Z'))).toBeNull();
    expect(nextStartsAt(s, new Date('2030-01-20T00:00:00Z'))).toBe('2030-02-01T18:00:00+03:30'); // جمعه
  });
});

describe('env (fail-fast)', () => {
  it('LOW_JWKS_URL و secret اجباری‌اند', () => {
    expect(() => loadEnv({ NODE_ENV: 'test' })).toThrow(/LOW_JWKS_URL|DB_HOST/);
  });
  it('production: INTERNAL_URL_LOW و CORS الزامی', () => {
    expect(() =>
      loadEnv({ NODE_ENV: 'production', DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p', LOW_JWKS_URL: 'https://api.israapp.ir/c/.well-known/jwks.json', INTERNAL_SECRET_LOW: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', INTERNAL_SECRET_HIGH: 'f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1' })
    ).toThrow(/INTERNAL_URL_LOW|CORS_ORIGINS/);
  });
  it('production: secret نمونه/ضعیف، تکراری و URL غیر https رد می‌شود', () => {
    const base = { NODE_ENV: 'production', DB_HOST: 'localhost', DB_USER: 'u', DB_PASSWORD: 'p', LOW_JWKS_URL: 'https://api.israapp.ir/c/.well-known/jwks.json', INTERNAL_URL_LOW: 'https://api.israapp.ir/c', CORS_ORIGINS: 'https://israapp.ir', INTERNAL_SECRET_LOW: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', INTERNAL_SECRET_HIGH: 'f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1' };
    expect(loadEnv(base).NODE_ENV).toBe('production');
    expect(() => loadEnv({ ...base, INTERNAL_SECRET_LOW: 'dev-pair-low-mid-0123456789abcdef0123' })).toThrow(/INTERNAL_SECRET_LOW/);
    expect(() => loadEnv({ ...base, INTERNAL_SECRET_HIGH: base.INTERNAL_SECRET_LOW })).toThrow(/مستقل/);
    expect(() => loadEnv({ ...base, LOW_JWKS_URL: 'http://evil.example/?x=localhost' })).toThrow(/LOW_JWKS_URL/);
    expect(() => loadEnv({ ...base, DB_HOST: 'db.example.com' })).toThrow(/DB_SSL/);
  });
  it('NODE_ENV پیش‌فرض production است (fail-closed)', () => {
    expect(() => loadEnv({ DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p', LOW_JWKS_URL: 'http://localhost/jwks', INTERNAL_SECRET_LOW: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', INTERNAL_SECRET_HIGH: 'f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1' })).toThrow(/CORS_ORIGINS|INTERNAL_URL_LOW/);
  });
});
