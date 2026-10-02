import { describe, expect, it } from 'vitest';
import { normalizePhone, toLatinDigits, formatPhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['09121234567', '09121234567'],
    ['۰۹۱۲۱۲۳۴۵۶۷', '09121234567'],
    ['٠٩١٢١٢٣٤٥٦٧', '09121234567'],
    ['+989121234567', '09121234567'],
    ['00989121234567', '09121234567'],
    ['989121234567', '09121234567'],
    ['9121234567', '09121234567'],
    ['0912 123 4567', '09121234567'],
    ['0912-123-4567', '09121234567']
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '0912', '08121234567', '091212345678', 'abc', '0912123456a'])('رد می‌شود: %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('ارقام را لاتین می‌کند', () => {
    expect(toLatinDigits('۱۲۳٤٥')).toBe('12345');
  });
  it('نمایش شماره', () => {
    expect(formatPhone('09121234567')).toBe('0912 123 4567');
  });
});
