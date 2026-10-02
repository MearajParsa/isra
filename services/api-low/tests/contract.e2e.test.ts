import { randomUUID } from 'node:crypto';
import { ModulesContainer } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENDPOINTS, ERROR_CATALOG, type EndpointDef } from '@isra/api-types';
import { EP_KEY, fullPath } from '../src/common/ep';
import { ANDROID, type Login, type TestApp, freshIp, loginOtp, startApp } from './helpers/app';

let t: TestApp;
let u: Login;
const defs = ENDPOINTS.low as readonly EndpointDef[];

beforeAll(async () => {
  t = await startApp();
  u = await loginOtp(t);
});
afterAll(async () => t.close());

describe('پوشش route ⇄ قرارداد', () => {
  it('هر handler کنترلر با یک endpoint قرارداد علامت خورده و برعکس (بدون route یتیم)', () => {
    const found = new Set<string>();
    for (const m of t.app.get(ModulesContainer).values()) {
      for (const c of m.controllers.values()) {
        const proto = c.metatype?.prototype as Record<string, unknown> | undefined;
        if (!proto) continue;
        for (const name of Object.getOwnPropertyNames(proto)) {
          const fn = proto[name];
          if (typeof fn === 'function') {
            const id = Reflect.getMetadata(EP_KEY, fn) as string | undefined;
            if (id) found.add(id);
          }
        }
      }
    }
    expect([...found].sort()).toEqual(defs.map((d) => d.id).sort());
  });

  it.each(defs.map((d) => [d.id, d] as const))('%s: متد و مسیر ثبت است (404 مسیر نیست)', async (_id, d) => {
    const path = fullPath(d).replace(/:(\w+)/g, () => randomUUID());
    const r = await (request(t.http) as unknown as Record<string, (p: string) => request.Test>)[d.method]!(path).set(ANDROID).set('X-Forwarded-For', freshIp());
    const unknownRoute = r.status === 404 && r.body?.error?.message === 'مسیر پیدا نشد.';
    expect(unknownRoute).toBe(false);
  });

  it('هر endpoint محافظت‌شده بدون توکن ⇒ 401 (ماتریس منفی)', async () => {
    for (const d of defs.filter((e) => e.auth === 'bearer')) {
      const path = fullPath(d).replace(/:(\w+)/g, () => randomUUID());
      const r = await (request(t.http) as unknown as Record<string, (p: string) => request.Test>)[d.method]!(path).set(ANDROID).set('X-Forwarded-For', freshIp());
      expect(r.status, `${d.id} ${d.method} ${path}`).toBe(401);
    }
  });
});

