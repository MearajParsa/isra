import { randomUUID } from 'node:crypto';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createApp, startApp as listen } from '../../src/bootstrap';
import { Clock } from '../../src/common/clock';
import { uuidv7 } from '../../src/common/ids';
import { type Env, loadEnv } from '../../src/config/env';
import { LiveService } from '../../src/live/live.service';

export class TestClock extends Clock {
  private t = Date.now();
  now() {
    return new Date(this.t);
  }
  advance(ms: number) {
    this.t += ms;
  }
}

const TABLES = ['sessions', 'session_members', 'session_member_roles', 'attendance_entries', 'queue_items', 'evaluations', 'point_ledger', 'user_points', 'badge_awards', 'settings_cache', 'user_directory', 'idempotency_keys', 'rate_limit_counters', 'outbox_events', 'inbox_events'];

/** سرور JWKS جعلی (نقش api-low) + امضای توکن */
export interface FakeLow {
  url: string;
  jwksUrl: string;
  kid: string;
  privateKey: CryptoKey;
  sign: (claims: { sub: string; roles?: string[]; perms?: string[]; exp?: number; iss?: string; aud?: string; lvl?: string; mcp?: boolean }, key?: CryptoKey) => Promise<string>;
  down: boolean;
  events: { url: string; headers: Record<string, unknown>; body: any }[];
  eventStatus: number;
  close: () => Promise<void>;
}

export async function startFakeLow(clock: Clock): Promise<FakeLow> {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-kid', use: 'sig', alg: 'RS256' };
  const fake: FakeLow = {
    url: '',
    jwksUrl: '',
    kid: 'test-kid',
    privateKey,
    down: false,
    events: [],
    eventStatus: 202,
    sign: (c, key) => {
      const iat = Math.floor(clock.now().getTime() / 1000);
      return new SignJWT({ sid: randomUUID(), lvl: c.lvl ?? 'low', roles: c.roles ?? [], perms: c.perms ?? [], pv: 1, ...(c.mcp === undefined ? {} : { mcp: c.mcp }) })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-kid', typ: 'JWT' })
        .setSubject(c.sub)
        .setIssuer(c.iss ?? 'isra-low')
        .setAudience(c.aud ?? 'isra')
        .setIssuedAt(iat)
        .setExpirationTime(c.exp ?? iat + 900)
        .sign(key ?? privateKey);
    },
    close: () => new Promise((r) => server.close(() => r()))
  };
  const server: Server = createServer((req, res) => {
    if (req.url === '/jwks') {
      if (fake.down) {
        res.statusCode = 500;
        return res.end();
      }
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ keys: [jwk] }));
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      fake.events.push({ url: req.url ?? '', headers: req.headers, body: raw ? JSON.parse(raw) : undefined });
      res.statusCode = fake.eventStatus;
      res.end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.jwksUrl = `${fake.url}/jwks`;
  return fake;
}

export function testEnv(over: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1',
    DB_PORT: process.env.TEST_DB_PORT ?? '3306',
    DB_USER: process.env.TEST_DB_USER ?? 'isra_mid',
    DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? 'isra_mid_dev',
    DB_NAME: process.env.TEST_DB_NAME ?? 'schema_mid_test',
    DB_MIGRATIONS_RUN: 'true',
    CORS_ORIGINS: 'http://localhost:5173',
    TRUST_PROXY: '1',
    LOW_JWKS_URL: 'http://127.0.0.1:1/jwks',
    INTERNAL_SECRET_LOW: 'test-pair-low-mid-0123456789abcdef01',
    INTERNAL_SECRET_HIGH: 'test-pair-mid-high-0123456789abcdef0',
    OUTBOX_ENABLED: 'false',
    MAINTENANCE_ENABLED: 'false',
    SOCKET_ENABLED: 'false',
    ...over
  });
}

export interface TestApp {
  app: NestExpressApplication;
  http: Server;
  port: number;
  clock: TestClock;
  ds: DataSource;
  env: Env;
  low: FakeLow;
  live: LiveService;
  close: () => Promise<void>;
}

export async function startApp(over: Record<string, string> = {}): Promise<TestApp> {
  const clock = new TestClock();
  const low = await startFakeLow(clock);
  const env = testEnv({ LOW_JWKS_URL: low.jwksUrl, INTERNAL_URL_LOW: low.url, ...over });
  const app = await createApp(env, { clock, silent: true });
  await listen(app, env, 0);
  const ds = app.get(DataSource);
  await resetDb(ds);
  const http = app.getHttpServer() as Server;
  return {
    app,
    http,
    port: (http.address() as AddressInfo).port,
    clock,
    ds,
    env,
    low,
    live: app.get(LiveService),
    close: async () => {
      await app.close();
      await low.close();
    }
  };
}

