import { randomUUID } from 'node:crypto';
import { io as client, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { high, internal, mid, MidSession, PublicSession } from '@isra/api-types';
import { uuidToBuf, uuidv7 } from '../src/common/ids';
import { OutboxService, routesFor } from '../src/outbox/outbox.service';
import { type TestApp, type User, api, creator, join, mkSession, mkUser, sessionBody, startApp } from './helpers/app';

const HIGH = 'test-pair-mid-high-0123456789abcdef0';
const LOW = 'test-pair-low-mid-0123456789abcdef01';
let t: TestApp;
let a: ReturnType<typeof api>;
beforeAll(async () => {
  t = await startApp({ SOCKET_ENABLED: 'true' });
  a = api(t);
});
afterAll(async () => t.close());

const bin = (id: string) => uuidToBuf(id);
const hdr = () => ({ 'X-Internal-Caller': 'high', 'X-Internal-Token': HIGH });
const ad = {
  get: (p: string) => request(t.http).get(`/o/internal/v1${p}`).set(hdr()),
  post: (p: string, b: object = {}, h: Record<string, string> = {}) => request(t.http).post(`/o/internal/v1${p}`).set({ ...hdr(), ...h }).send(b),
  put: (p: string, b: object = {}) => request(t.http).put(`/o/internal/v1${p}`).set(hdr()).send(b),
  del: (p: string) => request(t.http).delete(`/o/internal/v1${p}`).set(hdr())
};
const reason = (r: request.Response) => r.body?.error?.details?.reason as string | undefined;
const memberOf = async (sid: string, userId: string) => ((await t.ds.query('SELECT m.id, m.status, m.source FROM session_members m WHERE m.session_id = ? AND m.user_id = ?', [bin(sid), bin(userId)])) as { id: Buffer; status: string; source: string }[])[0];
const inboxFor = async (userId: string) =>
  ((await t.ds.query("SELECT payload FROM outbox_events WHERE type = 'inbox.messages.created'")) as { payload: any }[])
    .flatMap((r) => (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload).items as { userId: string; kind: string; title: string; ref: string }[])
    .filter((i) => i.userId === userId);

/** جلسهٔ started با مدیر، پشتیبان و قرآن‌آموز */
async function room(over: Record<string, unknown> = {}) {
  const manager = await creator(t);
  const r = await a.post('/sessions', manager, sessionBody(over));
  const id = r.body.data.id as string;
  await a.post(`/sessions/${id}/transition`, manager, { to: 'scheduled' });
  await a.post(`/sessions/${id}/transition`, manager, { to: 'started' });
  return { id, manager };
}
describe('جلسه: سیاست پیوستن/نمایش/ظرفیت', () => {
  it('SessionInput ذخیره و در MidSession/PublicSession برمی‌گردد؛ capacity نبود در ویرایش = بدون تغییر', async () => {
    const m = await creator(t);
    const r = await a.post('/sessions', m, sessionBody({ joinPolicy: 'open', visibility: 'unlisted', capacity: 12 }));
    expect(r.status).toBe(200);
    const s = MidSession.parse(r.body.data);
    expect(s).toMatchObject({ joinPolicy: 'open', visibility: 'unlisted', capacity: 12, memberCount: 1 });
    const e = await a.patch(`/sessions/${s.id}`, m, sessionBody({ joinPolicy: 'request', visibility: 'public' }));
    expect(e.body.data).toMatchObject({ joinPolicy: 'request', visibility: 'public', capacity: 12 });
    const e2 = await a.patch(`/sessions/${s.id}`, m, sessionBody({ capacity: null }));
    expect(e2.body.data.capacity).toBeNull();
    const def = (await a.post('/sessions', m, sessionBody())).body.data;
    expect(def).toMatchObject({ joinPolicy: 'request', visibility: 'public', capacity: null });
  });

  it('unlisted در M-06/فهرست عمومی low نمی‌آید ولی با شناسه (L-31/M-02) دیده می‌شود؛ M-06 فیلتر q/status/weekday و مرتب‌سازی', async () => {
    const m = await creator(t);
    const tag = `کشف${Date.now()}`;
    const mk = async (title: string, over: Record<string, unknown>, to: string[]) => {
      const id = (await a.post('/sessions', m, sessionBody({ title: `${tag} ${title}`, ...over }))).body.data.id as string;
      for (const s of to) await a.post(`/sessions/${id}/transition`, m, { to: s });
      return id;
    };
    // ۲۰۳۰-۰۱-۰۵ شنبه (تهران) ⇒ weekday=0
    const once = await mk('یکباره', { schedule: { type: 'once', startsAt: '2030-01-05T18:00:00+03:30', endsAt: '2030-01-05T20:00:00+03:30' } }, ['scheduled']);
    const rec = await mk('هفتگی', { schedule: { type: 'recurring', weekdays: [2, 4], timeOfDay: '18:00', durationMin: 60 }, location: { label: 'خانهٔ قرآن' } }, ['scheduled', 'started']);
    const hidden = await mk('پنهان', { visibility: 'unlisted' }, ['scheduled']);
    const draft = await mk('پیش‌نویس', {}, []);
    const u = await mkUser(t, 'کاوشگر');
    const ids = async (qs: string) => ((await a.get(`/sessions?${qs}`, u)).body.data as { id: string }[]).map((x) => x.id);
    const all = await a.get(`/sessions?q=${encodeURIComponent(tag)}`, u);
    expect(all.status).toBe(200);
    for (const x of all.body.data) PublicSession.parse(x);
    expect(all.body.data.map((x: { id: string }) => x.id)).toEqual([rec, once]); // started اول
    expect(all.body.data[0]).not.toHaveProperty('visibility');
    expect(await ids(`q=${encodeURIComponent(tag)}&status=scheduled`)).toEqual([once]);
    expect(await ids(`q=${encodeURIComponent(tag)}&weekday=0`)).toEqual([once]);
    expect(await ids(`q=${encodeURIComponent(tag)}&weekday=4`)).toEqual([rec]);
    expect(await ids(`q=${encodeURIComponent(tag)}&weekday=1`)).toEqual([]);
    expect(await ids('q=خانهٔ قرآن')).toContain(rec);
    expect(await ids(`q=${encodeURIComponent(tag)}`)).not.toContain(hidden);
    expect(await ids(`q=${encodeURIComponent(tag)}`)).not.toContain(draft);
    expect((await a.get('/sessions?q=x', u)).status).toBe(400); // حداقل ۲ نویسه
    const low = (p: string) => request(t.http).get(`/o/internal/v1${p}`).set({ 'X-Internal-Caller': 'low', 'X-Internal-Token': LOW });
    const pub = (await low('/public/sessions?pageSize=50')).body.data as { id: string }[];
    expect(pub.map((x) => x.id)).not.toContain(hidden);
    const one = await low(`/public/sessions/${hidden}`);
    expect(one.status).toBe(200);
    expect(PublicSession.parse(one.body.data).id).toBe(hidden);
    expect((await a.get(`/sessions/${hidden}/me`, u)).status).toBe(200);
  });

  it('M-07: مدیر draft را حذف نرم می‌کند؛ غیر draft ⇒ SESSION_LOCKED؛ غیرمدیر 403', async () => {
    const m = await creator(t);
    const d = (await a.post('/sessions', m, sessionBody())).body.data.id as string;
    const other = await mkUser(t, 'غریبه');
    expect((await a.del(`/sessions/${d}`, other)).status).toBe(404); // draft برای غیرعضو وجود ندارد
    expect((await a.del(`/sessions/${d}`, m)).status).toBe(200);
    expect((await a.get(`/sessions/${d}/me`, m)).status).toBe(404);
    const s = await mkSession(t, m, 'scheduled');
    const locked = await a.del(`/sessions/${s}`, m);
    expect(locked.status).toBe(409);
    expect(reason(locked)).toBe('SESSION_LOCKED');
    const sup = await mkUser(t, 'پشتیبان');
    await join(t, s, m, sup, ['session_supporter']);
    expect((await a.del(`/sessions/${s}`, sup)).status).toBe(403);
  });

  it('M-01: فیلتر status و role', async () => {
    const m = await creator(t);
    const s1 = await mkSession(t, m, 'scheduled');
    const s2 = await mkSession(t, m, 'started');
    const other = await creator(t, 'مدیر دیگر');
    const s3 = await mkSession(t, other, 'started');
    await join(t, s3, other, m, ['teacher']);
    const ids = async (qs: string) => ((await a.get(`/me/sessions?${qs}`, m)).body.data as { session: { id: string } }[]).map((x) => x.session.id).sort();
    expect(await ids('status=started')).toEqual([s2, s3].sort());
    expect(await ids('role=teacher')).toEqual([s3]);
    expect(await ids('role=session_manager&status=scheduled')).toEqual([s1]);
    for (const x of (await a.get('/me/sessions', m)).body.data) mid.MySessionItem.parse(x);
  });

  it('ویرایش زمان/مکان ⇒ اعلان session به اعضا و رویداد session.updated', async () => {
    const m = await creator(t);
    const s = await mkSession(t, m, 'scheduled');
    const u = await mkUser(t, 'عضو اعلان');
    await join(t, s, m, u);
    const emit = vi.spyOn(t.live, 'emit');
    try {
      await a.patch(`/sessions/${s}`, m, sessionBody({ location: { label: 'جای دیگر' } }));
      expect(emit.mock.calls.some((c) => c[0] === s && c[1] === 'session.updated')).toBe(true);
    } finally {
      emit.mockRestore();
    }
    const msgs = await inboxFor(u.id);
    expect(msgs.some((x) => x.kind === 'session' && x.ref === `session:${s}` && x.title === 'تغییر جلسه')).toBe(true);
    expect((await inboxFor(m.id)).some((x) => x.title === 'تغییر جلسه')).toBe(false);
  });
});

describe('M-10 درخواست عضویت: joinPolicy، ظرفیت، cooldown', () => {
  it('open ⇒ approved فوری (quran_student، source=open)؛ ظرفیت ⇒ SESSION_FULL', async () => {
    const { id, manager } = await room({ joinPolicy: 'open', capacity: 2 });
    const u1 = await mkUser(t, 'باز یک');
    const r = await a.post(`/sessions/${id}/members`, u1);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ status: 'approved', roles: ['quran_student'] });
    expect((await memberOf(id, u1.id))!.source).toBe('open');
    const full = await a.post(`/sessions/${id}/members`, await mkUser(t, 'باز دو'));
    expect(full.status).toBe(409);
    expect(reason(full)).toBe('SESSION_FULL');
    expect((await a.get(`/sessions/${id}/me`, manager)).body.data.session.memberCount).toBe(2);
  });

  it('invite_only ⇒ JOIN_CLOSED؛ request ⇒ pending + اعلان به کادر دارای membership.approve', async () => {
    const { id } = await room({ joinPolicy: 'invite_only' });
    const r = await a.post(`/sessions/${id}/members`, await mkUser(t, 'بسته'));
    expect(r.status).toBe(409);
    expect(reason(r)).toBe('JOIN_CLOSED');
    const { id: id2, manager } = await room();
    const sup = await mkUser(t, 'پشتیبان اعلان');
    const teacher = await mkUser(t, 'معلم بی‌اعلان');
    await join(t, id2, manager, sup, ['session_supporter']);
    await join(t, id2, manager, teacher, ['teacher']);
    const p = await a.post(`/sessions/${id2}/members`, await mkUser(t, 'متقاضی'));
    expect(p.body.data.status).toBe('pending');
    const isReq = (x: { title: string }) => x.title === 'درخواست عضویت تازه';
    expect((await inboxFor(manager.id)).filter(isReq).length).toBeGreaterThanOrEqual(1);
    expect((await inboxFor(sup.id)).filter(isReq).length).toBeGreaterThanOrEqual(1);
    expect((await inboxFor(teacher.id)).filter(isReq)).toHaveLength(0);
  });

  it('ردشده: تا ۷ روز REQUEST_COOLDOWN با retryAfterSec؛ پس از آن دوباره pending؛ M-12 approve روی rejected مجاز', async () => {
    const { id, manager } = await room();
    const u = await mkUser(t, 'ردشده');
    const memberId = (await a.post(`/sessions/${id}/members`, u)).body.data.id as string;
    expect((await a.patch(`/sessions/${id}/members/${memberId}`, manager, { action: 'reject' })).body.data.status).toBe('rejected');
    const cd = await a.post(`/sessions/${id}/members`, u);
    expect(cd.status).toBe(409);
    expect(reason(cd)).toBe('REQUEST_COOLDOWN');
    expect(cd.body.error.details.retryAfterSec).toBeGreaterThan(6 * 86_400);
    t.clock.advance(7 * 86_400_000 + 1000);
    const fresh = await t.low.sign({ sub: u.id });
    const mgr2 = await t.low.sign({ sub: manager.id, perms: ['session.create'] });
    u.h.Authorization = `Bearer ${fresh}`;
    manager.h.Authorization = `Bearer ${mgr2}`;
    const again = await a.post(`/sessions/${id}/members`, u);
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ id: memberId, status: 'pending' });
    await a.patch(`/sessions/${id}/members/${memberId}`, manager, { action: 'reject' });
    const ok = await a.patch(`/sessions/${id}/members/${memberId}`, manager, { action: 'approve' });
    expect(ok.body.data).toMatchObject({ status: 'approved', roles: ['quran_student'] });
    const dup = await a.patch(`/sessions/${id}/members/${memberId}`, manager, { action: 'approve' });
    expect(reason(dup)).toBe('ALREADY_DECIDED');
  });

  it('M-12 ظرفیت: تأیید بیش از ظرفیت ⇒ SESSION_FULL', async () => {
    const { id, manager } = await room({ capacity: 2 });
    const u1 = await mkUser(t, 'ظ۱');
    const u2 = await mkUser(t, 'ظ۲');
    const m1 = (await a.post(`/sessions/${id}/members`, u1)).body.data.id;
    const m2 = (await a.post(`/sessions/${id}/members`, u2)).body.data.id;
    expect((await a.patch(`/sessions/${id}/members/${m1}`, manager, { action: 'approve' })).status).toBe(200);
    const f = await a.patch(`/sessions/${id}/members/${m2}`, manager, { action: 'approve' });
    expect(f.status).toBe(409);
    expect(reason(f)).toBe('SESSION_FULL');
  });

  it('M-11 فیلترهای role و q', async () => {
    const { id, manager } = await room();
    const tch = await mkUser(t, 'حسین معلمی');
    await join(t, id, manager, tch, ['teacher']);
    await join(t, id, manager, await mkUser(t, 'رضا شاگرد'));
    const names = async (qs: string) => ((await a.get(`/sessions/${id}/members?${qs}`, manager)).body.data as { name: string }[]).map((x) => x.name);
    expect(await names('role=teacher')).toEqual(['حسین معلمی']);
    expect(await names(`q=${encodeURIComponent('شاگرد')}`)).toEqual(['رضا شاگرد']);
    expect(await names('q=%25')).toEqual([]);
  });
});

