import { randomUUID } from 'node:crypto';
import { io as client, type Socket } from 'socket.io-client';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dataSourceOptions } from '../src/db/data-source';
import { OutboxService } from '../src/outbox/outbox.service';
import { MaintenanceService } from '../src/outbox/maintenance.service';
import { uuidv7 } from '../src/common/ids';
import { type TestApp, type User, api, creator, join, mkSession, mkUser, startApp, testEnv } from './helpers/app';

const SECRET = 'test-pair-low-mid-0123456789abcdef01';
const HIGH_SECRET = 'test-pair-mid-high-0123456789abcdef0';
let t: TestApp;
let a: ReturnType<typeof api>;
beforeAll(async () => {
  t = await startApp({ SOCKET_ENABLED: 'true', INTERNAL_TIMEOUT_MS: '500' });
  a = api(t);
});
afterAll(async () => t.close());

const ev = (type: string, payload: object, eventId = randomUUID()) => ({ eventId, type, occurredAt: new Date().toISOString(), payload });
/** رویداد system.* از high می‌آید؛ بقیه از low (ACL فرستنده) */
const send = (body: object, token?: string | null, caller: 'low' | 'mid' | 'high' | null = null) => {
  const sys = String((body as { type?: unknown }).type ?? '').startsWith('system.');
  const r = request(t.http).post('/o/internal/v1/events').set('X-Internal-Caller', caller ?? (sys ? 'high' : 'low'));
  const tok = token === undefined ? (sys ? HIGH_SECRET : SECRET) : token;
  return (tok ? r.set('X-Internal-Token', tok) : r).send(body);
};
const internalGet = (path: string, token: string | null = SECRET, caller: 'low' | 'high' = 'low') => {
  const r = request(t.http).get(`/o/internal/v1${path}`).set('X-Internal-Caller', caller);
  return token ? r.set('X-Internal-Token', token) : r;
};

describe('رویدادهای ورودی (از low/high)', () => {
  it('secret نادرست/نبود ⇒ 401', async () => {
    expect((await send(ev('user.registered', { userId: randomUUID() }), null)).status).toBe(401);
    expect((await send(ev('user.registered', { userId: randomUUID() }), 'wrong'.repeat(10))).status).toBe(401);
  });

  it('user.registered / user.profile.updated ⇒ نام در عضویت‌ها؛ dedupe با eventId', async () => {
    const m = await creator(t);
    const id = await mkSession(t, m, 'scheduled');
    const uid = uuidv7();
    const tok = await t.low.sign({ sub: uid });
    const h = { Authorization: `Bearer ${tok}` };
    await send(ev('user.registered', { userId: uid }));
    const r1 = await request(t.http).post(`/o/v1/sessions/${id}/members`).set(h).send({});
    expect(r1.body.data.name).toBe('کاربر');
    const e = ev('user.profile.updated', { userId: uid, firstName: 'مریم', lastName: 'احمدی' });
    expect((await send(e)).status).toBe(202);
    await send(e);
    const list = await a.get(`/sessions/${id}/members?status=pending`, m);
    expect(list.body.data[0].name).toBe('مریم احمدی');
    // به‌روزرسانی جزئی نام خانوادگی را نمی‌پاشد
    await send(ev('user.profile.updated', { userId: uid, firstName: 'مریم‌السادات' }));
    expect((await a.get(`/sessions/${id}/members?status=pending`, m)).body.data[0].name).toBe('مریم‌السادات احمدی');
  });

  it('system.settings.changed: فقط نسخهٔ جدیدتر؛ جمع وزن‌ها باید ۱۰۰ باشد؛ نوع ناشناخته پذیرفته می‌شود', async () => {
    const good = { version: 5, evalWeights: { voice: 50, tone: 25, tajweed: 25 }, badgeThresholds: [10, 20, 30, 40] };
    expect((await send(ev('system.settings.changed', good))).status).toBe(202);
    expect((await send(ev('system.settings.changed', { ...good, version: 3, evalWeights: { voice: 10, tone: 10, tajweed: 80 } }))).status).toBe(202);
    expect((await send(ev('system.settings.changed', { ...good, version: 9, evalWeights: { voice: 50, tone: 50, tajweed: 50 } }))).status).toBe(400);
    const u = await mkUser(t, 'نمونه');
    expect((await a.get('/me/points', u)).body.data.badges.map((b: any) => b.threshold)).toEqual([10, 20, 30, 40]);
    expect((await send(ev('future.event', { a: 1 }))).status).toBe(403); // allow-list نوع رویداد per فرستنده
    await t.ds.query('DELETE FROM settings_cache');
  });

  it('ورودی نامعتبر ⇒ 400', async () => {
    expect((await send({ eventId: 'x' })).status).toBe(400);
    expect((await send(ev('user.registered', { userId: 'not-uuid' }))).status).toBe(400);
  });
});

