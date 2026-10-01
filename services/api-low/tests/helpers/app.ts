import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createApp } from '../../src/bootstrap';
import { Clock } from '../../src/common/clock';
import { type Env, loadEnv } from '../../src/config/env';
import { CapturingSmsProvider } from '../../src/sms/capturing.provider';
import { SmsProvider } from '../../src/sms/sms.provider';

export class TestClock extends Clock {
  private t = Date.now();
  now(): Date {
    return new Date(this.t);
  }
  advance(ms: number) {
    this.t += ms;
  }
}

const TABLES = ['users', 'user_credentials', 'profiles', 'user_claims', 'otp_challenges', 'auth_sessions', 'refresh_tokens', 'step_up_tokens', 'rate_limit_counters', 'inbox_messages', 'outbox_events', 'inbox_events'];

export function testEnv(over: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1',
    DB_PORT: process.env.TEST_DB_PORT ?? '3306',
    DB_USER: process.env.TEST_DB_USER ?? 'isra_low',
    DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? 'isra_low_dev',
    DB_NAME: process.env.TEST_DB_NAME ?? 'schema_low_test',
    DB_MIGRATIONS_RUN: 'true',
    CORS_ORIGINS: 'http://localhost:5173,http://localhost:5174',
    TRUST_PROXY: '1',
    OTP_PEPPER: 'test-otp-pepper-test-otp-pepper-1234',
    INTERNAL_SHARED_SECRET: 'test-internal-secret-test-internal-1234',
    SMS_PROVIDER: 'capture',
    ARGON2_MEMORY_KIB: '8',
    ARGON2_TIME: '1',
    OUTBOX_ENABLED: 'false',
    MAINTENANCE_ENABLED: 'false',
    ...over
  });
}

export interface TestApp {
  app: NestExpressApplication;
  http: Server;
  sms: CapturingSmsProvider;
  clock: TestClock;
  ds: DataSource;
  env: Env;
  close: () => Promise<void>;
}

export async function startApp(over: Record<string, string> = {}): Promise<TestApp> {
  const env = testEnv(over);
  const clock = new TestClock();
  const app = await createApp(env, { clock, silent: true });
  await app.listen(0, '127.0.0.1'); // supertest به سرور شنوا وصل می‌شود (بدون listener اضافی)
  const ds = app.get(DataSource);
  await resetDb(ds);
  return { app, http: app.getHttpServer() as Server, sms: app.get(SmsProvider) as CapturingSmsProvider, clock, ds, env, close: () => app.close() };
}

export async function resetDb(ds: DataSource) {
  await ds.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of TABLES) await ds.query(`TRUNCATE TABLE ${t}`);
  await ds.query('SET FOREIGN_KEY_CHECKS = 1');
}

let ipCounter = 10;
/** IP یکتا per فراخوانی (rate-limit بین تست‌ها نشت نکند) */
export const freshIp = () => `10.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}.7`;
let phoneCounter = 1000;
export const freshPhone = () => `0912${String(1_000_000 + phoneCounter++).slice(-7)}`;

export const WEB_MAIN = { 'X-Isra-Client': 'web-main', Origin: 'http://localhost:5173' } as const;
export const WEB_ADMIN = { 'X-Isra-Client': 'web-admin', Origin: 'http://localhost:5174' } as const;
export const ANDROID = { 'X-Isra-Client': 'android-low' } as const;

export interface Login {
  accessToken: string;
  refreshToken?: string;
  cookie?: string;
  sessionId: string;
  userId: string;
  phone: string;
  deviceId: string;
  headers: Record<string, string>;
  ip: string;
}

/** ورود کامل با OTP (و دستگاه جدید) */
export async function loginOtp(t: TestApp, opts: { phone?: string; client?: Record<string, string>; deviceId?: string; ip?: string } = {}): Promise<Login> {
  const phone = opts.phone ?? freshPhone();
  const ip = opts.ip ?? freshIp();
  const client = opts.client ?? ANDROID;
  const deviceId = opts.deviceId ?? randomUUID();
  const rq = await request(t.http).post('/c/v1/auth/otp/request').set(client).set('X-Forwarded-For', ip).send({ phone });
  if (rq.status !== 200) throw new Error(`otp request failed ${rq.status} ${JSON.stringify(rq.body)}`);
  const code = t.sms.lastCode(phone)!;
  const vr = await request(t.http)
    .post('/c/v1/auth/otp/verify')
    .set(client)
    .set('X-Forwarded-For', ip)
    .send({ challengeId: rq.body.data.challengeId, code, deviceId, deviceLabel: 'Test device' });
  if (vr.status !== 200) throw new Error(`otp verify failed ${vr.status} ${JSON.stringify(vr.body)}`);
  const setCookie = ([] as string[]).concat((vr.headers['set-cookie'] as unknown as string[] | undefined) ?? []);
  const cookie = setCookie.find((c) => c.startsWith('isra_rt'))?.split(';')[0];
  return {
    accessToken: vr.body.data.accessToken,
    refreshToken: vr.body.data.refreshToken,
    cookie,
    sessionId: vr.body.data.sessionId,
    userId: vr.body.data.user.id,
    phone,
    deviceId,
    headers: { ...client, Authorization: `Bearer ${vr.body.data.accessToken}`, 'X-Forwarded-For': ip },
    ip
  };
}
