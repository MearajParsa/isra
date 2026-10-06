import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENDPOINTS, type EndpointDef, PointsSummary, internal, mid } from '@isra/api-types';
import { bufToUuid, uuidToBuf, uuidv7 } from '../src/common/ids';
import { dataSourceOptions } from '../src/db/data-source';
import { OccurrencesPointsV161728600000001 } from '../src/db/migrations/1728600000001-OccurrencesPointsV16';
import { BadgesService } from '../src/domain/badges.service';
import { attendanceRef, legacyBadgeId } from '../src/domain/refs';
import { type TestApp, type User, api, creator, join, mkSession, mkUser, resetDb, sessionBody, startApp, testEnv } from './helpers/app';

const LOW = 'test-pair-low-mid-0123456789abcdef01';
const HIGH = 'test-pair-mid-high-0123456789abcdef0';

let t: TestApp;
let a: ReturnType<typeof api>;
beforeAll(async () => {
  t = await startApp();
  a = api(t);
});
afterAll(async () => t.close());

const bin = (id: string) => uuidToBuf(id);
const hdr = (caller: 'high' | 'low' = 'high') => ({ 'X-Internal-Caller': caller, 'X-Internal-Token': caller === 'high' ? HIGH : LOW });
const ad = {
  get: (p: string, caller: 'high' | 'low' = 'high') => request(t.http).get(`/o/internal/v1${p}`).set(hdr(caller)),
  post: (p: string, b: object = {}, caller: 'high' | 'low' = 'high') => request(t.http).post(`/o/internal/v1${p}`).set(hdr(caller)).send(b),
  patch: (p: string, b: object = {}) => request(t.http).patch(`/o/internal/v1${p}`).set(hdr()).send(b),
  del: (p: string) => request(t.http).delete(`/o/internal/v1${p}`).set(hdr())
};
const sendEvent = (type: string, payload: object, caller: 'low' | 'high' = 'high') =>
  request(t.http).post('/o/internal/v1/events').set(hdr(caller)).send({ eventId: randomUUID(), type, occurredAt: new Date().toISOString(), payload });
const def = (id: string) => (ENDPOINTS.mid as readonly EndpointDef[]).find((d) => d.id === id)!;
const total = async (u: User) => (await a.get('/me/points', u)).body.data.total as number;
const ledger = async (u: User) => (await t.ds.query('SELECT points, reason, ref_id FROM point_ledger WHERE user_id = ? ORDER BY created_at, id', [bin(u.id)])) as { points: number; reason: string; ref_id: Buffer }[];
const outbox = async (type: string) => ((await t.ds.query('SELECT payload FROM outbox_events WHERE type = ?', [type])) as { payload: unknown }[]).map((r) => (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload));
const recurring = { type: 'recurring', weekdays: [0, 1, 2, 3, 4, 5, 6], timeOfDay: '18:00', durationMin: 60 };

/** جلسهٔ started (پیش‌فرض once ⇒ نوبت #۱ خودکار) با مدیر، دو معلم و قرآن‌آموزها */
async function room(n = 2, schedule?: object) {
  const manager = await creator(t);
  let id: string;
  if (schedule) {
    const r = await a.post('/sessions', manager, sessionBody({ schedule }));
    id = r.body.data.id as string;
    await a.post(`/sessions/${id}/transition`, manager, { to: 'scheduled' });
    await a.post(`/sessions/${id}/transition`, manager, { to: 'started' });
  } else id = await mkSession(t, manager, 'started');
  const teacher = await mkUser(t, 'استاد اول');
  const teacher2 = await mkUser(t, 'استاد دوم');
  await join(t, id, manager, teacher, ['teacher']);
  await join(t, id, manager, teacher2, ['teacher']);
  const students: User[] = [];
  const memberIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const s = await mkUser(t, `شاگرد ${i + 1}`);
    memberIds.push(await join(t, id, manager, s));
    students.push(s);
  }
  return { id, manager, teacher, teacher2, students, memberIds };
}