describe('انطباق پاسخ‌ها با schemaهای قرارداد', () => {
  const auth = () => u.headers;
  const check = (d: EndpointDef, body: { success: boolean; data?: unknown }) => {
    expect(body.success).toBe(true);
    const items = d.list ? (body.data as unknown[]) : [body.data];
    expect(Array.isArray(items)).toBe(true);
    for (const it of items) {
      const r = d.response.safeParse(it);
      expect(r.success, `${d.id}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  };
  const def = (id: string) => defs.find((d) => d.id === id)!;

  it('L-01/02/04/06/07 (auth) و L-03', async () => {
    const phone = '09129990001';
    const rq = await request(t.http).post('/c/v1/auth/otp/request').set(ANDROID).set('X-Forwarded-For', freshIp()).send({ phone });
    check(def('L-01'), rq.body);
    const v = await request(t.http)
      .post('/c/v1/auth/otp/verify')
      .set(ANDROID)
      .set('X-Forwarded-For', freshIp())
      .send({ challengeId: rq.body.data.challengeId, code: t.sms.lastCode(phone), deviceId: randomUUID(), deviceLabel: 'c' });
    check(def('L-02'), v.body);
    const rf = await request(t.http).post('/c/v1/auth/refresh').set(ANDROID).set('X-Forwarded-For', freshIp()).send({ refreshToken: v.body.data.refreshToken });
    check(def('L-04'), rf.body);

    const srq = await request(t.http).post('/c/v1/auth/step-up/otp/request').set({ ...ANDROID, Authorization: `Bearer ${rf.body.data.accessToken}` }).send();
    check(def('L-06'), srq.body);
    const sv = await request(t.http)
      .post('/c/v1/auth/step-up/otp/verify')
      .set({ ...ANDROID, Authorization: `Bearer ${rf.body.data.accessToken}` })
      .send({ challengeId: srq.body.data.challengeId, code: t.sms.lastCode(phone) });
    check(def('L-07'), sv.body);

    const h = { ...ANDROID, Authorization: `Bearer ${rf.body.data.accessToken}` };
    await request(t.http).put('/c/v1/me/password').set(h).send({ newPassword: 'conformance-pass-1' });
    const pl = await request(t.http).post('/c/v1/auth/login/password').set(ANDROID).set('X-Forwarded-For', freshIp()).send({ phone, password: 'conformance-pass-1', deviceId: randomUUID(), deviceLabel: 'p' });
    check(def('L-03'), pl.body);
  });

  it('me/* (L-10..L-21)', async () => {
    await t.ds.query('INSERT INTO inbox_messages (id, user_id, kind, title, body, ref, created_at) VALUES (UNHEX(REPLACE(?, "-", "")), UNHEX(REPLACE(?, "-", "")), "turn", "نوبت شما", "نوبت شما رسید", "session:abc", NOW(3))', [randomUUID(), u.userId]);
    const g = (p: string) => request(t.http).get(`/c/v1${p}`).set(auth());
    check(def('L-10'), (await g('/me')).body);
    check(def('L-11'), (await g('/me/profile')).body);
    check(def('L-12'), (await request(t.http).patch('/c/v1/me/profile').set(auth()).send({ firstName: 'علی', lastName: 'رضایی' })).body);
    check(def('L-14'), (await g('/me/sessions')).body);
    const inbox = await g('/me/inbox');
    check(def('L-17'), inbox.body);
    expect(inbox.body.meta).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    check(def('L-18'), (await g('/me/inbox/unread-count')).body);
    check(def('L-19'), (await request(t.http).post(`/c/v1/me/inbox/${inbox.body.data[0].id}/read`).set(auth())).body);
    check(def('L-20'), (await request(t.http).post('/c/v1/me/inbox/read-all').set(auth())).body);
    check(def('L-21'), (await g('/me/points')).body);
    check(def('L-16'), (await request(t.http).post('/c/v1/me/sessions/revoke-others').set(auth())).body);
  });

  it('L-15/L-05 (Empty) و L-30/31/L-90/health', async () => {
    t.clock.advance(61_000);
    const other = await loginOtp(t, { phone: u.phone });
    check(def('L-15'), (await request(t.http).delete(`/c/v1/me/sessions/${other.sessionId}`).set(auth())).body);
    const pub = await request(t.http).get('/c/v1/public/sessions').set('X-Forwarded-For', freshIp());
    check(def('L-30'), pub.body);
    expect(pub.headers['cache-control']).toBe('public, max-age=30, stale-while-revalidate=120');
    expect(pub.headers.etag).toBeTruthy();
    const jwks = await request(t.http).get('/c/.well-known/jwks.json').set('X-Forwarded-For', freshIp());
    expect(def('L-90').response.safeParse(jwks.body).success).toBe(true);
    const live = await request(t.http).get('/c/health/live');
    expect(def('L-OPS-01').response.safeParse(live.body).success).toBe(true);
    const ready = await request(t.http).get('/c/health/ready');
    expect(ready.status).toBe(200);
    expect(def('L-OPS-02').response.safeParse(ready.body).success).toBe(true);
  });
});

describe('envelope و خطاها', () => {
  it('هر کد خطای تولیدشده در ERROR_CATALOG است و status با کاتالوگ برابر', async () => {
    const samples = [
      await request(t.http).get('/c/v1/me').set(ANDROID),
      await request(t.http).post('/c/v1/auth/otp/request').set(ANDROID).send({}),
      await request(t.http).get('/c/v1/zzz')
    ];
    for (const r of samples) {
      const code = r.body.error.code as keyof typeof ERROR_CATALOG;
      expect(ERROR_CATALOG[code]).toBeTruthy();
      expect(r.status).toBe(ERROR_CATALOG[code].status);
      expect(r.body.success).toBe(false);
      expect(r.body.meta.requestId).toBe(r.headers['x-request-id']);
    }
  });

  it('X-Request-Id ورودی معتبر حفظ و نامعتبر جایگزین می‌شود (log injection)', async () => {
    const ok = await request(t.http).get('/c/v1/me').set('X-Request-Id', 'abcdef12345678');
    expect(ok.headers['x-request-id']).toBe('abcdef12345678');
    const bad = await request(t.http).get('/c/v1/me').set('X-Request-Id', 'bad id\r\nX: y'.replace(/\r\n/g, ' '));
    expect(bad.headers['x-request-id']).not.toContain(' ');
  });

  it('عمومی: ETag پایدار و 304 با If-None-Match', async () => {
    const a = await request(t.http).get('/c/v1/public/sessions').set('X-Forwarded-For', freshIp());
    const b = await request(t.http).get('/c/v1/public/sessions').set('If-None-Match', a.headers.etag!).set('X-Forwarded-For', freshIp());
    expect(b.status).toBe(304);
    expect(b.text).toBe('');
  });
});
