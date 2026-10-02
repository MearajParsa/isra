import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dataSourceOptions } from '../src/db/data-source';
import { OutboxService } from '../src/outbox/outbox.service';
import { MaintenanceService } from '../src/outbox/maintenance.service';
import { type TestApp, api, mkUser, resetDb, startApp, testEnv } from './helpers/app';

const SECRET = 'test-internal-secret-test-internal-1234';
let t: TestApp;
let a: ReturnType<typeof api>;
beforeAll(async () => {
  t = await startApp({ INTERNAL_TIMEOUT_MS: '500' });
  a = api(t);
});
afterAll(async () => t.close());
beforeEach(async () => resetDb(t.ds));

const send = (body: object, token: string | null = SECRET) => {
  const r = request(t.http).post('/internal/v1/events');
  return (token ? r.set('X-Internal-Token', token) : r).send(body);
};
const ev = (type: string, payload: object, eventId = randomUUID()) => ({ eventId, type, occurredAt: new Date().toISOString(), payload });

describe('رویدادهای ورودی از low', () => {
  it('secret نادرست ⇒ 401؛ payload نامعتبر ⇒ 400؛ نوع ناشناخته ⇒ 202', async () => {
    expect((await send(ev('user.registered', {}), null)).status).toBe(401);
    expect((await send(ev('user.registered', {}), 'wrong'.repeat(10))).status).toBe(401);
    expect((await send(ev('user.registered', { userId: 'x', phone: '1' }))).status).toBe(400);
    expect((await send(ev('future.event', { a: 1 }))).status).toBe(202);
  });

  it('user.registered ⇒ در فهرست کاربران؛ dedupe؛ profile.updated جزئی نام را می‌پاشد؟ خیر', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const uid = randomUUID();
    const e = ev('user.registered', { userId: uid, phone: '09127776655', firstName: 'نرگس', lastName: '', createdAt: '2026-10-01T10:00:00+03:30' });
    expect((await send(e)).status).toBe(202);
    expect((await send(e)).status).toBe(202);
    expect((await a.get(`/system/users/${uid}`, dev)).body.data).toMatchObject({ name: 'نرگس', phone: '09127776655', createdAt: '2026-10-01T06:30:00.000Z' });
    await send(ev('user.profile.updated', { userId: uid, lastName: 'کاظمی' }));
    expect((await a.get(`/system/users/${uid}`, dev)).body.data.name).toBe('نرگس کاظمی');
    // بازپخش رویداد جدید با همان کاربر نام را خالی نمی‌کند
    await send(ev('user.registered', { userId: uid, phone: '09127776655', firstName: '', lastName: '' }));
    expect((await a.get(`/system/users/${uid}`, dev)).body.data.name).toBe('نرگس کاظمی');
    expect((await a.get('/system/users?q=کاظمی', dev)).body.meta.total).toBe(1);
  });
});

describe('outbox به low و mid', () => {
  it('رویدادها با secret به هر دو مقصد می‌رسند؛ شکست ⇒ backoff؛ eventId پایدار', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'هدف');
    await a.put(`/system/users/${u.id}/grants`, await dev.step(), { grants: ['session.create'] });
    const svc = t.app.get(OutboxService);
    t.fake.events.length = 0;
    t.fake.status = 500;
    expect(await svc.tick()).toBe(0);
    const [row] = (await t.ds.query('SELECT attempts, next_attempt_at FROM outbox_events')) as { attempts: number; next_attempt_at: Date }[];
    expect(row!.attempts).toBe(1);
    expect(await svc.tick()).toBe(0); // هنوز زود است
    t.clock.advance(120_000);
    t.fake.status = 202;
    t.fake.events.length = 0;
    expect(await svc.tick()).toBe(1);
    // دو مقصد (در تست هر دو به همان سرور جعلی اشاره می‌کنند)
    expect(t.fake.events).toHaveLength(2);
    expect(t.fake.events[0]!.headers['x-internal-token']).toBe(SECRET);
    expect(t.fake.events[0]!.body).toMatchObject({ type: 'system.role.changed', payload: { userId: u.id, grants: ['session.create'] } });
    expect(t.fake.events[0]!.body.eventId).toBe(t.fake.events[1]!.body.eventId);
    expect(await svc.tick()).toBe(0);
  });
});

describe('maintenance', () => {
  it('outbox منتشرشدهٔ قدیمی پاک می‌شود؛ audit هرگز پاک نمی‌شود', async () => {
    const dev = await mkUser(t, 'توسعه', ['developer']);
    const u = await mkUser(t, 'هدف');
    await a.put(`/system/users/${u.id}/grants`, await dev.step(), { grants: ['session.create'] });
    await t.ds.query('UPDATE outbox_events SET published_at = DATE_SUB(NOW(3), INTERVAL 10 DAY)');
    t.clock.advance(11 * 86_400_000);
    const out = await t.app.get(MaintenanceService).run();
    expect(out.outbox).toBeGreaterThanOrEqual(1);
    const fresh = { Authorization: `Bearer ${await t.fake.sign({ sub: dev.id })}`, 'X-Forwarded-For': '10.99.0.1' };
    expect((await a.get('/system/audit', fresh)).body.meta.total).toBe(1);
  });
});

describe('migration و seed', () => {
  it('seed: ۲ نقش undeletable، ۷ مجوز، ماتریس، تنظیمات؛ CHECK روی undeletable؛ down/up تکرارپذیر', async () => {
    const ds = new DataSource(dataSourceOptions(testEnv({ DB_MIGRATIONS_RUN: 'false', LOW_JWKS_URL: t.fake.jwksUrl })));
    await ds.initialize();
    try {
      const count = async (sql: string) => Number(((await ds.query(sql)) as { n: string }[])[0]!.n);
      expect(await count('SELECT COUNT(*) AS n FROM system_roles WHERE undeletable = 1')).toBe(2);
      expect(await count('SELECT COUNT(*) AS n FROM permissions')).toBe(7);
      expect(await count("SELECT COUNT(*) AS n FROM role_permissions WHERE role_key = 'developer' AND locked = 1")).toBe(7);
      await expect(ds.query("INSERT INTO system_roles (role_key, title, description, undeletable) VALUES ('x', 't', 'd', 0)")).rejects.toThrow();
      await ds.undoLastMigration();
      expect(await count('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> "migrations"')).toBe(0);
      await ds.runMigrations();
      expect(await count('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> "migrations"')).toBe(11);
      expect(await count('SELECT COUNT(*) AS n FROM system_settings')).toBe(1);
      const uq = (await ds.query("SELECT non_unique AS nu FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'user_directory' AND index_name = 'uq_directory_phone'")) as { nu: string | number }[];
      expect(Number(uq[0]!.nu)).toBe(0);
    } finally {
      await ds.destroy();
    }
  });
});
