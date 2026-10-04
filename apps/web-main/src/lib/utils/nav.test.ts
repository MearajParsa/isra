import { describe, expect, it } from 'vitest';
import { safeNext } from './nav';

describe('safeNext (جلوگیری از open-redirect)', () => {
  it.each(['/ok', '/ok?a=1#h', '/sessions?status=started'])('مجاز: %s', (v) => {
    expect(safeNext(v)).toBe(v);
  });
  it.each([
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    '/%2f/evil',
    'https://evil.com',
    'javascript:alert(1)',
    'evil',
    '',
    null,
    undefined,
    42
  ])('رد می‌شود: %s', (v) => {
    expect(safeNext(v as string | null | undefined)).toBe('/');
  });
  it('fallback سفارشی', () => {
    expect(safeNext('//evil.com', '/home')).toBe('/home');
  });
});
