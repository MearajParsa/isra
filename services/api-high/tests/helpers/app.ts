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
import { DEFAULT_FLAGS, DEFAULT_ROLE_PERMS, DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS, LOCKED, ROLE_KEYS } from '../../src/domain/rules';

export class TestClock extends Clock {
  private t = Date.now();
  now() {
    return new Date(this.t);
  }
  advance(ms: number) {
    this.t += ms;
  }
}

const TABLES = ['user_directory', 'user_system_roles', 'user_grants', 'audit_logs', 'outbox_events', 'inbox_events', 'rate_limit_counters'];

/** low جعلی: JWKS + دریافت رویدادهای outbox (نقش api-low) */
export interface FakeLow {
  url: string;
  jwksUrl: string;
  privateKey: CryptoKey;
  sign: (c: { sub: string; sid?: string; lvl?: string; exp?: number; iss?: string; aud?: string }, key?: CryptoKey) => Promise<string>;
  events: { url: string; headers: Record<string, unknown>; body: any }[];
  status: number;
  close: () => Promise<void>;
}

export async function startFake(clock: Clock): Promise<FakeLow> {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-kid', use: 'sig', alg: 'RS256' };
  const f: FakeLow = {
    url: '',
    jwksUrl: '',
    privateKey,
    events: [],
    status: 202,
    sign: (c, key) => {
      const iat = Math.floor(clock.now().getTime() / 1000);
      return new SignJWT({ sid: c.sid ?? randomUUID(), lvl: c.lvl ?? 'low' })
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
  const server: Server = createServer((req, res) => {
    if (req.url === '/jwks') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ keys: [jwk] }));
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.url === '/internal/v1/stats/sessions') {
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
  close: () => Promise<void>;
}

export async function startApp(over: Record<string, string> = {}): Promise<TestApp> {
  const clock = new TestClock();
  const fake = await startFake(clock);
  const env = testEnv({ LOW_JWKS_URL: fake.jwksUrl, INTERNAL_URL_LOW: fake.url, INTERNAL_URL_MID: fake.url, ...over });
  const app = await createApp(env, { clock, silent: true });
  await app.listen(0, '127.0.0.1');
  const ds = app.get(DataSource);
  await resetDb(ds);
  return { app, http: app.getHttpServer() as Server, clock, ds, env, fake, close: async () => (await app.close(), await fake.close()) };
}

/** وضعیت اولیهٔ سیستم: جدول‌های دادهٔ کاربر خالی + ماتریس مجوز و تنظیمات به seed برمی‌گردد */
export async function resetDb(ds: DataSource) {
  await ds.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of TABLES) await ds.query(`TRUNCATE TABLE ${t}`);
  await ds.query('SET FOREIGN_KEY_CHECKS = 1');
  await ds.query('DELETE FROM role_permissions');
  for (const r of ROLE_KEYS) for (const p of DEFAULT_ROLE_PERMS[r]) await ds.query('INSERT INTO role_permissions (role_key, permission_key, locked) VALUES (?, ?, ?)', [r, p, LOCKED[r].includes(p) ? 1 : 0]);
  await ds.query("UPDATE system_settings SET version = 1, eval_weights = ?, badge_thresholds = ?, flags = ?, updated_by = 'سیستم' WHERE setting_key = 'global'", [JSON.stringify(DEFAULT_WEIGHTS), JSON.stringify(DEFAULT_THRESHOLDS), JSON.stringify(DEFAULT_FLAGS)]);
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
export async function mkUser(t: TestApp, name: string, roles: string[] = [], grants: string[] = []): Promise<User> {
  const id = uuidv7();
  const sid = randomUUID();
  const phone = freshPhone();
  const [first, ...rest] = name.split(' ');
  await t.ds.query('INSERT INTO user_directory (user_id, phone, first_name, last_name, perm_ver, created_at, updated_at) VALUES (UNHEX(?), ?, ?, ?, 1, NOW(3), NOW(3))', [hex(id), phone, first ?? '', rest.join(' ')]);
  for (const r of roles) await t.ds.query('INSERT INTO user_system_roles (user_id, role_key, granted_by, granted_at) VALUES (UNHEX(?), ?, NULL, NOW(3))', [hex(id), r]);
  for (const g of grants) await t.ds.query('INSERT INTO user_grants (user_id, grant_key, granted_by, granted_at) VALUES (UNHEX(?), ?, NULL, NOW(3))', [hex(id), g]);
  const token = await t.fake.sign({ sub: id, sid });
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
  put: (path: string, h: Record<string, string>, body?: object) => request(t.http).put(`/s/v1${path}`).set(h).send(body ?? {})
});

export const outboxTypes = async (t: TestApp) => ((await t.ds.query('SELECT type, payload FROM outbox_events ORDER BY created_at, id')) as { type: string; payload: unknown }[]).map((r) => ({ type: r.type, payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload as any) }));
