import { describe, expect, it } from 'vitest';
import { gregorianStringToJalali, isJalaliLeap, jalaliMonthLength, jalaliToGregorianString, toGregorian, toJalali } from './jalali';

const fa = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
const intlJalali = (y: number, m: number, d: number) => {
  const p = fa.formatToParts(new Date(Date.UTC(y, m - 1, d))).reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return { jy: Number(p.relatedYear ?? p.year), jm: Number(p.month), jd: Number(p.day) };
};

describe('تقویم جلالی', () => {
  it('نمونه‌های شناخته‌شده', () => {
    expect(toJalali(2030, 1, 4)).toEqual({ jy: 1408, jm: 10, jd: 15 });
    expect(toJalali(2026, 3, 21)).toEqual({ jy: 1405, jm: 1, jd: 1 });
    expect(toGregorian(1405, 1, 1)).toEqual({ gy: 2026, gm: 3, gd: 21 });
  });

  it('با Intl (ICU) روی ۱۴۰۰ روز پیاپی از ۱۳۹۰ تا ۱۴۱۵ یکی است', () => {
    for (let t = Date.UTC(2011, 0, 1); t < Date.UTC(2036, 11, 31); t += 7 * 86_400_000 + 3_600_000 * 5) {
      const d = new Date(t);
      const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
      expect(toJalali(y, m, day), `${y}-${m}-${day}`).toEqual(intlJalali(y, m, day));
    }
  });

  it('رفت‌وبرگشت بدون خطا (ده‌ها سال، هر روز)', () => {
    for (let t = Date.UTC(2020, 0, 1); t < Date.UTC(2040, 0, 1); t += 86_400_000) {
      const d = new Date(t);
      const g = { gy: d.getUTCFullYear(), gm: d.getUTCMonth() + 1, gd: d.getUTCDate() };
      const j = toJalali(g.gy, g.gm, g.gd);
      expect(toGregorian(j.jy, j.jm, j.jd)).toEqual(g);
    }
  });

  it('طول ماه و سال کبیسه (۱۴۰۳ کبیسه؛ ۱۴۰۴ نه)', () => {
    expect(isJalaliLeap(1403)).toBe(true);
    expect(isJalaliLeap(1404)).toBe(false);
    expect(jalaliMonthLength(1405, 1)).toBe(31);
    expect(jalaliMonthLength(1405, 7)).toBe(30);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
  });

  it('رشته‌ها', () => {
    expect(gregorianStringToJalali('2030-01-04T21:00')).toEqual({ jy: 1408, jm: 10, jd: 15 });
    expect(gregorianStringToJalali('')).toBeNull();
    expect(jalaliToGregorianString(1408, 10, 15)).toBe('2030-01-04');
  });
});
