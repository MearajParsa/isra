import { describe, expect, it } from 'vitest';
import { ApiError } from '../types';
import { mockApi as api } from './mockApi';
import { nextOccurrence } from './seed';

const device = { deviceId: 'd1', deviceLabel: 'Test' };

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.code === code);
}

describe('mock auth', () => {
  it('OTP صحیح: کاربر جدید و توکن', async () => {
    const ch = await api.auth.requestOtp('09350000001');
    expect(ch.expiresInSec).toBe(120);
    const res = await api.auth.verifyOtp({ challengeId: ch.challengeId, code: '12345', ...device });
    expect(res.accessExpiresIn).toBe(900);
    expect(res.user.isNewUser).toBe(true);
    expect(res.user.profileComplete).toBe(false);
  });

  it('کد نادرست: attemptsLeft و بعد از ۳ تلاش قفل', async () => {
    const ch = await api.auth.requestOtp('09350000002');
    const bad = (code: string) => api.auth.verifyOtp({ challengeId: ch.challengeId, code, ...device });
    await expect(bad('00000')).rejects.toMatchObject({ code: 'AUTH_OTP_INVALID', details: { attemptsLeft: 2 } });
    await expect(bad('00000')).rejects.toMatchObject({ code: 'AUTH_OTP_INVALID', details: { attemptsLeft: 1 } });
    await expectCode(bad('00000'), 'AUTH_OTP_EXHAUSTED');
    // حتی کد درست هم پس از قفل پذیرفته نمی‌شود
    await expectCode(bad('12345'), 'AUTH_OTP_EXHAUSTED');
  });

  it('challenge تک‌مصرف است', async () => {
    const ch = await api.auth.requestOtp('09350000003');
    await api.auth.verifyOtp({ challengeId: ch.challengeId, code: '12345', ...device });
    await expectCode(api.auth.verifyOtp({ challengeId: ch.challengeId, code: '12345', ...device }), 'AUTH_OTP_EXPIRED');
  });

  it('ارسال مجدد زودهنگام و شماره‌های آزمایشی', async () => {
    await api.auth.requestOtp('09350000004');
    await expectCode(api.auth.requestOtp('09350000004'), 'RATE_LIMITED');
    await expectCode(api.auth.requestOtp('09120000000'), 'RATE_LIMITED');
    await expectCode(api.auth.requestOtp('09121111111'), 'AUTH_OTP_SEND_FAILED');
    await expectCode(api.auth.requestOtp('0912'), 'VALIDATION_FAILED');
  });

  it('ورود با رمز: خطای یکسان برای شماره/رمز اشتباه', async () => {
    await expectCode(api.auth.loginPassword({ phone: '09121234567', password: 'wrong', ...device }), 'AUTH_INVALID_CREDENTIALS');
    await expectCode(api.auth.loginPassword({ phone: '09359999999', password: 'isra1234', ...device }), 'AUTH_INVALID_CREDENTIALS');
    const ok = await api.auth.loginPassword({ phone: '09121234567', password: 'isra1234', ...device });
    expect(ok.user.hasPassword).toBe(true);
  });

  it('توکن نامعتبر یا منقضی روی مسیرهای me', async () => {
    await expectCode(api.me.get('mock.unknown'), 'AUTH_TOKEN_EXPIRED');
  });

  it('تعیین رمز بدون step-up رد می‌شود و با OTP تازه/توکن پذیرفته می‌شود', async () => {
    const pw = await api.auth.loginPassword({ phone: '09121234567', password: 'isra1234', ...device });
    await expectCode(api.me.setPassword(pw.accessToken, { newPassword: 'newpass123' }), 'AUTH_STEP_UP_REQUIRED');

    const ch = await api.auth.stepUpRequest(pw.accessToken);
    const su = await api.auth.stepUpVerify(pw.accessToken, { challengeId: ch.challengeId, code: '12345' });
    await expect(api.me.setPassword(pw.accessToken, { newPassword: 'short', stepUpToken: su.stepUpToken })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED'
    });
    await api.me.setPassword(pw.accessToken, { newPassword: 'isra1234', stepUpToken: su.stepUpToken });
  });
});

describe('seed', () => {
  it('nextOccurrence روز هفته را به وقت تهران محاسبه می‌کند', () => {
    // چهارشنبه ۱۴۰۵/۰۷/۱۰ ≈ 2026-10-01 (پنجشنبه)؛ از پنجشنبه ۱۲:۰۰ UTC، اولین «شنبه ۰۹:۰۰ تهران» = شنبه 05:30 UTC
    const from = new Date('2026-10-01T12:00:00Z');
    const n = nextOccurrence([0], '09:00', from);
    expect(n.toISOString()).toBe('2026-10-03T05:30:00.000Z');
  });
});
