import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANDROID, type TestApp, freshIp, freshPhone, loginOtp, startApp } from './helpers/app';

let t: TestApp;
beforeAll(async () => {
  t = await startApp({ SMS_PER_IP_DAILY: '2', SESSION_MAX_AGE_SEC: '86400', ACCESS_TTL_SEC: '600' });
});
afterAll(async () => t.close());

const post = (path: string, headers: Record<string, string> = ANDROID, ip = freshIp()) => request(t.http).post(`/c/v1${path}`).set(headers).set('X-Forwarded-For', ip);

describe('revocation propagation (session.revoked ⇒ mid/high)', () => {
  it('logout یک رویداد outbox با شناسهٔ نشست می‌سازد (انقضا = TTL access + حاشیه)', async () => {
    const l = await loginOtp(t);
    await t.ds.query("DELETE FROM outbox_events WHERE type = 'session.revoked'");
    expect((await post('/auth/logout', l.headers).send({ refreshToken: l.refreshToken })).status).toBe(200);
    const rows = (await t.ds.query("SELECT payload FROM outbox_events WHERE type = 'session.revoked'")) as { payload: unknown }[];
    expect(rows.length).toBeGreaterThan(0);
    const p = (typeof rows[0]!.payload === 'string' ? JSON.parse(rows[0]!.payload) : rows[0]!.payload) as { sessionIds: string[]; expiresAt: string };
    expect(p.sessionIds).toContain(l.sessionId);
    expect(Date.parse(p.expiresAt)).toBeGreaterThan(t.clock.now().getTime() + 600_000);
  });
});

describe('سقف مطلق عمر نشست', () => {
  it('refresh لغزان است ولی پس از SESSION_MAX_AGE_SEC دیگر تمدید نمی‌شود', async () => {
    const l = await loginOtp(t);
    t.clock.advance(3600_000);
    const ok = await post('/auth/refresh').send({ refreshToken: l.refreshToken });
    expect(ok.status).toBe(200);
    t.clock.advance(90_000_000); // > ۲۴ ساعت از ساخت نشست
    const late = await post('/auth/refresh').send({ refreshToken: ok.body.data.refreshToken });
    expect(late.status).toBe(401);
    expect(late.body.error.code).toBe('AUTH_REFRESH_INVALID');
  });
});

describe('سقف روزانهٔ OTP per-IP', () => {
  it('از سومین درخواست (شمارهٔ متفاوت، IP یکسان) ⇒ 429 و بودجهٔ سراسری مصرف نمی‌شود', async () => {
    const ip = freshIp();
    expect((await post('/auth/otp/request', ANDROID, ip).send({ phone: freshPhone() })).status).toBe(200);
    expect((await post('/auth/otp/request', ANDROID, ip).send({ phone: freshPhone() })).status).toBe(200);
    const r = await post('/auth/otp/request', ANDROID, ip).send({ phone: freshPhone() });
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBeTruthy();
    // IP دیگر آزاد است
    expect((await post('/auth/otp/request', ANDROID, freshIp()).send({ phone: freshPhone() })).status).toBe(200);
  });
});

describe('fail-closed: route بدون تعریف قرارداد و غیر internal', () => {
  it('EndpointGuard مسیر بدون @Route را رد می‌کند', async () => {
    const { EndpointGuard } = await import('../src/common/guards/endpoint.guard');
    const { Reflector } = await import('@nestjs/core');
    class H {
      handler() {}
    }
    const ctx = { getHandler: () => H.prototype.handler, getClass: () => H, switchToHttp: () => ({}) } as never;
    await expect((EndpointGuard.prototype.canActivate as (c: unknown) => Promise<boolean>).call({ reflector: new Reflector() }, ctx)).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });
});
