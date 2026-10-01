import { beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '../types';
import { markReady } from './control';
import { midMockApi as mid } from './midMock';
import { mockApi as low } from './mockApi';

const dev = { deviceId: 'd', deviceLabel: 'T' };
const S2 = '6f3c2a10-0000-4000-8000-000000000002'; // started؛ demo = manager + teacher
const S1 = '6f3c2a10-0000-4000-8000-000000000001'; // scheduled؛ demo = manager
const S3 = '6f3c2a10-0000-4000-8000-000000000003'; // scheduled؛ demo = supporter
const S5 = '6f3c2a10-0000-4000-8000-000000000005'; // started؛ demo = student
const S11 = '6f3c2a10-0000-4000-8000-000000000011'; // draft؛ demo = manager

let staff = '';
let stranger = '';

async function code(c: Promise<unknown>) {
  try {
    await c;
    return 'OK';
  } catch (e) {
    return e instanceof ApiError ? (e.details.reason ? `${e.code}:${e.details.reason}` : e.code) : 'ERR';
  }
}

beforeAll(async () => {
  markReady();
  staff = (await low.auth.loginPassword({ phone: '09121234567', password: 'isra1234', ...dev })).accessToken;
  const ch = await low.auth.requestOtp('09350001111'.replace('1111', '2222'));
  stranger = (await low.auth.verifyOtp({ challengeId: ch.challengeId, code: '12345', ...dev })).accessToken;
});

describe('ارزیابی: manager تنها نه؛ معلم/پشتیبان بله', () => {
  it('manager+teacher (s2) می‌تواند ارزیابی کند و تکراری رد می‌شود', async () => {
    const q = await mid.queue.state(staff, S2);
    const cur = q.current!;
    const ev = await mid.evaluations.submit(staff, S2, { queueItemId: cur.id, voice: 8, tone: 7, tajweed: 9 });
    expect(ev.score).toBe(80);
    expect(ev.weights).toEqual({ voice: 40, tone: 30, tajweed: 30 });
    expect(await code(mid.evaluations.submit(staff, S2, { queueItemId: cur.id, voice: 5, tone: 5, tajweed: 5 }))).toBe('CONFLICT:ALREADY_EVALUATED');
  });
  it('supporter (s3) مجوز eval دارد ولی student (s5) و غیرعضو ندارد', async () => {
    expect((await mid.sessions.me(staff, S3)).permissions).toContain('eval.submit');
    expect(await code(mid.evaluations.submit(staff, S5, { queueItemId: 'q-6', voice: 5, tone: 5, tajweed: 5 }))).toBe('AUTH_FORBIDDEN');
    expect(await code(mid.evaluations.submit(stranger, S2, { queueItemId: 'q-2', voice: 5, tone: 5, tajweed: 5 }))).toBe('AUTH_FORBIDDEN');
  });
  it('manager تنها (s1) مجوز eval.submit ندارد', async () => {
    const me = await mid.sessions.me(staff, S1);
    expect(me.permissions).toContain('session.edit');
    expect(me.permissions).not.toContain('eval.submit');
    expect(await code(mid.evaluations.submit(staff, S1, { queueItemId: 'x', voice: 5, tone: 5, tajweed: 5 }))).toBe('AUTH_FORBIDDEN');
  });
});

describe('حضور: +۵ فقط یک‌بار', () => {
  it('اولین بار +۵، دومین بار بدون امتیاز', async () => {
    const before = (await low.me.points(staff)).total;
    const a = await mid.attendance.checkIn(staff, S5);
    expect(a).toMatchObject({ pointsAwarded: 5, alreadyPresent: false });
    const b = await mid.attendance.checkIn(staff, S5);
    expect(b).toMatchObject({ pointsAwarded: 0, alreadyPresent: true });
    expect((await low.me.points(staff)).total).toBe(before + 5);
  });
  it('غیرعضو یا جلسهٔ شروع‌نشده ثبت حضور ندارد', async () => {
    expect(await code(mid.attendance.checkIn(stranger, S5))).toBe('AUTH_FORBIDDEN');
    expect(await code(mid.attendance.checkIn(staff, S1))).toBe('CONFLICT:SESSION_LOCKED');
  });
  it('لیست حاضرین فقط برای کادر', async () => {
    expect((await mid.attendance.list(staff, S2)).total).toBeGreaterThan(0);
    expect(await code(mid.attendance.list(staff, S5))).toBe('AUTH_FORBIDDEN'); // student
  });
});

describe('صف', () => {
  it('student حاضر می‌پیوندد؛ تکراری رد؛ نام دیگران پنهان', async () => {
    const item = await mid.queue.join(staff, S5);
    expect(item.status).toBe('waiting');
    expect(await code(mid.queue.join(staff, S5))).toBe('CONFLICT:ALREADY_IN_QUEUE');
    const st = await mid.queue.state(staff, S5);
    expect(st.myPosition).toBeGreaterThan(0);
    expect(st.waiting.every((w) => w.isMe)).toBe(true);
    expect(st.current?.name).toBeTruthy();
    await mid.queue.leave(staff, S5);
  });
  it('پیوستن بدون حضور رد می‌شود', async () => {
    // stranger عضو نیست ⇒ forbidden
    expect(await code(mid.queue.join(stranger, S2))).toBe('AUTH_FORBIDDEN');
  });
  it('کادر صف را مدیریت می‌کند؛ student نمی‌تواند', async () => {
    expect(await code(mid.queue.next(staff, S5))).toBe('AUTH_FORBIDDEN');
    const before = await mid.queue.state(staff, S2);
    const after = await mid.queue.next(staff, S2);
    expect(after.current?.id).not.toBe(before.current?.id);
    expect(after.done.length).toBe(before.done.length + 1);
    const first = after.waiting[0];
    const moved = await mid.queue.act(staff, S2, first.id, 'down');
    expect(moved.waiting[1].id).toBe(first.id);
    const removed = await mid.queue.act(staff, S2, first.id, 'remove');
    expect(removed.waiting.find((w) => w.id === first.id)).toBeUndefined();
  });
});

describe('چرخهٔ حیات و عضویت', () => {
  it('draft → scheduled → started → ended؛ پرش و برگشت رد می‌شود', async () => {
    expect(await code(mid.sessions.transition(staff, S11, 'started'))).toBe('SESSION_INVALID_TRANSITION');
    expect((await mid.sessions.transition(staff, S11, 'scheduled')).status).toBe('scheduled');
    expect(await code(mid.sessions.transition(staff, S11, 'ended'))).toBe('SESSION_INVALID_TRANSITION');
    expect((await mid.sessions.transition(staff, S11, 'started')).status).toBe('started');
    expect((await mid.sessions.transition(staff, S11, 'ended')).status).toBe('ended');
    expect(await code(mid.sessions.transition(staff, S11, 'started'))).toBe('SESSION_INVALID_TRANSITION');
    expect(await code(mid.sessions.update(staff, S11, { title: 'عنوان جدید', description: 'توضیحات کافی است.', location: { label: 'آنلاین' }, schedule: { type: 'recurring', weekdays: [1], timeOfDay: '10:00', durationMin: 60 } }))).toBe('CONFLICT:SESSION_LOCKED');
  });
  it('فقط مدیر وضعیت را تغییر می‌دهد', async () => {
    expect(await code(mid.sessions.transition(staff, S3, 'started'))).toBe('AUTH_FORBIDDEN'); // supporter
  });
  it('درخواست عضویت، تأیید و نقش‌ها', async () => {
    const m = await mid.members.request(stranger, S1);
    expect(m.status).toBe('pending');
    expect(await code(mid.members.request(stranger, S1))).toBe('CONFLICT:ALREADY_MEMBER');
    expect(await code(mid.members.list(stranger, S1))).toBe('AUTH_FORBIDDEN');
    const ok = await mid.members.decide(staff, S1, m.id, 'approve');
    expect(ok).toMatchObject({ status: 'approved', roles: ['quran_student'] });
    expect(await code(mid.members.decide(staff, S1, m.id, 'reject'))).toBe('CONFLICT:ALREADY_DECIDED');
    const t = await mid.members.setRoles(staff, S1, m.id, ['teacher']);
    expect(t.roles).toEqual(['teacher']);
    // supporter (s3) تأیید می‌کند ولی نقش تعیین نمی‌کند
    const pending = (await mid.members.list(staff, S3, 'pending'))[0];
    expect(await code(mid.members.setRoles(staff, S3, pending.id, ['teacher']))).toBe('AUTH_FORBIDDEN');
    expect((await mid.members.decide(staff, S3, pending.id, 'reject')).status).toBe('rejected');
  });
  it('ساخت جلسه: فقط 0912…؛ اعتبارسنجی؛ سازنده manager است', async () => {
    const input = { title: 'جلسهٔ تازه', description: 'توضیحات کافی برای جلسه.', location: { label: 'آنلاین' }, schedule: { type: 'once' as const, startsAt: '2030-01-01T10:00:00Z', endsAt: '2030-01-01T11:00:00Z' } };
    expect(await code(mid.sessions.create(stranger, input))).toBe('AUTH_FORBIDDEN');
    expect(await code(mid.sessions.create(staff, { ...input, title: 'x' }))).toBe('VALIDATION_FAILED');
    const s = await mid.sessions.create(staff, input);
    expect(s.status).toBe('draft');
    expect((await mid.sessions.me(staff, s.id)).permissions).toContain('session.transition');
    expect(await code(mid.sessions.me(stranger, s.id))).toBe('NOT_FOUND');
  });
});
