import { describe, expect, it } from 'vitest';
import { CONFLICT_REASONS, ERROR_CATALOG, ERROR_CODES, ErrorEnvelope } from '../src';

describe('کاتالوگ خطا', () => {
  it('کدها SCREAMING_SNAKE و پیام فارسی دارند', () => {
    for (const c of ERROR_CODES) {
      expect(c).toMatch(/^[A-Z][A-Z0-9_]+$/);
      expect(ERROR_CATALOG[c].messageFa).toMatch(/[؀-ۿ]/);
    }
  });
  it('status ها استاندارد و دسته‌بندی منطقی', () => {
    for (const c of ERROR_CODES) {
      const { status } = ERROR_CATALOG[c];
      if (c.startsWith('AUTH_') && !['AUTH_FORBIDDEN', 'AUTH_STEP_UP_REQUIRED', 'AUTH_PASSWORD_CHANGE_REQUIRED', 'AUTH_ACCOUNT_DISABLED', 'AUTH_OTP_INVALID', 'AUTH_OTP_EXPIRED', 'AUTH_OTP_EXHAUSTED', 'AUTH_OTP_SEND_FAILED'].includes(c))
        expect(status).toBe(401);
    }
    expect(ERROR_CATALOG.AUTH_FORBIDDEN.status).toBe(403);
    expect(ERROR_CATALOG.AUTH_STEP_UP_REQUIRED.status).toBe(403);
    expect(ERROR_CATALOG.RATE_LIMITED.status).toBe(429);
    expect(ERROR_CATALOG.RATE_LIMITED.retriable).toBe(true);
    expect(ERROR_CATALOG.CONFLICT.status).toBe(409);
    expect(ERROR_CATALOG.INTERNAL_ERROR.retriable).toBe(true);
    expect(ERROR_CATALOG.AUTH_OTP_INVALID.retriable).toBe(false);
  });
  it('پوشش دلایل CONFLICT مستند‌شده', () => {
    expect(CONFLICT_REASONS).toEqual(expect.arrayContaining(['ALREADY_MEMBER', 'LAST_HOLDER', 'VERSION_MISMATCH', 'NOT_PRESENT', 'ALREADY_EVALUATED']));
  });
  it('قالب خطا: stack/فیلد اضافه ندارد', () => {
    const good = { success: false, error: { code: 'NOT_FOUND', message: 'پیدا نشد.' }, meta: { requestId: 'req-12345678' } };
    expect(ErrorEnvelope.safeParse(good).success).toBe(true);
    expect(ErrorEnvelope.safeParse({ ...good, error: { ...good.error, code: 'NOPE' } }).success).toBe(false);
    expect(ErrorEnvelope.safeParse({ ...good, success: true }).success).toBe(false);
  });
});