describe('نوبت برگزاری (occurrence)', () => {
  it('once: started ⇒ نوبت #۱ خودکار؛ ended ⇒ بسته (صف current⇒done، waiting حذف)', async () => {
    const r = await room(3);
    const me = (await a.get(`/sessions/${r.id}/me`, r.students[0]!)).body.data;
    expect(mid.SessionMe.safeParse(me).success).toBe(true);
    expect(me.occurrence).toMatchObject({ seq: 1, status: 'live', closedAt: null, counts: { attendance: 0, evaluations: 0 } });
    for (const s of r.students) {
      await a.post(`/sessions/${r.id}/attendance`, s);
      await a.post(`/sessions/${r.id}/queue`, s);
    }
    expect((await a.get(`/sessions/${r.id}/me`, r.students[0]!)).body.data.myAttendance).toBeTruthy();
    await a.post(`/sessions/${r.id}/queue/next`, r.teacher);
    expect((await a.post(`/sessions/${r.id}/transition`, r.manager, { to: 'ended' })).status).toBe(200);
    const list = await a.get(`/sessions/${r.id}/occurrences`, r.teacher);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0]).toMatchObject({ seq: 1, status: 'closed', counts: { attendance: 3 } });
    expect(list.body.data[0].closedAt).toBeTruthy();
    const q = (await a.get(`/sessions/${r.id}/queue`, r.teacher)).body.data;
    expect(q).toMatchObject({ current: null, waiting: [], waitingCount: 0, occurrenceId: list.body.data[0].id });
    expect(q.done).toHaveLength(1);
    expect((await a.get(`/sessions/${r.id}/occurrences`, r.students[0]!)).status).toBe(403);
  });

  it('recurring: started بدون نوبت؛ M-09 باز (OCCURRENCE_LIVE/SESSION_LOCKED)، M-19 بستن idempotent؛ +۵ per نوبت', async () => {
    const r = await room(2, recurring);
    const s = r.students[0]!;
    const closed = await a.post(`/sessions/${r.id}/attendance`, s);
    expect(closed.status).toBe(409);
    expect(closed.body.error.details.reason).toBe('OCCURRENCE_CLOSED');
    expect((await a.get(`/sessions/${r.id}/me`, s)).body.data).toMatchObject({ occurrence: null, myAttendance: null });
    expect((await a.post(`/sessions/${r.id}/occurrences`, s)).status).toBe(403);
    const o1 = await a.post(`/sessions/${r.id}/occurrences`, r.teacher);
    expect(o1.status).toBe(200);
    expect(mid.Occurrence.safeParse(o1.body.data).success).toBe(true);
    expect(o1.body.data).toMatchObject({ seq: 1, status: 'live' });
    const dup = await a.post(`/sessions/${r.id}/occurrences`, r.manager);
    expect(dup.body.error.details.reason).toBe('OCCURRENCE_LIVE');

    expect((await a.post(`/sessions/${r.id}/attendance`, s)).body.data).toMatchObject({ pointsAwarded: 5, entry: { occurrenceId: o1.body.data.id, source: 'self' } });
    await a.post(`/sessions/${r.id}/queue`, s);
    await a.post(`/sessions/${r.id}/attendance`, r.students[1]!);
    await a.post(`/sessions/${r.id}/queue`, r.students[1]!);
    await a.post(`/sessions/${r.id}/queue/next`, r.teacher);
    const c1 = await a.post(`/sessions/${r.id}/occurrences/${o1.body.data.id}/close`, r.teacher);
    expect(c1.body.data).toMatchObject({ status: 'closed', counts: { attendance: 2 } });
    expect((await a.post(`/sessions/${r.id}/occurrences/${o1.body.data.id}/close`, r.teacher)).status).toBe(200);
    expect((await a.post(`/sessions/${r.id}/occurrences/${randomUUID()}/close`, r.teacher)).status).toBe(404);
    const after = (await a.get(`/sessions/${r.id}/queue`, r.teacher)).body.data;
    expect(after.current).toBeNull();
    expect(after.waiting).toEqual([]);
    expect(after.done).toHaveLength(1);
    // نوشتن روی نوبت بسته
    expect((await a.post(`/sessions/${r.id}/attendance`, s)).body.error.details.reason).toBe('OCCURRENCE_CLOSED');
    expect((await a.patch(`/sessions/${r.id}/queue/${randomUUID()}`, r.teacher, { action: 'up' })).body.error.details.reason).toBe('OCCURRENCE_CLOSED');
    expect((await a.post(`/sessions/${r.id}/queue/next`, r.teacher)).body.error.details.reason).toBe('OCCURRENCE_CLOSED');
    expect((await a.del(`/sessions/${r.id}/queue/me`, r.students[1]!)).status).toBe(404);

    const o2 = await a.post(`/sessions/${r.id}/occurrences`, r.teacher);
    expect(o2.body.data.seq).toBe(2);
    expect((await a.post(`/sessions/${r.id}/attendance`, s)).body.data).toMatchObject({ pointsAwarded: 5, alreadyPresent: false });
    expect((await a.post(`/sessions/${r.id}/attendance`, s)).body.data).toMatchObject({ pointsAwarded: 0, alreadyPresent: true });
    expect(await total(s)).toBe(10);
    // خواندن پیش‌فرض: نوبت باز؛ با occurrenceId نوبت قبلی
    expect((await a.get(`/sessions/${r.id}/attendance`, r.teacher)).body.data).toMatchObject({ total: 1, occurrenceId: o2.body.data.id });
    expect((await a.get(`/sessions/${r.id}/attendance?occurrenceId=${o1.body.data.id}`, r.teacher)).body.data).toMatchObject({ total: 2, occurrenceId: o1.body.data.id });
    expect((await a.get(`/sessions/${r.id}/attendance?occurrenceId=${randomUUID()}`, r.teacher)).status).toBe(404);
    expect((await a.get(`/sessions/${r.id}/queue?occurrenceId=${o1.body.data.id}`, r.teacher)).body.data.done).toHaveLength(1);
    expect((await a.get(`/sessions/${r.id}/occurrences`, r.teacher)).body.data.map((x: any) => x.seq)).toEqual([2, 1]);
    // ended ⇒ نوبت باز بسته
    await a.post(`/sessions/${r.id}/transition`, r.manager, { to: 'ended' });
    expect((await a.get(`/sessions/${r.id}/occurrences`, r.teacher)).body.data[0].status).toBe('closed');
    expect((await a.post(`/sessions/${r.id}/occurrences`, r.teacher)).body.error.details.reason).toBe('SESSION_LOCKED');
  });

  it('صفحه‌بندی واقعی M-21 با total درست و roster حاضر/غایب', async () => {
    const r = await room(5);
    for (const s of r.students.slice(0, 3)) await a.post(`/sessions/${r.id}/attendance`, s);
    const p1 = await a.get(`/sessions/${r.id}/attendance?page=1&pageSize=2`, r.teacher);
    const p2 = await a.get(`/sessions/${r.id}/attendance?page=2&pageSize=2`, r.teacher);
    expect(p1.body.data.items).toHaveLength(2);
    expect(p2.body.data.items).toHaveLength(1);
    expect(p1.body.data.total).toBe(3);
    const roster = await a.get(`/sessions/${r.id}/roster?pageSize=100`, r.teacher);
    expect(roster.body.meta.total).toBe(8); // مدیر + ۲ معلم + ۵ شاگرد
    for (const it of roster.body.data) expect(def('M-18').response.safeParse(it).success).toBe(true);
    const present = await a.get(`/sessions/${r.id}/roster?present=true`, r.teacher);
    expect(present.body.data.map((x: any) => x.userId).sort()).toEqual(r.students.slice(0, 3).map((s) => s.id).sort());
    expect(present.body.data[0]).toMatchObject({ attendanceSource: 'self' });
    const absentStudents = await a.get(`/sessions/${r.id}/roster?present=false&role=quran_student`, r.teacher);
    expect(absentStudents.body.meta.total).toBe(2);
    expect((await a.get(`/sessions/${r.id}/roster?q=${encodeURIComponent('شاگرد 4')}`, r.teacher)).body.data).toHaveLength(1);
    expect((await a.get(`/sessions/${r.id}/roster`, r.students[0]!)).status).toBe(403);
  });
});