describe('M-13 / M-16 نقش و مدیر', () => {
  it('M-13 روی مدیر: مدیر حفظ + معلم؛ مدیر به خودش نقش معلم می‌دهد ⇒ می‌تواند ارزیابی کند', async () => {
    const { id, manager } = await room();
    const mine = (await a.get(`/sessions/${id}/me`, manager)).body.data;
    const myMember = ((await a.get(`/sessions/${id}/members?role=session_manager`, manager)).body.data as { id: string }[])[0]!.id;
    expect(mine.permissions).not.toContain('eval.submit');
    const r = await a.put(`/sessions/${id}/members/${myMember}/roles`, manager, { roles: ['teacher'] });
    expect(r.body.data.roles).toEqual(['session_manager', 'teacher']);
    expect((await a.get(`/sessions/${id}/me`, manager)).body.data.permissions).toContain('eval.submit');
  });

  it('M-16: اعطا، انتقال اتمیک (stepDown)، سلب آخرین ⇒ LAST_HOLDER؛ غیر approved ⇒ NOT_APPROVED؛ پشتیبان 403', async () => {
    const { id, manager } = await room();
    const u = await mkUser(t, 'مدیر بعدی');
    const uMember = await join(t, id, manager, u);
    const mgrMember = ((await a.get(`/sessions/${id}/members?role=session_manager`, manager)).body.data as { id: string }[])[0]!.id;
    const last = await a.put(`/sessions/${id}/members/${mgrMember}/manager`, manager, { manager: false });
    expect(last.status).toBe(409);
    expect(reason(last)).toBe('LAST_HOLDER');
    const pend = (await a.post(`/sessions/${id}/members`, await mkUser(t, 'منتظر'))).body.data.id;
    expect(reason(await a.put(`/sessions/${id}/members/${pend}/manager`, manager, { manager: true }))).toBe('NOT_APPROVED');
    const sup = await mkUser(t, 'پشتیبان م۱۶');
    await join(t, id, manager, sup, ['session_supporter']);
    expect((await a.put(`/sessions/${id}/members/${uMember}/manager`, sup, { manager: true })).status).toBe(403);

    const tr = await a.put(`/sessions/${id}/members/${uMember}/manager`, manager, { manager: true, stepDown: true });
    expect(tr.status).toBe(200);
    expect(tr.body.data.roles).toEqual(['session_manager']);
    const me = (await a.get(`/sessions/${id}/me`, manager)).body.data;
    expect(me.membership.roles).toEqual(['quran_student']);
    expect(me.permissions).not.toContain('membership.roles');
    expect((await inboxFor(u.id)).some((x) => x.title === 'مدیر جلسه شدید')).toBe(true);
    // مدیر تازه می‌تواند مدیر قبلی را دوباره هم‌مدیر کند و سپس خودش سلب شود
    expect((await a.put(`/sessions/${id}/members/${mgrMember}/manager`, u, { manager: true })).body.data.roles).toEqual(['session_manager']);
    expect((await a.put(`/sessions/${id}/members/${uMember}/manager`, u, { manager: false })).body.data.roles).toEqual(['quran_student']);
  });
});

