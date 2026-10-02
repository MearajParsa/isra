import { randomUUID } from 'node:crypto';
import { ModulesContainer } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENDPOINTS, ERROR_CATALOG, type EndpointDef } from '@isra/api-types';
import { EP_KEY, fullPath } from '../src/common/ep';
import { type TestApp, type User, api, creator, join, mkSession, mkUser, startApp } from './helpers/app';

let t: TestApp;
let a: ReturnType<typeof api>;
const defs = ENDPOINTS.mid as readonly EndpointDef[];
const def = (id: string) => defs.find((d) => d.id === id)!;

beforeAll(async () => {
  t = await startApp();
  a = api(t);
});
afterAll(async () => t.close());

describe('پوشش route ⇄ قرارداد', () => {
  it('هر handler با یک endpoint قرارداد علامت خورده و برعکس (بدون route یتیم)', () => {
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

  it.each(defs.map((d) => [d.id, d] as const))('%s: ثبت است؛ محافظت‌شده‌ها بدون توکن 401', async (_id, d) => {
    const path = fullPath(d).replace(/:(\w+)/g, () => randomUUID());
    const r = await (request(t.http) as any)[d.method](path);
    expect(r.status === 404 && r.body?.error?.message === 'مسیر پیدا نشد.').toBe(false);
    if (d.auth === 'bearer') expect(r.status, `${d.id}`).toBe(401);
  });
});

describe('انطباق پاسخ‌ها با schemaهای قرارداد', () => {
  const check = (d: EndpointDef, body: any) => {
    expect(body.success, JSON.stringify(body)).toBe(true);
    const items = d.list ? body.data : [body.data];
    expect(Array.isArray(items)).toBe(true);
    for (const it of items) {
      const r = d.response.safeParse(it);
      expect(r.success, `${d.id}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  };

  it('مسیر کامل شرکت‌کننده: M-00 … M-42', async () => {
    const m = await creator(t);
    const teacher = await mkUser(t, 'معلم نمونه');
    const stu = await mkUser(t, 'قرآن‌آموز نمونه');
    const newbie = await mkUser(t, 'درخواست‌دهنده');

    check(def('M-00'), (await a.get('/me', m)).body);
    const created = await a.post('/sessions', m, { title: 'جلسهٔ قرارداد', description: 'توضیحات جلسهٔ تست قرارداد', schedule: { type: 'recurring', weekdays: [6], timeOfDay: '21:00', durationMin: 90 }, location: { label: 'مسجد' } });
    check(def('M-03'), created.body);
    const id = created.body.data.id as string;
    check(def('M-04'), (await a.patch(`/sessions/${id}`, m, { title: 'جلسهٔ قرارداد ۲', description: 'توضیحات جلسهٔ تست قرارداد', schedule: { type: 'range', rangeFrom: '2030-01-01T00:00:00+03:30', rangeTo: '2030-03-01T00:00:00+03:30', weekdays: [0, 2], timeOfDay: '18:30', durationMin: 60 }, location: { label: 'مسجد' } })).body);
    check(def('M-05'), (await a.post(`/sessions/${id}/transition`, m, { to: 'scheduled' })).body);
    check(def('M-05'), (await a.post(`/sessions/${id}/transition`, m, { to: 'started' })).body);

    const req = await a.post(`/sessions/${id}/members`, newbie);
    check(def('M-10'), req.body);
    check(def('M-11'), (await a.get(`/sessions/${id}/members`, m)).body);
    check(def('M-12'), (await a.patch(`/sessions/${id}/members/${req.body.data.id}`, m, { action: 'approve' })).body);
    await join(t, id, m, teacher, ['teacher']);
    const sm = await join(t, id, m, stu);
    check(def('M-13'), (await a.put(`/sessions/${id}/members/${sm}/roles`, m, { roles: [] })).body);
    check(def('M-01'), (await a.get('/me/sessions', m)).body);
    check(def('M-02'), (await a.get(`/sessions/${id}/me`, stu)).body);

    check(def('M-20'), (await a.post(`/sessions/${id}/attendance`, stu)).body);
    check(def('M-21'), (await a.get(`/sessions/${id}/attendance`, teacher)).body);
    const stu2 = await mkUser(t, 'قرآن‌آموز دوم');
    await join(t, id, m, stu2);
    await a.post(`/sessions/${id}/attendance`, stu2);
    check(def('M-30'), (await a.post(`/sessions/${id}/queue`, stu)).body);
    await a.post(`/sessions/${id}/queue`, stu2);
    check(def('M-32'), (await a.get(`/sessions/${id}/queue`, teacher)).body);
    check(def('M-32'), (await a.get(`/sessions/${id}/queue`, stu)).body);
    const q = await a.post(`/sessions/${id}/queue/next`, teacher);
    check(def('M-33'), q.body);
    check(def('M-34'), (await a.patch(`/sessions/${id}/queue/${q.body.data.waiting[0].id}`, teacher, { action: 'skip' })).body);
    check(def('M-40'), (await a.post(`/sessions/${id}/evaluations`, teacher, { queueItemId: q.body.data.current.id, voice: 9, tone: 8, tajweed: 7, note: 'خوب' })).body);
    check(def('M-41'), (await a.get(`/sessions/${id}/evaluations`, teacher)).body);
    check(def('M-42'), (await a.get('/me/points', stu)).body);
    const q2 = await a.get(`/sessions/${id}/queue`, stu);
    expect(q2.status).toBe(200);
    check(def('M-31'), (await a.del(`/sessions/${id}/queue/me`, stu2)).body);
  });

  it('خطاها از ERROR_CATALOG و status منطبق؛ meta.requestId همان هدر', async () => {
    const m = await creator(t);
    const samples = [await a.get(`/sessions/${randomUUID()}/me`, m), await a.post('/sessions', m, {}), await request(t.http).get('/o/v1/me'), await request(t.http).get('/o/v1/zzz')];
    for (const r of samples) {
      const code = r.body.error.code as keyof typeof ERROR_CATALOG;
      expect(ERROR_CATALOG[code]).toBeTruthy();
      expect(r.status).toBe(ERROR_CATALOG[code].status);
      expect(r.body.meta.requestId).toBe(r.headers['x-request-id']);
    }
  });

  it('صفحه‌بندی استاندارد در meta و AttendanceList بدون تبدیل به آرایه', async () => {
    const m = await creator(t);
    const id = await mkSession(t, m, 'started');
    const r = await a.get(`/sessions/${id}/attendance`, m);
    expect(Array.isArray(r.body.data)).toBe(false);
    expect(r.body.data).toEqual({ items: [], total: 0 });
    const list = await a.get('/me/sessions?page=1&pageSize=5', m);
    expect(list.body.meta).toMatchObject({ page: 1, pageSize: 5, total: 1 });
  });
});

describe('health', () => {
  it('live/ready بدون envelope', async () => {
    const live = await request(t.http).get('/o/health/live');
    expect(def('M-OPS-01').response.safeParse(live.body).success).toBe(true);
    const ready = await request(t.http).get('/o/health/ready');
    expect(ready.status).toBe(200);
  });
});
export type { User };