describe('حضور توسط کادر و لغو (دفتر قطعی)', () => {
  it('هم‌زمانی ثبت کادر و ثبت خود کاربر ⇒ دقیقاً یک +۵', async () => {
    for (let round = 0; round < 3; round++) {
      const r = await room(1);
      const s = r.students[0]!;
      const rs = await Promise.all([
        ...Array.from({ length: 4 }, () => a.post(`/sessions/${r.id}/attendance`, s)),
        ...Array.from({ length: 4 }, (_, i) => a.post(`/sessions/${r.id}/attendance/mark`, i % 2 ? r.teacher : r.teacher2, { userIds: [s.id] }))
      ]);
      expect(rs.map((x) => x.status).filter((c) => c !== 200)).toEqual([]);
      expect(await total(s)).toBe(5);
      expect((await ledger(s)).filter((l) => l.reason === 'attendance')).toHaveLength(1);
      const awarded = rs.reduce((n, x) => n + (x.body.data.pointsAwarded ?? x.body.data.items?.[0]?.pointsAwarded ?? 0), 0);
      expect(awarded).toBe(5);
    }
  });

  it('M-22 گروهی: not_member/already/marked؛ فقط attendance.manage؛ outbox points.changed', async () => {
    const r = await room(3);
    await a.post(`/sessions/${r.id}/attendance`, r.students[0]!);
    const outsider = await mkUser(t, 'غریبه');
    const m = await a.post(`/sessions/${r.id}/attendance/mark`, r.teacher, { userIds: [r.students[0]!.id, r.students[1]!.id, outsider.id, r.students[1]!.id] });
    expect(m.status).toBe(200);
    expect(mid.MarkAttendanceResult.safeParse(m.body.data).success).toBe(true);
    expect(m.body.data.items).toEqual([
      { userId: r.students[0]!.id, outcome: 'already', pointsAwarded: 0 },
      { userId: r.students[1]!.id, outcome: 'marked', pointsAwarded: 5 },
      { userId: outsider.id, outcome: 'not_member', pointsAwarded: 0 }
    ]);
    expect((await a.post(`/sessions/${r.id}/attendance/mark`, r.students[2]!, { userIds: [r.students[2]!.id] })).status).toBe(403);
    const list = (await a.get(`/sessions/${r.id}/attendance`, r.teacher)).body.data.items;
    expect(list.find((x: any) => x.userId === r.students[1]!.id).source).toBe('staff');
    const ev = (await outbox('points.changed')).filter((p: any) => p.userId === r.students[1]!.id);
    expect(ev).toEqual([{ userId: r.students[1]!.id, total: 5 }]);
  });

  it('لغو ⇒ −۵، ثبت دوباره ⇒ +۵ با ref تازه؛ خالص per نوبت هرگز بیش از ۵؛ idempotent؛ مجوز مدیر/ثبت‌کننده', async () => {
    const r = await room(1);
    const s = r.students[0]!;
    const occ = (await a.get(`/sessions/${r.id}/me`, s)).body.data.occurrence.id as string;
    await a.post(`/sessions/${r.id}/attendance/mark`, r.teacher, { userIds: [s.id] });
    await a.post(`/sessions/${r.id}/queue`, s);
    // معلم دیگر (ثبت‌کننده نیست) ⇒ 403؛ ثبت‌کننده مجاز
    expect((await a.post(`/sessions/${r.id}/attendance/${s.id}/revoke`, r.teacher2, { reason: 'اشتباه' })).status).toBe(403);
    const rv = await a.post(`/sessions/${r.id}/attendance/${s.id}/revoke`, r.teacher, { reason: 'اشتباه' });
    expect(rv.body.data).toEqual({ occurrenceId: occ, revoked: true, pointsReversed: 5 });
    expect(await total(s)).toBe(0);
    expect((await a.get(`/sessions/${r.id}/queue`, s)).body.data.myItem).toBeNull(); // صف منتظر هم حذف
    expect((await a.post(`/sessions/${r.id}/attendance/${s.id}/revoke`, r.teacher, { reason: 'اشتباه' })).body.data).toEqual({ occurrenceId: occ, revoked: false, pointsReversed: 0 });
    // ثبت دوباره (خود کاربر) ⇒ +۵
    expect((await a.post(`/sessions/${r.id}/attendance`, s)).body.data.pointsAwarded).toBe(5);
    expect(await total(s)).toBe(5);
    // مدیر هر حضوری را لغو می‌کند؛ دوباره ثبت کادر
    expect((await a.post(`/sessions/${r.id}/attendance/${s.id}/revoke`, r.manager, { reason: 'اشتباه دوم' })).body.data.pointsReversed).toBe(5);
    expect((await a.post(`/sessions/${r.id}/attendance/mark`, r.teacher2, { userIds: [s.id] })).body.data.items[0].pointsAwarded).toBe(5);
    const l = await ledger(s);
    // ساعت تست ثابت است ⇒ ترتیب زمانی ردیف‌ها قطعی نیست؛ مجموعه‌ای مقایسه می‌شود
    expect(l.map((x) => `${x.reason}:${x.points}`).sort()).toEqual(['attendance:5', 'attendance:5', 'attendance:5', 'attendance_reversal:-5', 'attendance_reversal:-5']);
    expect(l.reduce((n, x) => n + x.points, 0)).toBe(5);
    const refs = l.filter((x) => x.reason === 'attendance').map((x) => bufToUuid(x.ref_id));
    expect(refs.sort()).toEqual([attendanceRef(occ, s.id, 1), attendanceRef(occ, s.id, 2), attendanceRef(occ, s.id, 3)].sort());
    const reversed = l.filter((x) => x.reason === 'attendance_reversal').map((x) => bufToUuid(x.ref_id)).sort();
    expect(reversed).toEqual([attendanceRef(occ, s.id, 1), attendanceRef(occ, s.id, 2)].sort());
    // M-23 فقط نوبت باز
    await a.post(`/sessions/${r.id}/transition`, r.manager, { to: 'ended' });
    expect((await a.post(`/sessions/${r.id}/attendance/${s.id}/revoke`, r.manager, { reason: 'دیرهنگام' })).body.error.details.reason).toBe('OCCURRENCE_CLOSED');
    // تاریخچهٔ من (M-46)
    const h = await a.get('/me/points/history?pageSize=2', s);
    expect(h.body.meta.total).toBe(5);
    expect(h.body.data).toHaveLength(2);
    for (const it of h.body.data) expect(def('M-46').response.safeParse(it).success).toBe(true);
    expect(h.body.data[0].session).toMatchObject({ id: r.id, title: 'جلسهٔ آزمایشی قرآن' });
  });

  it('کف ۰: کسر بیش از total فقط تا ۰ و مقدار واقعی در دفتر', async () => {
    const r = await room(1);
    const s = r.students[0]!;
    await a.post(`/sessions/${r.id}/attendance`, s);
    const adj = await ad.post(`/admin/users/${s.id}/points/adjust`, { actorId: r.manager.id, delta: -3, reason: 'اصلاح دستی' });
    expect(adj.status).toBe(200);
    expect(internal.MidAdminPointsAdjustResult.safeParse(adj.body.data).success).toBe(true);
    expect(adj.body.data).toMatchObject({ summary: { total: 2 }, entry: { points: -3, reason: 'admin_adjust', note: 'اصلاح دستی', session: null } });
    const rv = await a.post(`/sessions/${r.id}/attendance/${s.id}/revoke`, r.manager, { reason: 'اشتباه' });
    expect(rv.body.data.pointsReversed).toBe(2);
    expect(await total(s)).toBe(0);
    expect((await ledger(s)).find((x) => x.reason === 'attendance_reversal')).toMatchObject({ points: -2 });
    const big = await ad.post(`/admin/users/${s.id}/points/adjust`, { actorId: r.manager.id, delta: -50, reason: 'بیش از موجودی' });
    expect(big.body.data).toMatchObject({ summary: { total: 0 }, entry: { points: 0 } });
    expect((await ad.post(`/admin/users/${s.id}/points/adjust`, { actorId: r.manager.id, delta: 7, reason: 'جبران' })).body.data.summary.total).toBe(7);
  });
});