describe('M-14 افزودن مستقیم', () => {
  it('مدیر با userId و شماره؛ نقش‌ها؛ outcomes؛ شمارهٔ ناشناس/غیرفعال؛ اعلان؛ شماره در لاگ/DB نیست', async () => {
    const { id, manager } = await room();
    const byId = await mkUser(t, 'با شناسه');
    const known = uuidv7();
    t.low.users.set('09120000001', { userId: known, firstName: 'شماره', lastName: 'دار', status: 'active' });
    t.low.users.set('09120000002', { userId: uuidv7(), firstName: 'غیر', lastName: 'فعال', status: 'disabled' });
    const ghost = uuidv7();
    const r = await a.post(`/sessions/${id}/members/add`, manager, {
      items: [
        { user: { userId: byId.id }, roles: ['teacher'] },
        { user: { phone: '09120000001' } },
        { user: { phone: '09120000002' } },
        { user: { phone: '09129999999' } },
        { user: { userId: ghost } }
      ]
    });
    expect(r.status).toBe(200);
    const res = mid.AddMembersResult.parse(r.body.data);
    expect(res.items.map((i) => i.outcome)).toEqual(['added', 'added', 'not_active', 'not_found', 'not_found']);
    expect(res.items[0]!.member).toMatchObject({ userId: byId.id, status: 'approved', roles: ['teacher'] });
    expect(res.items[1]!.member).toMatchObject({ userId: known, name: 'شماره دار', roles: ['quran_student'] });
    expect(res).toMatchObject({ added: 2, skipped: 3 });
    expect((await memberOf(id, known))!.source).toBe('staff');
    expect((await inboxFor(known)).some((x) => x.kind === 'membership')).toBe(true);
    // تکرار: skip ⇒ unchanged؛ merge ⇒ اجتماع نقش‌ها
    const again = await a.post(`/sessions/${id}/members/add`, manager, { items: [{ user: { userId: byId.id }, roles: ['quran_student'] }] });
    expect(again.body.data.items[0].outcome).toBe('unchanged');
    const merged = await a.post(`/sessions/${id}/members/add`, manager, { items: [{ user: { userId: byId.id }, roles: ['session_supporter'] }], onExisting: 'merge' });
    expect(merged.body.data.items[0]).toMatchObject({ outcome: 'merged', member: { roles: ['session_supporter', 'teacher'] } });
    expect((await a.post(`/sessions/${id}/members/add`, manager, { items: [{ user: { userId: byId.id } }], onExisting: 'replace' })).status).toBe(400);
    // شماره هرگز ذخیره نمی‌شود
    const leak = (await t.ds.query("SELECT COUNT(*) AS n FROM outbox_events WHERE payload LIKE '%0912000000%'")) as { n: string }[];
    expect(Number(leak[0]!.n)).toBe(0);
  });

  it('pending/rejected ⇒ approved؛ ظرفیت ⇒ full؛ جلسهٔ ended ⇒ SESSION_LOCKED', async () => {
    const { id, manager } = await room({ capacity: 3 });
    const p = await mkUser(t, 'درخواست‌دهنده');
    await a.post(`/sessions/${id}/members`, p);
    const x = await mkUser(t, 'اضافه');
    const y = await mkUser(t, 'سرریز');
    const r = await a.post(`/sessions/${id}/members/add`, manager, { items: [{ user: { userId: p.id } }, { user: { userId: x.id } }, { user: { userId: y.id } }] });
    expect(r.body.data.items.map((i: { outcome: string }) => i.outcome)).toEqual(['approved', 'added', 'full']);
    expect(r.body.data.items[2].member).toBeNull();
    await a.post(`/sessions/${id}/transition`, manager, { to: 'ended' });
    const locked = await a.post(`/sessions/${id}/members/add`, manager, { items: [{ user: { userId: y.id } }] });
    expect(locked.status).toBe(409);
    expect(reason(locked)).toBe('SESSION_LOCKED');
  });

  it('مجوز: پشتیبان فقط quran_student؛ معلم/قرآن‌آموز 403؛ نقش مدیر از این مسیر 400', async () => {
    const { id, manager } = await room();
    const sup = await mkUser(t, 'پشتیبان افزودن');
    const tch = await mkUser(t, 'معلم افزودن');
    await join(t, id, manager, sup, ['session_supporter']);
    await join(t, id, manager, tch, ['teacher']);
    const u = await mkUser(t, 'هدف');
    expect((await a.post(`/sessions/${id}/members/add`, sup, { items: [{ user: { userId: u.id }, roles: ['teacher'] }] })).status).toBe(403);
    expect((await a.post(`/sessions/${id}/members/add`, sup, { items: [{ user: { userId: u.id } }] })).body.data.items[0].outcome).toBe('added');
    expect((await a.post(`/sessions/${id}/members/add`, tch, { items: [{ user: { userId: u.id } }] })).status).toBe(403);
    expect((await a.post(`/sessions/${id}/members/add`, manager, { items: [{ user: { userId: u.id }, roles: ['session_manager'] }] })).status).toBe(400);
    expect((await a.post(`/sessions/${id}/members/add`, manager, { items: [{ user: { userId: u.id, phone: '09120000001' } }] })).status).toBe(400);
  });

  it('کاربر غیرفعال/حذف‌شده با userId ⇒ not_active؛ low در دسترس نیست ⇒ 503؛ سقف durable شماره (۲۰/دقیقه) ⇒ RATE_LIMITED', async () => {
    const { id, manager } = await room();
    const dis = await mkUser(t, 'غیرفعال شده');
    await t.ds.query("UPDATE user_directory SET status = 'disabled' WHERE user_id = ?", [bin(dis.id)]);
    expect((await a.post(`/sessions/${id}/members/add`, manager, { items: [{ user: { userId: dis.id } }] })).body.data.items[0].outcome).toBe('not_active');
    t.low.resolveStatus = 500;
    try {
      const down = await a.post(`/sessions/${id}/members/add`, manager, { items: [{ user: { phone: '09121111111' } }] });
      expect(down.status).toBe(503);
    } finally {
      t.low.resolveStatus = 200;
    }
    const phones = Array.from({ length: 19 }, (_, i) => ({ user: { phone: `0913${String(i).padStart(7, '0')}` } }));
    const ok = await a.post(`/sessions/${id}/members/add`, manager, { items: phones });
    expect(ok.status).toBe(200); // ۱ + ۱۹ = ۲۰
    const before = t.low.resolveCalls;
    const over = await a.post(`/sessions/${id}/members/add`, manager, { items: [{ user: { phone: '09140000000' } }] });
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('RATE_LIMITED');
    expect(t.low.resolveCalls).toBe(before); // بدون فراخوانی low
  });
});

