import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestApp, mkUser, outboxTypes, resetDb, startApp } from './helpers/app';

let t: TestApp;
const hex = (id: string) => id.replace(/-/g, '');

beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => t.close());
beforeEach(async () => resetDb(t.ds, t.app));

const send = (type: string, payload: object, over: { caller?: string; token?: string; eventId?: string } = {}) =>
  request(t.http)
    .post('/s/internal/v1/events')
    .set({ 'X-Internal-Caller': over.caller ?? 'low', 'X-Internal-Token': over.token ?? t.env.INTERNAL_SECRET_LOW })
    .send({ eventId: over.eventId ?? randomUUID(), type, occurredAt: new Date().toISOString(), payload });
const dir = async (id: string) => ((await t.ds.query('SELECT status, phone, first_name, last_name FROM user_directory WHERE user_id = UNHEX(?)', [hex(id)])) as any[])[0];
const now = () => new Date().toISOString();

describe('ACL رویدادهای تازه', () => {
  it('low ⇒ user.phone.changed و user.status.changed مجاز؛ فرستندهٔ دیگر/secret غلط/نوع ناشناخته ⇒ رد', async () => {
    const u = await mkUser(t, 'کاربر نمونه');
    expect((await send('user.phone.changed', { userId: u.id, phone: '09127776655', changedAt: now() })).status).toBe(202);
    expect((await send('user.status.changed', { userId: u.id, status: 'disabled', changedAt: now() })).status).toBe(202);
    // mid هیچ رویدادی به high نمی‌فرستد (ACL خالی)
    const m = await send('user.status.changed', { userId: u.id, status: 'active', changedAt: now() }, { caller: 'mid', token: t.env.INTERNAL_SECRET_MID });
    expect(m.status).toBe(403);
    // secret جفت دیگر برای فرستندهٔ low کار نمی‌کند
    expect((await send('user.status.changed', { userId: u.id, status: 'active', changedAt: now() }, { token: t.env.INTERNAL_SECRET_MID })).status).toBe(401);
    expect((await send('user.exploded', {})).status).toBe(403);
    expect((await dir(u.id)).status).toBe('disabled');
  });

  it('رویدادهای قبلی هنوز مجازند', async () => {
    const id = randomUUID();
    expect((await send('user.registered', { userId: id, phone: '09128889900', firstName: 'ن', lastName: 'ک' })).status).toBe(202);
    expect((await send('user.profile.updated', { userId: id, firstName: 'نام' })).status).toBe(202);
    expect((await send('session.revoked', { sessionIds: [randomUUID()], expiresAt: new Date(Date.now() + 60_000).toISOString() })).status).toBe(202);
  });
});

describe('user.phone.changed', () => {
  it('شمارهٔ دایرکتوری به‌روز می‌شود؛ dedupe با eventId؛ payload نامعتبر ⇒ 400 و بی‌اثر', async () => {
    const u = await mkUser(t, 'کاربر نمونه');
    const eventId = randomUUID();
    expect((await send('user.phone.changed', { userId: u.id, phone: '09127776655', changedAt: now() }, { eventId })).status).toBe(202);
    expect((await dir(u.id)).phone).toBe('09127776655');
    await t.ds.query('UPDATE user_directory SET phone = ? WHERE user_id = UNHEX(?)', ['09120000001', hex(u.id)]);
    expect((await send('user.phone.changed', { userId: u.id, phone: '09127776655', changedAt: now() }, { eventId })).status).toBe(202); // تکراری ⇒ نادیده
    expect((await dir(u.id)).phone).toBe('09120000001');
    const bad = await send('user.phone.changed', { userId: u.id, phone: 'abc', changedAt: now() });
    expect(bad.status).toBe(400);
    expect((await dir(u.id)).phone).toBe('09120000001');
    // کاربر ناموجود: بی‌خطا
    expect((await send('user.phone.changed', { userId: randomUUID(), phone: '09127776600', changedAt: now() })).status).toBe(202);
  });
});

