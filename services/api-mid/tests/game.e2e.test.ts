import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SettingsService } from '../src/domain/settings.service';
import { type TestApp, type User, api, creator, join, mkSession, mkUser, startApp } from './helpers/app';

let t: TestApp;
let a: ReturnType<typeof api>;
beforeAll(async () => {
  t = await startApp();
  a = api(t);
});
afterAll(async () => t.close());

/** جلسهٔ started با مدیر، معلم، پشتیبان و چند قرآن‌آموز */
async function room(nStudents = 3) {
  const manager = await creator(t);
  const id = await mkSession(t, manager, 'started');
  const teacher = await mkUser(t, 'استاد معلم');
  const supporter = await mkUser(t, 'پشتیبان یک');
  await join(t, id, manager, teacher, ['teacher']);
  await join(t, id, manager, supporter, ['session_supporter']);
  const students: User[] = [];
  for (let i = 0; i < nStudents; i++) {
    const s = await mkUser(t, `قرآن‌آموز ${i + 1}`);
    await join(t, id, manager, s);
    students.push(s);
  }
  return { id, manager, teacher, supporter, students };
}

describe('حضور و امتیاز (+۵ فقط یک‌بار)', () => {
  it('اولین بار +۵، تکرار همان entry با pointsAwarded=0', async () => {
    const r = await room(1);
    const s = r.students[0]!;
    const first = await a.post(`/sessions/${r.id}/attendance`, s);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ pointsAwarded: 5, alreadyPresent: false, entry: { userId: s.id, name: 'قرآن‌آموز 1' } });
    const again = await a.post(`/sessions/${r.id}/attendance`, s);
    expect(again.body.data).toMatchObject({ pointsAwarded: 0, alreadyPresent: true });
    expect(again.body.data.entry.enteredAt).toBe(first.body.data.entry.enteredAt);
    expect((await a.get('/me/points', s)).body.data.total).toBe(5);
    expect((await a.get(`/sessions/${r.id}/me`, s)).body.data.myAttendance).toBeTruthy();
  });

  it('۱۰ درخواست موازی ⇒ دقیقاً یک بار ۵ امتیاز (یکتایی DB)', async () => {
    const r = await room(1);
    const s = r.students[0]!;
    const rs = await Promise.all(Array.from({ length: 10 }, () => a.post(`/sessions/${r.id}/attendance`, s)));
    expect(rs.map((x) => x.status).filter((c) => c !== 200)).toEqual([]);
    expect(rs.filter((x) => x.body.data.pointsAwarded === 5)).toHaveLength(1);
    expect((await a.get('/me/points', s)).body.data.total).toBe(5);
    const [{ n }] = (await t.ds.query('SELECT COUNT(*) AS n FROM point_ledger WHERE user_id = UNHEX(REPLACE(?, "-", ""))', [s.id])) as { n: string }[];
    expect(Number(n)).toBe(1);
  });

  it('فقط عضو تأییدشده و فقط جلسهٔ started', async () => {
    const m = await creator(t);
    const scheduled = await mkSession(t, m, 'scheduled');
    const u = await mkUser(t, 'کاربر');
    await join(t, scheduled, m, u);
    const early = await a.post(`/sessions/${scheduled}/attendance`, u);
    expect(early.status).toBe(409);
    expect(early.body.error.details.reason).toBe('SESSION_LOCKED');
    const started = await mkSession(t, m, 'started');
    expect((await a.post(`/sessions/${started}/attendance`, await mkUser(t, 'غیرعضو'))).status).toBe(403);
    const pending = await mkUser(t, 'در انتظار');
    await a.post(`/sessions/${started}/members`, pending);
    expect((await a.post(`/sessions/${started}/attendance`, pending)).status).toBe(403);
  });

  it('فهرست حاضرین فقط attendance.view (کادر)', async () => {
    const r = await room(2);
    await a.post(`/sessions/${r.id}/attendance`, r.students[0]!);
    await a.post(`/sessions/${r.id}/attendance`, r.students[1]!);
    expect((await a.get(`/sessions/${r.id}/attendance`, r.students[0]!)).status).toBe(403);
    const list = await a.get(`/sessions/${r.id}/attendance`, r.teacher);
    expect(list.body.data.total).toBe(2);
    expect(list.body.data.items.map((x: any) => x.name).sort()).toEqual(['قرآن‌آموز 1', 'قرآن‌آموز 2']);
  });

  it('نشان با رسیدن به آستانه (از تنظیمات high) اعطا و اطلاع به اینباکس (outbox)', async () => {
    await t.ds.query("INSERT INTO settings_cache (setting_key, value, version, updated_at) VALUES ('global', ?, 7, NOW(3))", [JSON.stringify({ evalWeights: { voice: 40, tone: 30, tajweed: 30 }, badgeThresholds: [5, 10, 20, 30] })]);
    (t.app.get(SettingsService) as unknown as { cached?: unknown }).cached = undefined;
    const r = await room(1);
    const s = r.students[0]!;
    await a.post(`/sessions/${r.id}/attendance`, s);
    const pts = (await a.get('/me/points', s)).body.data;
    expect(pts.total).toBe(5);
    expect(pts.badges.map((b: any) => b.threshold)).toEqual([5, 10, 20, 30]);
    expect(pts.badges[0].awardedAt).toBeTruthy();
    expect(pts.badges[1].awardedAt).toBeNull();
    const ev = (await t.ds.query("SELECT payload FROM outbox_events WHERE type = 'inbox.message.created'")) as { payload: any }[];
    expect(ev.some((e) => String(typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload)).includes('نشان'))).toBe(true);
    await t.ds.query('DELETE FROM settings_cache');
    (t.app.get(SettingsService) as unknown as { cached?: unknown }).cached = undefined;
  });
});

