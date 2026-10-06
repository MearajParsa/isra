import { randomUUID } from 'node:crypto';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { uuidToBuf, uuidv7 } from '../src/common/ids';
import { bucketStart } from '../src/internal/admin.service';
import { ANDROID, type Login, type TestApp, WEB_ADMIN, freshIp, freshPhone, loginOtp, resetDb, startApp } from './helpers/app';

const HIGH = 'test-pair-low-high-0123456789abcdef0';
const MID = 'test-pair-low-mid-0123456789abcdef01';
let t: TestApp;

beforeAll(async () => {
  t = await startApp();
});
afterAll(() => t.close());
beforeEach(() => resetDb(t.ds));

type M = 'get' | 'post' | 'put' | 'patch' | 'delete';
const call = (m: M, path: string, caller: 'high' | 'mid' = 'high', token: string | null = caller === 'high' ? HIGH : MID) => {
  let r = (request(t.http) as unknown as Record<M, (u: string) => request.Test>)[m](`/c/internal/v1${path}`).set('X-Internal-Caller', caller).set('X-Forwarded-For', freshIp());
  if (token) r = r.set('X-Internal-Token', token);
  return r;
};
const adm = (m: M, path: string, body?: object) => {
  const r = call(m, path);
  return body ? r.send(body) : r;
};

const outbox = async (type: string): Promise<Record<string, any>[]> => {
  const rows = (await t.ds.query('SELECT payload FROM outbox_events WHERE type = ? ORDER BY created_at, id', [type])) as { payload: unknown }[];
  return rows.map((r) => (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload) as Record<string, any>);
};
const clearOutbox = () => t.ds.query('TRUNCATE TABLE outbox_events');

const mkUser = async (extra: Record<string, unknown> = {}) => {
  const phone = freshPhone();
  const r = await adm('post', '/admin/users', { phone, firstName: 'علی', lastName: 'رضایی', ...extra });
  expect(r.status).toBe(201);
  return { phone, id: r.body.data.id as string, body: r.body };
};

const post = (path: string, client: Record<string, string> = ANDROID, ip = freshIp()) => request(t.http).post(`/c/v1${path}`).set(client).set('X-Forwarded-For', ip);
const pwLogin = (phone: string, password: string, deviceId = randomUUID()) => post('/auth/login/password').send({ phone, password, deviceId, deviceLabel: 'pw' });

describe('ACL و احراز internal admin', () => {
  const routes: [M, string, object?][] = [
    ['post', '/admin/users', { phone: '09120000001', firstName: 'علی', lastName: 'رضایی' }],
    ['get', `/admin/users/${randomUUID()}`],
    ['patch', `/admin/users/${randomUUID()}`, { firstName: 'سارا' }],
    ['delete', `/admin/users/${randomUUID()}`],
    ['post', `/admin/users/${randomUUID()}/status`, { status: 'disabled' }],
    ['put', `/admin/users/${randomUUID()}/password`, { action: 'clear' }],
    ['post', `/admin/users/${randomUUID()}/change-password`, { newPassword: 'abcdefgh1', verified: 'stepup' }],
    ['get', `/admin/users/${randomUUID()}/sessions`],
    ['delete', `/admin/users/${randomUUID()}/sessions/${randomUUID()}`],
    ['post', `/admin/users/${randomUUID()}/logout-all`],
    ['get', '/admin/reports/otp?from=2026-09-01&to=2026-09-02'],
    ['get', '/admin/reports/clients'],
    ['get', '/admin/reports/users?from=2026-09-01&to=2026-09-02']
  ];

  it('فرستندهٔ mid (با secret درست خودش) ⇒ 403 روی همهٔ مسیرها', async () => {
    for (const [m, p, b] of routes) {
      const r = b ? call(m, p, 'mid').send(b) : call(m, p, 'mid');
      expect((await r).status, `${m} ${p}`).toBe(403);
    }
  });

  it('بدون توکن / توکن غلط / secret جفت دیگر برای high ⇒ 401', async () => {
    for (const [m, p, b] of routes) {
      for (const tok of [null, 'wrong'.repeat(10), MID]) {
        const r = b ? call(m, p, 'high', tok).send(b) : call(m, p, 'high', tok);
        expect((await r).status, `${m} ${p}`).toBe(401);
      }
    }
  });
});

