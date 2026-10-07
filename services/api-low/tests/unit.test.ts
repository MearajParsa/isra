import { describe, expect, it } from 'vitest';
import { hmac256, maskPhone, randomOtp, safeEqual } from '../src/common/crypto';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../src/common/ids';
import { normalizePhone } from '../src/common/phone';
import { endpoint, fullPath } from '../src/common/ep';
import { EnvSchema, loadEnv } from '../src/config/env';
import { testEnv } from './helpers/app';

describe('normalizePhone', () => {
  it.each([
    ['09121234567', '09121234567'],
    ['+989121234567', '09121234567'],
    ['00989121234567', '09121234567'],
    ['989121234567', '09121234567'],
    ['9121234567', '09121234567'],
    ['۰۹۱۲۱۲۳۴۵۶۷', '09121234567'],
    ['٠٩١٢١٢٣٤٥٦٧', '09121234567'],
    ['0912 123 4567', '09121234567'],
    ['0912-123-4567', '09121234567']
  ])('%s ⇒ %s', (i, o) => expect(normalizePhone(i)).toBe(o));

  it('ورودی نامعتبر دست‌نخورده می‌ماند (zod رد می‌کند)', () => {
    expect(normalizePhone('12345')).toBe('12345');
    expect(normalizePhone(123)).toBe(123);
    expect(normalizePhone('0'.repeat(100))).toBe('0'.repeat(100));
    expect(normalizePhone('08121234567')).toBe('08121234567');
  });
});

describe('ids', () => {
  it('uuidv7: معتبر، یکتا و زمان‌مرتب', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe('7');
    expect(a < b).toBe(true);
    expect(new Set(Array.from({ length: 1000 }, () => uuidv7())).size).toBe(1000);
  });
  it('round-trip باینری', () => {
    const id = uuidv7();
    expect(bufToUuid(uuidToBuf(id))).toBe(id);
    expect(uuidToBuf(id)).toHaveLength(16);
  });
});

describe('crypto', () => {
  it('OTP پنج رقمی با صفر پیشرو', () => {
    for (let i = 0; i < 2000; i++) expect(randomOtp()).toMatch(/^\d{5}$/);
  });
  it('safeEqual طول‌های متفاوت را بدون throw رد می‌کند', () => {
    expect(safeEqual(Buffer.from('a'), Buffer.from('ab'))).toBe(false);
    expect(safeEqual(hmac256('k', 'x'), hmac256('k', 'x'))).toBe(true);
    expect(safeEqual(hmac256('k', 'x'), hmac256('k', 'y'))).toBe(false);
  });
  it('maskPhone', () => expect(maskPhone('09121234567')).toBe('0912***4567'));
});

describe('endpoint helpers', () => {
  it('fullPath از قرارداد', () => {
    expect(fullPath(endpoint('L-01'))).toBe('/c/v1/auth/otp/request');
    expect(fullPath(endpoint('L-15'))).toBe('/c/v1/me/sessions/:id');
    expect(fullPath(endpoint('L-90'))).toBe('/c/.well-known/jwks.json');
    expect(fullPath(endpoint('L-OPS-01'))).toBe('/c/health/live');
  });
  it('شناسهٔ ناموجود ⇒ خطا در boot', () => expect(() => endpoint('L-999')).toThrow());
});

describe('env (fail-fast)', () => {
  const base = { ...process.env, NODE_ENV: 'test' };
  it('secret گم‌شده ⇒ خطا با نام کلید', () => {
    expect(() => loadEnv({ NODE_ENV: 'test' })).toThrow(/DB_HOST|OTP_PEPPER/);
  });
  it('production: قواعد سخت‌گیرانه', () => {
    const prod = { ...base, NODE_ENV: 'production' } as NodeJS.ProcessEnv;
    const mk = (o: Record<string, string>) => EnvSchema.safeParse({ ...Object.fromEntries(Object.entries(testEnvRaw())), ...o });
    expect(prod).toBeTruthy();
    const bad = mk({ NODE_ENV: 'production' });
    expect(bad.success).toBe(false);
    const msg = JSON.stringify(bad.error?.issues);
    for (const k of ['JWT_PRIVATE_KEY_PEM', 'SMS_PROVIDER', 'INTERNAL_URL_MID']) expect(msg).toContain(k);
    const wild = mk({ NODE_ENV: 'production', CORS_ORIGINS: '*' });
    expect(JSON.stringify(wild.error?.issues)).toContain('CORS_ORIGINS');
    const http = mk({ NODE_ENV: 'production', CORS_ORIGINS: 'http://x.ir' });
    expect(JSON.stringify(http.error?.issues)).toContain('CORS_ORIGINS');
  });
  it('پیش‌فرض‌های امن', () => {
    const e = testEnv();
    expect(e.ACCESS_TTL_SEC).toBe(1200);
    expect(e.REFRESH_TTL_SEC).toBe(2_592_000);
    // env override همچنان مجاز
    expect(testEnv({ ACCESS_TTL_SEC: '900', REFRESH_TTL_SEC: '1209600' }).ACCESS_TTL_SEC).toBe(900);
    expect(e.OTP_TTL_SEC).toBe(120);
    expect(e.OTP_MAX_ATTEMPTS).toBe(3);
    expect(e.SWAGGER_ENABLED).toBe(false);
    expect(e.COOKIE_SECURE).toBe(false);
    expect(loadEnv({ ...testEnvRaw(), NODE_ENV: 'development' }).COOKIE_SECURE).toBe(false);
  });
  it('SMS کنسول فقط development؛ capture فقط test', () => {
    expect(() => loadEnv({ ...testEnvRaw(), SMS_PROVIDER: 'console', NODE_ENV: 'test' })).toThrow(/SMS_PROVIDER/);
    expect(() => loadEnv({ ...testEnvRaw(), SMS_PROVIDER: 'capture', NODE_ENV: 'development' })).toThrow(/SMS_PROVIDER/);
    expect(loadEnv({ ...testEnvRaw(), SMS_PROVIDER: 'console', NODE_ENV: 'development' }).SMS_PROVIDER).toBe('console');
  });
});

function testEnvRaw(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    DB_HOST: 'h',
    DB_USER: 'u',
    DB_PASSWORD: 'p',
    OTP_PEPPER: 'x'.repeat(32),
    INTERNAL_SECRET_MID: 'y'.repeat(16) + 'z'.repeat(16),
    INTERNAL_SECRET_HIGH: 'q'.repeat(16) + 'w'.repeat(16),
    SMS_PROVIDER: 'console'
  };
}