describe('صف توسط کادر (M-35)', () => {
  it('NOT_STUDENT / NOT_APPROVED / NOT_PRESENT / markPresent / ALREADY_IN_QUEUE / 403', async () => {
    const r = await room(2);
    const [s1, s2] = r.students as [User, User];
    const pending = await mkUser(t, 'در انتظار');
    await a.post(`/sessions/${r.id}/members`, pending);
    const reason = async (body: object, u: User = r.teacher) => (await a.post(`/sessions/${r.id}/queue/enqueue`, u, body)).body.error?.details?.reason;
    expect(await reason({ userId: r.teacher2.id })).toBe('NOT_STUDENT');
    expect(await reason({ userId: pending.id })).toBe('NOT_APPROVED');
    expect((await a.post(`/sessions/${r.id}/queue/enqueue`, r.teacher, { userId: randomUUID() })).status).toBe(404);
    expect(await reason({ userId: s1.id })).toBe('NOT_PRESENT');
    const ok = await a.post(`/sessions/${r.id}/queue/enqueue`, r.teacher, { userId: s1.id, markPresent: true });
    expect(ok.status).toBe(200);
    expect(ok.body.data.waiting.map((x: any) => x.userId)).toEqual([s1.id]);
    expect(await total(s1)).toBe(5);
    expect(await reason({ userId: s1.id })).toBe('ALREADY_IN_QUEUE');
    await a.post(`/sessions/${r.id}/attendance`, s2);
    expect((await a.post(`/sessions/${r.id}/queue/enqueue`, r.teacher, { userId: s2.id })).body.data.waiting).toHaveLength(2);
    expect((await a.post(`/sessions/${r.id}/queue/enqueue`, s2, { userId: s1.id })).status).toBe(403);
  });
});