describe('ساخت کاربر', () => {
  it('بدون رمز: 201، پروفایل، رویداد user.registered با createdAt و نام‌ها', async () => {
    const { phone, id, body } = await mkUser();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id, phone, firstName: 'علی', lastName: 'رضایی', status: 'active', hasPassword: false, mustChangePassword: false, activeSessions: 0, sessionsByClient: {}, lastActiveAt: null });
    const ev = await outbox('user.registered');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ userId: id, phone, firstName: 'علی', lastName: 'رضایی' });
    expect(ev[0]!.createdAt).toBe(body.data.createdAt);
    const prof = (await t.ds.query('SELECT first_name FROM profiles WHERE user_id = ?', [uuidToBuf(id)])) as { first_name: string }[];
    expect(prof[0]!.first_name).toBe('علی');
  });

  it('با رمز ⇒ mustChangePassword و hasPassword؛ رمز در پاسخ/outbox نیست', async () => {
    const { id, body } = await mkUser({ password: 'temp-pass-123' });
    expect(body.data).toMatchObject({ hasPassword: true, mustChangePassword: true });
    expect(JSON.stringify(body)).not.toContain('temp-pass-123');
    expect(JSON.stringify(await outbox('user.registered'))).not.toContain('temp-pass-123');
    const [c] = (await t.ds.query('SELECT password_hash FROM user_credentials WHERE user_id = ?', [uuidToBuf(id)])) as { password_hash: string }[];
    expect(c!.password_hash.startsWith('$argon2id$')).toBe(true);
  });

  it('شمارهٔ تکراری ⇒ 409 CONFLICT reason=PHONE_TAKEN', async () => {
    const { phone } = await mkUser();
    const r = await adm('post', '/admin/users', { phone, firstName: 'علی', lastName: 'رضایی' });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'CONFLICT', details: { reason: 'PHONE_TAKEN' } });
    expect(await outbox('user.registered')).toHaveLength(1);
  });

  it('اعتبارسنجی: شمارهٔ بد، فیلد اضافه، رمز کوتاه، نام کوتاه ⇒ 400', async () => {
    const ok = { phone: freshPhone(), firstName: 'علی', lastName: 'رضایی' };
    for (const bad of [{ ...ok, phone: '123' }, { ...ok, extra: 1 }, { ...ok, password: 'short' }, { ...ok, firstName: 'ع' }, {}]) {
      const r = await adm('post', '/admin/users', bad);
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_FAILED');
    }
  });
});

describe('کاربر: خواندن و ویرایش', () => {
  it('کاربر ناشناس/شناسهٔ نامعتبر ⇒ 404', async () => {
    expect((await adm('get', `/admin/users/${randomUUID()}`)).status).toBe(404);
    expect((await adm('get', '/admin/users/not-a-uuid')).body.error.code).toBe('NOT_FOUND');
  });

  it('lastActiveAt، activeSessions و sessionsByClient (client null ⇒ unknown)', async () => {
    const l = await loginOtp(t);
    await loginOtp(t, { phone: l.phone, client: WEB_ADMIN, ip: freshIp() }).catch(() => null);
    // نشست بدون client_id و یک نشست revoke‌شده (در شمارش نمی‌آید)
    const now = new Date();
    for (const [rev, client] of [[null, null], [now, 'web-main']] as const)
      await t.ds.query(
        'INSERT INTO auth_sessions (id, user_id, device_id, device_label, platform, client_id, ip, created_at, last_active_at, revoked_at, perm_ver) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
        [uuidToBuf(uuidv7()), uuidToBuf(l.userId), randomUUID(), 'x', 'web', client, '1.1.1.1', now, new Date(now.getTime() + 60_000), rev]
      );
    const r = await adm('get', `/admin/users/${l.userId}`);
    expect(r.status).toBe(200);
    expect(r.body.data.sessionsByClient['android-low']).toBe(1);
    expect(r.body.data.sessionsByClient.unknown).toBe(1);
    expect(r.body.data.sessionsByClient['web-main']).toBeUndefined();
    const total = Object.values(r.body.data.sessionsByClient as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(r.body.data.activeSessions).toBe(total);
    expect(new Date(r.body.data.lastActiveAt).getTime()).toBe(now.getTime() + 60_000);
  });

  it('PATCH نام ⇒ user.profile.updated؛ شماره ⇒ user.phone.changed؛ بدون تغییر شماره ⇒ بدون رویداد', async () => {
    const { id, phone } = await mkUser();
    await clearOutbox();
    const r = await adm('patch', `/admin/users/${id}`, { firstName: 'سارا' });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ firstName: 'سارا', lastName: 'رضایی' });
    expect(await outbox('user.profile.updated')).toEqual([{ userId: id, firstName: 'سارا' }]);
    expect(await outbox('user.phone.changed')).toHaveLength(0);

    const np = freshPhone();
    const r2 = await adm('patch', `/admin/users/${id}`, { phone: np, lastName: 'کریمی' });
    expect(r2.body.data).toMatchObject({ phone: np, lastName: 'کریمی' });
    const pc = await outbox('user.phone.changed');
    expect(pc).toHaveLength(1);
    expect(pc[0]).toMatchObject({ userId: id, phone: np });
    expect(typeof pc[0]!.changedAt).toBe('string');

    await clearOutbox();
    await adm('patch', `/admin/users/${id}`, { phone: np });
    expect(await outbox('user.phone.changed')).toHaveLength(0);
    void phone;
  });

  it('PATCH شمارهٔ تکراری ⇒ 409 PHONE_TAKEN؛ بدنهٔ خالی/ناشناخته ⇒ 400؛ کاربر ناشناس ⇒ 404', async () => {
    const a = await mkUser();
    const b = await mkUser();
    const r = await adm('patch', `/admin/users/${a.id}`, { phone: b.phone });
    expect(r.status).toBe(409);
    expect(r.body.error.details.reason).toBe('PHONE_TAKEN');
    expect((await adm('patch', `/admin/users/${a.id}`, {})).status).toBe(400);
    expect((await adm('patch', `/admin/users/${a.id}`, { status: 'x' })).status).toBe(400);
    expect((await adm('patch', `/admin/users/${randomUUID()}`, { firstName: 'سارا' })).status).toBe(404);
  });
});