describe('user.status.changed', () => {
  it('disabled/active فقط status را عوض می‌کند', async () => {
    const u = await mkUser(t, 'کاربر نمونه', ['super_admin']);
    await send('user.status.changed', { userId: u.id, status: 'disabled', changedAt: now() });
    expect(await dir(u.id)).toMatchObject({ status: 'disabled', first_name: 'کاربر' });
    expect(Number(((await t.ds.query('SELECT COUNT(*) AS n FROM user_system_roles WHERE user_id = UNHEX(?)', [hex(u.id)])) as any[])[0].n)).toBe(1);
    await send('user.status.changed', { userId: u.id, status: 'active', changedAt: now() });
    expect((await dir(u.id)).status).toBe('active');
    expect((await send('user.status.changed', { userId: u.id, status: 'zombie', changedAt: now() })).status).toBe(400);
  });

  it('deleted: شمارهٔ ناشناس، نام خالی، پاک‌شدن نقش/grant و claim تازه؛ idempotent', async () => {
    const u = await mkUser(t, 'کاربر نمونه', ['super_admin'], ['session.create']);
    await t.ds.query('DELETE FROM outbox_events');
    const anon = `d${hex(u.id).slice(-10)}`;
    const eventId = randomUUID();
    expect((await send('user.status.changed', { userId: u.id, status: 'deleted', changedAt: now(), anonymizedPhone: anon }, { eventId })).status).toBe(202);
    expect(await dir(u.id)).toMatchObject({ status: 'deleted', phone: anon, first_name: '', last_name: '' });
    expect(Number(((await t.ds.query('SELECT COUNT(*) AS n FROM user_system_roles WHERE user_id = UNHEX(?)', [hex(u.id)])) as any[])[0].n)).toBe(0);
    expect(Number(((await t.ds.query('SELECT COUNT(*) AS n FROM user_grants WHERE user_id = UNHEX(?)', [hex(u.id)])) as any[])[0].n)).toBe(0);
    const ev = (await outboxTypes(t)).filter((e) => e.type === 'system.role.changed');
    expect(ev).toHaveLength(1);
    expect(ev[0]!.payload).toMatchObject({ userId: u.id, systemRoles: [], grants: [] });
    // تکرار (همان eventId و eventId تازه) ⇒ بدون claim اضافه
    await send('user.status.changed', { userId: u.id, status: 'deleted', changedAt: now(), anonymizedPhone: anon }, { eventId });
    await send('user.status.changed', { userId: u.id, status: 'deleted', changedAt: now(), anonymizedPhone: anon });
    expect((await outboxTypes(t)).filter((e) => e.type === 'system.role.changed')).toHaveLength(1);
    // anonymizedPhone نیامده ⇒ از شناسه محاسبه می‌شود
    const v = await mkUser(t, 'دیگر کاربر');
    const noAnon = await send('user.status.changed', { userId: v.id, status: 'deleted', changedAt: now() });
    expect(noAnon.status).toBe(202);
    expect((await dir(v.id)).phone).toBe(`d${hex(v.id).slice(-10)}`);
    // anonymizedPhone نامعتبر ⇒ 400
    expect((await send('user.status.changed', { userId: v.id, status: 'deleted', changedAt: now(), anonymizedPhone: '09121234567' })).status).toBe(400);
  });

  it('رویداد دیررس (registered/profile/phone/status=active) کاربر حذف‌شده را زنده نمی‌کند', async () => {
    const u = await mkUser(t, 'کاربر نمونه');
    const phone = u.phone;
    await send('user.status.changed', { userId: u.id, status: 'deleted', changedAt: now() });
    await send('user.registered', { userId: u.id, phone, firstName: 'کاربر', lastName: 'نمونه' });
    await send('user.profile.updated', { userId: u.id, firstName: 'برگشت' });
    await send('user.phone.changed', { userId: u.id, phone: '09123334455', changedAt: now() });
    await send('user.status.changed', { userId: u.id, status: 'active', changedAt: now() });
    expect(await dir(u.id)).toMatchObject({ status: 'deleted', phone: `d${hex(u.id).slice(-10)}`, first_name: '', last_name: '' });
    // شمارهٔ قبلی آزاد است: کاربر تازه با همان شماره ثبت‌نام می‌کند (UNIQUE phone نقض نمی‌شود)
    const fresh = randomUUID();
    expect((await send('user.registered', { userId: fresh, phone, firstName: 'کاربر', lastName: 'تازه' })).status).toBe(202);
    expect(await dir(fresh)).toMatchObject({ status: 'active', phone });
  });

  it('user.registered ⇒ status=active', async () => {
    const id = randomUUID();
    await send('user.registered', { userId: id, phone: '09124443322', firstName: 'ن', lastName: 'ک' });
    expect((await dir(id)).status).toBe('active');
  });
});