describe('M-15 حذف / M-17 ترک: صف پاک، امتیاز می‌ماند', () => {
  async function present(id: string, manager: User, roles: string[] = []) {
    const u = await mkUser(t, `حاضر ${Math.random().toString(36).slice(2, 6)}`);
    const memberId = await join(t, id, manager, u, roles);
    await a.post(`/sessions/${id}/attendance`, u);
    return { u, memberId };
  }
  const queued = async (sid: string, uid: string) => Number(((await t.ds.query("SELECT COUNT(*) AS n FROM queue_items WHERE session_id = ? AND user_id = ? AND status IN ('waiting','current')", [bin(sid), bin(uid)])) as { n: string }[])[0]!.n);
  const points = async (uid: string) => Number(((await t.ds.query('SELECT COALESCE(SUM(points),0) AS n FROM point_ledger WHERE user_id = ?', [bin(uid)])) as { n: string }[])[0]!.n);

  it('M-15 مدیر: عضو حذف، صف فعال پاک، حضور/امتیاز می‌ماند، اعلان، members.updated؛ مدیر ⇒ SESSION_MANAGER_PROTECTED', async () => {
    const { id, manager } = await room();
    const { u, memberId } = await present(id, manager);
    await a.post(`/sessions/${id}/queue`, u);
    expect(await queued(id, u.id)).toBe(1);
    const pts = await points(u.id);
    expect(pts).toBeGreaterThan(0);
    const emit = vi.spyOn(t.live, 'emit');
    try {
      expect((await a.del(`/sessions/${id}/members/${memberId}`, manager)).status).toBe(200);
      expect(emit.mock.calls.filter((c) => c[0] === id).map((c) => c[1])).toEqual(expect.arrayContaining(['members.updated', 'queue.updated']));
    } finally {
      emit.mockRestore();
    }
    expect(await queued(id, u.id)).toBe(0);
    expect(await points(u.id)).toBe(pts);
    expect(Number(((await t.ds.query('SELECT COUNT(*) AS n FROM attendance_entries WHERE session_id = ? AND user_id = ?', [bin(id), bin(u.id)])) as { n: string }[])[0]!.n)).toBe(1);
    expect((await inboxFor(u.id)).some((x) => x.title === 'حذف از جلسه')).toBe(true);
    const mgrMember = ((await a.get(`/sessions/${id}/members?role=session_manager`, manager)).body.data as { id: string }[])[0]!.id;
    expect(reason(await a.del(`/sessions/${id}/members/${mgrMember}`, manager))).toBe('SESSION_MANAGER_PROTECTED');
    expect((await a.del(`/sessions/${id}/members/${memberId}`, manager)).status).toBe(404);
  });

  it('M-15 پشتیبان: قرآن‌آموز و درخواست مجاز؛ معلم 403', async () => {
    const { id, manager } = await room();
    const sup = await mkUser(t, 'پشتیبان حذف');
    await join(t, id, manager, sup, ['session_supporter']);
    const { memberId: stu } = await present(id, manager);
    const { memberId: tch } = await present(id, manager, ['teacher']);
    const pend = (await a.post(`/sessions/${id}/members`, await mkUser(t, 'درخواست حذف'))).body.data.id;
    expect((await a.del(`/sessions/${id}/members/${tch}`, sup)).status).toBe(403);
    expect((await a.del(`/sessions/${id}/members/${stu}`, sup)).status).toBe(200);
    expect((await a.del(`/sessions/${id}/members/${pend}`, sup)).status).toBe(200);
  });

  it('M-17: ترک (صف پاک، امتیاز می‌ماند)؛ لغو درخواست؛ آخرین مدیر LAST_HOLDER؛ غیرعضو 404', async () => {
    const { id, manager } = await room();
    const { u } = await present(id, manager);
    await a.post(`/sessions/${id}/queue`, u);
    const pts = await points(u.id);
    expect((await a.del(`/sessions/${id}/membership`, u)).status).toBe(200);
    expect(await queued(id, u.id)).toBe(0);
    expect(await points(u.id)).toBe(pts);
    expect((await a.get(`/sessions/${id}/me`, u)).body.data.membership).toBeNull();
    const p = await mkUser(t, 'لغوکننده');
    await a.post(`/sessions/${id}/members`, p);
    expect((await a.del(`/sessions/${id}/membership`, p)).status).toBe(200);
    expect(await memberOf(id, p.id)).toBeUndefined();
    const last = await a.del(`/sessions/${id}/membership`, manager);
    expect(last.status).toBe(409);
    expect(reason(last)).toBe('LAST_HOLDER');
    expect((await a.del(`/sessions/${id}/membership`, await mkUser(t, 'غریبه'))).status).toBe(404);
  });
});

