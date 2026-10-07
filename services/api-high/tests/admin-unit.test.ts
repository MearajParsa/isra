import { describe, expect, it } from 'vitest';
import { AppError } from '../src/common/app-error';
import { maskIp } from '../src/common/phone';
import { bucketStart, fillSeries, parseDay, resolveRange } from '../src/common/tehran';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMS, LOCKED, NEW_V16 } from '../src/db/rbac-seed';

const day = (s: string) => parseDay(s)!;

describe('maskIp', () => {
  it('IPv4: دو octet آخر؛ IPv6: دو گروه آخر؛ mapped؛ نامعتبر', () => {
    expect(maskIp('192.168.10.77')).toBe('192.168.*.*');
    expect(maskIp('::ffff:10.20.30.40')).toBe('10.20.*.*');
    expect(maskIp('2001:db8:85a3:0:0:8a2e:370:7334')).toBe('2001:db8:85a3:0:0:8a2e:*:*');
    expect(maskIp('2001:db8::1')).toBe('2001:db8:0:0:0:0:*:*');
    expect(maskIp('::1')).toBe('0:0:0:0:0:0:*:*');
    expect(maskIp('garbage')).toBe('*');
    expect(maskIp('')).toBe('*');
  });
});

describe('tehran: بازه و سطل‌ها', () => {
  it('parseDay تاریخ واقعی تقویم را می‌پذیرد', () => {
    expect(parseDay('2026-02-28')).not.toBeNull();
    expect(parseDay('2026-02-29')).toBeNull();
    expect(parseDay('2026-13-01')).toBeNull();
    expect(parseDay('26-1-1')).toBeNull();
  });

  it('resolveRange: پیش‌فرض ۳۰ روز تهران (۲۰:۳۰ UTC همان روز ⇒ فردا)', () => {
    const r = resolveRange(new Date('2026-10-05T20:45:00Z'));
    expect(r).toMatchObject({ from: '2026-09-06', to: '2026-10-06' });
    expect(r.fromUtc.toISOString()).toBe('2026-09-05T20:30:00.000Z');
    expect(r.toUtcExclusive.toISOString()).toBe('2026-10-06T20:30:00.000Z');
  });

  it('resolveRange: خطاها VALIDATION_FAILED با fields', () => {
    const now = new Date('2026-10-05T10:00:00Z');
    const err = (f?: string, t?: string) => {
      try {
        resolveRange(now, f, t);
      } catch (e) {
        return e as AppError;
      }
      return null;
    };
    expect(err('2026-10-02', '2026-10-01')).toMatchObject({ code: 'VALIDATION_FAILED', details: { fields: { from: expect.any(String) } } });
    expect(err('2025-01-01', '2026-01-03')).toMatchObject({ code: 'VALIDATION_FAILED', details: { fields: { to: expect.any(String) } } });
    expect(err('2025-01-01', '2026-01-02')).toBeNull();
    expect(err('2026-02-30', '2026-03-01')).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(err(undefined, '2026-99-99')).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(err('2026-12-01')).toMatchObject({ code: 'VALIDATION_FAILED' }); // from بعد از امروز (to پیش‌فرض)
  });

  it('bucketStart: هفته از شنبه، ماه از اول ماه', () => {
    // 2026-10-03 شنبه
    expect(bucketStart(day('2026-10-03'), 'week')).toBe(day('2026-10-03'));
    expect(bucketStart(day('2026-10-04'), 'week')).toBe(day('2026-10-03')); // یک‌شنبه
    expect(bucketStart(day('2026-10-09'), 'week')).toBe(day('2026-10-03')); // جمعه
    expect(bucketStart(day('2026-10-10'), 'week')).toBe(day('2026-10-10'));
    expect(bucketStart(day('2026-10-17'), 'month')).toBe(day('2026-10-01'));
    expect(bucketStart(day('2026-10-17'), 'day')).toBe(day('2026-10-17'));
  });

  it('fillSeries: zero-fill و مرز ماه/سال', () => {
    const range = resolveRange(new Date('2026-01-10T10:00:00Z'), '2025-12-30', '2026-01-03');
    const perDay = new Map([['2025-12-31', 2], ['2026-01-02', 1], ['2027-01-01', 9]]);
    expect(fillSeries(range, 'day', perDay)).toEqual([
      { bucket: '2025-12-30', count: 0 },
      { bucket: '2025-12-31', count: 2 },
      { bucket: '2026-01-01', count: 0 },
      { bucket: '2026-01-02', count: 1 },
      { bucket: '2026-01-03', count: 0 }
    ]);
    expect(fillSeries(range, 'month', perDay)).toEqual([
      { bucket: '2025-12-01', count: 2 },
      { bucket: '2026-01-01', count: 1 }
    ]);
  });
});

describe('ماتریس مجوز پیش‌فرض ۱.۴', () => {
  it('developer همه قفل؛ super_admin: sessions.view/reports.view بدون قفل و بدون manage', () => {
    expect(ALL_PERMISSIONS).toHaveLength(19);
    for (const p of NEW_V16) expect(DEFAULT_ROLE_PERMS.super_admin!).not.toContain(p);
    expect([...LOCKED.developer!].sort()).toEqual([...ALL_PERMISSIONS].sort());
    expect(DEFAULT_ROLE_PERMS.super_admin!).toEqual(expect.arrayContaining(['system.sessions.view', 'system.reports.view']));
    expect(DEFAULT_ROLE_PERMS.super_admin!).not.toContain('system.users.manage');
    expect(DEFAULT_ROLE_PERMS.super_admin!).not.toContain('system.sessions.manage');
    expect(LOCKED.super_admin!).not.toContain('system.sessions.view');
    expect(LOCKED.super_admin!).not.toContain('system.reports.view');
  });
});