describe('endpointهای internal برای low', () => {
  it('guard: بدون secret 401', async () => {
    expect((await internalGet('/public/sessions', null)).status).toBe(401);
  });

  it('public/sessions: draft نیست؛ صفحه‌بندی و فیلتر status؛ شکل مطابق قرارداد', async () => {
    const m = await creator(t);
    await mkSession(t, m, 'draft');
    const sched = await mkSession(t, m, 'scheduled');
    const started = await mkSession(t, m, 'started');
    const r = await internalGet('/public/sessions?pageSize=50');
    expect(r.status).toBe(200);
    const ids = r.body.data.map((s: any) => s.id);
    expect(ids).toEqual(expect.arrayContaining([sched, started]));
    expect(r.body.data.every((s: any) => s.status !== 'draft')).toBe(true);
    expect(r.body.meta).toMatchObject({ page: 1, pageSize: 50 });
    // started قبل از scheduled
    expect(ids.indexOf(started)).toBeLessThan(ids.indexOf(sched));
    const only = await internalGet('/public/sessions?status=started&pageSize=50');
    expect(only.body.data.every((s: any) => s.status === 'started')).toBe(true);
    expect((await internalGet('/public/sessions?pageSize=500')).status).toBe(400);
  });

  it('public/sessions/:id: draft ⇒ 404، scheduled ⇒ 200؛ users/:id/points', async () => {
    const m = await creator(t);
    const draft = await mkSession(t, m, 'draft');
    const sched = await mkSession(t, m, 'scheduled');
    expect((await internalGet(`/public/sessions/${draft}`)).status).toBe(404);
    expect((await internalGet(`/public/sessions/${sched}`)).body.data.id).toBe(sched);
    expect((await internalGet('/public/sessions/xyz')).status).toBe(404);
    const pts = await internalGet(`/users/${m.id}/points`);
    expect(pts.body.data).toMatchObject({ total: 0 });
    expect(pts.body.data.badges).toHaveLength(4);
  });
});

describe('outbox به low', () => {
  it('تأیید عضویت ⇒ رویداد inbox.message.created با secret به low می‌رسد؛ شکست ⇒ backoff؛ eventId پایدار', async () => {
    await t.ds.query('DELETE FROM outbox_events');
    t.low.events.length = 0;
    const m = await creator(t);
    const id = await mkSession(t, m, 'scheduled');
    const u = await mkUser(t, 'عضو جدید');
    const mem = (await a.post(`/sessions/${id}/members`, u)).body.data.id;
    await a.patch(`/sessions/${id}/members/${mem}`, m, { action: 'approve' });

    const svc = t.app.get(OutboxService);
    t.low.eventStatus = 500;
    expect(await svc.tick()).toBe(0);
    const [row] = (await t.ds.query('SELECT attempts, next_attempt_at FROM outbox_events')) as { attempts: number; next_attempt_at: Date }[];
    expect(row!.attempts).toBe(1);
    expect(row!.next_attempt_at.getTime()).toBeGreaterThan(t.clock.now().getTime());
    expect(await svc.tick()).toBe(0);

    t.clock.advance(120_000);
    t.low.eventStatus = 202;
    expect(await svc.tick()).toBe(1);
    const last = t.low.events.at(-1)!;
    expect(last.url).toBe('/internal/v1/events');
    expect(last.headers['x-internal-token']).toBe(SECRET);
    expect(last.body).toMatchObject({ type: 'inbox.message.created', payload: { userId: u.id, kind: 'membership' } });
    expect(t.low.events[0]!.body.eventId).toBe(last.body.eventId);
    expect(await svc.tick()).toBe(0);
  });
});

describe('maintenance', () => {
  it('کلیدهای idempotency و رویدادهای قدیمی پاک؛ snapshot جلسات تکرارشونده تازه می‌شود', async () => {
    await t.ds.query("INSERT INTO idempotency_keys (user_id, idem_key, request_hash, status, created_at) VALUES (UNHEX(REPEAT('01',16)), 'old-key-1', UNHEX(REPEAT('00',32)), 'done', DATE_SUB(NOW(3), INTERVAL 3 DAY))");
    const m = await creator(t);
    const id = await mkSession(t, m, 'scheduled');
    await a.patch(`/sessions/${id}`, m, { title: 'جلسهٔ هفتگی ثابت', description: 'جلسهٔ تکرارشونده برای تست', schedule: { type: 'recurring', weekdays: [0, 1, 2, 3, 4, 5, 6], timeOfDay: '10:00', durationMin: 60 }, location: { label: 'مسجد' } });
    await t.ds.query('UPDATE sessions SET next_starts_at = DATE_SUB(NOW(3), INTERVAL 2 DAY) WHERE id = UNHEX(REPLACE(?, "-", ""))', [id]);
    t.clock.advance(3 * 86_400_000);
    const out = await t.app.get(MaintenanceService).run();
    expect(out.idempotency).toBeGreaterThanOrEqual(1);
    expect(out.snapshots).toBeGreaterThanOrEqual(1);
  });
});

