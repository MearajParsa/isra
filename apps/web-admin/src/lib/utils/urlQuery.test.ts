import { describe, expect, it } from 'vitest';
import { applyPatch, defaults, isPageString, pageNumber, parseQuery, serializeQuery, type QuerySpec } from './urlQuery';

const spec = {
  q: { def: '' },
  status: { def: '', allowed: ['active', 'disabled', 'deleted'] as const },
  sort: { def: 'newest', allowed: ['newest', 'oldest', 'name'] as const },
  from: { def: '', valid: (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) },
  page: { def: '1', valid: isPageString, resetsPage: false }
} satisfies QuerySpec;

describe('urlQuery', () => {
  it('پیش‌فرض‌ها در URL نمی‌آیند', () => {
    expect(serializeQuery(spec, defaults(spec))).toBe('');
    expect(serializeQuery(spec, { ...defaults(spec), q: 'علی', sort: 'name', page: '3' })).toBe('?q=%D8%B9%D9%84%DB%8C&sort=name&page=3');
  });
  it('رفت‌وبرگشت', () => {
    const v = { q: 'علی', status: 'disabled', sort: 'oldest', from: '2026-01-01', page: '2' };
    expect(parseQuery(spec, new URLSearchParams(serializeQuery(spec, v)))).toEqual(v);
  });
  it('مقدار نامعتبر به پیش‌فرض برمی‌گردد', () => {
    const v = parseQuery(spec, new URLSearchParams('status=hacked&sort=zzz&from=abc&page=-4'));
    expect(v).toEqual(defaults(spec));
  });
  it('تغییر فیلتر صفحه را ۱ می‌کند ولی تغییر صفحه نه', () => {
    const cur = { ...defaults(spec), page: '4' };
    expect(applyPatch(spec, cur, { q: 'x' }).page).toBe('1');
    expect(applyPatch(spec, cur, { page: '5' }).page).toBe('5');
    expect(applyPatch(spec, cur, { q: '' }).page).toBe('4');
  });
  it('pageNumber', () => {
    expect(pageNumber('7')).toBe(7);
    expect(pageNumber('x')).toBe(1);
    expect(pageNumber('0')).toBe(1);
  });
});