describe('ارزیابی: ویرایش/باطل با دفتر', () => {
  async function evaluated() {
    const r = await room(1);
    const s = r.students[0]!;
    await a.post(`/sessions/${r.id}/attendance`, s);
    await a.post(`/sessions/${r.id}/queue`, s);
    const item = (await a.post(`/sessions/${r.id}/queue/next`, r.teacher)).body.data.current.id as string;
    const ev = await a.post(`/sessions/${r.id}/evaluations`, r.teacher, { queueItemId: item, voice: 8, tone: 6, tajweed: 7 }); // 71 ⇒ 7
    expect(ev.status).toBe(200);
    return { ...r, s, item, evalId: ev.body.data.id as string };
  }

  it('ویرایش فقط ارزیاب اصلی تا ۲۴ ساعت؛ evaluation_adjust با تفاضل؛ وزن ذخیره‌شده', async () => {
    const r = await evaluated();
    expect(await total(r.s)).toBe(12);
    expect((await a.patch(`/sessions/${r.id}/evaluations/${r.evalId}`, r.teacher2, { voice: 10 })).status).toBe(403);
    const p = await a.patch(`/sessions/${r.id}/evaluations/${r.evalId}`, r.teacher, { voice: 10, tone: 10, tajweed: 10, note: 'بازبینی' });
    expect(p.status).toBe(200);
    expect(p.body.data).toMatchObject({ score: 100, points: 10, note: 'بازبینی', status: 'active' });
    expect(p.body.data.updatedAt).toBeTruthy();
    expect(await total(r.s)).toBe(15);
    expect((await a.patch(`/sessions/${r.id}/evaluations/${r.evalId}`, r.teacher, { voice: 0, tone: 0, tajweed: 0 })).body.data.points).toBe(0);
    expect(await total(r.s)).toBe(5);
    expect((await ledger(r.s)).filter((l) => l.reason === 'evaluation_adjust').map((l) => l.points).sort((x, y) => x - y)).toEqual([-10, 3]);
    await t.ds.query('UPDATE evaluations SET created_at = DATE_SUB(created_at, INTERVAL 25 HOUR) WHERE id = ?', [bin(r.evalId)]);
    expect((await a.patch(`/sessions/${r.id}/evaluations/${r.evalId}`, r.teacher, { voice: 5 })).status).toBe(403);
  });

  it('باطل (ارزیاب یا مدیر): evaluation_void؛ idempotent؛ EVALUATION_VOIDED؛ فهرست پیش‌فرض بدون باطل‌شده', async () => {
    const r = await evaluated();
    expect((await a.post(`/sessions/${r.id}/evaluations/${r.evalId}/void`, r.teacher2, { reason: 'دلیل کافی' })).status).toBe(403);
    expect((await a.post(`/sessions/${r.id}/evaluations/${r.evalId}/void`, r.s, { reason: 'دلیل کافی' })).status).toBe(403);
    const v = await a.post(`/sessions/${r.id}/evaluations/${r.evalId}/void`, r.manager, { reason: 'ثبت اشتباه' });
    expect(v.status).toBe(200);
    expect(v.body.data.status).toBe('void');
    expect(await total(r.s)).toBe(5);
    expect((await a.post(`/sessions/${r.id}/evaluations/${r.evalId}/void`, r.teacher, { reason: 'تکرار' })).status).toBe(200);
    expect((await ledger(r.s)).filter((l) => l.reason === 'evaluation_void').map((l) => l.points)).toEqual([-7]);
    expect((await a.patch(`/sessions/${r.id}/evaluations/${r.evalId}`, r.teacher, { voice: 1 })).body.error.details.reason).toBe('EVALUATION_VOIDED');
    expect((await a.get(`/sessions/${r.id}/evaluations`, r.teacher)).body.meta.total).toBe(0);
    expect((await a.get(`/sessions/${r.id}/evaluations?includeVoid=true`, r.teacher)).body.meta.total).toBe(1);
    expect((await a.get(`/sessions/${r.id}/evaluations?includeVoid=true`, r.s)).body.meta.total).toBe(0);
    const occ = (await a.get(`/sessions/${r.id}/occurrences`, r.teacher)).body.data[0];
    expect(occ.counts.evaluations).toBe(0);
  });

  it('M-40: ارزیابی‌شونده باید هنوز عضو تأییدشده باشد؛ نوبت بسته ⇒ OCCURRENCE_CLOSED', async () => {
    const r = await room(2);
    for (const s of r.students) {
      await a.post(`/sessions/${r.id}/attendance`, s);
      await a.post(`/sessions/${r.id}/queue`, s);
    }
    const item = (await a.post(`/sessions/${r.id}/queue/next`, r.teacher)).body.data.current.id as string;
    expect((await ad.del(`/admin/sessions/${r.id}/members/${r.memberIds[0]}`)).status).toBe(200);
    const res = await a.post(`/sessions/${r.id}/evaluations`, r.teacher, { queueItemId: item, voice: 5, tone: 5, tajweed: 5 });
    // حذف عضو، آیتم current را هم حذف می‌کند ⇒ 404؛ در غیر این صورت NOT_APPROVED
    expect([404, 409]).toContain(res.status);
    const item2 = (await a.post(`/sessions/${r.id}/queue/next`, r.teacher)).body.data.current.id as string;
    const occ = (await a.get(`/sessions/${r.id}/me`, r.teacher)).body.data.occurrence.id as string;
    await a.post(`/sessions/${r.id}/occurrences/${occ}/close`, r.teacher);
    const c = await a.post(`/sessions/${r.id}/evaluations`, r.teacher, { queueItemId: item2, voice: 5, tone: 5, tajweed: 5 });
    expect(c.body.error.details.reason).toBe('OCCURRENCE_CLOSED');
  });
});

