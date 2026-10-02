import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FarazSmsProvider } from '../src/sms/faraz.provider';
import { testEnv } from './helpers/app';

let server: Server;
let base: string;
const calls: { url: string; headers: IncomingMessage['headers']; body: Record<string, unknown> }[] = [];
let reply: { status: number; json: unknown } = { status: 200, json: { status: 'success' } };

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      calls.push({ url: req.url ?? '', headers: req.headers, body: JSON.parse(raw || '{}') });
      res.statusCode = reply.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(reply.json));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const mk = (over: Record<string, string> = {}) =>
  new FarazSmsProvider(testEnv({ SMS_PROVIDER: 'faraz', FARAZ_BASE_URL: base, FARAZ_API_KEY: 'test-key', FARAZ_SENDER: '90008361', FARAZ_PATTERN_CODE: 'PAT123', ...over }));

describe('FarazSmsProvider (طبق docs.iranpayamak.com)', () => {
  it('درخواست دقیقاً مطابق مستندات: مسیر، هدر Api-Key، بدنه، بدون schedule', async () => {
    reply = { status: 200, json: { status: 'success' } };
    calls.length = 0;
    await mk().sendOtp({ phone: '09121234567', code: '12345' });
    const c = calls[0]!;
    expect(c.url).toBe('/ws/v1/sms/pattern');
    expect(c.headers['api-key']).toBe('test-key');
    expect(c.headers.authorization).toBeUndefined();
    expect(c.body).toEqual({ code: 'PAT123', attributes: { code: '12345' }, recipient: '09121234567', line_number: '90008361', number_format: 'english' });
    expect(c.body).not.toHaveProperty('schedule');
  });

  it('نام متغیر الگو قابل تنظیم است (FARAZ_CODE_VAR)', async () => {
    calls.length = 0;
    await mk({ FARAZ_CODE_VAR: 'otp' }).sendOtp({ phone: '09121234567', code: '54321' });
    expect(calls[0]!.body.attributes).toEqual({ otp: '54321' });
  });

  it.each([
    [401, { status: 'error' }],
    [429, {}],
    [500, {}],
    [200, { status: 'failed' }]
  ])('HTTP %s / %j ⇒ خطا (AUTH_OTP_SEND_FAILED در لایهٔ بالا)', async (status, json) => {
    reply = { status, json };
    await expect(mk().sendOtp({ phone: '09121234567', code: '12345' })).rejects.toThrow();
  });

  it('timeout ⇒ خطا', async () => {
    const slow = createServer(() => undefined);
    await new Promise<void>((r) => slow.listen(0, '127.0.0.1', () => r()));
    const url = `http://127.0.0.1:${(slow.address() as AddressInfo).port}`;
    await expect(mk({ FARAZ_BASE_URL: url, SMS_TIMEOUT_MS: '300' }).sendOtp({ phone: '09121234567', code: '12345' })).rejects.toThrow();
    slow.closeAllConnections();
    await new Promise<void>((r) => slow.close(() => r()));
  });
});
