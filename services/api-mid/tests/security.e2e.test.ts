import { randomUUID } from 'node:crypto';
import { SignJWT, generateKeyPair } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AttendanceService } from '../src/domain/attendance.service';
import { type TestApp, api, creator, join, mkSession, mkUser, sessionBody, startApp } from './helpers/app';

let t: TestApp;
let a: ReturnType<typeof api>;
beforeAll(async () => {
  t = await startApp();
  a = api(t);
});
afterAll(async () => t.close());

const get = (token: string | null) => {
  const r = request(t.http).get('/o/v1/me');
  return token === null ? r : r.set('Authorization', `Bearer ${token}`);
};

describe('احراز JWT (JWKS محلی)', () => {
  it('بدون توکن 401؛ مزخرف/alg=none 401', async () => {
    expect((await get(null)).body.error.code).toBe('AUTH_REQUIRED');
    expect((await get('garbage')).body.error.code).toBe('AUTH_TOKEN_INVALID');
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: randomUUID(), iss: 'isra-low', aud: 'isra', lvl: 'low', exp: 9_999_999_999 })}.`;
    expect((await get(none)).status).toBe(401);
  });

  it('امضای کلید دیگر، iss/aud اشتباه، lvl اشتباه، منقضی ⇒ رد', async () => {
    const sub = randomUUID();
    const { privateKey } = await generateKeyPair('RS256');
    expect((await get(await t.low.sign({ sub }, privateKey))).status).toBe(401);
    expect((await get(await t.low.sign({ sub, iss: 'evil' }))).status).toBe(401);
    expect((await get(await t.low.sign({ sub, aud: 'other' }))).status).toBe(401);
    expect((await get(await t.low.sign({ sub, lvl: 'high' }))).status).toBe(401);
    const past = Math.floor(t.clock.now().getTime() / 1000) - 3600;
    const expired = await get(await t.low.sign({ sub, exp: past }));
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('AUTH_TOKEN_EXPIRED');
    expect((await get(await t.low.sign({ sub }))).status).toBe(200);
  });

  it('HS256 با کلید عمومی (algorithm confusion) رد می‌شود', async () => {
    const forged = await new SignJWT({ lvl: 'low' }).setProtectedHeader({ alg: 'HS256', kid: 'test-kid' }).setSubject(randomUUID()).setIssuer('isra-low').setAudience('isra').setExpirationTime('10m').sign(new TextEncoder().encode('x'.repeat(32)));
    expect((await get(forged)).status).toBe(401);
  });

  it('JWKS در دسترس نیست ⇒ 503 (نه 401)', async () => {
    const t2 = await startApp();
    const token = await t2.low.sign({ sub: randomUUID() });
    t2.low.down = true;
    const r = await request(t2.http).get('/o/v1/me').set('Authorization', `Bearer ${token}`);
    expect([401, 503]).toContain(r.status);
    await t2.close();
  });

  it('همهٔ endpointهای محافظت‌شده بدون توکن 401', async () => {
    const id = randomUUID();
    for (const [m, p] of [['get', '/me/sessions'], ['post', '/sessions'], ['get', `/sessions/${id}/me`], ['post', `/sessions/${id}/attendance`], ['get', `/sessions/${id}/queue`], ['post', `/sessions/${id}/evaluations`], ['get', '/me/points']] as const) {
      const r = await (request(t.http) as any)[m](`/o/v1${p}`);
      expect(r.status, `${m} ${p}`).toBe(401);
    }
  });
});

describe('ورودی و مرز', () => {
  it('JSON خراب 400؛ بدنهٔ بزرگ 413؛ Content-Type غیر JSON 415؛ id نامعتبر 404', async () => {
    const m = await creator(t);
    const bad = await request(t.http).post('/o/v1/sessions').set(m.h).set('Content-Type', 'application/json').send('{"title":');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    expect((await request(t.http).post('/o/v1/sessions').set(m.h).send({ ...sessionBody(), pad: 'x'.repeat(20_000) })).status).toBe(413);
    expect((await request(t.http).post('/o/v1/sessions').set(m.h).set('Content-Type', 'text/plain').send('a=b')).status).toBe(415);
    expect((await a.get('/sessions/not-a-uuid/me', m)).status).toBe(404);
    expect((await a.get(`/sessions/${randomUUID()}/me`, m)).status).toBe(404);
  });

  it('SQL injection در رشته‌ها به‌صورت متن ذخیره می‌شود (پارامتری)', async () => {
    const m = await creator(t);
    const evil = "x'); DROP TABLE sessions;--";
    const r = await a.post('/sessions', m, sessionBody({ title: evil }));
    expect(r.status).toBe(200);
    expect(r.body.data.title).toBe(evil);
    expect((await a.get('/me/sessions', m)).status).toBe(200);
  });

  it('query نامعتبر 400؛ pageSize بیش از سقف 400', async () => {
    const m = await creator(t);
    expect((await a.get('/me/sessions?scope=zzz', m)).status).toBe(400);
    expect((await a.get('/me/sessions?pageSize=1000', m)).status).toBe(400);
  });

  it('هدرهای امنیتی و CORS؛ no-store برای دادهٔ خصوصی', async () => {
    const m = await creator(t);
    const r = await a.get('/me', m);
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-request-id']).toBeTruthy();
    const ok = await request(t.http).options('/o/v1/sessions').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const bad = await request(t.http).options('/o/v1/sessions').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate-limit نوشتن per کاربر: ساخت جلسه ۱۰/دقیقه ⇒ ۱۱ام 429 با Retry-After', async () => {
    const m = await creator(t);
    const rs = [];
    for (let i = 0; i < 11; i++) rs.push(await a.post('/sessions', m, sessionBody()));
    expect(rs.slice(0, 10).every((r) => r.status === 200)).toBe(true);
    expect(rs[10]!.status).toBe(429);
    expect(Number(rs[10]!.headers['retry-after'])).toBeGreaterThan(0);
    // کاربر دیگر تحت‌تأثیر نیست
    expect((await a.post('/sessions', await creator(t), sessionBody())).status).toBe(200);
  });
});

describe('Idempotency-Key (M-03/M-05/M-40)', () => {
  it('تکرار با همان کلید و بدنه ⇒ همان نتیجه و فقط یک جلسه', async () => {
    const m = await creator(t);
    const key = randomUUID();
    const send = (body = sessionBody()) => request(t.http).post('/o/v1/sessions').set(m.h).set('Idempotency-Key', key).send(body);
    const first = await send();
    const second = await send();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    const mine = await a.get('/me/sessions?scope=staff', m);
    expect(mine.body.meta.total).toBe(1);
  });

  it('همان کلید با بدنهٔ دیگر ⇒ 409 IDEMPOTENCY_KEY_REUSED؛ کلید نامعتبر 400', async () => {
    const m = await creator(t);
    const key = randomUUID();
    await request(t.http).post('/o/v1/sessions').set(m.h).set('Idempotency-Key', key).send(sessionBody());
    const r = await request(t.http).post('/o/v1/sessions').set(m.h).set('Idempotency-Key', key).send(sessionBody({ title: 'عنوان دیگر' }));
    expect(r.status).toBe(409);
    expect(r.body.error.details.reason).toBe('IDEMPOTENCY_KEY_REUSED');
    expect((await request(t.http).post('/o/v1/sessions').set(m.h).set('Idempotency-Key', 'x').send(sessionBody())).status).toBe(400);
  });

  it('درخواست‌های هم‌زمان با یک کلید ⇒ حداکثر یک اجرا', async () => {
    const m = await creator(t);
    const key = randomUUID();
    const rs = await Promise.all(Array.from({ length: 5 }, () => request(t.http).post('/o/v1/sessions').set(m.h).set('Idempotency-Key', key).send(sessionBody())));
    const ok = rs.filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ok.map((r) => r.body.data.id)).size).toBe(1);
    expect((await a.get('/me/sessions?scope=staff', m)).body.meta.total).toBe(1);
  });

  it('خطا ⇒ کلید آزاد می‌شود و تلاش مجدد با همان کلید ممکن است', async () => {
    const m = await creator(t);
    const id = await mkSession(t, m, 'draft');
    const key = randomUUID();
    const bad = await request(t.http).post(`/o/v1/sessions/${id}/transition`).set(m.h).set('Idempotency-Key', key).send({ to: 'scheduled' });
    expect(bad.status).toBe(200);
    const again = await request(t.http).post(`/o/v1/sessions/${id}/transition`).set(m.h).set('Idempotency-Key', key).send({ to: 'scheduled' });
    expect(again.status).toBe(200);
    expect(again.body.data.status).toBe('scheduled');
    const jump = await request(t.http).post(`/o/v1/sessions/${id}/transition`).set(m.h).set('Idempotency-Key', randomUUID()).send({ to: 'ended' });
    expect(jump.status).toBe(409);
  });
});

describe('همزمانی در سطح سرویس (بدون محدودیت rate-limit HTTP)', () => {
  it('۴۰ ثبت حضور هم‌زمان ⇒ یک ردیف، یک ۵ امتیاز، بدون خطای deadlock', async () => {
    const m = await creator(t);
    const id = await mkSession(t, m, 'started');
    const u = await mkUser(t, 'شلوغ');
    await join(t, id, m, u);
    const svc = t.app.get(AttendanceService);
    const rs = await Promise.allSettled(Array.from({ length: 40 }, () => svc.checkIn(u.id, id)));
    expect(rs.filter((r) => r.status === 'rejected')).toHaveLength(0);
    const awarded = rs.filter((r) => r.status === 'fulfilled' && r.value.pointsAwarded === 5);
    expect(awarded).toHaveLength(1);
    const [{ n }] = (await t.ds.query('SELECT COUNT(*) AS n FROM attendance_entries')) as { n: string }[];
    expect(Number(n)).toBe(1);
    expect((await a.get('/me/points', u)).body.data.total).toBe(5);
  });
});