export async function resetDb(ds: DataSource) {
  await ds.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of TABLES) await ds.query(`TRUNCATE TABLE ${t}`);
  await ds.query('SET FOREIGN_KEY_CHECKS = 1');
}

export interface User {
  id: string;
  token: string;
  h: Record<string, string>;
  name: string;
}

let ipN = 10;
const freshIp = () => `10.${(ipN >> 8) & 255}.${ipN++ & 255}.9`;

/** کاربر آزمایشی با JWT معتبر (و نام در user_directory) */
export async function mkUser(t: TestApp, name: string, extra: { roles?: string[]; perms?: string[] } = {}): Promise<User> {
  const id = uuidv7();
  const token = await t.low.sign({ sub: id, ...extra });
  const [first, ...rest] = name.split(' ');
  await t.ds.query('INSERT INTO user_directory (user_id, first_name, last_name, updated_at) VALUES (UNHEX(REPLACE(?, "-", "")), ?, ?, NOW(3))', [id, first ?? '', rest.join(' ')]);
  return { id, token, name, h: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': freshIp() } };
}

export const creator = (t: TestApp, name = 'مدیر نمونه') => mkUser(t, name, { perms: ['session.create'] });

export const sessionBody = (over: Record<string, unknown> = {}) => ({
  title: 'جلسهٔ آزمایشی قرآن',
  description: 'توضیحات جلسهٔ آزمایشی برای تست سرویس',
  schedule: { type: 'once', startsAt: '2030-01-04T18:00:00+03:30', endsAt: '2030-01-04T20:00:00+03:30' },
  location: { label: 'مسجد نمونه' },
  ...over
});

export const api = (t: TestApp) => ({
  get: (path: string, u: User) => request(t.http).get(`/o/v1${path}`).set(u.h),
  post: (path: string, u: User, body?: object) => request(t.http).post(`/o/v1${path}`).set(u.h).send(body ?? {}),
  patch: (path: string, u: User, body?: object) => request(t.http).patch(`/o/v1${path}`).set(u.h).send(body ?? {}),
  put: (path: string, u: User, body?: object) => request(t.http).put(`/o/v1${path}`).set(u.h).send(body ?? {}),
  del: (path: string, u: User) => request(t.http).delete(`/o/v1${path}`).set(u.h)
});

/** جلسه با مدیر، به وضعیت دلخواه برده می‌شود */
export async function mkSession(t: TestApp, manager: User, status: 'draft' | 'scheduled' | 'started' | 'ended' = 'started'): Promise<string> {
  const a = api(t);
  const r = await a.post('/sessions', manager, sessionBody());
  if (r.status !== 200) throw new Error(`create failed ${r.status} ${JSON.stringify(r.body)}`);
  const id = r.body.data.id as string;
  for (const to of ['scheduled', 'started', 'ended'] as const) {
    if (status === 'draft' || (to === 'started' && status === 'scheduled') || (to === 'ended' && status !== 'ended')) break;
    const tr = await a.post(`/sessions/${id}/transition`, manager, { to });
    if (tr.status !== 200) throw new Error(`transition ${to} failed ${tr.status}`);
    if (to === status) break;
  }
  return id;
}

/** کاربر عضو تأییدشدهٔ جلسه با نقش‌های داده‌شده (توسط مدیر) */
export async function join(t: TestApp, sessionId: string, manager: User, user: User, roles: string[] = []): Promise<string> {
  const a = api(t);
  const r = await a.post(`/sessions/${sessionId}/members`, user);
  if (r.status !== 200) throw new Error(`member request failed ${r.status} ${JSON.stringify(r.body)}`);
  const memberId = r.body.data.id as string;
  const d = await a.patch(`/sessions/${sessionId}/members/${memberId}`, manager, { action: 'approve' });
  if (d.status !== 200) throw new Error(`approve failed ${d.status}`);
  if (roles.length) {
    const s = await a.put(`/sessions/${sessionId}/members/${memberId}/roles`, manager, { roles });
    if (s.status !== 200) throw new Error(`roles failed ${s.status}`);
  }
  return memberId;
}
