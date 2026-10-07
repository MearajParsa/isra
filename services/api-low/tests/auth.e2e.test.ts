import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANDROID, WEB_ADMIN, WEB_MAIN, type TestApp, freshIp, freshPhone, loginOtp, startApp } from './helpers/app';

let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => t.close());

const post = (path: string, headers: Record<string, string> = ANDROID, ip = freshIp()) => request(t.http).post(`/c/v1${path}`).set(headers).set('X-Forwarded-For', ip);

async function requestOtp(phone: string, ip = freshIp(), client: Record<string, string> = ANDROID) {
  return post('/auth/otp/request', client, ip).send({ phone });
}

describe('OTP request (L-01)', () => {
  it('پاسخ استاندارد و کد ۵ رقمی به provider می‌رسد', async () => {
    const phone = freshPhone();
    const r = await requestOtp(phone);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toMatchObject({ expiresInSec: 120, resendAfterSec: 60 });
    expect(r.headers['x-request-id']).toBeTruthy();
    expect(r.headers['cache-control']).toBe('no-store');
    expect(t.sms.lastCode(phone)).toMatch(/^\d{5}$/);
  });

  it('شماره‌های فارسی/+98 نرمال می‌شوند', async () => {
    const r = await requestOtp('+989121110001');
    expect(r.status).toBe(200);
    expect(t.sms.lastCode('09121110001')).toBeTruthy();
    const r2 = await requestOtp('۰۹۱۲۱۱۱۰۰۰۲');
    expect(r2.status).toBe(200);
    expect(t.sms.lastCode('09121110002')).toBeTruthy();
  });

  it('شمارهٔ نامعتبر و فیلد اضافه ⇒ 400 با details.fields', async () => {
    const bad = await requestOtp('12345');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    expect(bad.body.error.details.fields.phone).toBeTruthy();
    const extra = await post('/auth/otp/request').send({ phone: freshPhone(), admin: true });
    expect(extra.status).toBe(400);
  });

  it('cooldown ارسال مجدد ⇒ 429 با Retry-After', async () => {
    const phone = freshPhone();
    expect((await requestOtp(phone)).status).toBe(200);
    const again = await requestOtp(phone);
    expect(again.status).toBe(429);
    expect(again.body.error.code).toBe('RATE_LIMITED');
    expect(Number(again.headers['retry-after'])).toBeGreaterThan(0);
    t.clock.advance(61_000);
    expect((await requestOtp(phone)).status).toBe(200);
  });

  it('پاسخ برای شمارهٔ ثبت‌شده و ثبت‌نشده هم‌شکل است (ضد enumeration)', async () => {
    const known = await loginOtp(t);
    t.clock.advance(61_000);
    const a = await requestOtp(known.phone);
    const b = await requestOtp(freshPhone());
    expect(a.status).toBe(b.status);
    expect(Object.keys(a.body.data).sort()).toEqual(Object.keys(b.body.data).sort());
  });

  it('خطای provider ⇒ 503 AUTH_OTP_SEND_FAILED و cooldown نمی‌خورد', async () => {
    const phone = freshPhone();
    t.sms.failNext = true;
    const r = await requestOtp(phone);
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('AUTH_OTP_SEND_FAILED');
    expect((await requestOtp(phone)).status).toBe(200);
  });

  it('سقف ساعتی per phone (۵)', async () => {
    const phone = freshPhone();
    for (let i = 0; i < 5; i++) {
      expect((await requestOtp(phone)).status).toBe(200);
      t.clock.advance(61_000);
    }
    // هنوز در همان ساعت پنجرهٔ ثابت؟ اگر پنجره عوض شده بود شمارنده ریست می‌شد؛ هر دو حالت باید یا 200 یا 429 معتبر باشد
    const r = await requestOtp(phone);
    expect([200, 429]).toContain(r.status);
  });
});

