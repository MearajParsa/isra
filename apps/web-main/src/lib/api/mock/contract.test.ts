/**
 * مطابقت mock با قرارداد قفل‌شده (@isra/api-types): هر پاسخ mock باید با schema سرور بخواند.
 * اگر قرارداد عوض شود و mock/وب نه، این تست می‌شکند.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { low, mid } from '@isra/api-types';
import { markReady } from './control';
import { midMockApi as m } from './midMock';
import { mockApi as l } from './mockApi';

const dev = { deviceId: '6f3c2a10-0000-4000-8000-0000000000aa', deviceLabel: 'Test' };
const S2 = '6f3c2a10-0000-4000-8000-000000000002';
const S5 = '6f3c2a10-0000-4000-8000-000000000005';
const S1 = '6f3c2a10-0000-4000-8000-000000000001';

/** هر schema از @isra/api-types (zod) — فقط safeParse لازم است */
type Schema = { safeParse(v: unknown): { success: boolean; error?: { issues: unknown[] } } };

function conforms(schema: Schema, value: unknown, label: string) {
  const r = schema.safeParse(value);
  expect(r.success, `${label}: ${r.success ? '' : JSON.stringify(r.error?.issues.slice(0, 3))}`).toBe(true);
}

let t = '';
beforeAll(async () => {
  markReady();
  const res = await l.auth.loginPassword({ phone: '09121234567', password: 'isra1234', ...dev });
  t = res.accessToken;
  conforms(low.AuthResult, res, 'L-03 AuthResult');
});

describe('mock low ⇄ قرارداد', () => {
  it('auth', async () => {
    const ch = await l.auth.requestOtp('09351230001');
    conforms(low.OtpChallenge, ch, 'L-01');
    conforms(low.AuthResult, await l.auth.verifyOtp({ challengeId: ch.challengeId, code: '12345', ...dev }), 'L-02');
    conforms(low.RefreshResult, await l.auth.refresh(), 'L-04');
    const su = await l.auth.stepUpRequest(t);
    conforms(low.OtpChallenge, su, 'L-06');
    conforms(low.StepUpResult, await l.auth.stepUpVerify(t, { challengeId: su.challengeId, code: '12345' }), 'L-07');
  });
  it('me / sessions / inbox / points', async () => {
    conforms(low.Me, await l.me.get(t), 'L-10');
    conforms(low.Profile, await l.me.updateProfile(t, { firstName: 'سارا' }), 'L-12');
    for (const s of await l.me.listSessions(t)) conforms(low.DeviceSession, s, 'L-14');
    for (const i of (await l.me.inbox(t, { pageSize: 50 })).items) conforms(low.InboxItem, i, 'L-17');
    conforms(low.UnreadCount, { count: await l.me.unreadCount(t) }, 'L-18');
    conforms(low.PointsSummary, await l.me.points(t), 'L-21');
  });
  it('محتوای عمومی', async () => {
    const list = await l.publicContent.listSessions({ pageSize: 50 });
    expect(list.items.length).toBeGreaterThan(0);
    for (const s of list.items) conforms(low.PublicSession, s, `L-30 ${s.id}`);
    conforms(low.PublicSession, await l.publicContent.getSession(list.items[0]!.id), 'L-31');
  });
});

describe('mock mid ⇄ قرارداد', () => {
  it('کاربر و جلسه‌ها', async () => {
    conforms(mid.MidMe, await m.me.get(t), 'M-00');
    for (const i of await m.me.sessions(t, 'all')) conforms(mid.MySessionItem, i, 'M-01');
    for (const id of [S1, S2, S5]) conforms(mid.SessionMe, await m.sessions.me(t, id), `M-02 ${id}`);
  });
  it('ساخت جلسه', async () => {
    const input = { title: 'جلسهٔ قرارداد', description: 'توضیحات کافی برای تست قرارداد.', location: { label: 'آنلاین' }, schedule: { type: 'recurring' as const, weekdays: [1], timeOfDay: '18:00', durationMin: 60 } };
    conforms(mid.SessionInput, input, 'ورودی M-03');
    const s = await m.sessions.create(t, input);
    conforms(mid.MidSession, s, 'M-03');
    conforms(mid.MidSession, await m.sessions.transition(t, s.id, 'scheduled'), 'M-05');
  });
  it('عضویت، حضور، صف، ارزیابی', async () => {
    for (const x of await m.members.list(t, S1)) conforms(mid.Member, x, 'M-11');
    conforms(mid.AttendanceList, await m.attendance.list(t, S2), 'M-21');
    conforms(mid.AttendanceResult, await m.attendance.checkIn(t, S5), 'M-20');
    conforms(mid.AttendanceResult, await m.attendance.checkIn(t, S5), 'M-20 تکراری');
    const q = await m.queue.state(t, S2);
    conforms(mid.QueueState, q, 'M-32 کادر');
    conforms(mid.QueueState, await m.queue.state(t, S5), 'M-32 قرآن‌آموز');
    conforms(mid.QueueItem, await m.queue.join(t, S5), 'M-30');
    conforms(mid.QueueState, await m.queue.next(t, S2), 'M-33');
    const cur = (await m.queue.state(t, S2)).current!;
    const body = { queueItemId: cur.id, voice: 8, tone: 7, tajweed: 9 };
    conforms(mid.EvaluationBody, body, 'ورودی M-40');
    conforms(mid.Evaluation, await m.evaluations.submit(t, S2, body), 'M-40');
    for (const e of (await m.evaluations.list(t, S2)).items) conforms(mid.Evaluation, e, 'M-41');
    conforms(mid.EvaluationWeights, m.evaluations.weights(), 'وزن‌ها');
  });
});
