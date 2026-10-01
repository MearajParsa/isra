import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANDROID, type TestApp, freshIp, freshPhone, startApp } from './helpers/app';

let t: TestApp;
beforeAll(async () => {
  t = await startApp({ SMS_DAILY_BUDGET: '3' });
});
afterAll(async () => t.close());

const otp = (phone: string) => request(t.http).post('/c/v1/auth/otp/request').set(ANDROID).set('X-Forwarded-For', freshIp()).send({ phone });

describe('بودجهٔ روزانهٔ پیامک (ضد SMS-pumping)', () => {
  it('درخواست‌های ردشده با cooldown بودجه مصرف نمی‌کنند؛ پس از اتمام بودجه ارسال متوقف می‌شود', async () => {
    const a = freshPhone();
    expect((await otp(a)).status).toBe(200); // ۱
    for (let i = 0; i < 10; i++) expect((await otp(a)).status).toBe(429); // cooldown؛ بودجه نمی‌سوزد
    expect((await otp(freshPhone())).status).toBe(200); // ۲
    expect((await otp(freshPhone())).status).toBe(200); // ۳
    const over = await otp(freshPhone());
    expect(over.status).toBe(503);
    expect(over.body.error.code).toBe('AUTH_OTP_SEND_FAILED');
    expect(t.sms.sent).toHaveLength(3);
  });
});