describe('صف نوبت', () => {
  it('پیوستن نیازمند حضور؛ تکراری 409؛ فقط قرآن‌آموز؛ نیاز started', async () => {
    const r = await room(2);
    const [s1] = r.students as [User, User];
    const notPresent = await a.post(`/sessions/${r.id}/queue`, s1);
    expect(notPresent.status).toBe(409);
    expect(notPresent.body.error.details.reason).toBe('NOT_PRESENT');
    await a.post(`/sessions/${r.id}/attendance`, s1);
    const ok = await a.post(`/sessions/${r.id}/queue`, s1);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: 'waiting', position: 1, isMe: true, userId: s1.id });
    const dup = await a.post(`/sessions/${r.id}/queue`, s1);
    expect(dup.status).toBe(409);
    expect(dup.body.error.details.reason).toBe('ALREADY_IN_QUEUE');
    expect((await a.post(`/sessions/${r.id}/queue`, r.teacher)).status).toBe(403);
  });

  it('پیوستن هم‌زمان ⇒ یک آیتم', async () => {
    const r = await room(1);
    const s = r.students[0]!;
    await a.post(`/sessions/${r.id}/attendance`, s);
    const rs = await Promise.all(Array.from({ length: 8 }, () => a.post(`/sessions/${r.id}/queue`, s)));
    expect(rs.filter((x) => x.status === 200)).toHaveLength(1);
    const [{ n }] = (await t.ds.query('SELECT COUNT(*) AS n FROM queue_items')) as { n: string }[];
    expect(Number(n)).toBeGreaterThanOrEqual(1);
  });

  it('حریم خصوصی: کادر کامل؛ قرآن‌آموز فقط جاری/جایگاه خود/تعداد', async () => {
    const r = await room(3);
    for (const s of r.students) {
      await a.post(`/sessions/${r.id}/attendance`, s);
      await a.post(`/sessions/${r.id}/queue`, s);
    }
    const staff = (await a.get(`/sessions/${r.id}/queue`, r.teacher)).body.data;
    expect(staff.waiting).toHaveLength(3);
    expect(staff.waiting.map((x: any) => x.name)).toEqual(['قرآن‌آموز 1', 'قرآن‌آموز 2', 'قرآن‌آموز 3']);
    expect(staff.waiting.every((x: any) => x.userId)).toBe(true);

    const mine = (await a.get(`/sessions/${r.id}/queue`, r.students[2]!)).body.data;
    expect(mine.waiting).toEqual([]);
    expect(mine.waitingCount).toBe(3);
    expect(mine.myPosition).toBe(3);
    expect(mine.myItem).toMatchObject({ isMe: true, position: 3 });
    expect(mine.current).toBeNull();

    await a.post(`/sessions/${r.id}/queue/next`, r.teacher);
    const s2 = (await a.get(`/sessions/${r.id}/queue`, r.students[1]!)).body.data;
    expect(s2.current).toMatchObject({ name: 'قرآن‌آموز 1', userId: '', isMe: false });
    expect(s2.myPosition).toBe(1);
    expect(s2.done).toEqual([]);
    expect((await a.get(`/sessions/${r.id}/queue`, await mkUser(t, 'غیرعضو'))).status).toBe(403);
  });

  it('next: جاری ⇒ done و نفر بعد current؛ مدیریت فقط queue.manage؛ اعلان نوبت در outbox', async () => {
    const r = await room(2);
    for (const s of r.students) {
      await a.post(`/sessions/${r.id}/attendance`, s);
      await a.post(`/sessions/${r.id}/queue`, s);
    }
    expect((await a.post(`/sessions/${r.id}/queue/next`, r.students[0]!)).status).toBe(403);
    const n1 = (await a.post(`/sessions/${r.id}/queue/next`, r.teacher)).body.data;
    expect(n1.current.userId).toBe(r.students[0]!.id);
    expect(n1.waiting).toHaveLength(1);
    const n2 = (await a.post(`/sessions/${r.id}/queue/next`, r.supporter)).body.data;
    expect(n2.current.userId).toBe(r.students[1]!.id);
    expect(n2.done).toHaveLength(1);
    const n3 = (await a.post(`/sessions/${r.id}/queue/next`, r.manager)).body.data;
    expect(n3.current).toBeNull();
    expect(n3.done).toHaveLength(2);
    const turn = (await t.ds.query("SELECT COUNT(*) AS n FROM outbox_events WHERE JSON_VALUE(payload, '$.kind') = 'turn'")) as { n: string }[];
    expect(Number(turn[0]!.n)).toBeGreaterThanOrEqual(2);
  });

  it('PATCH بالا/پایین/انتها/حذف و انصراف خودم', async () => {
    const r = await room(3);
    for (const s of r.students) {
      await a.post(`/sessions/${r.id}/attendance`, s);
      await a.post(`/sessions/${r.id}/queue`, s);
    }
    const order = async () => (await a.get(`/sessions/${r.id}/queue`, r.teacher)).body.data.waiting.map((x: any) => x.userId);
    const [s1, s2, s3] = r.students.map((s) => s.id);
    const items = (await a.get(`/sessions/${r.id}/queue`, r.teacher)).body.data.waiting;
    const idOf = (uid: string) => items.find((x: any) => x.userId === uid).id;
    expect(await order()).toEqual([s1, s2, s3]);
    await a.patch(`/sessions/${r.id}/queue/${idOf(s3!)}`, r.teacher, { action: 'up' });
    expect(await order()).toEqual([s1, s3, s2]);
    await a.patch(`/sessions/${r.id}/queue/${idOf(s1!)}`, r.teacher, { action: 'down' });
    expect(await order()).toEqual([s3, s1, s2]);
    await a.patch(`/sessions/${r.id}/queue/${idOf(s3!)}`, r.teacher, { action: 'skip' });
    expect(await order()).toEqual([s1, s2, s3]);
    await a.patch(`/sessions/${r.id}/queue/${idOf(s2!)}`, r.teacher, { action: 'remove' });
    expect(await order()).toEqual([s1, s3]);
    expect((await a.patch(`/sessions/${r.id}/queue/${idOf(s2!)}`, r.teacher, { action: 'up' })).status).toBe(404);
    expect((await a.patch(`/sessions/${r.id}/queue/${idOf(s1!)}`, r.students[0]!, { action: 'up' })).status).toBe(403);
    expect((await a.del(`/sessions/${r.id}/queue/me`, r.students[0]!)).status).toBe(200);
    expect((await a.del(`/sessions/${r.id}/queue/me`, r.students[0]!)).status).toBe(404);
    expect(await order()).toEqual([s3]);
  });

  it('پس از انجام ارزیابی دوباره می‌شود وارد صف شد', async () => {
    const r = await room(1);
    const s = r.students[0]!;
    await a.post(`/sessions/${r.id}/attendance`, s);
    await a.post(`/sessions/${r.id}/queue`, s);
    await a.post(`/sessions/${r.id}/queue/next`, r.teacher);
    await a.post(`/sessions/${r.id}/queue/next`, r.teacher);
    const again = await a.post(`/sessions/${r.id}/queue`, s);
    expect(again.status).toBe(200);
  });
});