describe('Socket.IO realtime (قفل: روی api-mid)', () => {
  const connect = (token: string | null): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const s = client(`http://127.0.0.1:${t.port}`, { path: '/o/v1/socket.io', transports: ['websocket'], auth: token ? { token } : {}, reconnection: false, forceNew: true });
      s.on('connect', () => resolve(s));
      s.on('connect_error', (e) => reject(e));
    });
  const join_ = (s: Socket, sessionId: string) => new Promise<{ ok: boolean; error?: string }>((r) => s.emit('session.join', { sessionId }, r));
  const next = (s: Socket) => new Promise<any>((r) => s.once('live', r));

  it('توکن نامعتبر/نبود ⇒ اتصال رد می‌شود', async () => {
    await expect(connect(null)).rejects.toThrow(/AUTH_REQUIRED/);
    await expect(connect('garbage')).rejects.toThrow(/AUTH_TOKEN_INVALID/);
  });

  it('join فقط عضو تأییدشده؛ رویدادهای attendance/queue/eval/session.state فقط به اتاق همان جلسه', async () => {
    const m = await creator(t);
    const id = await mkSession(t, m, 'scheduled');
    const teacher = await mkUser(t, 'معلم زنده');
    const stu = await mkUser(t, 'دانش زنده');
    const outsider = await mkUser(t, 'بیرونی');
    await join(t, id, m, teacher, ['teacher']);
    await join(t, id, m, stu);
    const other = await mkSession(t, await creator(t, 'مدیر دوم'), 'scheduled');

    const sTeacher = await connect(teacher.token);
    const sStu = await connect(stu.token);
    const sOut = await connect(outsider.token);
    try {
      expect(await join_(sOut, id)).toEqual({ ok: false, error: 'AUTH_FORBIDDEN' });
      expect(await join_(sTeacher, 'bad')).toMatchObject({ ok: false });
      expect(await join_(sTeacher, other)).toMatchObject({ ok: false });
      expect(await join_(sTeacher, id)).toEqual({ ok: true });
      expect(await join_(sStu, id)).toEqual({ ok: true });

      const leaked: unknown[] = [];
      sOut.on('live', (e) => leaked.push(e));

      let p = next(sStu);
      await a.post(`/sessions/${id}/transition`, m, { to: 'started' });
      expect(await p).toEqual({ type: 'session.state', sessionId: id, payload: { status: 'started' } });

      p = next(sTeacher);
      await a.post(`/sessions/${id}/attendance`, stu);
      expect((await p).type).toBe('attendance.updated');

      const types: string[] = [];
      sTeacher.on('live', (e) => types.push(e.type));
      await a.post(`/sessions/${id}/queue`, stu);
      await a.post(`/sessions/${id}/queue/next`, teacher);
      const turned = new Promise<any>((r) => sStu.on('live', (e) => e.type === 'queue.turned' && r(e)));
      await a.post(`/sessions/${id}/queue`, stu).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 150));
      expect(types).toEqual(expect.arrayContaining(['queue.updated', 'queue.turned']));
      void turned;
      expect(leaked).toEqual([]);
    } finally {
      [sTeacher, sStu, sOut].forEach((s) => s.disconnect());
    }
  });

  it('queue.turned حاوی userId نفر نوبت‌رسیده و eval.updated پس از ارزیابی', async () => {
    const m = await creator(t);
    const id = await mkSession(t, m, 'started');
    const teacher = await mkUser(t, 'معلم دو');
    const stu = await mkUser(t, 'دانش دو');
    await join(t, id, m, teacher, ['teacher']);
    await join(t, id, m, stu);
    await a.post(`/sessions/${id}/attendance`, stu);
    await a.post(`/sessions/${id}/queue`, stu);
    const s = await connect(stu.token);
    try {
      await join_(s, id);
      const events: any[] = [];
      s.on('live', (e) => events.push(e));
      const q = await a.post(`/sessions/${id}/queue/next`, teacher);
      await a.post(`/sessions/${id}/evaluations`, teacher, { queueItemId: q.body.data.current.id, voice: 5, tone: 5, tajweed: 5 });
      await new Promise((r) => setTimeout(r, 200));
      expect(events.find((e) => e.type === 'queue.turned')).toMatchObject({ sessionId: id, payload: { userId: stu.id } });
      expect(events.some((e) => e.type === 'eval.updated')).toBe(true);
    } finally {
      s.disconnect();
    }
  });
});

