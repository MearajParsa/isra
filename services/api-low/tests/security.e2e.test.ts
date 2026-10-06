import { randomUUID } from 'node:crypto';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { KeysService } from '../src/auth/keys.service';
import { ANDROID, type Login, type TestApp, freshIp, loginOtp, startApp } from './helpers/app';

let t: TestApp;
let me: Login;
beforeAll(async () => {
  t = await startApp();
});
// ساعت مشترک در بعضی تست‌ها جلو می‌رود ⇒ هر تست ورود تازه دارد
beforeEach(async () => {
  me = await loginOtp(t);
});
afterAll(async () => t.close());

const get = (path: string, h: Record<string, string>) => request(t.http).get(`/c/v1${path}`).set(h);
const bearer = (tok: string) => ({ ...ANDROID, Authorization: `Bearer ${tok}`, 'X-Forwarded-For': freshIp() });

describe('JWT: دست‌کاری و جعل', () => {
  it('بدون Authorization ⇒ 401 AUTH_REQUIRED', async () => {
    const r = await get('/me', { ...ANDROID, 'X-Forwarded-For': freshIp() });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('توکن مزخرف / alg=none / امضای نادرست ⇒ AUTH_TOKEN_INVALID', async () => {
    expect((await get('/me', bearer('garbage'))).body.error.code).toBe('AUTH_TOKEN_INVALID');

    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: me.userId, sid: me.sessionId, iss: 'isra-low', aud: 'isra', exp: 9_999_999_999 })}.`;
    expect((await get('/me', bearer(none))).status).toBe(401);

    // کلید دیگر (مهاجم) با همان kid
    const kid = t.app.get(KeysService).kid;
    const { privateKey } = await generateKeyPair('RS256');
    const forged = await new SignJWT({ sid: me.sessionId })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setSubject(me.userId)
      .setIssuer('isra-low')
      .setAudience('isra')
      .setExpirationTime('10m')
      .sign(privateKey);
    expect((await get('/me', bearer(forged))).body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('حمله‌ٔ algorithm confusion (HS256 با کلید عمومی به‌عنوان secret) رد می‌شود', async () => {
    const jwk = t.app.get(KeysService).jwks().keys[0]!;
    const secret = new TextEncoder().encode(JSON.stringify(jwk));
    const forged = await new SignJWT({ sid: me.sessionId }).setProtectedHeader({ alg: 'HS256', kid: jwk.kid }).setSubject(me.userId).setIssuer('isra-low').setAudience('isra').setExpirationTime('10m').sign(secret);
    expect((await get('/me', bearer(forged))).status).toBe(401);
  });

  it('payload دست‌کاری‌شده (sub دیگر) با امضای قدیمی ⇒ 401', async () => {
    const [h, , s] = me.accessToken.split('.');
    const p = Buffer.from(JSON.stringify({ sub: randomUUID(), sid: me.sessionId, iss: 'isra-low', aud: 'isra', exp: 9_999_999_999 })).toString('base64url');
    expect((await get('/me', bearer(`${h}.${p}.${s}`))).status).toBe(401);
  });

  it('منقضی ⇒ AUTH_TOKEN_EXPIRED؛ پس از refresh نشست ادامه دارد', async () => {
    const l = await loginOtp(t);
    t.clock.advance(21 * 60_000);
    const r = await get('/me', l.headers);
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('AUTH_TOKEN_EXPIRED');
    const rf = await request(t.http).post('/c/v1/auth/refresh').set(ANDROID).send({ refreshToken: l.refreshToken });
    expect(rf.status).toBe(200);
    expect((await get('/me', bearer(rf.body.data.accessToken))).status).toBe(200);
  });

  it('issuer/audience اشتباه رد می‌شود', async () => {
    const keys = t.app.get(KeysService);
    const mk = (iss: string, aud: string) =>
      new SignJWT({ sid: me.sessionId }).setProtectedHeader({ alg: 'RS256', kid: keys.kid }).setSubject(me.userId).setIssuer(iss).setAudience(aud).setExpirationTime('10m').sign(keys.privateKey);
    expect((await get('/me', bearer(await mk('evil', 'isra')))).status).toBe(401);
    expect((await get('/me', bearer(await mk('isra-low', 'other')))).status).toBe(401);
  });

  it('نشست revoke‌شده فوراً رد می‌شود (حتی با access معتبر)', async () => {
    const l = await loginOtp(t);
    expect((await get('/me', l.headers)).status).toBe(200);
    await request(t.http).post('/c/v1/auth/logout').set(l.headers).send();
    expect((await get('/me', l.headers)).status).toBe(401);
  });

  it('Bearer خیلی بلند ⇒ رد (بدون پردازش)', async () => {
    expect((await get('/me', bearer('a'.repeat(5000)))).status).toBe(401);
  });
});

describe('IDOR / مالکیت', () => {
  it('revoke نشست کاربر دیگر ⇒ 404 و نشست او سالم می‌ماند', async () => {
    const a = await loginOtp(t);
    const b = await loginOtp(t);
    const r = await request(t.http).delete(`/c/v1/me/sessions/${b.sessionId}`).set(a.headers);
    expect(r.status).toBe(404);
    expect((await get('/me', b.headers)).status).toBe(200);
  });

  it('خواندن پیام اینباکس کاربر دیگر ⇒ 404', async () => {
    const a = await loginOtp(t);
    const b = await loginOtp(t);
    const id = randomUUID();
    await t.ds.query('INSERT INTO inbox_messages (id, user_id, kind, title, body, created_at) VALUES (UNHEX(REPLACE(?, "-", "")), UNHEX(REPLACE(?, "-", "")), "system", "t", "b", NOW(3))', [id, b.userId]);
    const r = await request(t.http).post(`/c/v1/me/inbox/${id}/read`).set(a.headers);
    expect(r.status).toBe(404);
    const ok = await request(t.http).post(`/c/v1/me/inbox/${id}/read`).set(b.headers);
    expect(ok.status).toBe(200);
  });

  it('id غیر UUID در مسیر ⇒ 404 (نه 500)', async () => {
    expect((await request(t.http).delete('/c/v1/me/sessions/not-a-uuid').set(me.headers)).status).toBe(404);
    expect((await request(t.http).post('/c/v1/me/inbox/..%2f..%2fx/read').set(me.headers)).status).toBeGreaterThanOrEqual(400);
  });
});

describe('ورودی و مرز', () => {
  it('JSON خراب ⇒ 400 VALIDATION_FAILED با envelope', async () => {
    const r = await request(t.http).post('/c/v1/auth/otp/request').set(ANDROID).set('Content-Type', 'application/json').set('X-Forwarded-For', freshIp()).send('{"phone":');
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } });
    expect(r.body.meta.requestId).toBeTruthy();
  });

  it('بدنهٔ بیش از 16KB ⇒ 413', async () => {
    const r = await request(t.http).post('/c/v1/auth/otp/request').set(ANDROID).set('X-Forwarded-For', freshIp()).send({ phone: '09121234567', pad: 'x'.repeat(20_000) });
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('Content-Type غیر JSON ⇒ 415', async () => {
    const r = await request(t.http).post('/c/v1/auth/otp/request').set(ANDROID).set('Content-Type', 'text/plain').set('X-Forwarded-For', freshIp()).send('phone=09121234567');
    expect(r.status).toBe(415);
  });

  it('کلیدهای خطرناک (prototype pollution) و فیلد اضافه رد می‌شوند', async () => {
    const r = await request(t.http)
      .post('/c/v1/auth/otp/request')
      .set(ANDROID)
      .set('Content-Type', 'application/json')
      .set('X-Forwarded-For', freshIp())
      .send('{"phone":"09121234567","__proto__":{"admin":true}}');
    expect(r.status).toBe(400);
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  it('query غیرمجاز: pageSize بیش از سقف و page منفی ⇒ 400', async () => {
    expect((await get('/me/sessions?pageSize=1000', me.headers)).status).toBe(400);
    expect((await get('/me/sessions?page=-1', me.headers)).status).toBe(400);
  });

  it('PATCH پروفایل: فیلد ناشناخته (مثلاً phone) و بدنهٔ خالی رد می‌شود', async () => {
    const h = me.headers;
    expect((await request(t.http).patch('/c/v1/me/profile').set(h).send({ phone: '09120000000' })).status).toBe(400);
    expect((await request(t.http).patch('/c/v1/me/profile').set(h).send({})).status).toBe(400);
  });

  it('مسیر/متد ناشناخته ⇒ 404 envelope (بدون افشای stack)', async () => {
    const r = await request(t.http).get('/c/v1/nope').set(ANDROID);
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(r.body)).not.toMatch(/stack|node_modules|at \w+\./);
  });
});

describe('هدرهای امنیتی و CORS', () => {
  it('helmet: CSP/HSTS/nosniff/no x-powered-by؛ همهٔ پاسخ‌ها no-store (جز عمومی)', async () => {
    const r = await get('/me', me.headers);
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
  });

  it('CORS: origin مجاز با credentials؛ origin ناشناخته بدون Allow-Origin', async () => {
    const ok = await request(t.http).options('/c/v1/auth/refresh').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const bad = await request(t.http).options('/c/v1/auth/refresh').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('خطا هرگز PII/توکن را در پاسخ تکرار نمی‌کند', async () => {
    const r = await request(t.http).post('/c/v1/auth/login/password').set(ANDROID).set('X-Forwarded-For', freshIp()).send({ phone: '09121234567', password: 'SuperSecret123', deviceId: randomUUID(), deviceLabel: 'x' });
    expect(JSON.stringify(r.body)).not.toContain('SuperSecret123');
  });
});

describe('JWKS (L-90)', () => {
  it('کلید عمومی RS256 بدون بخش خصوصی؛ cache عمومی + ETag/304', async () => {
    const r = await request(t.http).get('/c/.well-known/jwks.json').set('X-Forwarded-For', freshIp());
    expect(r.status).toBe(200);
    expect(r.body.keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig' });
    expect(r.body.keys[0].d).toBeUndefined();
    expect(r.headers['cache-control']).toMatch(/public, max-age=300/);
    const etag = r.headers.etag!;
    const again = await request(t.http).get('/c/.well-known/jwks.json').set('If-None-Match', etag).set('X-Forwarded-For', freshIp());
    expect(again.status).toBe(304);
  });

  it('توکن را می‌توان فقط با JWKS منتشرشده اعتبارسنجی کرد (مصرف mid/high)', async () => {
    const { jwtVerify, importJWK } = await import('jose');
    const jwks = (await request(t.http).get('/c/.well-known/jwks.json').set('X-Forwarded-For', freshIp())).body;
    const key = await importJWK(jwks.keys[0], 'RS256');
    const { payload, protectedHeader } = await jwtVerify(me.accessToken, key, { issuer: 'isra-low', audience: 'isra', currentDate: t.clock.now() });
    expect(protectedHeader.kid).toBe(jwks.keys[0].kid);
    expect(payload.sub).toBe(me.userId);
    expect(payload.lvl).toBe('low');
    void exportJWK;
  });
});
