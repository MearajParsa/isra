import { randomUUID } from 'node:crypto';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createApp } from '../../src/bootstrap';
import { Clock } from '../../src/common/clock';
import { uuidv7 } from '../../src/common/ids';
import { type Env, loadEnv } from '../../src/config/env';
import { SEED_MODULES, SEED_PERMISSIONS, seedRbac } from '../../src/db/rbac-seed';
import { RbacService, syncBaseline } from '../../src/domain/rbac.service';
import { SEED_CRITERIA, TEACHER_BACKFILL_JOB } from '../../src/db/migrations/1728700000000-TiersTeacherContent';
import { DEFAULT_FLAGS } from '../../src/domain/rules';

export class TestClock extends Clock {
  private t = Date.now();
  now() {
    return new Date(this.t);
  }
  advance(ms: number) {
    this.t += ms;
  }
}

const TABLES = ['user_directory', 'user_system_roles', 'user_grants', 'audit_logs', 'outbox_events', 'inbox_events', 'rate_limit_counters', 'idempotency_keys', 'announcements'];

/** low جعلی: JWKS + دریافت رویدادهای outbox (نقش api-low) */
export interface FakeLow {
  url: string;
  jwksUrl: string;
  privateKey: CryptoKey;
  sign: (c: { sub: string; sid?: string; lvl?: string; exp?: number; iss?: string; aud?: string; mcp?: boolean }, key?: CryptoKey) => Promise<string>;
  events: { url: string; headers: Record<string, unknown>; body: any }[];
  status: number;
  /** low/mid جعلی برای مسیرهای admin (internal): ثبت فراخوانی‌ها و پاسخ برنامه‌پذیر */
  admin: FakeAdmin;
  close: () => Promise<void>;
}

export interface AdminCall {
  method: string;
  /** مسیر کامل شامل پیشوند سرویس: `/c/internal/v1/admin/...` یا `/o/internal/v1/admin/...` */
  path: string;
  query: Record<string, string>;
  body: any;
  headers: Record<string, string | string[] | undefined>;
}
export type AdminReply = { status?: number; body?: unknown; delayMs?: number } | { __reply: true; status: number; body: unknown; delayMs?: number };
type Handler = (c: AdminCall, params: Record<string, string>) => AdminReply | unknown;
export interface FakeAdmin {
  calls: AdminCall[];
  on: (method: string, pattern: string, h: Handler) => void;
  reset: () => void;
}
/** پاسخ موفق envelope استاندارد (لیست‌ها: meta) */
export const okReply = (data: unknown, meta?: Record<string, unknown>) => ({ __reply: true as const, status: 200, body: { success: true, data, ...(meta ? { meta } : {}) } });
/** پاسخ خطای مبدأ با envelope استاندارد */
export const failReply = (status: number, code: string, message = 'خطا', details?: Record<string, unknown>) => ({ __reply: true as const, status, body: { success: false, error: { code, message, ...(details ? { details } : {}) } } });
export const rawReply = (status: number, body: unknown = {}, delayMs?: number) => ({ __reply: true as const, status, body, delayMs });
/** پاسخ باینری خام (محتوای گالری) */
export const binReply = (status: number, headers: Record<string, string>, body: Buffer) => ({ __raw: true as const, status, headers, body });