describe('migration', () => {
  it('down همهٔ جدول‌ها را برمی‌دارد و up دوباره می‌سازد؛ ایندکس‌های یکتای کسب‌وکار موجودند', async () => {
    const ds = new DataSource(dataSourceOptions(testEnv({ DB_MIGRATIONS_RUN: 'false', LOW_JWKS_URL: t.low.jwksUrl })));
    await ds.initialize();
    try {
      const tables = async () => ((await ds.query('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> "migrations"')) as { t: string }[]).length;
      const unique = async (table: string, name: string) => {
        const rows = (await ds.query('SELECT non_unique AS nu FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?', [table, name])) as { nu: number | string }[];
        return rows.length > 0 && Number(rows[0]!.nu) === 0;
      };
      await ds.runMigrations();
      expect(await tables()).toBe(16);
      for (const [tb, ix] of [['attendance_entries', 'uq_attendance_session_user'], ['evaluations', 'uq_eval_queue_item'], ['point_ledger', 'uq_ledger_reason_ref'], ['badge_awards', 'uq_badge_user_key'], ['session_members', 'uq_member_session_user'], ['queue_items', 'uq_queue_active']] as const) expect(await unique(tb, ix), ix).toBe(true);
      await ds.undoLastMigration(); // RevokedSessions
      await ds.undoLastMigration(); // SessionRouteUrl
      await ds.undoLastMigration(); // InitSchema
      expect(await tables()).toBe(0);
      await ds.runMigrations();
      expect(await tables()).toBe(16);
    } finally {
      await ds.destroy();
    }
  });
});
export type { User };

describe('maintenance_mode از high', () => {
  it('پرچم ⇒ همهٔ مسیرهای عمومی 503؛ internal و health باز؛ خاموش شدن ⇒ برگشت', async () => {
    const u = await mkUser(t, 'کاربر نگهداری');
    const flags = (version: number, m: boolean) => send(ev('system.settings.changed', { version, evalWeights: { voice: 40, tone: 30, tajweed: 30 }, badgeThresholds: [50, 150, 300, 500], flags: { maintenance_mode: m, registration_open: true } }));
    expect((await a.get('/me', u)).status).toBe(200);
    expect((await flags(50, true)).status).toBe(202);
    t.clock.advance(6_000);
    const r = await a.get('/me', u);
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect((await request(t.http).get('/o/health/live')).status).toBe(200);
    expect((await internalGet('/public/sessions')).status).toBe(200);
    await flags(51, false);
    t.clock.advance(6_000);
    expect((await a.get('/me', u)).status).toBe(200);
    await t.ds.query('DELETE FROM settings_cache');
  });
});

describe('internal stats برای high', () => {
  it('شمار جلسات per وضعیت', async () => {
    await t.ds.query('DELETE FROM session_members');
    await t.ds.query('DELETE FROM sessions');
    const m = await creator(t);
    await mkSession(t, m, 'draft');
    await mkSession(t, m, 'scheduled');
    await mkSession(t, m, 'scheduled');
    await mkSession(t, m, 'ended');
    const r = await internalGet('/stats/sessions', HIGH_SECRET, 'high');
    expect(r.body.data).toEqual({ draft: 1, scheduled: 2, started: 0, ended: 1 });
    expect((await internalGet('/stats/sessions', null, 'high')).status).toBe(401);
    expect((await internalGet('/stats/sessions')).status).toBe(403); // فرستندهٔ غیرمجاز (low) برای مسیر stats
  });
});

describe('session.revoked از low', () => {
  const sidOf = (tok: string) => (JSON.parse(Buffer.from(tok.split('.')[1]!, 'base64url').toString()) as { sid: string }).sid;
  it('توکن نشست باطل‌شده رد می‌شود؛ نشست‌های دیگر سالم؛ ACL: فقط low', async () => {
    const u = await mkUser(t, 'الف');
    const v = await mkUser(t, 'ب');
    expect((await a.get('/me', u)).status).toBe(200);
    const body = ev('session.revoked', { sessionIds: [sidOf(u.token)], expiresAt: new Date(Date.now() + 600_000).toISOString() });
    expect((await send(body, HIGH_SECRET, 'high')).status).toBe(403); // high اجازهٔ ارسال session.revoked ندارد
    expect((await send(body)).status).toBe(202);
    expect((await a.get('/me', u)).status).toBe(401);
    expect((await a.get('/me', v)).status).toBe(200);
  });
});
