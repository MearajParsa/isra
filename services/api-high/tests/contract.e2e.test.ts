import { randomUUID } from 'node:crypto';
import { ModulesContainer } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ENDPOINTS, ERROR_CATALOG, type EndpointDef } from '@isra/api-types';
import { EP_KEY, fullPath } from '../src/common/ep';
import { type TestApp, api, mkUser, resetDb, startApp } from './helpers/app';

let t: TestApp;
let a: ReturnType<typeof api>;
const defs = ENDPOINTS.high as readonly EndpointDef[];
const def = (id: string) => defs.find((d) => d.id === id)!;
beforeAll(async () => {
  t = await startApp();
  a = api(t);
});
afterAll(async () => t.close());
beforeEach(async () => resetDb(t.ds, t.app));

describe('پوشش route ⇄ قرارداد', () => {
  it('هر handler با یک endpoint قرارداد علامت خورده و برعکس', () => {
    const found = new Set<string>();
    for (const m of t.app.get(ModulesContainer).values())
      for (const c of m.controllers.values()) {
        const proto = c.metatype?.prototype as Record<string, unknown> | undefined;
        if (!proto) continue;
        for (const name of Object.getOwnPropertyNames(proto)) {
          const fn = proto[name];
          const id = typeof fn === 'function' ? (Reflect.getMetadata(EP_KEY, fn) as string | undefined) : undefined;
          if (id) found.add(id);
        }
      }
    expect([...found].sort()).toEqual(defs.map((d) => d.id).sort());
  });

  it.each(defs.map((d) => [d.id, d] as const))('%s: ثبت است؛ بدون توکن 401', async (_id, d) => {
    const path = fullPath(d).replace(/:(\w+)/g, () => (d.params?.shape.key ? 'super_admin' : randomUUID()));
    const r = await (request(t.http) as any)[d.method](path);
    expect(r.status === 404 && r.body?.error?.message === 'مسیر پیدا نشد.').toBe(false);
    if (d.auth === 'bearer') expect(r.status).toBe(401);
  });
});

describe('انطباق پاسخ‌ها با schemaهای قرارداد', () => {
  const check = (d: EndpointDef, body: any) => {
    expect(body.success, JSON.stringify(body)).toBe(true);
    for (const it of d.list ? body.data : [body.data]) {
      const r = d.response.safeParse(it);
      expect(r.success, `${d.id}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  };

  it('همهٔ endpointهای H-00 … H-40', async () => {
    const dev = await mkUser(t, 'توسعه نمونه', ['developer']);
    const u = await mkUser(t, 'کاربر نمونه');
    await mkUser(t, 'مدیر نمونه', ['super_admin']);
    check(def('H-00'), (await a.get('/system/me', dev)).body);
    check(def('H-01'), (await a.get('/system/overview', dev)).body);
    check(def('H-10'), (await a.get('/system/roles', dev)).body);
    check(def('H-11'), (await a.get('/system/permissions', dev)).body);
    check(def('H-20'), (await a.get('/system/users', dev)).body);
    check(def('H-21'), (await a.get(`/system/users/${u.id}`, dev)).body);
    check(def('H-22'), (await a.put(`/system/users/${u.id}/roles`, await dev.step(), { roles: ['super_admin'] })).body);
    check(def('H-23'), (await a.put(`/system/users/${u.id}/grants`, await dev.step(), { grants: ['session.create'] })).body);
    check(def('H-12'), (await a.put('/system/roles/super_admin/permissions', await dev.step(), { permissions: ['system.users.view', 'system.role.assign', 'system.permission.edit', 'system.audit.view', 'session.create'] })).body);
    const s = await a.get('/system/settings', dev);
    check(def('H-30'), s.body);
    check(def('H-31'), (await a.put('/system/settings', await dev.step(), { version: s.body.data.version, evalWeights: { voice: 34, tone: 33, tajweed: 33 }, badgeThresholds: [1, 2, 3, 4], flags: { maintenance_mode: false, registration_open: false } })).body);
    check(def('H-40'), (await a.get('/system/audit', dev)).body);
  });

  it('خطاها از ERROR_CATALOG و status منطبق', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const samples = [await a.get(`/system/users/${randomUUID()}`, dev), await request(t.http).get('/s/v1/system/me'), await request(t.http).get('/s/v1/zzz'), await a.get('/system/me', await mkUser(t, 'عادی'))];
    for (const r of samples) {
      const code = r.body.error.code as keyof typeof ERROR_CATALOG;
      expect(ERROR_CATALOG[code]).toBeTruthy();
      expect(r.status).toBe(ERROR_CATALOG[code].status);
      expect(r.body.meta.requestId).toBe(r.headers['x-request-id']);
    }
  });

  it('هدرهای امنیتی، no-store، CORS، 413/415/JSON خراب', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const r = await a.get('/system/me', dev);
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    const ok = await request(t.http).options('/s/v1/system/settings').set('Origin', 'http://localhost:5174').set('Access-Control-Request-Method', 'PUT').set('Access-Control-Request-Headers', 'x-step-up-token,authorization');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5174');
    expect(String(ok.headers['access-control-allow-headers']).toLowerCase()).toContain('x-step-up-token');
    expect((await request(t.http).options('/s/v1/system/me').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET')).headers['access-control-allow-origin']).toBeUndefined();
    const step = await dev.step();
    expect((await request(t.http).put('/s/v1/system/settings').set(step).set('Content-Type', 'application/json').send('{"v":')).status).toBe(400);
    expect((await request(t.http).put('/s/v1/system/settings').set(step).send({ pad: 'x'.repeat(20_000) })).status).toBe(413);
    expect((await request(t.http).put('/s/v1/system/settings').set(step).set('Content-Type', 'text/plain').send('a=b')).status).toBe(415);
  });

  it('rate-limit نوشتن: ۳۰/دقیقه per کاربر ⇒ 429', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'کاربر');
    const step = await dev.step();
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await a.put(`/system/users/${u.id}/grants`, step, { grants: [] })).status;
    expect(last).toBe(429);
  });
});