describe('دعوت M-50..M-53', () => {
  it('ساخت (کد ۲۲ نویسه، فقط hash ذخیره)، فهرست بدون کد، پذیرش، عضو موجود، منقضی/باطل/تمام', async () => {
    const { id, manager } = await room();
    const c = await a.post(`/sessions/${id}/invites`, manager, { roles: ['teacher'], maxUses: 1, expiresInHours: 1 });
    expect(c.status).toBe(200);
    const inv = mid.CreatedInvite.parse(c.body.data);
    expect(inv.code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const stored = (await t.ds.query('SELECT HEX(code_hash) AS h FROM session_invites WHERE id = ?', [bin(inv.id)])) as { h: string }[];
    expect(stored[0]!.h).not.toContain(Buffer.from(inv.code).toString('hex').toUpperCase());
    const list = await a.get(`/sessions/${id}/invites`, manager);
    expect(list.body.data[0]).not.toHaveProperty('code');
    mid.Invite.parse(list.body.data[0]);
    const u = await mkUser(t, 'دعوت‌شده');
    const acc = await a.post('/invites/accept', u, { code: inv.code });
    expect(acc.status).toBe(200);
    expect(acc.body.data).toMatchObject({ status: 'approved', roles: ['teacher'] });
    expect((await memberOf(id, u.id))!.source).toBe('invite');
    // عضو موجود ⇒ همان عضویت بدون مصرف
    expect((await a.post('/invites/accept', u, { code: inv.code })).body.data.id).toBe(acc.body.data.id);
    const ex = await a.post('/invites/accept', await mkUser(t, 'دیرکرده'), { code: inv.code });
    expect(reason(ex)).toBe('INVITE_EXHAUSTED');
    // منقضی
    const c2 = (await a.post(`/sessions/${id}/invites`, manager, { expiresInHours: 1 })).body.data;
    t.clock.advance(3_600_001);
    manager.h.Authorization = `Bearer ${await t.low.sign({ sub: manager.id, perms: ['session.create'] })}`;
    u.h.Authorization = `Bearer ${await t.low.sign({ sub: u.id })}`;
    expect(reason(await a.post('/invites/accept', await mkUser(t, 'دیر'), { code: c2.code }))).toBe('INVITE_EXPIRED');
    // باطل
    const c3 = (await a.post(`/sessions/${id}/invites`, manager, {})).body.data;
    expect((await a.del(`/sessions/${id}/invites/${c3.id}`, manager)).status).toBe(200);
    expect((await a.del(`/sessions/${id}/invites/${c3.id}`, manager)).status).toBe(200);
    expect(reason(await a.post('/invites/accept', await mkUser(t, 'باطل'), { code: c3.code }))).toBe('INVITE_EXPIRED');
    expect((await a.post('/invites/accept', u, { code: 'A'.repeat(22) })).status).toBe(404);
    expect((await a.post('/invites/accept', u, { code: 'short' })).status).toBe(400);
  });

  it('pending ⇒ approved با دعوت؛ مجوز نقش کادر؛ ۲۰ دعوت فعال ⇒ LIMIT_REACHED؛ ظرفیت ⇒ SESSION_FULL', async () => {
    const { id, manager } = await room({ capacity: 2 });
    const sup = await mkUser(t, 'پشتیبان دعوت');
    await join(t, id, manager, sup, ['session_supporter']);
    expect((await a.post(`/sessions/${id}/invites`, sup, { roles: ['teacher'] })).status).toBe(403);
    const code = (await a.post(`/sessions/${id}/invites`, sup, {})).body.data.code as string;
    expect(reason(await a.post('/invites/accept', await mkUser(t, 'پر'), { code }))).toBe('SESSION_FULL');
    const { id: id2, manager: m2 } = await room();
    const p = await mkUser(t, 'منتظر دعوت');
    const pm = (await a.post(`/sessions/${id2}/members`, p)).body.data.id;
    const code2 = (await a.post(`/sessions/${id2}/invites`, m2, {})).body.data.code as string;
    expect((await a.post('/invites/accept', p, { code: code2 })).body.data).toMatchObject({ id: pm, status: 'approved', roles: ['quran_student'] });
    for (let i = 0; i < 19; i++) {
      if (i % 9 === 8) t.clock.advance(61_000); // سقف ۱۰/دقیقهٔ M-50
      expect((await a.post(`/sessions/${id2}/invites`, m2, {})).status).toBe(200);
    }
    t.clock.advance(61_000);
    const lim = await a.post(`/sessions/${id2}/invites`, m2, {});
    expect(lim.status).toBe(409);
    expect(reason(lim)).toBe('LIMIT_REACHED');
  });

  it('پذیرش هم‌زمان با maxUses=1 ⇒ دقیقاً یک عضو', async () => {
    const { id, manager } = await room();
    const code = (await a.post(`/sessions/${id}/invites`, manager, { maxUses: 1 })).body.data.code as string;
    const users = await Promise.all(Array.from({ length: 6 }, (_, i) => mkUser(t, `هم‌زمان ${i}`)));
    const rs = await Promise.all(users.map((u) => a.post('/invites/accept', u, { code })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => reason(r) === 'INVITE_EXHAUSTED')).toHaveLength(5);
    expect(Number(((await t.ds.query('SELECT uses FROM session_invites WHERE session_id = ?', [bin(id)])) as { uses: number }[])[0]!.uses)).toBe(1);
  });
});

describe('android-low (D1)', () => {
  it('فقط endpointهای مجاز؛ بقیه AUTH_FORBIDDEN؛ بقیهٔ کلاینت‌ها بی‌تغییر', async () => {
    const m = await creator(t);
    const s = await mkSession(t, m, 'started');
    const u = await mkUser(t, 'اندروید');
    const al = { 'X-Isra-Client': 'android-low' };
    const g = (p: string, who: User, h: Record<string, string> = al) => request(t.http).get(`/o/v1${p}`).set({ ...who.h, ...h });
    expect((await g('/me', u)).status).toBe(200);
    expect((await g('/me/sessions', u)).status).toBe(200);
    expect((await g('/sessions', u)).status).toBe(200);
    expect((await request(t.http).post(`/o/v1/sessions/${s}/members`).set({ ...u.h, ...al }).send({})).status).toBe(200);
    expect((await g(`/sessions/${s}/me`, u)).status).toBe(200);
    const create = await request(t.http).post('/o/v1/sessions').set({ ...m.h, ...al }).send(sessionBody());
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe('AUTH_FORBIDDEN');
    expect((await g(`/sessions/${s}/members`, m)).status).toBe(403);
    expect((await request(t.http).post(`/o/v1/sessions/${s}/members/add`).set({ ...m.h, ...al }).send({ items: [{ user: { userId: u.id } }] })).status).toBe(403);
    expect((await request(t.http).post('/o/v1/sessions').set({ ...m.h, 'X-Isra-Client': 'android-mid' }).send(sessionBody())).status).toBe(200);
    expect((await request(t.http).get('/o/health/live').set(al)).status).toBeLessThan(400);
  });
});

describe('Socket.IO: اخراج و حریم queue.turned', () => {
  const connect = (token: string): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const s = client(`http://127.0.0.1:${t.port}`, { path: '/o/v1/socket.io', transports: ['websocket'], auth: { token }, reconnection: false, forceNew: true });
      s.on('connect', () => resolve(s));
      s.on('connect_error', (e) => reject(e));
    });
  const joinRoom = (s: Socket, sessionId: string) => new Promise<{ ok: boolean }>((r) => s.emit('session.join', { sessionId }, r));
  const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));

  it('حذف/ترک ⇒ socket کاربر از اتاق خارج و رویدادهای بعدی را نمی‌گیرد؛ members.updated به بقیه', async () => {
    const { id, manager } = await room();
    const u = await mkUser(t, 'اخراجی');
    const memberId = await join(t, id, manager, u);
    const sU = await connect(u.token);
    const sM = await connect(manager.token);
    try {
      expect(await joinRoom(sU, id)).toEqual({ ok: true });
      expect(await joinRoom(sM, id)).toEqual({ ok: true });
      const gotU: string[] = [];
      const gotM: string[] = [];
      sU.on('live', (e) => gotU.push(e.type));
      sM.on('live', (e) => gotM.push(e.type));
      await a.del(`/sessions/${id}/members/${memberId}`, manager);
      await wait();
      expect(gotM).toContain('members.updated');
      gotU.length = 0;
      await a.post(`/sessions/${id}/members`, await mkUser(t, 'تازه'));
      await wait();
      expect(gotM.filter((x) => x === 'members.updated').length).toBeGreaterThanOrEqual(2);
      expect(gotU).toEqual([]);
    } finally {
      sU.disconnect();
      sM.disconnect();
    }
  });

  it('queue.turned: userId فقط به کادر و خود نفر؛ قرآن‌آموز دیگر بدون userId', async () => {
    const { id, manager } = await room();
    const teacher = await mkUser(t, 'معلم سوکت');
    const s1 = await mkUser(t, 'نفر اول');
    const s2 = await mkUser(t, 'نفر دوم');
    await join(t, id, manager, teacher, ['teacher']);
    for (const s of [s1, s2]) {
      await join(t, id, manager, s);
      await a.post(`/sessions/${id}/attendance`, s);
      await a.post(`/sessions/${id}/queue`, s);
    }
    const sockets = await Promise.all([teacher, s1, s2].map((u) => connect(u.token)));
    try {
      for (const s of sockets) expect(await joinRoom(s, id)).toEqual({ ok: true });
      const turned = sockets.map(() => [] as any[]);
      sockets.forEach((s, i) => s.on('live', (e) => e.type === 'queue.turned' && turned[i]!.push(e)));
      await a.post(`/sessions/${id}/queue/next`, teacher);
      await wait(250);
      expect(turned[0]![0]).toMatchObject({ sessionId: id, payload: { userId: s1.id } });
      expect(turned[1]![0]).toMatchObject({ payload: { userId: s1.id } });
      expect(turned[2]).toHaveLength(1);
      expect(turned[2]![0].payload?.userId).toBeUndefined();
    } finally {
      sockets.forEach((s) => s.disconnect());
    }
  });
});