describe('وضعیت کاربر', () => {
  it('disabled ⇒ نشست‌ها revoke + session.revoked + user.status.changed؛ همهٔ مسیرهای ورود/refresh/guard رد', async () => {
    const l = await loginOtp(t);
    await post('/auth/login/password').send({ phone: l.phone, password: 'x'.repeat(8), deviceId: randomUUID(), deviceLabel: 'x' }); // بی‌اثر
    await clearOutbox();
    expect((await request(t.http).get('/c/v1/me').set(l.headers)).status).toBe(200); // cache گرم
    const r = await adm('post', `/admin/users/${l.userId}/status`, { status: 'disabled' });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('disabled');
    expect(r.body.data.activeSessions).toBe(0);
    const rev = await outbox('session.revoked');
    expect(rev.flatMap((e) => e.sessionIds as string[])).toContain(l.sessionId);
    const sc = await outbox('user.status.changed');
    expect(sc).toHaveLength(1);
    expect(sc[0]).toMatchObject({ userId: l.userId, status: 'disabled' });
    expect(sc[0]).not.toHaveProperty('anonymizedPhone');

    // guard: access هنوز معتبر ولی حساب غیرفعال (cache فوراً invalidate شده)
    const me = await request(t.http).get('/c/v1/me').set(l.headers);
    expect(me.status).toBe(403);
    expect(me.body.error.code).toBe('AUTH_ACCOUNT_DISABLED');
    // refresh
    const rf = await post('/auth/refresh').send({ refreshToken: l.refreshToken });
    expect(rf.status).toBe(403);
    expect(rf.body.error.code).toBe('AUTH_ACCOUNT_DISABLED');
    // OTP login
    const rq = await post('/auth/otp/request').send({ phone: l.phone });
    const vr = await post('/auth/otp/verify').send({ challengeId: rq.body.data.challengeId, code: t.sms.lastCode(l.phone)!, deviceId: randomUUID(), deviceLabel: 'x' });
    expect(vr.status).toBe(403);
    expect(vr.body.error.code).toBe('AUTH_ACCOUNT_DISABLED');
  });

  it('ورود با رمز برای disabled ⇒ 403 فقط با رمز درست؛ رمز غلط ⇒ 401', async () => {
    const { id, phone } = await mkUser({ password: 'temp-pass-123' });
    await adm('post', `/admin/users/${id}/status`, { status: 'disabled' });
    const ok = await pwLogin(phone, 'temp-pass-123');
    expect(ok.status).toBe(403);
    expect(ok.body.error.code).toBe('AUTH_ACCOUNT_DISABLED');
    expect((await pwLogin(phone, 'wrong-password-1')).body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('فعال‌سازی مجدد ⇒ ورود دوباره؛ تکرار همان وضعیت idempotent و بدون رویداد', async () => {
    const l = await loginOtp(t);
    await adm('post', `/admin/users/${l.userId}/status`, { status: 'disabled' });
    await clearOutbox();
    const r = await adm('post', `/admin/users/${l.userId}/status`, { status: 'active' });
    expect(r.body.data.status).toBe('active');
    expect((await outbox('user.status.changed'))[0]).toMatchObject({ status: 'active' });
    await clearOutbox();
    await adm('post', `/admin/users/${l.userId}/status`, { status: 'active' });
    expect(await outbox('user.status.changed')).toHaveLength(0);
    await loginOtp(t, { phone: l.phone });
  });

  it('اعتبارسنجی: status=deleted در این مسیر ⇒ 400؛ ناشناس ⇒ 404', async () => {
    const { id } = await mkUser();
    expect((await adm('post', `/admin/users/${id}/status`, { status: 'deleted' })).status).toBe(400);
    expect((await adm('post', `/admin/users/${randomUUID()}/status`, { status: 'disabled' })).status).toBe(404);
  });
});

describe('حذف نرم و ناشناس‌سازی', () => {
  it('ناشناس‌سازی کامل، رویداد، بسته‌شدن ورود، idempotent، ثبت‌نام مجدد = کاربر جدید', async () => {
    const l = await loginOtp(t);
    await adm('put', `/admin/users/${l.userId}/password`, { action: 'set', password: 'temp-pass-123' });
    const l2 = await loginOtp(t, { phone: l.phone });
    const uid = uuidToBuf(l.userId);
    await adm('patch', `/admin/users/${l.userId}`, { firstName: 'علی', lastName: 'رضایی' });
    await t.ds.query('INSERT INTO inbox_messages (id, user_id, kind, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)', [uuidToBuf(uuidv7()), uid, 'membership', 't', 'b', new Date()]);
    await t.ds.query('INSERT INTO user_claims (user_id, system_roles, grants, perm_ver, updated_at) VALUES (?, ?, ?, 4, ?)', [uid, JSON.stringify(['developer']), JSON.stringify(['a.b']), new Date()]);
    await t.ds.query("INSERT INTO otp_challenges (id, phone, purpose, code_hmac, expires_at, ip, created_at) VALUES (?, ?, 'login', ?, ?, '1.1.1.1', ?)", [uuidToBuf(uuidv7()), l.phone, Buffer.alloc(32), new Date(Date.now() + 60_000), new Date()]);
    await clearOutbox();

    const r = await adm('delete', `/admin/users/${l.userId}`);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ id: l.userId, status: 'deleted', firstName: '', lastName: '', hasPassword: false, mustChangePassword: false, activeSessions: 0 });
    expect(r.body.data.phone).toMatch(/^d[0-9a-f]{10}$/);
    expect(r.body.data.phone).not.toBe(l.phone);

    expect(await t.ds.query('SELECT 1 FROM user_credentials WHERE user_id = ?', [uid])).toHaveLength(0);
    expect(await t.ds.query('SELECT 1 FROM inbox_messages WHERE user_id = ?', [uid])).toHaveLength(0);
    expect(await t.ds.query("SELECT 1 FROM otp_challenges WHERE phone = ? AND consumed_at IS NULL", [l.phone])).toHaveLength(0);
    expect(await t.ds.query('SELECT 1 FROM otp_challenges WHERE phone = ?', [l.phone])).toHaveLength(0); // شمارهٔ واقعی در OTPها نمانده
    const [cl] = (await t.ds.query('SELECT system_roles, grants, perm_ver FROM user_claims WHERE user_id = ?', [uid])) as { system_roles: unknown; grants: unknown; perm_ver: number }[];
    expect((typeof cl!.system_roles === 'string' ? JSON.parse(cl!.system_roles) : cl!.system_roles)).toEqual([]);
    expect((typeof cl!.grants === 'string' ? JSON.parse(cl!.grants) : cl!.grants)).toEqual([]);
    expect(cl!.perm_ver).toBe(5);
    expect(await t.ds.query('SELECT 1 FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL', [uid])).toHaveLength(0);

    const sc = await outbox('user.status.changed');
    expect(sc).toHaveLength(1);
    expect(sc[0]).toMatchObject({ userId: l.userId, status: 'deleted', anonymizedPhone: r.body.data.phone });
    const rev = (await outbox('session.revoked')).flatMap((e) => e.sessionIds as string[]);
    expect(rev).toEqual([l2.sessionId]); // نشست اول پیشتر با تعیین رمز revoke شده بود

    // ورود به حساب قدیمی ممکن نیست
    expect((await request(t.http).get('/c/v1/me').set(l.headers)).body.error.code).toBe('AUTH_ACCOUNT_DISABLED');
    expect((await post('/auth/refresh').send({ refreshToken: l.refreshToken })).body.error.code).toBe('AUTH_ACCOUNT_DISABLED');
    expect((await pwLogin(l.phone, 'temp-pass-123')).body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect((await pwLogin(r.body.data.phone, 'temp-pass-123')).status).toBe(400); // شمارهٔ ناشناس فرمت معتبر ندارد

    // idempotent: بدون رویداد تازه
    await clearOutbox();
    const again = await adm('delete', `/admin/users/${l.userId}`);
    expect(again.status).toBe(200);
    expect(again.body.data.phone).toBe(r.body.data.phone);
    expect(await outbox('user.status.changed')).toHaveLength(0);

    // ثبت‌نام مجدد با همان شماره ⇒ کاربر جدید
    const fresh = await loginOtp(t, { phone: l.phone });
    expect(fresh.userId).not.toBe(l.userId);
    expect((await request(t.http).get('/c/v1/me').set(fresh.headers)).status).toBe(200);
    expect((await adm('get', `/admin/users/${l.userId}`)).body.data.status).toBe('deleted');

    // کاربر حذف‌شده: ویرایش/وضعیت/رمز ⇒ 409 USER_NOT_ACTIVE
    for (const [m, p, b] of [
      ['patch', `/admin/users/${l.userId}`, { firstName: 'سارا' }],
      ['post', `/admin/users/${l.userId}/status`, { status: 'active' }],
      ['put', `/admin/users/${l.userId}/password`, { action: 'clear' }],
      ['post', `/admin/users/${l.userId}/change-password`, { newPassword: 'abcdefgh1', verified: 'stepup' }]
    ] as [M, string, object][]) {
      const x = await adm(m, p, b);
      expect(x.status, p).toBe(409);
      expect(x.body.error.details.reason).toBe('USER_NOT_ACTIVE');
    }
  });

  it('کاربران هم‌پنجرهٔ زمانی (برخورد ۱۰ هگز ابتدایی UUIDv7) هر دو حذف می‌شوند و شمارهٔ ناشناس یکتاست', async () => {
    const a = await mkUser();
    const b = await mkUser();
    // شناسهٔ b را طوری می‌سازیم که ۱۰ هگز ابتدایی‌اش با a یکی باشد
    const idB = a.id.replace(/-/g, '').slice(0, 10) + uuidv7().replace(/-/g, '').slice(10);
    const fmt = `${idB.slice(0, 8)}-${idB.slice(8, 12)}-${idB.slice(12, 16)}-${idB.slice(16, 20)}-${idB.slice(20)}`;
    await t.ds.query('UPDATE users SET id = ? WHERE id = ?', [uuidToBuf(fmt), uuidToBuf(b.id)]);
    await t.ds.query('UPDATE profiles SET user_id = ? WHERE user_id = ?', [uuidToBuf(fmt), uuidToBuf(b.id)]);
    const ra = await adm('delete', `/admin/users/${a.id}`);
    const rb = await adm('delete', `/admin/users/${fmt}`);
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);
    expect(ra.body.data.phone).not.toBe(rb.body.data.phone);
    expect(rb.body.data.phone).toMatch(/^d[0-9a-f]{10}$/);
  });

  it('ناشناس ⇒ 404', async () => {
    expect((await adm('delete', `/admin/users/${randomUUID()}`)).status).toBe(404);
  });
});

describe('رمز (admin)', () => {
  it('set ⇒ رمز argon2id، پرچم، revoke همهٔ نشست‌ها + session.revoked؛ clear ⇒ حذف رمز و پرچم=۰', async () => {
    const l = await loginOtp(t);
    await clearOutbox();
    const r = await adm('put', `/admin/users/${l.userId}/password`, { action: 'set', password: 'temp-pass-123' });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ hasPassword: true, mustChangePassword: true, activeSessions: 0 });
    expect(JSON.stringify(r.body)).not.toContain('temp-pass-123');
    expect((await outbox('session.revoked')).flatMap((e) => e.sessionIds as string[])).toContain(l.sessionId);
    expect((await request(t.http).get('/c/v1/me').set(l.headers)).body.error.code).toBe('AUTH_TOKEN_INVALID');

    const c = await adm('put', `/admin/users/${l.userId}/password`, { action: 'clear' });
    expect(c.body.data).toMatchObject({ hasPassword: false, mustChangePassword: false });
    expect((await pwLogin(l.phone, 'temp-pass-123')).body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('اعتبارسنجی و 404', async () => {
    const { id, phone } = await mkUser();
    expect((await adm('put', `/admin/users/${id}/password`, { action: 'set', password: 'short' })).status).toBe(400);
    expect((await adm('put', `/admin/users/${id}/password`, { action: 'nope' })).status).toBe(400);
    expect((await adm('put', `/admin/users/${id}/password`, { action: 'set', password: `x${phone}xx` })).status).toBe(400);
    expect((await adm('put', `/admin/users/${randomUUID()}/password`, { action: 'clear' })).status).toBe(404);
  });

  it('change-password verified=current: غلط ⇒ 401 و شمارندهٔ rate-limit؛ درست ⇒ پرچم=۰ و سایر نشست‌ها revoke جز keepSessionId', async () => {
    const { id, phone } = await mkUser({ password: 'temp-pass-123' });
    const s1 = (await pwLogin(phone, 'temp-pass-123')).body.data.sessionId as string;
    const s2 = (await pwLogin(phone, 'temp-pass-123')).body.data.sessionId as string;
    const bad = await adm('post', `/admin/users/${id}/change-password`, { newPassword: 'brand-new-pass1', verified: 'current', currentPassword: 'wrong-password-1' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect((await adm('post', `/admin/users/${id}/change-password`, { newPassword: 'brand-new-pass1', verified: 'current' })).status).toBe(400);

    await clearOutbox();
    const ok = await adm('post', `/admin/users/${id}/change-password`, { newPassword: 'brand-new-pass1', verified: 'current', currentPassword: 'temp-pass-123', keepSessionId: s1 });
    expect(ok.status).toBe(200);
    const [row] = (await t.ds.query('SELECT must_change_password AS m FROM users WHERE id = ?', [uuidToBuf(id)])) as { m: number }[];
    expect(Number(row!.m)).toBe(0);
    const active = (await t.ds.query('SELECT id FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL', [uuidToBuf(id)])) as { id: Buffer }[];
    expect(active.map((r) => r.id.toString('hex'))).toEqual([s1.replace(/-/g, '')]);
    expect((await outbox('session.revoked')).flatMap((e) => e.sessionIds as string[])).toEqual([s2]);
    expect((await pwLogin(phone, 'brand-new-pass1')).status).toBe(200);
  });

  it('change-password verified=stepup: رمز فعلی لازم نیست؛ بدون keepSessionId همهٔ نشست‌ها revoke', async () => {
    const { id, phone } = await mkUser({ password: 'temp-pass-123' });
    await pwLogin(phone, 'temp-pass-123');
    const ok = await adm('post', `/admin/users/${id}/change-password`, { newPassword: 'brand-new-pass1', verified: 'stepup' });
    expect(ok.status).toBe(200);
    expect(await t.ds.query('SELECT 1 FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL', [uuidToBuf(id)])).toHaveLength(0);
    expect((await adm('post', `/admin/users/${id}/change-password`, { newPassword: 'x', verified: 'stepup' })).status).toBe(400);
    expect((await adm('post', `/admin/users/${id}/change-password`, { newPassword: 'abcdefgh1', verified: 'other' })).status).toBe(400);
    expect((await adm('post', `/admin/users/${randomUUID()}/change-password`, { newPassword: 'abcdefgh1', verified: 'stepup' })).status).toBe(404);
  });

  it('تلاش‌های غلط currentPassword بیش از سقف ⇒ 429', async () => {
    const { id } = await mkUser({ password: 'temp-pass-123' });
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await adm('post', `/admin/users/${id}/change-password`, { newPassword: 'brand-new-pass1', verified: 'current', currentPassword: 'wrong-password-1' })).status;
    expect(last).toBe(429);
  });
});

describe('نشست‌ها (admin)', () => {
  it('فهرست صفحه‌بندی با meta، activeOnly، revoke یک نشست (فقط متعلق به همان کاربر)، logout-all', async () => {
    const l = await loginOtp(t);
    const l2 = await loginOtp(t, { phone: l.phone });
    const other = await loginOtp(t);
    const r = await adm('get', `/admin/users/${l.userId}/sessions?pageSize=1`);
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(1);
    expect(r.body.meta).toMatchObject({ page: 1, pageSize: 1, total: 2 });
    expect(r.body.data[0]).toMatchObject({ platform: 'android', client: 'android-low', revokedAt: null });
    expect(Object.keys(r.body.data[0]).sort()).toEqual(['client', 'createdAt', 'deviceLabel', 'id', 'ip', 'lastActiveAt', 'platform', 'revokedAt']);

    // نشست کاربر دیگر ⇒ 404
    expect((await adm('delete', `/admin/users/${l.userId}/sessions/${other.sessionId}`)).status).toBe(404);
    expect((await adm('delete', `/admin/users/${l.userId}/sessions/${randomUUID()}`)).status).toBe(404);
    expect((await adm('delete', `/admin/users/${l.userId}/sessions/zzz`)).status).toBe(404);

    await clearOutbox();
    expect((await adm('delete', `/admin/users/${l.userId}/sessions/${l.sessionId}`)).status).toBe(200);
    expect((await adm('delete', `/admin/users/${l.userId}/sessions/${l.sessionId}`)).status).toBe(200); // idempotent
    expect((await outbox('session.revoked')).flatMap((e) => e.sessionIds as string[])).toEqual([l.sessionId]);
    expect((await request(t.http).get('/c/v1/me').set(l.headers)).status).toBe(401);

    const all = await adm('get', `/admin/users/${l.userId}/sessions`);
    expect(all.body.meta.total).toBe(2);
    const act = await adm('get', `/admin/users/${l.userId}/sessions?activeOnly=true`);
    expect(act.body.meta.total).toBe(1);
    expect(act.body.data[0].id).toBe(l2.sessionId);

    await clearOutbox();
    expect((await adm('post', `/admin/users/${l.userId}/logout-all`)).status).toBe(200);
    expect((await outbox('session.revoked')).flatMap((e) => e.sessionIds as string[])).toEqual([l2.sessionId]);
    expect((await request(t.http).get('/c/v1/me').set(l2.headers)).status).toBe(401);
    expect((await request(t.http).get('/c/v1/me').set(other.headers)).status).toBe(200);

    expect((await adm('get', `/admin/users/${randomUUID()}/sessions`)).status).toBe(404);
    expect((await adm('post', `/admin/users/${randomUUID()}/logout-all`)).status).toBe(404);
    expect((await adm('get', `/admin/users/${l.userId}/sessions?pageSize=500`)).status).toBe(400);
  });
});

describe('رمز موقت: جریان کامل کاربر', () => {
  it('claim mcp، مسیرهای مسدود، تغییر با currentPassword، پرچم پاک، refresh بدون mcp', async () => {
    const { phone, id } = await mkUser({ password: 'temp-pass-123' });
    const a = await pwLogin(phone, 'temp-pass-123');
    expect(a.status).toBe(200);
    const h = { ...ANDROID, Authorization: `Bearer ${a.body.data.accessToken}`, 'X-Forwarded-For': freshIp() };
    expect(decodeJwt(a.body.data.accessToken).mcp).toBe(true);

    const me = await request(t.http).get('/c/v1/me').set(h);
    expect(me.status).toBe(200);
    expect(me.body.data.mustChangePassword).toBe(true);
    for (const p of ['/me/profile', '/me/sessions', '/me/inbox', '/me/inbox/unread-count', '/me/points']) {
      const r = await request(t.http).get(`/c/v1${p}`).set(h);
      expect(r.status, p).toBe(403);
      expect(r.body.error.code).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
    }
    expect((await request(t.http).patch('/c/v1/me/profile').set(h).send({ firstName: 'سارا' })).body.error.code).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
    expect((await request(t.http).post('/c/v1/auth/step-up/otp/request').set(h)).body.error.code).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');

    // بدون currentPassword و بدون step-up ⇒ همان الزام step-up (استثنا فقط با currentPassword)
    expect((await request(t.http).put('/c/v1/me/password').set(h).send({ newPassword: 'brand-new-pass1' })).body.error.code).toBe('AUTH_STEP_UP_REQUIRED');
    // رمز موقت غلط
    const bad = await request(t.http).put('/c/v1/me/password').set(h).send({ newPassword: 'brand-new-pass1', currentPassword: 'wrong-password-1' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    // رمز جدید برابر رمز موقت
    expect((await request(t.http).put('/c/v1/me/password').set(h).send({ newPassword: 'temp-pass-123', currentPassword: 'temp-pass-123' })).status).toBe(400);

    // نشست دوم (باید revoke شود)
    const b = await pwLogin(phone, 'temp-pass-123');
    const ok = await request(t.http).put('/c/v1/me/password').set(h).send({ newPassword: 'brand-new-pass1', currentPassword: 'temp-pass-123' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual({});
    const [row] = (await t.ds.query('SELECT must_change_password AS m FROM users WHERE id = ?', [uuidToBuf(id)])) as { m: number }[];
    expect(Number(row!.m)).toBe(0);

    // نشست جاری می‌ماند و دیگر محدود نیست؛ نشست دوم revoke
    expect((await request(t.http).get('/c/v1/me/profile').set(h)).status).toBe(200);
    expect((await request(t.http).get('/c/v1/me').set(h)).body.data.mustChangePassword).toBe(false);
    expect((await request(t.http).get('/c/v1/me').set({ ...ANDROID, Authorization: `Bearer ${b.body.data.accessToken}` })).status).toBe(401);
    // refresh ⇒ access جدید بدون mcp
    const rf = await post('/auth/refresh').send({ refreshToken: a.body.data.refreshToken });
    expect(rf.status).toBe(200);
    expect(decodeJwt(rf.body.data.accessToken).mcp).toBeUndefined();
    expect((await pwLogin(phone, 'brand-new-pass1')).status).toBe(200);
  });

  it('currentPassword وقتی پرچم نیست ⇒ step-up همچنان لازم (استثنا فقط در حالت رمز موقت)', async () => {
    const { phone } = await mkUser({ password: 'temp-pass-123' });
    const a = await pwLogin(phone, 'temp-pass-123');
    const h = { ...ANDROID, Authorization: `Bearer ${a.body.data.accessToken}`, 'X-Forwarded-For': freshIp() };
    await request(t.http).put('/c/v1/me/password').set(h).send({ newPassword: 'brand-new-pass1', currentPassword: 'temp-pass-123' });
    const r = await request(t.http).put('/c/v1/me/password').set(h).send({ newPassword: 'another-pass-22', currentPassword: 'brand-new-pass1' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('AUTH_STEP_UP_REQUIRED');
  });

  it('logout برای کاربر با رمز موقت مجاز؛ refresh نیز مجاز و claim mcp می‌ماند', async () => {
    const { phone } = await mkUser({ password: 'temp-pass-123' });
    const a = await pwLogin(phone, 'temp-pass-123');
    const rf = await post('/auth/refresh').send({ refreshToken: a.body.data.refreshToken });
    expect(rf.status).toBe(200);
    expect(decodeJwt(rf.body.data.accessToken).mcp).toBe(true);
    const h = { ...ANDROID, Authorization: `Bearer ${rf.body.data.accessToken}` };
    expect((await request(t.http).post('/c/v1/auth/logout').set(h)).status).toBe(200);
  });

  it('پاک‌کردن رمز توسط ادمین پرچم را برمی‌دارد (cache فوراً invalidate)', async () => {
    const l = await loginOtp(t);
    await adm('put', `/admin/users/${l.userId}/password`, { action: 'set', password: 'temp-pass-123' });
    const a = await pwLogin(l.phone, 'temp-pass-123');
    const h = { ...ANDROID, Authorization: `Bearer ${a.body.data.accessToken}` };
    expect((await request(t.http).get('/c/v1/me/profile').set(h)).status).toBe(403);
    await adm('put', `/admin/users/${l.userId}/password`, { action: 'clear' });
    expect((await request(t.http).get('/c/v1/me/profile').set(h)).status).toBe(200);
  });
});

describe('گزارش‌ها', () => {
  it('bucketStart: هفته از شنبه، ماه از روز اول', () => {
    expect(bucketStart('2026-10-03', 'week')).toBe('2026-10-03'); // شنبه
    expect(bucketStart('2026-10-04', 'week')).toBe('2026-10-03'); // یکشنبه
    expect(bucketStart('2026-10-09', 'week')).toBe('2026-10-03'); // جمعه
    expect(bucketStart('2026-10-10', 'week')).toBe('2026-10-10');
    expect(bucketStart('2026-10-17', 'month')).toBe('2026-10-01');
    expect(bucketStart('2026-10-17', 'day')).toBe('2026-10-17');
  });

  const otp = (iso: string, consumed: boolean) =>
    t.ds.query("INSERT INTO otp_challenges (id, phone, purpose, code_hmac, expires_at, consumed_at, ip, created_at) VALUES (?, ?, 'login', ?, ?, ?, '1.1.1.1', ?)", [
      uuidToBuf(uuidv7()),
      freshPhone(),
      Buffer.alloc(32),
      new Date(iso),
      consumed ? new Date(iso) : null,
      new Date(iso)
    ]);

  it('otp: bucket به‌وقت تهران، پر شدن صفرها، روز/هفته/ماه', async () => {
    await otp('2026-09-12T19:59:00Z', true); // تهران ۱۲ سپتامبر ۲۳:۲۹ ⇒ شنبه 09-12
    await otp('2026-09-12T20:45:00Z', false); // تهران ۱۳ سپتامبر ۰۰:۱۵ ⇒ یکشنبه 09-13 (هفتهٔ 09-12)
    await otp('2026-09-12T20:50:00Z', true);
    await otp('2026-09-04T20:45:00Z', true); // تهران 09-05 (شنبه) ⇒ هفتهٔ 09-05

    const day = await adm('get', '/admin/reports/otp?from=2026-09-05&to=2026-09-20');
    expect(day.status).toBe(200);
    expect(day.body.data.interval).toBe('day');
    expect(day.body.data.items).toHaveLength(16);
    const by = Object.fromEntries(day.body.data.items.map((i: any) => [i.bucket, i]));
    expect(by['2026-09-05']).toMatchObject({ requested: 1, verified: 1 });
    expect(by['2026-09-12']).toMatchObject({ requested: 1, verified: 1 });
    expect(by['2026-09-13']).toMatchObject({ requested: 2, verified: 1 });
    expect(by['2026-09-10']).toMatchObject({ requested: 0, verified: 0 });

    const week = await adm('get', '/admin/reports/otp?from=2026-09-05&to=2026-09-20&interval=week');
    expect(week.body.data.items).toEqual([
      { bucket: '2026-09-05', requested: 1, verified: 1, failed: 0 },
      { bucket: '2026-09-12', requested: 3, verified: 2, failed: 0 },
      { bucket: '2026-09-19', requested: 0, verified: 0, failed: 0 }
    ]);
    const month = await adm('get', '/admin/reports/otp?from=2026-09-05&to=2026-10-02&interval=month');
    expect(month.body.data.items).toEqual([
      { bucket: '2026-09-01', requested: 4, verified: 3, failed: 0 },
      { bucket: '2026-10-01', requested: 0, verified: 0, failed: 0 }
    ]);
  });

  it('اعتبارسنجی بازه: فرمت، from>to، بیش از ۳۶۶ روز ⇒ 400', async () => {
    for (const q of ['from=2026-9-1&to=2026-09-02', 'from=2026-09-05&to=2026-09-01', 'from=2025-01-01&to=2026-09-01', 'to=2026-09-01', 'from=2026-09-01&to=2026-09-02&interval=year']) {
      expect((await adm('get', `/admin/reports/otp?${q}`)).status, q).toBe(400);
      expect((await adm('get', `/admin/reports/users?${q}`)).status, q).toBe(400);
    }
    expect((await adm('get', '/admin/reports/otp?from=2025-09-01&to=2026-09-01')).status).toBe(200); // ۳۶۶ روز
  });

  it('clients: نشست‌های فعال به تفکیک client (null ⇒ unknown)', async () => {
    const a = await loginOtp(t);
    await loginOtp(t);
    await loginOtp(t, { client: WEB_ADMIN });
    await t.ds.query('INSERT INTO auth_sessions (id, user_id, device_id, device_label, platform, client_id, ip, created_at, last_active_at, perm_ver) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 1)', [
      uuidToBuf(uuidv7()),
      uuidToBuf(a.userId),
      randomUUID(),
      'x',
      'web',
      '1.1.1.1',
      new Date(),
      new Date()
    ]);
    await adm('post', `/admin/users/${(await loginOtp(t, { client: WEB_ADMIN })).userId}/logout-all`);
    const r = await adm('get', '/admin/reports/clients');
    expect(r.status).toBe(200);
    expect(r.body.data.items).toEqual([
      { client: 'android-low', activeSessions: 2 },
      { client: 'unknown', activeSessions: 1 },
      { client: 'web-admin', activeSessions: 1 }
    ]);
  });

  it('users: شمارش‌ها و سری ثبت‌نام با پر شدن صفرها', async () => {
    const u1 = await mkUser({ password: 'temp-pass-123' });
    const u2 = await mkUser();
    const u3 = await mkUser();
    const u4 = await mkUser();
    await adm('post', `/admin/users/${u2.id}/status`, { status: 'disabled' });
    await adm('delete', `/admin/users/${u3.id}`);
    for (const [u, iso] of [[u1, '2026-09-12T19:59:00Z'], [u2, '2026-09-12T20:45:00Z'], [u3, '2026-09-04T20:45:00Z'], [u4, '2025-01-01T00:00:00Z']] as const)
      await t.ds.query('UPDATE users SET created_at = ? WHERE id = ?', [new Date(iso), uuidToBuf(u.id)]);

    const r = await adm('get', '/admin/reports/users?from=2026-09-05&to=2026-09-20&interval=week');
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ total: 4, registered: 3, byStatus: { active: 2, disabled: 1, deleted: 1 }, withPassword: 1 });
    expect(r.body.data.series).toEqual({
      interval: 'week',
      items: [
        { bucket: '2026-09-05', count: 1 },
        { bucket: '2026-09-12', count: 2 },
        { bucket: '2026-09-19', count: 0 }
      ]
    });
    const empty = await adm('get', '/admin/reports/users?from=2026-01-01&to=2026-01-03');
    expect(empty.body.data.series.items).toEqual([
      { bucket: '2026-01-01', count: 0 },
      { bucket: '2026-01-02', count: 0 },
      { bucket: '2026-01-03', count: 0 }
    ]);
  });
});
