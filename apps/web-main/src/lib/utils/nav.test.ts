import { describe, expect, it } from 'vitest';
import { safeNext } from './nav';

describe('safeNext (جلوگیری از open-redirect)', () => {
  it('مسیر داخلی مجاز است', () => {
    expect(safeNext('/sessions?status=started')).toBe('/sessions?status=started');
  });
  it.each(['//evil.com', 'https://evil.com', '/\\evil.com', 'evil', '', null, undefined])('رد می‌شود: %s', (v) => {
    expect(safeNext(v as string | null | undefined)).toBe('/');
  });
});