describe('MID_ADMIN عضویت', () => {
  it('membersAdd: ساخت ردیف دایرکتوری با نام، ended مجاز، replace با حفظ مدیر، Idempotency-Key', async () => {
    const { id, manager } = await room();
    await a.post(`/sessions/${id}/transition`, manager, { to: 'ended' });
    const actor = randomUUID();
    const fresh = uuidv7();
    const body = { actorId: actor, items: [{ userId: fresh, roles: ['teacher'], firstName: 'تازه', lastName: 'وارد' }, { userId: manager.id, roles: ['teacher'] }], onExisting: 'replace' };
    const key = `k-${randomUUID()}`;
    const r = await ad.post(`/admin/sessions/${id}/members/add`, body, { 'Idempotency-Key': key });
    expect(r.status).toBe(200);
    const res = internal.MidAdminAddMembersResult.parse(r.body.data);
    expect(res.items.map((i) => i.outcome)).toEqual(['added', 'replaced']);
    expect(res.items[0]!.member).toMatchObject({ name: 'تازه وارد', phone: null, roles: ['teacher'] });
    expect(res.items[1]!.member!.roles).toEqual(['session_manager', 'teacher']);
    expect((await memberOf(id, fresh))!.source).toBe('admin');
    const again = await ad.post(`/admin/sessions/${id}/members/add`, body, { 'Idempotency-Key': key });
    expect(again.body.data).toEqual(r.body.data);
    expect(reason(await ad.post(`/admin/sessions/${id}/members/add`, { ...body, onExisting: 'skip' }, { 'Idempotency-Key': key }))).toBe('IDEMPOTENCY_KEY_REUSED');
    expect((await ad.post(`/admin/sessions/${randomUUID()}/members/add`, body)).status).toBe(404);
  });

  it('membersDecide گروهی با ظرفیت؛ members فیلتر role/q/userId', async () => {
    const { id, manager } = await room({ capacity: 3 });
    const us = await Promise.all([1, 2, 3].map((i) => mkUser(t, `گروهی ${i}`)));
    const ids = [] as string[];
    for (const u of us) ids.push((await a.post(`/sessions/${id}/members`, u)).body.data.id);
    const r = await ad.post(`/admin/sessions/${id}/members/decide`, { actorId: randomUUID(), memberIds: [...ids, randomUUID()], action: 'approve' });
    expect(r.status).toBe(200);
    expect(internal.MidAdminDecideBulkResult.parse(r.body.data).items.map((i) => i.outcome)).toEqual(['approved', 'approved', 'full', 'not_found']);
    const rej = await ad.post(`/admin/sessions/${id}/members/decide`, { actorId: randomUUID(), memberIds: [ids[0], ids[2]], action: 'reject' });
    expect(rej.body.data.items.map((i: { outcome: string }) => i.outcome)).toEqual(['skipped', 'rejected']);
    const byUser = await ad.get(`/admin/sessions/${id}/members?userId=${us[1]!.id}`);
    expect(byUser.body.data.map((x: { userId: string }) => x.userId)).toEqual([us[1]!.id]);
    expect((await ad.get(`/admin/sessions/${id}/members?role=session_manager`)).body.data.map((x: { userId: string }) => x.userId)).toEqual([manager.id]);
    expect((await ad.get(`/admin/sessions/${id}/members?q=${encodeURIComponent('گروهی 3')}`)).body.meta.total).toBe(1);
    for (const x of (await ad.get(`/admin/sessions/${id}/members`)).body.data) high.AdminMember.parse(x);
  });

  it('manager (H-74): انتقال با demote/remove، کاربر تازه، transferCreator؛ غیرفعال ⇒ USER_NOT_ACTIVE', async () => {
    const { id, manager } = await room();
    const co = await mkUser(t, 'هم‌مدیر');
    const coMember = await join(t, id, manager, co);
    await a.put(`/sessions/${id}/members/${coMember}/manager`, manager, { manager: true });
    const next = uuidv7();
    const r = await ad.put(`/admin/sessions/${id}/manager`, { actorId: randomUUID(), userId: next, previous: 'demote', previousRoles: ['teacher'], transferCreator: true, firstName: 'مدیر', lastName: 'نو' });
    expect(r.status).toBe(200);
    const s = high.AdminSession.parse(r.body.data);
    expect(s.createdBy).toEqual({ id: next, name: 'مدیر نو' });
    expect(s.counts.managers).toBe(1);
    const roles = async (uid: string) => ((await ad.get(`/admin/sessions/${id}/members?userId=${uid}`)).body.data[0]?.roles ?? null) as string[] | null;
    expect(await roles(manager.id)).toEqual(['teacher']);
    expect(await roles(co.id)).toEqual(['teacher']);
    expect(await roles(next)).toEqual(['session_manager']);
    const r2 = await ad.put(`/admin/sessions/${id}/manager`, { actorId: randomUUID(), userId: co.id, previous: 'remove' });
    expect(r2.status).toBe(200);
    expect(await roles(next)).toBeNull();
    expect(await roles(co.id)).toEqual(['session_manager', 'teacher']);
    const dis = await mkUser(t, 'غیرفعال مدیر');
    await t.ds.query("UPDATE user_directory SET status = 'disabled' WHERE user_id = ?", [bin(dis.id)]);
    expect(reason(await ad.put(`/admin/sessions/${id}/manager`, { actorId: randomUUID(), userId: dis.id }))).toBe('USER_NOT_ACTIVE');
  });

  it('userMemberships و notify (فیلتر نقش، idempotent per broadcastId، ref نامعتبر 400)', async () => {
    const { id, manager } = await room();
    const tch = await mkUser(t, 'معلم پیام');
    const stu = await mkUser(t, 'شاگرد پیام');
    await join(t, id, manager, tch, ['teacher']);
    await join(t, id, manager, stu);
    await a.post(`/sessions/${id}/attendance`, stu);
    const um = await ad.get(`/admin/users/${stu.id}/memberships`);
    expect(um.status).toBe(200);
    const item = internal.MidAdminUserMembership.parse(um.body.data[0]);
    expect(item).toMatchObject({ attendanceCount: 1, points: 5, status: 'approved', roles: ['quran_student'] });
    expect(item.session.id).toBe(id);
    expect((await ad.get(`/admin/users/${stu.id}/memberships?role=teacher`)).body.meta.total).toBe(0);
    const bid = randomUUID();
    const body = { actorId: randomUUID(), broadcastId: bid, roles: ['teacher'], title: 'اطلاعیه', body: 'متن اطلاعیه', ref: `announcement:${bid}` };
    const n = await ad.post(`/admin/sessions/${id}/notify`, body);
    expect(n.body.data).toEqual({ recipients: 1 });
    expect((await ad.post(`/admin/sessions/${id}/notify`, body)).body.data).toEqual({ recipients: 1 });
    expect((await inboxFor(tch.id)).filter((x) => x.kind === 'announcement')).toHaveLength(1);
    expect((await inboxFor(stu.id)).filter((x) => x.kind === 'announcement')).toHaveLength(0);
    const all = await ad.post(`/admin/sessions/${id}/notify`, { ...body, broadcastId: randomUUID(), roles: undefined });
    expect(all.body.data.recipients).toBe(3);
    expect((await ad.post(`/admin/sessions/${id}/notify`, { ...body, broadcastId: randomUUID(), ref: 'javascript:x' })).status).toBe(400);
  });

  it('sessions create: creatorId باید در دایرکتوری و active باشد', async () => {
    expect((await ad.post('/admin/sessions', { creatorId: uuidv7(), session: sessionBody() })).status).toBe(404);
    const d = await mkUser(t, 'سازندهٔ غیرفعال');
    await t.ds.query("UPDATE user_directory SET status = 'disabled' WHERE user_id = ?", [bin(d.id)]);
    expect(reason(await ad.post('/admin/sessions', { creatorId: d.id, session: sessionBody() }))).toBe('USER_NOT_ACTIVE');
  });
});

