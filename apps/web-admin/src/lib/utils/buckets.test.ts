import { describe, expect, it } from 'vitest';
import { bucketLabel, bucketTitle, jalaliString, niceMax, tickIndexes } from './buckets';

describe('bucket labels', () => {
  it('روز و هفته: روز و ماه جلالی', () => {
    expect(bucketLabel('2026-10-06', 'day')).toBe('۱۴ مهر');
    expect(bucketLabel('2026-10-03', 'week')).toBe('۱۱ مهر');
  });
  it('ماه: نام ماه و سال', () => {
    expect(bucketLabel('2026-10-01', 'month')).toBe('مهر ۱۴۰۵');
  });
  it('عنوان کامل', () => {
    expect(bucketTitle('2026-10-06', 'day')).toBe('۱۴ مهر ۱۴۰۵');
    expect(bucketTitle('2026-10-03', 'week')).toBe('هفتهٔ ۱۱ مهر ۱۴۰۵');
    expect(bucketTitle('2026-10-01', 'month')).toBe('مهر ۱۴۰۵');
  });
  it('ورودی نامعتبر برگردانده می‌شود', () => {
    expect(bucketLabel('abc', 'day')).toBe('abc');
  });
  it('تاریخ عددی', () => {
    expect(jalaliString('2026-03-21')).toBe('۱۴۰۵/۰۱/۰۱');
  });
  it('tickIndexes و niceMax', () => {
    expect(tickIndexes(5, 8)).toEqual([0, 1, 2, 3, 4]);
    expect(tickIndexes(30, 7).length).toBeLessThanOrEqual(7);
    expect(tickIndexes(30, 7)[0]).toBe(0);
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(130)).toBe(200);
    expect(niceMax(1)).toBe(1);
  });
});