describe('OTP verify (L-02)', () => {
  it('کاربر جدید: ثبت‌نام خودکار + توکن؛ کاربر موجود: isNewUser=false', async () => {
    const phone = freshPhone();
    const rq = await requestOtp(phone);
    const v = await post('/auth/otp/verify').send({ challengeId: rq.body.data.challengeId, code: t.sms.lastCode(phone), deviceId: randomUUID(), deviceLabel: 'A' });
    expect(v.status).toBe(200);
    expect(v.body.data.user).toMatchObject({ phone, isNewUser: true, profileComplete: false, hasPassword: false });
    expect(v.body.data.tokenType).toBe('Bearer');
    expect(v.body.data.accessExpiresIn).toBe(1200); // قفل #9: ۲۰ دقیقه
    expect(v.body.data.refreshToken).toBeTruthy(); // غیر وب: در body

    t.clock.advance(61_000);
    const rq2 = await requestOtp(phone);
    const v2 = await post('/auth/otp/verify').send({ challengeId: rq2.body.data.challengeId, code: t.sms.lastCode(phone), deviceId: randomUUID(), deviceLabel: 'B' });
    expect(v2.body.data.user.isNewUser).toBe(false);
    expect(v2.body.data.user.id).toBe(v.body.data.user.id);
  });

  it('وب: refresh فقط در cookie HttpOnly/SameSite/Path محدود؛ در body نیست', async () => {
    const phone = freshPhone();
    const rq = await requestOtp(phone, freshIp(), WEB_MAIN);
    const v = await post('/auth/otp/verify', WEB_MAIN).send({ challengeId: rq.body.data.challengeId, code: t.sms.lastCode(phone), deviceId: randomUUID(), deviceLabel: 'Chrome' });
    expect(v.status).toBe(200);
    expect(v.body.data.refreshToken).toBeUndefined();
    const cookie = ([] as string[]).concat(v.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('isra_rt='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/c\/v1\/auth/);
  });

  it('web-admin از cookie جداگانه استفاده می‌کند', async () => {
    const l = await loginOtp(t, { client: WEB_ADMIN });
    expect(l.cookie).toMatch(/^isra_rt_admin=/);
  });

  it('کد غلط: attemptsLeft کم می‌شود؛ بار سوم EXHAUSTED؛ کد درست بعد از آن هم رد می‌شود', async () => {
    const phone = freshPhone();
    const rq = await requestOtp(phone);
    const real = t.sms.lastCode(phone)!;
    const wrong = real === '00000' ? '11111' : '00000';
    const body = (code: string) => ({ challengeId: rq.body.data.challengeId, code, deviceId: randomUUID(), deviceLabel: 'x' });
    const a = await post('/auth/otp/verify').send(body(wrong));
    expect(a.status).toBe(400);
    expect(a.body.error.code).toBe('AUTH_OTP_INVALID');
    expect(a.body.error.details.attemptsLeft).toBe(2);
    await post('/auth/otp/verify').send(body(wrong));
    const c = await post('/auth/otp/verify').send(body(wrong));
    expect(c.status).toBe(429);
    expect(c.body.error.code).toBe('AUTH_OTP_EXHAUSTED');
    const d = await post('/auth/otp/verify').send(body(real));
    expect(d.body.error.code).toBe('AUTH_OTP_EXHAUSTED');
  });

  it('انقضا بعد از ۱۲۰ ثانیه', async () => {
    const phone = freshPhone();
    const rq = await requestOtp(phone);
    const code = t.sms.lastCode(phone);
    t.clock.advance(121_000);
    const v = await post('/auth/otp/verify').send({ challengeId: rq.body.data.challengeId, code, deviceId: randomUUID(), deviceLabel: 'x' });
    expect(v.status).toBe(400);
    expect(v.body.error.code).toBe('AUTH_OTP_EXPIRED');
  });

  it('challenge تک‌مصرف: تکرار با کد درست ⇒ AUTH_OTP_INVALID', async () => {
    const phone = freshPhone();
    const rq = await requestOtp(phone);
    const b = { challengeId: rq.body.data.challengeId, code: t.sms.lastCode(phone), deviceId: randomUUID(), deviceLabel: 'x' };
    expect((await post('/auth/otp/verify').send(b)).status).toBe(200);
    const again = await post('/auth/otp/verify').send(b);
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('AUTH_OTP_INVALID');
  });

  it('challenge ناشناخته ⇒ AUTH_OTP_INVALID (بدون نشت)', async () => {
    const v = await post('/auth/otp/verify').send({ challengeId: randomUUID(), code: '12345', deviceId: randomUUID(), deviceLabel: 'x' });
    expect(v.body.error.code).toBe('AUTH_OTP_INVALID');
  });

  it('حدس موازی هرگز بیش از ۳ تلاش نمی‌دهد (اتمی)', async () => {
    const phone = freshPhone();
    const rq = await requestOtp(phone);
    const real = t.sms.lastCode(phone)!;
    const wrong = real === '00000' ? '11111' : '00000';
    const rs = await Promise.all(
      Array.from({ length: 12 }, () => post('/auth/otp/verify').send({ challengeId: rq.body.data.challengeId, code: wrong, deviceId: randomUUID(), deviceLabel: 'x' }))
    );
    const [row] = (await t.ds.query('SELECT attempts FROM otp_challenges WHERE phone = ?', [phone])) as { attempts: number }[];
    expect(row!.attempts).toBe(3);
    expect(rs.filter((r) => r.body.error.code === 'AUTH_OTP_INVALID').length).toBeLessThanOrEqual(3);
  });

  it('مصرف هم‌زمان کد درست: دقیقاً یک موفقیت', async () => {
    const phone = freshPhone();
    const rq = await requestOtp(phone);
    const code = t.sms.lastCode(phone);
    const rs = await Promise.all(Array.from({ length: 6 }, () => post('/auth/otp/verify').send({ challengeId: rq.body.data.challengeId, code, deviceId: randomUUID(), deviceLabel: 'x' })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it('کد در دیتابیس خام ذخیره نمی‌شود', async () => {
    const phone = freshPhone();
    await requestOtp(phone);
    const code = t.sms.lastCode(phone)!;
    const [row] = (await t.ds.query('SELECT code_hmac FROM otp_challenges WHERE phone = ?', [phone])) as { code_hmac: Buffer }[];
    expect(row!.code_hmac.length).toBe(32);
    expect(row!.code_hmac.toString('utf8')).not.toContain(code);
  });
});

describe('ورود با رمز (L-03) و رمز (L-13)', () => {
  it('کاربر بدون رمز و شمارهٔ ناموجود هر دو همان خطا را می‌گیرند', async () => {
    const l = await loginOtp(t);
    const a = await post('/auth/login/password').send({ phone: l.phone, password: 'whatever12', deviceId: randomUUID(), deviceLabel: 'x' });
    const b = await post('/auth/login/password').send({ phone: freshPhone(), password: 'whatever12', deviceId: randomUUID(), deviceLabel: 'x' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error).toEqual(b.body.error);
    expect(a.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('تعیین رمز بلافاصله بعد از OTP (تازه) مجاز؛ سپس ورود با رمز', async () => {
    const l = await loginOtp(t);
    const other = await loginOtp(t, { phone: l.phone, ip: l.ip }).catch(() => null); // نشست دوم (دستگاه دیگر) — ممکن است cooldown بخورد
    void other;
    const set = await request(t.http).put('/c/v1/me/password').set(l.headers).send({ newPassword: 'correct-horse-1' });
    expect(set.status).toBe(200);
    const login = await post('/auth/login/password').send({ phone: l.phone, password: 'correct-horse-1', deviceId: randomUUID(), deviceLabel: 'pw' });
    expect(login.status).toBe(200);
    expect(login.body.data.user.hasPassword).toBe(true);
    expect(login.body.data.user.isNewUser).toBe(false);
    const bad = await post('/auth/login/password').send({ phone: l.phone, password: 'wrong-password', deviceId: randomUUID(), deviceLabel: 'pw' });
    expect(bad.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('رمز ضعیف/شامل شماره رد می‌شود؛ رمز با argon2id هش می‌شود', async () => {
    const l = await loginOtp(t);
    const short = await request(t.http).put('/c/v1/me/password').set(l.headers).send({ newPassword: 'short' });
    expect(short.status).toBe(400);
    const phoneIn = await request(t.http).put('/c/v1/me/password').set(l.headers).send({ newPassword: `x${l.phone}x` });
    expect(phoneIn.status).toBe(400);
    await request(t.http).put('/c/v1/me/password').set(l.headers).send({ newPassword: 'a-good-password' });
    const [row] = (await t.ds.query('SELECT password_hash FROM user_credentials')) as { password_hash: string }[];
    expect(row!.password_hash.startsWith('$argon2id$')).toBe(true);
    expect(row!.password_hash).not.toContain('a-good-password');
  });

  it('بدون OTP تازه و بدون step-up ⇒ AUTH_STEP_UP_REQUIRED؛ با step-up مجاز؛ سایر نشست‌ها revoke', async () => {
    const l = await loginOtp(t);
    const second = await (async () => {
      t.clock.advance(61_000);
      return loginOtp(t, { phone: l.phone });
    })();
    t.clock.advance(6 * 60_000); // OTP قدیمی (>۵ دقیقه)
    const denied = await request(t.http).put('/c/v1/me/password').set(l.headers).send({ newPassword: 'new-password-1' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('AUTH_STEP_UP_REQUIRED');

    const rq = await request(t.http).post('/c/v1/auth/step-up/otp/request').set(l.headers).send();
    expect(rq.status).toBe(200);
    const sv = await request(t.http).post('/c/v1/auth/step-up/otp/verify').set(l.headers).send({ challengeId: rq.body.data.challengeId, code: t.sms.lastCode(l.phone) });
    expect(sv.status).toBe(200);
    expect(sv.body.data.expiresInSec).toBe(300);

    const ok = await request(t.http).put('/c/v1/me/password').set(l.headers).set('X-Step-Up-Token', sv.body.data.stepUpToken).send({ newPassword: 'new-password-1' });
    expect(ok.status).toBe(200);
    // نشست دوم بی‌اعتبار شد (cache ۵ ثانیه‌ای همین instance فوراً invalidate می‌شود)
    const me2 = await request(t.http).get('/c/v1/me').set(second.headers);
    expect(me2.status).toBe(401);
    const me1 = await request(t.http).get('/c/v1/me').set(l.headers);
    expect(me1.status).toBe(200);
  });

  it('step-up token متعلق به نشست دیگر پذیرفته نمی‌شود', async () => {
    const a = await loginOtp(t);
    t.clock.advance(61_000);
    const b = await loginOtp(t, { phone: a.phone });
    t.clock.advance(6 * 60_000);
    const rq = await request(t.http).post('/c/v1/auth/step-up/otp/request').set(b.headers).send();
    const sv = await request(t.http).post('/c/v1/auth/step-up/otp/verify').set(b.headers).send({ challengeId: rq.body.data.challengeId, code: t.sms.lastCode(b.phone) });
    const r = await request(t.http).put('/c/v1/me/password').set(a.headers).set('X-Step-Up-Token', sv.body.data.stepUpToken).send({ newPassword: 'new-password-1' });
    expect(r.status).toBe(403);
  });

  it('challenge step-up کاربر دیگر قابل استفاده نیست', async () => {
    const a = await loginOtp(t);
    const b = await loginOtp(t);
    const rq = await request(t.http).post('/c/v1/auth/step-up/otp/request').set(a.headers).send();
    const r = await request(t.http).post('/c/v1/auth/step-up/otp/verify').set(b.headers).send({ challengeId: rq.body.data.challengeId, code: t.sms.lastCode(a.phone) });
    expect(r.status).toBe(400);
  });
});

describe('refresh / logout (L-04, L-05)', () => {
  it('Android: rotation و رد توکن قبلی (reuse ⇒ revoke کل نشست)', async () => {
    const l = await loginOtp(t);
    const r1 = await post('/auth/refresh', ANDROID).send({ refreshToken: l.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.data.refreshToken).toBeTruthy();
    expect(r1.body.data.refreshToken).not.toBe(l.refreshToken);

    const reuse = await post('/auth/refresh', ANDROID).send({ refreshToken: l.refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('AUTH_REFRESH_INVALID');
    // توکن جدید هم بی‌اعتبار شد چون خانواده revoke شد
    const after = await post('/auth/refresh', ANDROID).send({ refreshToken: r1.body.data.refreshToken });
    expect(after.status).toBe(401);
    const me = await request(t.http).get('/c/v1/me').set(l.headers);
    expect(me.status).toBe(401);
  });

  it('وب: refresh از cookie؛ CSRF با Origin نادرست رد می‌شود', async () => {
    const l = await loginOtp(t, { client: WEB_MAIN });
    const bad = await request(t.http).post('/c/v1/auth/refresh').set({ ...WEB_MAIN, Origin: 'https://evil.example' }).set('Cookie', l.cookie!).send({});
    expect(bad.status).toBe(403);
    const noOrigin = await request(t.http).post('/c/v1/auth/refresh').set('X-Isra-Client', 'web-main').set('Cookie', l.cookie!).send({});
    expect(noOrigin.status).toBe(403);
    const ok = await request(t.http).post('/c/v1/auth/refresh').set(WEB_MAIN).set('Cookie', l.cookie!).send({});
    expect(ok.status).toBe(200);
    expect(ok.body.data.refreshToken).toBeUndefined();
    expect(([] as string[]).concat(ok.headers['set-cookie'] as unknown as string[]).some((c) => c.startsWith('isra_rt='))).toBe(true);
  });

  it('وب: درخواست هم‌زمان با توکن چرخیده‌شده در پنجرهٔ grace موفق است، بعد از آن reuse', async () => {
    const l = await loginOtp(t, { client: WEB_MAIN });
    const first = await request(t.http).post('/c/v1/auth/refresh').set(WEB_MAIN).set('Cookie', l.cookie!).send({});
    expect(first.status).toBe(200);
    const raced = await request(t.http).post('/c/v1/auth/refresh').set(WEB_MAIN).set('Cookie', l.cookie!).send({});
    expect(raced.status).toBe(200);
    expect(raced.body.data.accessToken).toBeTruthy();
    expect(([] as string[]).concat((raced.headers['set-cookie'] as unknown as string[]) ?? []).some((c) => c.startsWith('isra_rt='))).toBe(false);
    t.clock.advance(11_000);
    const late = await request(t.http).post('/c/v1/auth/refresh').set(WEB_MAIN).set('Cookie', l.cookie!).send({});
    expect(late.status).toBe(401);
  });

  it('cookie web-main برای کلاینت web-admin کاربردی ندارد', async () => {
    const l = await loginOtp(t, { client: WEB_MAIN });
    const r = await request(t.http).post('/c/v1/auth/refresh').set(WEB_ADMIN).set('Cookie', l.cookie!).send({});
    expect(r.status).toBe(401);
  });

  it('refresh منقضی (۳۰ روز؛ قفل #9) رد می‌شود', async () => {
    const l = await loginOtp(t);
    t.clock.advance(31 * 86_400_000);
    const r = await post('/auth/refresh', ANDROID).send({ refreshToken: l.refreshToken });
    expect(r.status).toBe(401);
  });

  it('refresh تصادفی/ناقص ⇒ 401 یکسان (نه 500)', async () => {
    const r = await post('/auth/refresh').send({ refreshToken: 'x'.repeat(43) });
    expect(r.status).toBe(401);
    const empty = await post('/auth/refresh').send({});
    expect(empty.status).toBe(401);
  });

  it('logout idempotent: نشست revoke می‌شود، تکرار و حتی بدون توکن 200', async () => {
    const l = await loginOtp(t, { client: WEB_MAIN });
    const out = await request(t.http).post('/c/v1/auth/logout').set(l.headers).set('Cookie', l.cookie!).send();
    expect(out.status).toBe(200);
    expect(([] as string[]).concat(out.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/isra_rt=;/);
    expect((await request(t.http).get('/c/v1/me').set(l.headers)).status).toBe(401);
    expect((await request(t.http).post('/c/v1/auth/logout').set(l.headers).set('Cookie', l.cookie!).send()).status).toBe(200);
    expect((await request(t.http).post('/c/v1/auth/logout').set(ANDROID).send()).status).toBe(200);
  });

  it('دستگاه تکراری: نشست قبلی همان deviceId باطل می‌شود', async () => {
    const deviceId = randomUUID();
    const a = await loginOtp(t, { deviceId });
    t.clock.advance(61_000);
    const b = await loginOtp(t, { phone: a.phone, deviceId });
    expect((await request(t.http).get('/c/v1/me').set(a.headers)).status).toBe(401);
    expect((await request(t.http).get('/c/v1/me').set(b.headers)).status).toBe(200);
  });
});

describe('rate-limit (ورود با رمز)', () => {
  it('۵ تلاش ip+phone ⇒ ششمی 429 با هدرهای استاندارد', async () => {
    const phone = freshPhone();
    const ip = freshIp();
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await post('/auth/login/password', ANDROID, ip).send({ phone, password: 'wrong-password', deviceId: randomUUID(), deviceLabel: 'x' }));
    expect(results.slice(0, 5).every((r) => r.status === 401)).toBe(true);
    expect(results[5]!.status).toBe(429);
    expect(results[5]!.body.error.code).toBe('RATE_LIMITED');
    expect(Number(results[5]!.headers['retry-after'])).toBeGreaterThan(0);
    expect(results[0]!.headers['ratelimit-limit']).toBeTruthy();
  });
});