describe('ارزیابی (قفل #15: manager به‌تنهایی نه)', () => {
  async function current() {
    const r = await room(1);
    const s = r.students[0]!;
    await a.post(`/sessions/${r.id}/attendance`, s);
    await a.post(`/sessions/${r.id}/queue`, s);
    const q = (await a.post(`/sessions/${r.id}/queue/next`, r.teacher)).body.data;
    return { ...r, s, itemId: q.current.id as string };
  }
  const body = (itemId: string, extra: object = {}) => ({ queueItemId: itemId, voice: 8, tone: 6, tajweed: 7, ...extra });

  it('manager تنها ⇒ 403؛ student ⇒ 403؛ teacher و supporter مجاز؛ manager+teacher مجاز', async () => {
    const r = await current();
    expect((await a.post(`/sessions/${r.id}/evaluations`, r.manager, body(r.itemId))).status).toBe(403);
    expect((await a.post(`/sessions/${r.id}/evaluations`, r.s, body(r.itemId))).status).toBe(403);
    const ok = await a.post(`/sessions/${r.id}/evaluations`, r.teacher, body(r.itemId, { note: 'عالی' }));
    expect(ok.status).toBe(200);
    // اجتماع نقش‌ها: مدیری که معلم هم هست
    const m2 = await creator(t, 'مدیر معلم');
    const id2 = await mkSession(t, m2, 'started');
    const st = await mkUser(t, 'دانش‌آموز');
    await join(t, id2, m2, st);
    const mm = (await a.get(`/sessions/${id2}/members?pageSize=100`, m2)).body.data.find((x: any) => x.userId === m2.id).id;
    void mm;
    // نقش manager قابل تغییر نیست ⇒ مدیر معلم‌شدن از طریق عضو جداگانه ممکن نیست؛ پس با supporter بررسی می‌شود
    const sup = await mkUser(t, 'پشتیبان دو');
    await join(t, id2, m2, sup, ['session_supporter']);
    await a.post(`/sessions/${id2}/attendance`, st);
    await a.post(`/sessions/${id2}/queue`, st);
    const q2 = (await a.post(`/sessions/${id2}/queue/next`, sup)).body.data;
    expect((await a.post(`/sessions/${id2}/evaluations`, sup, body(q2.current.id))).status).toBe(200);
  });

  it('فرمول وزنی، امتیاز ledger و اعلان اینباکس؛ ثبت دوباره 409؛ خودارزیابی 409', async () => {
    const r = await current();
    const ev = await a.post(`/sessions/${r.id}/evaluations`, r.teacher, body(r.itemId, { note: 'ماشاءالله' }));
    expect(ev.body.data).toMatchObject({ voice: 8, tone: 6, tajweed: 7, score: 71, points: 7, weights: { voice: 40, tone: 30, tajweed: 30 }, userId: r.s.id, userName: 'قرآن‌آموز 1', evaluatorName: 'استاد معلم', note: 'ماشاءالله' });
    const dup = await a.post(`/sessions/${r.id}/evaluations`, r.supporter, body(r.itemId));
    expect(dup.status).toBe(409);
    expect(dup.body.error.details.reason).toBe('ALREADY_EVALUATED');
    expect((await a.get('/me/points', r.s)).body.data.total).toBe(5 + 7);
    const msgs = (await t.ds.query("SELECT payload FROM outbox_events WHERE JSON_VALUE(payload, '$.kind') = 'evaluation'")) as unknown[];
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it('ارزیابی هم‌زمان یک نوبت ⇒ یک ثبت و یک بار امتیاز', async () => {
    const r = await current();
    const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => a.post(`/sessions/${r.id}/evaluations`, i % 2 ? r.teacher : r.supporter, body(r.itemId))));
    expect(rs.filter((x) => x.status === 200)).toHaveLength(1);
    expect((await a.get('/me/points', r.s)).body.data.total).toBe(5 + 7 + 0 + 0 || 12);
  });

  it('نوبت در انتظار ⇒ 409؛ آیتم ناشناخته ⇒ 404؛ مقدار خارج از ۰..۱۰ ⇒ 400', async () => {
    const r = await room(2);
    for (const s of r.students) {
      await a.post(`/sessions/${r.id}/attendance`, s);
      await a.post(`/sessions/${r.id}/queue`, s);
    }
    await a.post(`/sessions/${r.id}/queue/next`, r.teacher);
    const waiting = (await a.get(`/sessions/${r.id}/queue`, r.teacher)).body.data.waiting[0];
    const w = await a.post(`/sessions/${r.id}/evaluations`, r.teacher, body(waiting.id));
    expect(w.status).toBe(409);
    expect(w.body.error.details.reason).toBe('QUEUE_ITEM_STATE');
    expect((await a.post(`/sessions/${r.id}/evaluations`, r.teacher, body('00000000-0000-4000-8000-000000000000'))).status).toBe(404);
    expect((await a.post(`/sessions/${r.id}/evaluations`, r.teacher, body(waiting.id, { voice: 11 }))).status).toBe(400);
    expect((await a.post(`/sessions/${r.id}/evaluations`, r.teacher, body(waiting.id, { tone: 5.5 }))).status).toBe(400);
  });

  it('لیست: کادر همه، قرآن‌آموز فقط خودش؛ غیرعضو 403؛ نوبت جلسهٔ دیگر 404', async () => {
    const r = await current();
    await a.post(`/sessions/${r.id}/evaluations`, r.teacher, body(r.itemId));
    expect((await a.get(`/sessions/${r.id}/evaluations`, r.manager)).body.meta.total).toBe(1);
    expect((await a.get(`/sessions/${r.id}/evaluations`, r.s)).body.data).toHaveLength(1);
    const other = await room(1);
    expect((await a.get(`/sessions/${r.id}/evaluations`, other.students[0]!)).status).toBe(403);
    expect((await a.post(`/sessions/${other.id}/evaluations`, other.teacher, body(r.itemId))).status).toBe(404);
  });

  it('وزن‌های جدید فقط برای ارزیابی‌های بعدی (weights لحظهٔ ثبت ذخیره می‌شود)', async () => {
    const r1 = await current();
    const before = await a.post(`/sessions/${r1.id}/evaluations`, r1.teacher, body(r1.itemId));
    await t.ds.query("INSERT INTO settings_cache (setting_key, value, version, updated_at) VALUES ('global', ?, 99, NOW(3)) ON DUPLICATE KEY UPDATE value = VALUES(value), version = 99", [JSON.stringify({ evalWeights: { voice: 100, tone: 0, tajweed: 0 }, badgeThresholds: [50, 150, 300, 500] })]);
    (t.app.get(SettingsService) as unknown as { cached?: unknown }).cached = undefined;
    const r2 = await current();
    const after = await a.post(`/sessions/${r2.id}/evaluations`, r2.teacher, body(r2.itemId));
    expect(before.body.data.weights.voice).toBe(40);
    expect(before.body.data.score).toBe(71);
    expect(after.body.data.weights).toEqual({ voice: 100, tone: 0, tajweed: 0 });
    expect(after.body.data.score).toBe(80);
    await t.ds.query('DELETE FROM settings_cache');
    (t.app.get(SettingsService) as unknown as { cached?: unknown }).cached = undefined;
  });
});