describe('نشان پویا', () => {
  const badge = (key: string, threshold: number, extra: object = {}) => ({ id: randomUUID(), key, title: `نشان ${key}`, description: 'توضیح', threshold, active: true, sortOrder: 0, imageHash: null, ...extra });

  it('fallback قدیمی تا رسیدن کاتالوگ؛ کاتالوگ ⇒ اعطا/پس‌گیری با inbox دسته‌ای؛ نسخهٔ قدیمی نادیده', async () => {
    await resetDb(t.ds);
    t.app.get(BadgesService).invalidate();
    const r = await room(1);
    const s = r.students[0]!;
    const legacy = (await a.get('/me/points', s)).body.data;
    expect(PointsSummary.safeParse(legacy).success).toBe(true);
    expect(legacy.badges.map((b: any) => [b.key, b.threshold, b.id])).toEqual([
      ['badge_50', 50, legacyBadgeId('badge_50')],
      ['badge_150', 150, legacyBadgeId('badge_150')],
      ['badge_300', 300, legacyBadgeId('badge_300')],
      ['badge_500', 500, legacyBadgeId('badge_500')]
    ]);

    const bronze = badge('bronze', 5, { sortOrder: 1, imageHash: 'a'.repeat(64) });
    const silver = badge('silver', 12, { sortOrder: 2 });
    const hidden = badge('hidden', 1, { active: false });
    expect((await sendEvent('badge.catalog.changed', { version: 3, badges: [silver, bronze, hidden] })).status).toBe(202);
    expect((await sendEvent('badge.catalog.changed', { version: 2, badges: [] })).status).toBe(202); // قدیمی ⇒ بی‌اثر
    expect((await sendEvent('badge.catalog.changed', { version: 4, badges: [] }, 'low')).status).toBe(403); // ACL فقط high
    await t.app.get(BadgesService).runRecompute();

    await a.post(`/sessions/${r.id}/attendance`, s);
    const p = (await a.get('/me/points', s)).body.data;
    expect(PointsSummary.safeParse(p).success).toBe(true);
    expect(p.badges.map((b: any) => b.key)).toEqual(['bronze', 'silver']);
    expect(p.badges[0]).toMatchObject({ id: bronze.id, image: { hash: 'a'.repeat(64) } });
    expect(p.badges[0].awardedAt).toBeTruthy();
    expect(p.badges[1].awardedAt).toBeNull();
    const inbox = (await outbox('inbox.messages.created')).flatMap((x: any) => x.items).filter((i: any) => i.userId === s.id);
    expect(inbox).toEqual([expect.objectContaining({ kind: 'system', ref: `badge:${bronze.id}` })]);

    // لغو حضور ⇒ زیر آستانه ⇒ پس‌گیری + inbox
    await a.post(`/sessions/${r.id}/attendance/${s.id}/revoke`, r.manager, { reason: 'اشتباه' });
    expect((await a.get('/me/points', s)).body.data.badges[0].awardedAt).toBeNull();
    const inbox2 = (await outbox('inbox.messages.created')).flatMap((x: any) => x.items).filter((i: any) => i.userId === s.id);
    expect(inbox2).toHaveLength(2);
    expect(inbox2.some((i: any) => i.body.includes('از دست رفت') && i.ref === `badge:${bronze.id}`)).toBe(true);
    const holders = await ad.get('/admin/badges/holders');
    expect(internal.MidAdminBadgeHolders.safeParse(holders.body.data).success).toBe(true);
    expect(holders.body.data.items.find((x: any) => x.badgeId === bronze.id).holders).toBe(0);
  });

  it('تغییر کاتالوگ ⇒ job بازمحاسبه (دسته‌ای، بدون inbox)، نگاشت نشان قدیمی هم‌کلید', async () => {
    await resetDb(t.ds);
    t.app.get(BadgesService).invalidate();
    const users = Array.from({ length: 7 }, () => uuidv7());
    const totals = [0, 4, 5, 20, 60, 200, 600];
    for (let i = 0; i < users.length; i++) await t.ds.query('INSERT INTO user_points (user_id, total, updated_at) VALUES (?, ?, NOW(3))', [bin(users[i]!), totals[i]]);
    // نشان قدیمی کاربر ۴ (۶۰ امتیاز) با awarded_at قدیمی
    await t.ds.query("INSERT INTO badge_awards (user_id, badge_id, awarded_at) VALUES (?, ?, '2025-01-01 00:00:00.000')", [bin(users[4]!), bin(legacyBadgeId('badge_50'))]);
    const b50 = badge('badge_50', 50);
    const b10 = badge('ten', 10);
    await sendEvent('badge.catalog.changed', { version: 7, badges: [b50, b10] });
    expect(await t.app.get(BadgesService).runRecompute()).toBeGreaterThanOrEqual(0);
    const rows = (await t.ds.query('SELECT user_id, badge_id, awarded_at FROM badge_awards')) as { user_id: Buffer; badge_id: Buffer; awarded_at: Date }[];
    const have = (u: string) => rows.filter((x) => bufToUuid(x.user_id) === u).map((x) => bufToUuid(x.badge_id)).sort();
    expect(have(users[0]!)).toEqual([]);
    expect(have(users[3]!)).toEqual([b10.id]);
    expect(have(users[4]!)).toEqual([b10.id, b50.id].sort());
    expect(rows.find((x) => bufToUuid(x.user_id) === users[4] && bufToUuid(x.badge_id) === b50.id)!.awarded_at.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(await outbox('inbox.messages.created')).toEqual([]);
    // آستانه بالا رفت ⇒ پس‌گیری (باز هم بدون inbox)؛ اجرای دوباره idempotent
    await sendEvent('badge.catalog.changed', { version: 8, badges: [{ ...b50, threshold: 100 }, { ...b10, active: false }] });
    await t.app.get(BadgesService).runRecompute();
    await t.app.get(BadgesService).runRecompute();
    const after = (await t.ds.query('SELECT user_id FROM badge_awards')) as { user_id: Buffer }[];
    expect(after.map((x) => bufToUuid(x.user_id)).sort()).toEqual([users[5]!, users[6]!].sort());
    expect(await outbox('inbox.messages.created')).toEqual([]);
    const h = (await ad.get('/admin/badges/holders')).body.data.items;
    expect(h).toEqual(expect.arrayContaining([{ badgeId: b50.id, holders: 2 }, { badgeId: b10.id, holders: 0 }]));
  });
});

describe('MID_ADMIN (۱.۶.۰)', () => {
  it('نوبت‌ها، حضور روی نوبت بسته، لغو، صف با QUEUE_STATE_CHANGED، ارزیابی، امتیاز؛ ACL', async () => {
    const r = await room(3, recurring);
    const [s1, s2, s3] = r.students as [User, User, User];
    // بدون نوبت باز ⇒ OCCURRENCE_CLOSED
    expect((await ad.post(`/admin/sessions/${r.id}/attendance/mark`, { actorId: r.manager.id, userIds: [s1.id], reason: 'اصلاح' })).body.error.details.reason).toBe('OCCURRENCE_CLOSED');
    const o1 = (await a.post(`/sessions/${r.id}/occurrences`, r.teacher)).body.data.id as string;
    for (const s of [s1, s2]) {
      await a.post(`/sessions/${r.id}/attendance`, s);
      await a.post(`/sessions/${r.id}/queue`, s);
    }
    // صف: شرط هم‌زمانی
    const stale = await ad.post(`/admin/sessions/${r.id}/queue/next`, { actorId: r.manager.id, expectCurrentItemId: randomUUID() });
    expect(stale.status).toBe(409);
    expect(stale.body.error.details.reason).toBe('QUEUE_STATE_CHANGED');
    const n1 = await ad.post(`/admin/sessions/${r.id}/queue/next`, { actorId: r.manager.id, expectCurrentItemId: null });
    expect(n1.status).toBe(200);
    expect(internal.MidAdminQueue.safeParse(n1.body.data).success).toBe(true);
    expect(n1.body.data.current.userId).toBe(s1.id);
    const waitingId = n1.body.data.waiting[0].id as string;
    expect((await ad.patch(`/admin/sessions/${r.id}/queue/${waitingId}`, { actorId: r.manager.id, action: 'up', expectPosition: 2 })).body.error.details.reason).toBe('QUEUE_STATE_CHANGED');
    expect((await ad.patch(`/admin/sessions/${r.id}/queue/${waitingId}`, { actorId: r.manager.id, action: 'skip', expectPosition: 1 })).status).toBe(200);
    // ارزیابی و اصلاح ادمین (بدون محدودیت ارزیاب)
    const ev = (await a.post(`/sessions/${r.id}/evaluations`, r.teacher, { queueItemId: n1.body.data.current.id, voice: 5, tone: 5, tajweed: 5 })).body.data;
    const ep = await ad.patch(`/admin/sessions/${r.id}/evaluations/${ev.id}`, { actorId: r.manager.id, reason: 'اصلاح نمره', voice: 10 });
    expect(ep.status).toBe(200);
    expect(internal.MidAdminEvaluation.safeParse(ep.body.data).success).toBe(true);
    expect(ep.body.data.score).toBe(70);
    expect((await ad.patch(`/admin/sessions/${r.id}/evaluations/${ev.id}`, { actorId: r.manager.id, reason: 'خالی' })).status).toBe(400);
    const vd = await ad.post(`/admin/sessions/${r.id}/evaluations/${ev.id}/void`, { actorId: r.manager.id, reason: 'باطل ادمین' });
    expect(vd.body.data.status).toBe('void');
    expect((await ad.get(`/admin/sessions/${r.id}/evaluations`)).body.data.total).toBe(0); // پیش‌فرض بدون باطل‌شده
    expect((await ad.get(`/admin/sessions/${r.id}/evaluations?includeVoid=true`)).body.data.items[0]).toMatchObject({ id: ev.id, status: 'void' });

    // بستن نوبت و ثبت حضور ادمین روی نوبت بسته (اصلاح)
    await a.post(`/sessions/${r.id}/occurrences/${o1}/close`, r.teacher);
    const mk = await ad.post(`/admin/sessions/${r.id}/attendance/mark`, { actorId: r.manager.id, userIds: [s3.id, s1.id], occurrenceId: o1, reason: 'جاماندگی ثبت' });
    expect(mk.status).toBe(200);
    expect(internal.MidAdminMarkAttendanceResult.safeParse(mk.body.data).success).toBe(true);
    expect(mk.body.data.items).toEqual([
      { userId: s3.id, outcome: 'marked', pointsAwarded: 5 },
      { userId: s1.id, outcome: 'already', pointsAwarded: 0 }
    ]);
    const att = await ad.get(`/admin/sessions/${r.id}/attendance?pageSize=2&page=2`);
    expect(att.body.data).toMatchObject({ total: 3, occurrenceId: o1 });
    expect(att.body.data.items).toHaveLength(1);
    expect((await ad.get(`/admin/sessions/${r.id}/attendance`)).body.data.items.find((x: any) => x.userId === s3.id).source).toBe('admin');
    const rv = await ad.post(`/admin/sessions/${r.id}/attendance/${s3.id}/revoke`, { actorId: r.manager.id, reason: 'برگشت' });
    expect(rv.body.data).toEqual({ occurrenceId: o1, revoked: true, pointsReversed: 5 });
    const occs = await ad.get(`/admin/sessions/${r.id}/occurrences`);
    expect(occs.body.meta.total).toBe(1);
    expect(internal.MidAdminOccurrence.safeParse(occs.body.data[0]).success).toBe(true);
    expect((await ad.get(`/admin/sessions/${r.id}`)).body.data.counts.occurrences).toBe(1);
    // امتیاز کاربر (ادمین) و دفتر برای low
    const up = await ad.get(`/admin/users/${s3.id}/points?pageSize=1`);
    expect(internal.MidAdminUserPoints.safeParse(up.body.data).success).toBe(true);
    expect(up.body.data.ledger).toMatchObject({ page: 1, pageSize: 1, total: 2 });
    const low = await ad.get(`/users/${s1.id}/points/ledger`, 'low');
    expect(low.status).toBe(200);
    expect(low.body.meta.total).toBeGreaterThanOrEqual(1);
    // ACL
    expect((await ad.get(`/users/${s1.id}/points/ledger`, 'high')).status).toBe(403);
    expect((await ad.get(`/admin/users/${s1.id}/points`, 'low')).status).toBe(403);
    expect((await ad.post(`/admin/sessions/${r.id}/queue/next`, { actorId: r.manager.id }, 'low')).status).toBe(403);
    expect((await ad.post(`/admin/sessions/${randomUUID()}/attendance/mark`, { actorId: r.manager.id, userIds: [s1.id], reason: 'نیست' })).status).toBe(404);
    expect((await ad.post(`/admin/sessions/${r.id}/attendance/mark`, { actorId: r.manager.id, userIds: [s1.id], reason: 'x' })).status).toBe(400);
  });
});

describe('کلاینت‌های موجود (android-mid/low) بدون تغییر', () => {
  it('جریان قدیمی once بدون occurrenceId همان شکل پاسخ را می‌گیرد', async () => {
    const r = await room(1);
    const s = r.students[0]!;
    const h = { 'X-Isra-Client': 'android-mid' };
    const att = await request(t.http).post(`/o/v1/sessions/${r.id}/attendance`).set({ ...s.h, ...h }).send({});
    expect(att.status).toBe(200);
    expect(mid.AttendanceResult.safeParse(att.body.data).success).toBe(true);
    const q = await request(t.http).post(`/o/v1/sessions/${r.id}/queue`).set({ ...s.h, ...h }).send({});
    expect(mid.QueueItem.safeParse(q.body.data).success).toBe(true);
    const st = await request(t.http).get(`/o/v1/sessions/${r.id}/queue`).set({ ...r.teacher.h, ...h });
    expect(mid.QueueState.safeParse(st.body.data).success).toBe(true);
    expect(st.body.data.waiting).toHaveLength(1);
  });
});

describe('مهاجرت دادهٔ ۱.۶.۰ روی دادهٔ موجود', () => {
  it('backfill نوبت #۱ (live برای started، closed برای بقیه)، occurrence_id، دفتر و نشان‌ها؛ down/up برگشت‌پذیر', async () => {
    await resetDb(t.ds);
    const ds = new DataSource(dataSourceOptions(testEnv({ DB_MIGRATIONS_RUN: 'false', LOW_JWKS_URL: t.low.jwksUrl })));
    await ds.initialize();
    const qr = ds.createQueryRunner();
    const mig = new OccurrencesPointsV161728600000001();
    try {
      await mig.down(qr);
      const sched = JSON.stringify({ type: 'once', startsAt: '2030-01-04T18:00:00+03:30', endsAt: '2030-01-04T20:00:00+03:30' });
      const mkS = async (status: string) => {
        const id = uuidv7();
        await ds.query("INSERT INTO sessions (id, title, description, status, schedule_type, schedule, location_label, created_by, version, created_at, updated_at) VALUES (?, 'قدیمی', 'جلسهٔ دادهٔ قدیمی', ?, 'once', ?, 'مسجد', ?, 1, NOW(3), NOW(3))", [bin(id), status, sched, bin(uuidv7())]);
        return id;
      };
      const started = await mkS('started');
      const ended = await mkS('ended');
      const empty = await mkS('scheduled');
      const startedEmpty = await mkS('started');
      const [u1, u2] = [uuidv7(), uuidv7()];
      const att1 = uuidv7();
      await ds.query('INSERT INTO attendance_entries (id, session_id, user_id, entered_at) VALUES (?, ?, ?, NOW(3)), (?, ?, ?, NOW(3))', [bin(att1), bin(started), bin(u1), bin(uuidv7()), bin(ended), bin(u1)]);
      await ds.query("INSERT INTO point_ledger (id, user_id, points, reason, ref_id, created_at) VALUES (?, ?, 5, 'attendance', ?, NOW(3))", [bin(uuidv7()), bin(u1), bin(att1)]);
      await ds.query('INSERT INTO user_points (user_id, total, updated_at) VALUES (?, 55, NOW(3))', [bin(u1)]);
      await ds.query("INSERT INTO badge_awards (id, user_id, badge_key, threshold, awarded_at) VALUES (?, ?, 'badge_50', 50, NOW(3))", [bin(uuidv7()), bin(u1)]);
      const [qw, qc, qd] = [uuidv7(), uuidv7(), uuidv7()];
      await ds.query(
        "INSERT INTO queue_items (id, session_id, user_id, status, position, joined_at) VALUES (?, ?, ?, 'waiting', 1, NOW(3)), (?, ?, ?, 'current', NULL, NOW(3)), (?, ?, ?, 'waiting', 1, NOW(3))",
        [bin(qw), bin(started), bin(u2), bin(qc), bin(ended), bin(u1), bin(qd), bin(ended), bin(u2)]
      );
      const ev = uuidv7();
      await ds.query("INSERT INTO evaluations (id, session_id, queue_item_id, user_id, evaluator_id, voice, tone, tajweed, weights, score, points, note, created_at) VALUES (?, ?, ?, ?, ?, 5, 5, 5, '{}', 50, 5, '', NOW(3))", [bin(ev), bin(ended), bin(qc), bin(u1), bin(uuidv7())]);
      await ds.query("INSERT INTO point_ledger (id, user_id, points, reason, ref_id, created_at) VALUES (?, ?, 5, 'evaluation', ?, NOW(3))", [bin(uuidv7()), bin(u1), bin(ev)]);

      await mig.up(qr);

      const occ = (await ds.query('SELECT session_id, seq, status, closed_at FROM session_occurrences')) as { session_id: Buffer; seq: number; status: string; closed_at: Date | null }[];
      const bySession = new Map(occ.map((o) => [bufToUuid(o.session_id), o]));
      expect(bySession.get(started)).toMatchObject({ seq: 1, status: 'live', closed_at: null });
      expect(bySession.get(ended)).toMatchObject({ seq: 1, status: 'closed' });
      expect(bySession.get(startedEmpty)).toMatchObject({ status: 'live' }); // once شروع‌شده بدون داده هم نوبت باز دارد
      expect(bySession.has(empty)).toBe(false);
      const nulls = (await ds.query('SELECT (SELECT COUNT(*) FROM attendance_entries WHERE occurrence_id IS NULL) + (SELECT COUNT(*) FROM queue_items WHERE occurrence_id IS NULL) + (SELECT COUNT(*) FROM evaluations WHERE occurrence_id IS NULL) AS n')) as { n: string }[];
      expect(Number(nulls[0]!.n)).toBe(0);
      const a1 = (await ds.query('SELECT award_ref, source FROM attendance_entries WHERE id = ?', [bin(att1)])) as { award_ref: Buffer; source: string }[];
      expect(bufToUuid(a1[0]!.award_ref)).toBe(att1);
      expect(a1[0]!.source).toBe('self');
      // صف نوبت بسته: current⇒done، waiting حذف؛ صف نوبت live دست‌نخورده
      const qs = (await ds.query('SELECT id, status FROM queue_items')) as { id: Buffer; status: string }[];
      expect(Object.fromEntries(qs.map((x) => [bufToUuid(x.id), x.status]))).toEqual({ [qw]: 'waiting', [qc]: 'done' });
      const led = (await ds.query('SELECT reason, session_id FROM point_ledger ORDER BY reason')) as { reason: string; session_id: Buffer }[];
      expect(led.map((l) => [l.reason, bufToUuid(l.session_id)])).toEqual([
        ['attendance', started],
        ['evaluation', ended]
      ]);
      const badgesRows = (await ds.query('SELECT user_id, badge_id FROM badge_awards')) as { user_id: Buffer; badge_id: Buffer }[];
      expect(badgesRows.map((b) => [bufToUuid(b.user_id), bufToUuid(b.badge_id)])).toEqual([[u1, legacyBadgeId('badge_50')]]);

      // برنامه کار می‌کند: نشان قدیمی در خلاصهٔ امتیاز اعطاشده دیده می‌شود
      t.app.get(BadgesService).invalidate();
      const p = (await ad.get(`/admin/users/${u1}/points`)).body.data.summary;
      expect(p.total).toBe(55);
      expect(p.badges.find((b: any) => b.key === 'badge_50').awardedAt).toBeTruthy();

      // down/up دوباره روی همین داده (سازگار با یکتایی قدیم)
      await mig.down(qr);
      const old = (await ds.query('SELECT badge_key FROM badge_awards')) as { badge_key: string }[];
      expect(old.map((x) => x.badge_key)).toEqual(['badge_50']);
      await mig.up(qr);
      // چند حضور یک کاربر در دو نوبت یک جلسه ⇒ down خطای صریح
      const o2 = uuidv7();
      await ds.query("INSERT INTO session_occurrences (id, session_id, seq, status, opened_at) VALUES (?, ?, 2, 'closed', NOW(3))", [bin(o2), bin(ended)]);
      await ds.query('INSERT INTO attendance_entries (id, session_id, occurrence_id, user_id, entered_at) VALUES (?, ?, ?, ?, NOW(3))', [bin(uuidv7()), bin(ended), bin(o2), bin(u1)]);
      await expect(mig.down(qr)).rejects.toThrow(/down ممکن نیست/);
    } finally {
      await qr.release();
      await ds.destroy();
      await resetDb(t.ds);
    }
  });
});