describe('رویدادها و outbox', () => {
  const send = (type: string, payload: object) =>
    request(t.http).post('/o/internal/v1/events').set({ 'X-Internal-Caller': 'low', 'X-Internal-Token': LOW }).send({ eventId: randomUUID(), type, occurredAt: new Date().toISOString(), payload });
  const dir = async (id: string) => ((await t.ds.query('SELECT first_name AS f, last_name AS l, status AS s FROM user_directory WHERE user_id = ?', [bin(id)])) as { f: string; l: string; s: string }[])[0];

  it('user.registered نام را ذخیره می‌کند؛ status.changed همهٔ وضعیت‌ها؛ deleted ⇒ صف فعال حذف', async () => {
    const uid = uuidv7();
    expect((await send('user.registered', { userId: uid, phone: '09120000000', firstName: 'ثبت', lastName: 'نامی' })).status).toBe(202);
    expect(await dir(uid)).toEqual({ f: 'ثبت', l: 'نامی', s: 'active' });
    await send('user.status.changed', { userId: uid, status: 'disabled', changedAt: new Date().toISOString() });
    expect((await dir(uid))!.s).toBe('disabled');
    const { id, manager } = await room();
    const u = await mkUser(t, 'حذفی صف');
    await join(t, id, manager, u);
    await a.post(`/sessions/${id}/attendance`, u);
    await a.post(`/sessions/${id}/queue`, u);
    await send('user.status.changed', { userId: u.id, status: 'deleted', changedAt: new Date().toISOString(), anonymizedPhone: 'd0123456789' });
    expect((await dir(u.id))!.s).toBe('deleted');
    expect(Number(((await t.ds.query("SELECT COUNT(*) AS n FROM queue_items WHERE user_id = ? AND status IN ('waiting','current')", [bin(u.id)])) as { n: string }[])[0]!.n)).toBe(0);
    await send('user.status.changed', { userId: u.id, status: 'active', changedAt: new Date().toISOString() });
    expect((await dir(u.id))!.s).toBe('deleted');
  });

  it('outbox: مسیریابی per نوع (فقط مصرف‌کننده)؛ نوع بی‌مصرف‌کننده ارسال نمی‌شود', async () => {
    expect(routesFor('inbox.messages.created')).toEqual(['low']);
    expect(routesFor('points.changed')).toEqual(['low']);
    expect(routesFor('totally.unknown')).toEqual([]);
    await t.ds.query('DELETE FROM outbox_events');
    t.low.events.length = 0;
    t.low.eventStatus = 202;
    const now = t.clock.now();
    await t.ds.query("INSERT INTO outbox_events (id, type, payload, created_at, attempts, next_attempt_at) VALUES (?, 'totally.unknown', '{}', ?, 0, ?), (?, 'inbox.messages.created', ?, ?, 0, ?)", [
      bin(uuidv7()),
      now,
      now,
      bin(uuidv7()),
      JSON.stringify({ items: [{ userId: uuidv7(), kind: 'system', title: 'x', body: 'y', ref: null }] }),
      now,
      now
    ]);
    const svc = t.app.get(OutboxService);
    expect(await svc.tick()).toBe(2);
    expect(t.low.events.map((e) => e.body.type)).toEqual(['inbox.messages.created']);
    expect(Number(((await t.ds.query('SELECT COUNT(*) AS n FROM outbox_events WHERE published_at IS NULL')) as { n: string }[])[0]!.n)).toBe(0);
  });
});