export async function startFake(clock: Clock): Promise<FakeLow> {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-kid', use: 'sig', alg: 'RS256' };
  const f: FakeLow = {
    url: '',
    jwksUrl: '',
    privateKey,
    events: [],
    status: 202,
    admin: undefined as unknown as FakeAdmin,
    sign: (c, key) => {
      const iat = Math.floor(clock.now().getTime() / 1000);
      return new SignJWT({ sid: c.sid ?? randomUUID(), lvl: c.lvl ?? 'low', ...(c.mcp ? { mcp: true } : {}) })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-kid', typ: 'JWT' })
        .setSubject(c.sub)
        .setIssuer(c.iss ?? 'isra-low')
        .setAudience(c.aud ?? 'isra')
        .setIssuedAt(iat)
        .setExpirationTime(c.exp ?? iat + (c.lvl === 'stepup' ? 300 : 900))
        .sign(key ?? privateKey);
    },
    close: () => new Promise((r) => server.close(() => r()))
  };
  const routes: { method: string; re: RegExp; keys: string[]; h: Handler }[] = [];
  f.admin = {
    calls: [],
    on: (method, pattern, h) => {
      const keys: string[] = [];
      const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k: string) => (keys.push(k), '([^/?]+)'))}$`);
      routes.unshift({ method: method.toUpperCase(), re, keys, h });
    },
    reset: () => {
      routes.length = 0;
      f.admin.calls.length = 0;
    }
  };
  const server: Server = createServer((req, res) => {
    const rawUrl = req.url ?? '';
    if (/^\/(c|o)\/internal\/v1\/admin\//.test(rawUrl)) {
      const parts: Buffer[] = [];
      req.on('data', (c: Buffer) => parts.push(c));
      req.on('end', async () => {
        const u = new URL(rawUrl, 'http://x');
        const buf = Buffer.concat(parts);
        const isJson = !req.headers['content-type'] || String(req.headers['content-type']).startsWith('application/json');
        const call: AdminCall = { method: req.method ?? 'GET', path: u.pathname, query: Object.fromEntries(u.searchParams), body: buf.length ? (isJson ? JSON.parse(buf.toString('utf8')) : buf) : undefined, headers: req.headers };
        f.admin.calls.push(call);
        const r = routes.find((x) => x.method === call.method && x.re.test(call.path));
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (!r) return send(404, { success: false, error: { code: 'NOT_FOUND', message: 'fake: no route' } });
        const m = r.re.exec(call.path)!;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
        const out = r.h(call, params) as { __reply?: boolean; status?: number; body?: unknown; delayMs?: number } | unknown;
        const rep = out as { __reply?: boolean; status?: number; body?: unknown; delayMs?: number };
        if (rep && (rep as { __raw?: boolean }).__raw) {
          const rr = rep as unknown as { status: number; headers: Record<string, string>; body: Buffer };
          res.writeHead(rr.status, rr.headers);
          return res.end(rr.body);
        }
        if (rep && rep.__reply) {
          if (rep.delayMs) await new Promise((x) => setTimeout(x, rep.delayMs));
          return send(rep.status ?? 200, rep.body);
        }
        return send(200, { success: true, data: out ?? {} });
      });
      return;
    }
    if (req.url === '/jwks') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ keys: [jwk] }));
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.url === '/o/internal/v1/stats/sessions' || req.url === '/internal/v1/stats/sessions') {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = f.status === 202 ? 200 : f.status;
        return res.end(JSON.stringify({ success: true, data: { draft: 1, scheduled: 2, started: 3, ended: 4 } }));
      }
      f.events.push({ url: req.url ?? '', headers: req.headers, body: raw ? JSON.parse(raw) : undefined });
      res.statusCode = f.status;
      res.end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  f.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  f.jwksUrl = `${f.url}/jwks`;
  return f;
}

export function testEnv(over: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1',
    DB_PORT: process.env.TEST_DB_PORT ?? '3306',
    DB_USER: process.env.TEST_DB_USER ?? 'isra_high',
    DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? 'isra_high_dev',
    DB_NAME: process.env.TEST_DB_NAME ?? 'schema_high_test',
    DB_MIGRATIONS_RUN: 'true',
    CORS_ORIGINS: 'http://localhost:5174',
    TRUST_PROXY: '1',
    LOW_JWKS_URL: 'http://127.0.0.1:1/jwks',
    INTERNAL_SECRET_LOW: 'test-pair-low-high-0123456789abcdef0',
    INTERNAL_SECRET_MID: 'test-pair-mid-high-0123456789abcdef0',
    OUTBOX_ENABLED: 'false',
    MAINTENANCE_ENABLED: 'false',
    ...over
  });
}

export interface TestApp {
  app: NestExpressApplication;
  http: Server;
  clock: TestClock;
  ds: DataSource;
  env: Env;
  fake: FakeLow;
  /** کش RBAC حافظه را باطل می‌کند (پس از دست‌کاری مستقیم DB در تست) */
  flush: () => void;
  close: () => Promise<void>;
}

export async function startApp(over: Record<string, string> = {}): Promise<TestApp> {
  const clock = new TestClock();
  const fake = await startFake(clock);
  const env = testEnv({ LOW_JWKS_URL: fake.jwksUrl, INTERNAL_URL_LOW: `${fake.url}/c`, INTERNAL_URL_MID: `${fake.url}/o`, ...over });
  const app = await createApp(env, { clock, silent: true });
  await app.listen(0, '127.0.0.1');
  const ds = app.get(DataSource);
  await resetDb(ds, app);
  const rbac = app.get(RbacService);
  return { app, http: app.getHttpServer() as Server, clock, ds, env, fake, flush: () => rbac.invalidate(), close: async () => (await app.close(), await fake.close()) };
}

/** وضعیت اولیهٔ سیستم: جدول‌های دادهٔ کاربر خالی + ماتریس مجوز و تنظیمات به seed برمی‌گردد */
export async function resetDb(ds: DataSource, app?: NestExpressApplication) {
  await ds.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of TABLES) await ds.query(`TRUNCATE TABLE ${t}`);
  await ds.query('SET FOREIGN_KEY_CHECKS = 1');
  for (const t of ['role_permissions', 'role_modules', 'role_step_up', 'user_grants']) await ds.query(`DELETE FROM ${t}`);
  await ds.query('DELETE FROM system_roles WHERE undeletable = 0');
  await ds.query('DELETE FROM permissions WHERE is_system = 0');
  await ds.query('DELETE FROM system_modules WHERE is_system = 0');
  // seed ویرایش مالک را overwrite نمی‌کند (۱.۶.۰) ⇒ تست متادیتای سیستمی را صریحاً به پیش‌فرض برمی‌گرداند
  for (const p of SEED_PERMISSIONS) await ds.query('UPDATE permissions SET title = ?, description = ?, module_key = ?, grantable = ?, step_up = ? WHERE permission_key = ?', [p.title, p.description, p.module, p.grantable ? 1 : 0, p.stepUp, p.key]);
  for (const m of SEED_MODULES) await ds.query('UPDATE system_modules SET title = ?, description = ?, sort_order = ? WHERE module_key = ?', [m.title, m.description, m.sortOrder, m.key]);
  await seedRbac(ds, new Date(), { restoreDefaults: true });
  await resetBadges(ds);
  // baseline منتشرشده = وضعیت seed (هش درست) ⇒ نوشتن RBAC بی‌اثر روی guest/quran_student رویداد baseline نمی‌سازد
  await syncBaseline(ds, new Date(), true);
  await ds.query('UPDATE rbac_meta SET version = 1, baseline_version = 1');
  await ds.query('DELETE FROM outbox_events');
  // معیارهای ارزیابی ⇒ seed مهاجرت (سه معیار، نسخهٔ ۱)
  await ds.query('DELETE FROM evaluation_criteria');
  for (const c of SEED_CRITERIA)
    await ds.query("INSERT INTO evaluation_criteria (id, criterion_key, title, description, weight, max_score, active, sort_order, used, created_at, updated_at) VALUES (UNHEX(?), ?, ?, '', ?, 10, 1, ?, 1, NOW(3), NOW(3))", [c.id.replace(/-/g, ''), c.key, c.title, { voice: 40, tone: 30, tajweed: 30 }[c.weightKey], c.sortOrder]);
  await ds.query('UPDATE criteria_meta SET version = 1');
  await ds.query("UPDATE system_jobs SET status = 'pending', cursor_page = 1, attempts = 0, lease_until = NULL, meta = NULL, done_at = NULL WHERE job_key = ?", [TEACHER_BACKFILL_JOB]);
  // نقش‌های حذف‌شدهٔ پویا ردی در user_system_roles ندارند (جدول بالا truncate شده)
  app?.get(RbacService).invalidate();
  await ds.query("UPDATE system_settings SET version = 1, flags = ?, updated_by = 'سیستم' WHERE setting_key = 'global'", [JSON.stringify(DEFAULT_FLAGS)]);
}

export interface User {
  id: string;
  sid: string;
  phone: string;
  name: string;
  token: string;
  h: Record<string, string>;
  /** step-up معتبر برای همین کاربر/نشست */
  step: () => Promise<Record<string, string>>;
}

let ipN = 10;
let phoneN = 5000;
const freshIp = () => `10.${(ipN >> 8) & 255}.${ipN++ & 255}.9`;
export const freshPhone = () => `0913${String(1_000_000 + phoneN++).slice(-7)}`;
const hex = (id: string) => id.replace(/-/g, '');

/** کاربر در دایرکتوری (مثل رویداد user.registered از low) با نقش‌های دلخواه (مستقیم در DB = وضعیت اولیهٔ سیستم) */
export async function mkUser(t: TestApp, name: string, roles: string[] = [], grants: string[] = [], opts: { mcp?: boolean; status?: string } = {}): Promise<User> {
  const id = uuidv7();
  const sid = randomUUID();
  const phone = freshPhone();
  const [first, ...rest] = name.split(' ');
  await t.ds.query('INSERT INTO user_directory (user_id, phone, first_name, last_name, status, perm_ver, created_at, updated_at) VALUES (UNHEX(?), ?, ?, ?, ?, 1, NOW(3), NOW(3))', [hex(id), phone, first ?? '', rest.join(' '), opts.status ?? 'active']);
  for (const r of roles) await t.ds.query('INSERT INTO user_system_roles (user_id, role_key, granted_by, granted_at) VALUES (UNHEX(?), ?, NULL, NOW(3))', [hex(id), r]);
  for (const g of grants) await t.ds.query('INSERT INTO user_grants (user_id, grant_key, granted_by, granted_at) VALUES (UNHEX(?), ?, NULL, NOW(3))', [hex(id), g]);
  t.flush();
  const token = await t.fake.sign({ sub: id, sid, mcp: opts.mcp });
  return {
    id,
    sid,
    phone,
    name,
    token,
    h: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': freshIp() },
    step: async () => ({ ...({ Authorization: `Bearer ${token}`, 'X-Forwarded-For': freshIp() } as Record<string, string>), 'X-Step-Up-Token': await t.fake.sign({ sub: id, sid, lvl: 'stepup' }) })
  };
}

export const api = (t: TestApp) => ({
  get: (path: string, h: Record<string, string> | User) => request(t.http).get(`/s/v1${path}`).set(typeof (h as User).id === 'string' ? (h as User).h : (h as Record<string, string>)),
  put: (path: string, h: Record<string, string>, body?: object) => request(t.http).put(`/s/v1${path}`).set(h).send(body ?? {}),
  post: (path: string, h: Record<string, string>, body?: object) => request(t.http).post(`/s/v1${path}`).set(h).send(body ?? {}),
  patch: (path: string, h: Record<string, string>, body?: object) => request(t.http).patch(`/s/v1${path}`).set(h).send(body ?? {}),
  del: (path: string, h: Record<string, string>) => request(t.http).delete(`/s/v1${path}`).set(h)
});

export const outboxTypes = async (t: TestApp) => ((await t.ds.query('SELECT type, payload FROM outbox_events ORDER BY created_at, id')) as { type: string; payload: unknown }[]).map((r) => ({ type: r.type, payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload as any) }));

/** نقش پویا مستقیم در DB (برای تست guard با کاربر غیر developer دارای مجوزهای مشخص) */
export async function mkRoleDb(t: TestApp, key: string, perms: string[]): Promise<void> {
  await t.ds.query("INSERT INTO system_roles (role_key, title, description, undeletable) VALUES (?, ?, '', 0)", [key, `نقش ${key}`]);
  for (const p of perms) await t.ds.query('INSERT INTO role_permissions (role_key, permission_key, locked) VALUES (?, ?, 0)', [key, p]);
  t.flush();
}

/** کاتالوگ نشان به وضعیت seed مهاجرت: ۴ نشان قدیمی بدون تصویر، نسخهٔ ۱ */
export async function resetBadges(ds: DataSource) {
  await ds.query('DELETE FROM badges');
  const seed: [string, string, number, number][] = [
    ['badge_50', 'قرآن‌آموز کوشا', 50, 10],
    ['badge_150', 'همراه پیگیر', 150, 20],
    ['badge_300', 'یار همیشگی جلسه', 300, 30],
    ['badge_500', 'ستارهٔ قرآنی', 500, 40]
  ];
  for (const [key, title, th, so] of seed)
    await ds.query('INSERT INTO badges (id, badge_key, title, description, threshold, active, sort_order, created_at, updated_at) VALUES (UNHEX(?), ?, ?, ?, ?, 1, ?, NOW(3), NOW(3))', [uuidv7().replace(/-/g, ''), key, title, `کسب دست‌کم ${th} امتیاز`, th, so]);
  await ds.query('UPDATE badge_catalog_meta SET version = 1');
}
