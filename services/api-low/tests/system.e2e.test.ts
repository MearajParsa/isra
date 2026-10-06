import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANDROID, type TestApp, freshIp, freshPhone, loginOtp, startApp } from './helpers/app';

const SECRET = 'test-pair-low-high-0123456789abcdef0';
let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => t.close());

const settings = (version: number, flags: { maintenance_mode: boolean; registration_open: boolean }) =>
  request(t.http)
    .post('/c/internal/v1/events')
    .set('X-Internal-Caller', 'high')
    .set('X-Internal-Token', SECRET)
    .send({ eventId: randomUUID(), type: 'system.settings.changed', occurredAt: new Date().toISOString(), payload: { version, evalWeights: { voice: 40, tone: 30, tajweed: 30 }, badgeThresholds: [50, 150, 300, 500], flags } });

describe('step-up JWT (برای مصرف api-high)', () => {
  it('JWT امضاشده با lvl=stepup، متصل به کاربر/نشست، ۵ دقیقه؛ هرگز به‌عنوان access پذیرفته نمی‌شود', async () => {
    const l = await loginOtp(t);
    const rq = await request(t.http).post('/c/v1/auth/step-up/otp/request').set(l.headers).send();
    const sv = await request(t.http).post('/c/v1/auth/step-up/otp/verify').set(l.headers).send({ challengeId: rq.body.data.challengeId, code: t.sms.lastCode(l.phone) });
    const token = sv.body.data.stepUpToken as string;
    expect(token.split('.')).toHaveLength(3);
    expect(token.length).toBeLessThanOrEqual(1024);
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
    expect(payload).toMatchObject({ lvl: 'stepup', sub: l.userId, sid: l.sessionId, iss: 'isra-low' });
    expect(payload.exp - payload.iat).toBe(300);
    const asAccess = await request(t.http).get('/c/v1/me').set({ ...ANDROID, Authorization: `Bearer ${token}`, 'X-Forwarded-For': freshIp() });
    expect(asAccess.status).toBe(401);
  });
});

describe('پرچم‌های سراسری از high', () => {
  it('registration_open=false ⇒ کاربر جدید رد؛ کاربر موجود وارد می‌شود؛ بازگشایی ⇒ مجاز', async () => {
    const existing = await loginOtp(t);
    await settings(2, { maintenance_mode: false, registration_open: false }).expect(202);
    t.clock.advance(6_000);
    const phone = freshPhone();
    const sentBefore = t.sms.sent.length;
    const rq = await request(t.http).post('/c/v1/auth/otp/request').set(ANDROID).set('X-Forwarded-For', freshIp()).send({ phone });
    // پاسخ یکسان (ضد enumeration) ولی هیچ پیامکی به شمارهٔ ناشناس نمی‌رود
    expect(rq.status).toBe(200);
    expect(Object.keys(rq.body.data).sort()).toEqual(['challengeId', 'expiresInSec', 'resendAfterSec']);
    expect(t.sms.sent.length).toBe(sentBefore);
    // cooldown مثل حالت عادی
    expect((await request(t.http).post('/c/v1/auth/otp/request').set(ANDROID).set('X-Forwarded-For', freshIp()).send({ phone })).status).toBe(429);
    const v = await request(t.http).post('/c/v1/auth/otp/verify').set(ANDROID).set('X-Forwarded-For', freshIp()).send({ challengeId: rq.body.data.challengeId, code: '12345', deviceId: randomUUID(), deviceLabel: 'x' });
    expect(v.status).toBe(400);
    expect(v.body.error.code).toBe('AUTH_OTP_INVALID');
    expect(await t.ds.query('SELECT 1 FROM users WHERE phone = ?', [phone])).toHaveLength(0);
    t.clock.advance(61_000);
    // کاربر موجود همچنان پیامک می‌گیرد
    await expect(loginOtp(t, { phone: existing.phone })).resolves.toBeTruthy();
    await settings(3, { maintenance_mode: false, registration_open: true }).expect(202);
    t.clock.advance(6_000);
    await expect(loginOtp(t)).resolves.toBeTruthy();
  });

  it('maintenance_mode ⇒ me/public ۵۰۳؛ auth، JWKS و health باز', async () => {
    const u = await loginOtp(t);
    await settings(10, { maintenance_mode: true, registration_open: true }).expect(202);
    t.clock.advance(6_000);
    const me = await request(t.http).get('/c/v1/me').set(u.headers);
    expect(me.status).toBe(503);
    expect(me.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect((await request(t.http).get('/c/v1/public/sessions').set('X-Forwarded-For', freshIp())).status).toBe(503);
    expect((await request(t.http).get('/c/.well-known/jwks.json').set('X-Forwarded-For', freshIp())).status).toBe(200);
    expect((await request(t.http).get('/c/health/ready')).status).toBe(200);
    t.clock.advance(61_000);
    await expect(loginOtp(t, { phone: u.phone })).resolves.toBeTruthy(); // ادمین می‌تواند وارد شود
    await settings(11, { maintenance_mode: false, registration_open: true }).expect(202);
    t.clock.advance(6_000);
    expect((await request(t.http).get('/c/v1/me').set(u.headers)).status).toBe(200);
  });

  it('نسخهٔ قدیمی تنظیمات اثری ندارد', async () => {
    await settings(20, { maintenance_mode: false, registration_open: true }).expect(202);
    await settings(5, { maintenance_mode: true, registration_open: true }).expect(202);
    t.clock.advance(6_000);
    const u = await loginOtp(t);
    expect((await request(t.http).get('/c/v1/me').set(u.headers)).status).toBe(200);
  });
});

describe('رویداد ثبت‌نام برای high/mid', () => {
  it('user.registered شامل phone و createdAt است', async () => {
    const u = await loginOtp(t);
    // ساعت تست جعلی است ⇒ ترتیب created_at قطعی نیست؛ رویداد همین کاربر را با userId پیدا کن
    const rows = (await t.ds.query("SELECT payload FROM outbox_events WHERE type = 'user.registered'")) as { payload: any }[];
    const all = rows.map((r) => (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload));
    const p = all.find((e) => e.userId === u.userId);
    expect(p).toBeDefined();
    expect(p).toMatchObject({ userId: u.userId, phone: u.phone, firstName: '', lastName: '' });
    expect(Date.parse(p.createdAt)).not.toBeNaN();
  });
});

describe('مسیر internal روی دامنهٔ عمومی', () => {
  it('حدس‌زدن secret: بعد از ۱۰ تلاش ناموفق per IP ⇒ 429 حتی با secret درست', async () => {
    const hit = (token: string) => request(t.http).post('/c/internal/v1/events').set('X-Internal-Caller', 'high').set('X-Internal-Token', token).set('X-Forwarded-For', '203.0.113.9').send({});
    for (let i = 0; i < 10; i++) expect((await hit('x'.repeat(40))).status).toBe(401);
    expect((await hit('x'.repeat(40))).status).toBe(429);
    expect((await hit(SECRET)).status).toBe(429);
    // IP دیگر تحت‌تأثیر نیست
    const other = await request(t.http).post('/c/internal/v1/events').set('X-Internal-Caller', 'high').set('X-Internal-Token', SECRET).set('X-Forwarded-For', '203.0.113.10').send({ eventId: randomUUID(), type: 'system.settings.changed', occurredAt: new Date().toISOString(), payload: {} });
    expect(other.status).not.toBe(429); // مجاز (احراز شد؛ payload خالی ⇒ 400)
    expect(other.status).not.toBe(401);
  });
});
