/**
 * mock قرارداد mid (docs-v2/18). فقط داخل web-main؛ نه سرور واقعی.
 * کاربر نمونه 09121234567 (id 1111…) در جلسات seed نقش‌های مختلف دارد:
 *  s1 manager · s2 manager+teacher (جاری) · s3 supporter · s4 student · s5 student (جاری، با ربات) · s6 pending · s10 teacher.
 * سایر کاربران هیچ عضویتی ندارند. ساخت جلسه: شماره‌های 0912….
 */
import { ApiError, type Page, type PublicSession } from '../types';
import type {
  AttendanceResult,
  Evaluation,
  EvaluationInput,
  LiveEvent,
  Member,
  MembershipStatus,
  MidApi,
  MidSession,
  MySessionItem,
  Permission,
  QueueAction,
  QueueItem,
  QueueState,
  SessionInput,
  SessionRole,
  SessionState
} from '../mid-types';
import { getScenario } from './control';
import {
  DEFAULT_WEIGHTS,
  canTransition,
  computeScore,
  evalPoints,
  isStaffRole,
  permissionsFor,
  validateEvaluation,
  validateSessionInput
} from './midRules';
import { nextOccurrence, seedSessions } from './seed';
import { actorFromToken, dataGuard, displayName, enter, lookupUser, uid } from './shared';

const KEY = 'isra.mock.mid.v1';
const CHANNEL = 'isra-mock-live';
const DEMO = '11111111-1111-4111-8111-111111111111';
const sid = (n: number) => `6f3c2a10-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BOT_SESSIONS = new Set([sid(5)]);

interface MSession extends Omit<MidSession, 'nextStartsAt'> {
  createdBy: string;
}
interface MMember {
  id: string;
  sessionId: string;
  userId: string;
  name: string;
  roles: SessionRole[];
  status: MembershipStatus;
  requestedAt: string;
}
interface MAttendance {
  sessionId: string;
  userId: string;
  name: string;
  enteredAt: string;
}
interface MQueue {
  id: string;
  sessionId: string;
  userId: string;
  name: string;
  status: 'waiting' | 'current' | 'done';
  order: number;
  joinedAt: string;
}
interface MState {
  sessions: MSession[];
  members: MMember[];
  attendance: MAttendance[];
  queue: MQueue[];
  evals: Evaluation[];
  ledger: { userId: string; points: number; reason: string; at: string }[];
  seq: number;
}

const FAKE_NAMES = [
  'امیرحسین کاظمی',
  'زهرا صادقی',
  'علی نوری',
  'فاطمه رحیمی',
  'محمدرضا اکبری',
  'مریم حسینی',
  'یاسین موسوی',
  'نرگس جعفری'
];
const fakeId = (i: number) => `fake-${i}`;
const fakeName = (userId: string) => FAKE_NAMES[Number(userId.replace('fake-', '')) % FAKE_NAMES.length] ?? 'کاربر';
const isFake = (userId: string) => userId.startsWith('fake-');
const BOT_EVALUATOR = 'معلم نمونه';

export function publicSessionFrom(s: MSession): PublicSession | null {
  if (s.status === 'draft') return null;
  return toDto(s) as PublicSession;
}

function nextStart(s: MSession): string | null {
  if (s.status !== 'scheduled') return null;
  const sc = s.schedule;
  if (sc.type === 'once') return sc.startsAt;
  const from = sc.type === 'range' ? new Date(Math.max(Date.now(), Date.parse(sc.rangeFrom))) : new Date();
  return nextOccurrence(sc.weekdays, sc.timeOfDay, from).toISOString();
}
function toDto(s: MSession): MidSession {
  const { createdBy: _c, ...rest } = s;
  void _c;
  return { ...rest, nextStartsAt: nextStart(s) };
}

function seed(): MState {
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const pub = seedSessions();
  const sessions: MSession[] = pub.map((p) => {
    const { nextStartsAt: _n, ...rest } = p;
    void _n;
    return { ...rest, createdBy: DEMO } as MSession;
  });
  sessions.push({
    id: sid(11),
    title: 'دورهٔ تازه‌های پاییزی',
    description: 'دورهٔ مقدماتی روخوانی برای تازه‌کارها؛ پیش‌نویس در انتظار انتشار.',
    status: 'draft',
    schedule: { type: 'once', startsAt: iso(-20 * 86_400_000), endsAt: iso(-20 * 86_400_000 + 5_400_000) },
    location: { label: 'آنلاین · پیوند پس از عضویت' },
    createdBy: DEMO
  });

  const members: MMember[] = [];
  const addM = (n: number, userId: string, roles: SessionRole[], status: MembershipStatus = 'approved') =>
    members.push({
      id: `m-${members.length + 1}`,
      sessionId: sid(n),
      userId,
      name: isFake(userId) ? fakeName(userId) : 'سارا محمدی',
      roles,
      status,
      requestedAt: iso((members.length + 2) * 3_600_000)
    });
  addM(1, DEMO, ['session_manager']);
  addM(2, DEMO, ['session_manager', 'teacher']);
  addM(3, DEMO, ['session_supporter']);
  addM(4, DEMO, ['quran_student']);
  addM(5, DEMO, ['quran_student']);
  addM(6, DEMO, ['quran_student'], 'pending');
  addM(10, DEMO, ['teacher']);
  addM(11, DEMO, ['session_manager']);
  addM(1, fakeId(5), ['quran_student'], 'pending');
  addM(3, fakeId(6), ['quran_student'], 'pending');
  addM(3, fakeId(7), ['quran_student'], 'pending');
  for (let i = 0; i < 6; i++) addM(2, fakeId(i), ['quran_student']);
  for (let i = 0; i < 5; i++) addM(5, fakeId(i), ['quran_student']);

  const attendance: MAttendance[] = [];
  for (const [n, count] of [
    [2, 6],
    [5, 4]
  ] as const)
    for (let i = 0; i < count; i++)
      attendance.push({ sessionId: sid(n), userId: fakeId(i), name: fakeName(fakeId(i)), enteredAt: iso((count - i) * 420_000) });

  const queue: MQueue[] = [];
  const addQ = (n: number, i: number, status: MQueue['status'], order: number) =>
    queue.push({ id: `q-${queue.length + 1}`, sessionId: sid(n), userId: fakeId(i), name: fakeName(fakeId(i)), status, order, joinedAt: iso(900_000 - order * 60_000) });
  addQ(2, 0, 'done', 1);
  addQ(2, 1, 'current', 2);
  addQ(2, 2, 'waiting', 3);
  addQ(2, 3, 'waiting', 4);
  addQ(2, 4, 'waiting', 5);
  addQ(5, 0, 'current', 1);
  addQ(5, 1, 'waiting', 2);
  addQ(5, 2, 'waiting', 3);

  const evals: Evaluation[] = [
    {
      id: 'e-1',
      sessionId: sid(2),
      queueItemId: 'q-1',
      userId: fakeId(0),
      userName: fakeName(fakeId(0)),
      evaluatorName: 'سارا محمدی',
      voice: 8,
      tone: 7,
      tajweed: 9,
      weights: DEFAULT_WEIGHTS,
      score: computeScore({ voice: 8, tone: 7, tajweed: 9 }),
      points: evalPoints(computeScore({ voice: 8, tone: 7, tajweed: 9 })),
      note: 'قرائت روان؛ روی مدّها بیشتر تمرین کنید.',
      createdAt: iso(600_000)
    }
  ];
  return { sessions, members, attendance, queue, evals, ledger: [], seq: 100 };
}

let state: MState | null = null;
const listeners = new Map<string, Set<(e: LiveEvent) => void>>();
let channel: BroadcastChannel | null = null;

function load(): MState {
  if (state) return state;
  let loaded: MState | null = null;
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) loaded = JSON.parse(raw) as MState;
    } catch {
      loaded = null;
    }
  }
  state = loaded ?? seed();
  if (typeof BroadcastChannel !== 'undefined' && !channel) {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (m: MessageEvent<LiveEvent>) => {
      state = null; // دوباره از localStorage
      notify(m.data);
    };
  }
  return state;
}
function save() {
  if (typeof localStorage === 'undefined' || !state) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
function notify(e: LiveEvent) {
  listeners.get(e.sessionId)?.forEach((h) => h(e));
}
function commit(...events: LiveEvent[]) {
  save();
  for (const e of events) {
    notify(e);
    channel?.postMessage(e);
  }
}

/* ───────── exports برای mock لایهٔ low ───────── */
export const pointsLedgerTotal = (userId: string): number =>
  load()
    .ledger.filter((l) => l.userId === userId)
    .reduce((a, l) => a + l.points, 0);

export const publicSessions = (): PublicSession[] =>
  load()
    .sessions.map(publicSessionFrom)
    .filter((s): s is PublicSession => s !== null);

/* ───────── کمک‌ها ───────── */
const forbidden = (msg = 'برای این کار مجوز ندارید.') => new ApiError('AUTH_FORBIDDEN', msg, 403);
const notFound = (msg = 'پیدا نشد.') => new ApiError('NOT_FOUND', msg, 404);
const conflict = (reason: string, msg: string) => new ApiError('CONFLICT', msg, 409, { reason });

function sessionOrThrow(id: string): MSession {
  const s = load().sessions.find((x) => x.id === id);
  if (!s) throw notFound('این جلسه پیدا نشد.');
  return s;
}
function membership(sessionId: string, userId: string): MMember | undefined {
  return load().members.find((m) => m.sessionId === sessionId && m.userId === userId);
}
function perms(sessionId: string, userId: string): Permission[] {
  const m = membership(sessionId, userId);
  return m && m.status === 'approved' ? permissionsFor(m.roles) : [];
}
function need(sessionId: string, userId: string, p: Permission, msg?: string) {
  if (!perms(sessionId, userId).includes(p)) throw forbidden(msg);
}
function approvedMember(sessionId: string, userId: string): MMember {
  const m = membership(sessionId, userId);
  if (!m || m.status !== 'approved') throw forbidden('فقط اعضای تأییدشدهٔ جلسه مجازند.');
  return m;
}
const memberDto = (m: MMember): Member => ({
  id: m.id,
  userId: m.userId,
  name: m.name,
  roles: m.roles,
  status: m.status,
  requestedAt: m.requestedAt
});

function queueState(sessionId: string, userId: string): QueueState {
  const q = load().queue.filter((x) => x.sessionId === sessionId);
  const staff = perms(sessionId, userId).includes('queue.manage');
  const waiting = q.filter((x) => x.status === 'waiting').sort((a, b) => a.order - b.order);
  const evaluated = new Set(load().evals.filter((e) => e.sessionId === sessionId).map((e) => e.queueItemId));
  const dto = (x: MQueue, position: number | null): QueueItem => {
    const isMe = x.userId === userId;
    return {
      id: x.id,
      userId: staff || isMe ? x.userId : '',
      name: staff || isMe || x.status === 'current' ? x.name : null,
      status: x.status,
      position,
      joinedAt: x.joinedAt,
      evaluated: evaluated.has(x.id),
      isMe
    };
  };
  const waitingDto = waiting.map((x, i) => dto(x, i + 1));
  const current = q.find((x) => x.status === 'current');
  const done = q
    .filter((x) => x.status === 'done')
    .sort((a, b) => b.order - a.order)
    .map((x) => dto(x, null));
  const mine = q.filter((x) => x.userId === userId && x.status !== 'done').sort((a, b) => a.order - b.order)[0];
  const myPos = mine?.status === 'waiting' ? waiting.findIndex((x) => x.id === mine.id) + 1 : null;
  return {
    current: current ? dto(current, null) : null,
    waiting: staff ? waitingDto : waitingDto.filter((x) => x.isMe),
    done: staff ? done : done.filter((x) => x.isMe),
    myItem: mine ? dto(mine, myPos) : null,
    myPosition: myPos,
    waitingCount: waiting.length
  };
}

/** نفر جاری ⇒ done؛ اولین منتظر ⇒ current (مشترک بین کادر و ربات) */
function advance(sessionId: string): { finished: MQueue | null; now: MQueue | null } {
  const s = load();
  const q = s.queue.filter((x) => x.sessionId === sessionId);
  const cur = q.find((x) => x.status === 'current') ?? null;
  if (cur) cur.status = 'done';
  const nxt = q.filter((x) => x.status === 'waiting').sort((a, b) => a.order - b.order)[0] ?? null;
  if (nxt) nxt.status = 'current';
  return { finished: cur, now: nxt };
}

function createEval(sessionId: string, item: MQueue, input: EvaluationInput, evaluatorName: string): Evaluation {
  const s = load();
  const score = computeScore(input);
  const ev: Evaluation = {
    id: `e-${++s.seq}`,
    sessionId,
    queueItemId: item.id,
    userId: item.userId,
    userName: item.name,
    evaluatorName,
    voice: input.voice,
    tone: input.tone,
    tajweed: input.tajweed,
    weights: DEFAULT_WEIGHTS,
    score,
    points: evalPoints(score),
    note: (input.note ?? '').trim(),
    createdAt: new Date().toISOString()
  };
  s.evals.push(ev);
  s.ledger.push({ userId: item.userId, points: ev.points, reason: 'evaluation', at: ev.createdAt });
  return ev;
}

/* ───────── ربات نمونه: فقط در جلسهٔ s5 تا جریان زنده دیده شود ───────── */
const botTimers = new Map<string, ReturnType<typeof setInterval>>();
function startBot(sessionId: string) {
  if (typeof window === 'undefined' || botTimers.has(sessionId) || !BOT_SESSIONS.has(sessionId)) return;
  let tick = 0;
  botTimers.set(
    sessionId,
    setInterval(() => {
      const s = load();
      const session = s.sessions.find((x) => x.id === sessionId);
      if (!session || session.status !== 'started') return;
      tick += 1;
      const events: LiveEvent[] = [];
      const waiting = s.queue.filter((x) => x.sessionId === sessionId && x.status === 'waiting');
      // هر دو تیک: یک دانش‌آموز نمونه به صف می‌پیوندد
      if (tick % 2 === 0 && waiting.length < 3) {
        const free = FAKE_NAMES.map((_, i) => i).find(
          (i) => !s.queue.some((x) => x.sessionId === sessionId && x.userId === fakeId(i) && x.status !== 'done')
        );
        if (free !== undefined) {
          s.queue.push({
            id: `q-${++s.seq}`,
            sessionId,
            userId: fakeId(free),
            name: fakeName(fakeId(free)),
            status: 'waiting',
            order: Math.max(0, ...s.queue.filter((x) => x.sessionId === sessionId).map((x) => x.order)) + 1,
            joinedAt: new Date().toISOString()
          });
          events.push({ type: 'queue.updated', sessionId });
        }
      }
      // هر تیک سوم: معلم نمونه نوبت را جلو می‌برد؛ اگر نوبت کاربر واقعی تمام شد ارزیابی می‌کند
      if (tick % 3 === 0) {
        const { finished, now } = advance(sessionId);
        events.push({ type: 'queue.updated', sessionId });
        if (finished && !isFake(finished.userId) && !s.evals.some((e) => e.queueItemId === finished.id)) {
          createEval(
            sessionId,
            finished,
            { queueItemId: finished.id, voice: 7 + (tick % 3), tone: 6 + (tick % 4), tajweed: 7 + (tick % 2), note: 'قرائت خوبی بود؛ ادامه دهید.' },
            BOT_EVALUATOR
          );
          events.push({ type: 'eval.updated', sessionId });
        }
        if (now && !isFake(now.userId)) events.push({ type: 'queue.turned', sessionId, payload: { userId: now.userId } });
      }
      if (events.length) commit(...events);
    }, 7000)
  );
}
function stopBot(sessionId: string) {
  const t = botTimers.get(sessionId);
  if (t) clearInterval(t);
  botTimers.delete(sessionId);
}

/* ───────── API ───────── */
function createMidApi(): MidApi {
  const who = (t: string) => actorFromToken(t).userId;
  const guarded = async <T>(fn: () => T, data = false): Promise<T> => {
    await enter();
    if (data) dataGuard();
    return fn();
  };
  const fieldsError = (fields: Record<string, string>) =>
    new ApiError('VALIDATION_FAILED', 'اطلاعات واردشده معتبر نیست.', 400, { fields });

  const api: MidApi = {
    me: {
      get: (t) =>
        guarded(() => {
          const u = who(t);
          const canCreate = Boolean(lookupUser(u)?.phone.startsWith('0912'));
          const hasStaff = load().members.some((m) => m.userId === u && m.status === 'approved' && m.roles.some(isStaffRole));
          return { canCreateSession: canCreate, hasStaffRole: hasStaff };
        }, true),

      sessions: (t, scope = 'all') =>
        guarded(() => {
          if (getScenario() === 'empty') return [];
          const u = who(t);
          const s = load();
          const items: MySessionItem[] = [];
          for (const m of s.members.filter((x) => x.userId === u)) {
            const session = s.sessions.find((x) => x.id === m.sessionId);
            if (!session) continue;
            const staff = m.status === 'approved' && m.roles.some(isStaffRole);
            if (scope === 'staff' && !staff) continue;
            const canApprove = m.status === 'approved' && permissionsFor(m.roles).includes('membership.approve');
            items.push({
              session: toDto(session),
              roles: m.roles,
              membership: m.status,
              pendingCount: canApprove ? s.members.filter((x) => x.sessionId === session.id && x.status === 'pending').length : undefined
            });
          }
          const order: Record<SessionState, number> = { started: 0, scheduled: 1, draft: 2, ended: 3 };
          return items.sort((a, b) => order[a.session.status] - order[b.session.status]);
        }, true),
    },

    sessions: {
      me: (t, id) =>
        guarded(() => {
          const u = who(t);
          const s = sessionOrThrow(id);
          const m = membership(id, u);
          if (s.status === 'draft' && !m) throw notFound('این جلسه پیدا نشد.');
          return {
            session: toDto(s),
            membership: m ? { status: m.status, roles: m.roles } : null,
            permissions: perms(id, u),
            myAttendance: (() => {
              const a = load().attendance.find((x) => x.sessionId === id && x.userId === u);
              return a ? { enteredAt: a.enteredAt } : null;
            })()
          };
        }, true),

      create: (t, input) =>
        guarded(() => {
          const u = who(t);
          if (!lookupUser(u)?.phone.startsWith('0912')) throw forbidden('ساخت جلسه برای حساب شما فعال نیست.');
          const errs = validateSessionInput(input);
          if (Object.keys(errs).length) throw fieldsError(errs);
          const s = load();
          const session: MSession = {
            id: uid(),
            title: input.title.trim(),
            description: input.description.trim(),
            status: 'draft',
            schedule: input.schedule,
            location: { label: input.location.label.trim() },
            createdBy: u
          };
          s.sessions.push(session);
          s.members.push({ id: `m-${++s.seq}`, sessionId: session.id, userId: u, name: displayName(u), roles: ['session_manager'], status: 'approved', requestedAt: new Date().toISOString() });
          commit();
          return toDto(session);
        }),

      update: (t, id, input) =>
        guarded(() => {
          const u = who(t);
          const s = sessionOrThrow(id);
          need(id, u, 'session.edit', 'فقط مدیر جلسه می‌تواند آن را ویرایش کند.');
          if (s.status !== 'draft' && s.status !== 'scheduled')
            throw conflict('SESSION_LOCKED', 'جلسهٔ شروع‌شده یا پایان‌یافته قابل ویرایش نیست.');
          const errs = validateSessionInput(input);
          if (Object.keys(errs).length) throw fieldsError(errs);
          s.title = input.title.trim();
          s.description = input.description.trim();
          s.schedule = input.schedule;
          s.location = { label: input.location.label.trim() };
          commit({ type: 'session.state', sessionId: id });
          return toDto(s);
        }),

      transition: (t, id, to) =>
        guarded(() => {
          const u = who(t);
          const s = sessionOrThrow(id);
          need(id, u, 'session.transition', 'فقط مدیر جلسه می‌تواند وضعیت را تغییر دهد.');
          if (!canTransition(s.status, to))
            throw new ApiError('SESSION_INVALID_TRANSITION', 'تغییر وضعیت جلسه فقط یک‌قدم رو به جلو ممکن است.', 409, { from: s.status, to });
          s.status = to;
          commit({ type: 'session.state', sessionId: id, payload: { status: to } });
          return toDto(s);
        }),
    },

    members: {
      request: (t, sessionId) =>
        guarded(() => {
          const u = who(t);
          const s = sessionOrThrow(sessionId);
          if (s.status === 'draft') throw notFound('این جلسه پیدا نشد.');
          if (s.status === 'ended') throw conflict('SESSION_LOCKED', 'این جلسه پایان یافته است.');
          if (membership(sessionId, u)) throw conflict('ALREADY_MEMBER', 'درخواست یا عضویت شما از قبل ثبت شده است.');
          const st = load();
          const m: MMember = { id: `m-${++st.seq}`, sessionId, userId: u, name: displayName(u), roles: ['quran_student'], status: 'pending', requestedAt: new Date().toISOString() };
          st.members.push(m);
          commit();
          return memberDto(m);
        }),

      list: (t, sessionId, status) =>
        guarded(() => {
          need(sessionId, who(t), 'membership.approve', 'فقط مدیر و پشتیبان جلسه به فهرست اعضا دسترسی دارند.');
          return load()
            .members.filter((m) => m.sessionId === sessionId && (!status || m.status === status))
            .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
            .map(memberDto);
        }, true),

      decide: (t, sessionId, memberId, action) =>
        guarded(() => {
          need(sessionId, who(t), 'membership.approve', 'فقط مدیر و پشتیبان جلسه می‌توانند عضویت را تأیید کنند.');
          const m = load().members.find((x) => x.id === memberId && x.sessionId === sessionId);
          if (!m) throw notFound('این درخواست پیدا نشد.');
          if (m.status !== 'pending') throw conflict('ALREADY_DECIDED', 'دربارهٔ این درخواست قبلاً تصمیم گرفته شده است.');
          m.status = action === 'approve' ? 'approved' : 'rejected';
          commit();
          return memberDto(m);
        }),

      setRoles: (t, sessionId, memberId, roles) =>
        guarded(() => {
          need(sessionId, who(t), 'membership.roles', 'فقط مدیر جلسه می‌تواند نقش‌ها را تغییر دهد.');
          const m = load().members.find((x) => x.id === memberId && x.sessionId === sessionId);
          if (!m) throw notFound('این عضو پیدا نشد.');
          if (m.roles.includes('session_manager')) throw forbidden('نقش مدیر جلسه از اینجا قابل تغییر نیست.');
          if (m.status !== 'approved') throw conflict('NOT_APPROVED', 'ابتدا عضویت باید تأیید شود.');
          const allowed: SessionRole[] = ['session_supporter', 'teacher', 'quran_student'];
          if (roles.some((r) => !allowed.includes(r))) throw fieldsError({ roles: 'نقش نامعتبر است.' });
          m.roles = roles.length ? [...new Set(roles)] : ['quran_student'];
          commit();
          return memberDto(m);
        }),
    },

    attendance: {
      checkIn: (t, sessionId) =>
        guarded(() => {
          const u = who(t);
          const s = sessionOrThrow(sessionId);
          const m = approvedMember(sessionId, u);
          if (s.status !== 'started') throw conflict('SESSION_LOCKED', 'ثبت حضور فقط وقتی جلسه شروع شده ممکن است.');
          const st = load();
          const existing = st.attendance.find((a) => a.sessionId === sessionId && a.userId === u);
          if (existing) return { entry: { userId: u, name: existing.name, enteredAt: existing.enteredAt }, pointsAwarded: 0, alreadyPresent: true } satisfies AttendanceResult;
          const a: MAttendance = { sessionId, userId: u, name: m.name, enteredAt: new Date().toISOString() };
          st.attendance.push(a);
          st.ledger.push({ userId: u, points: 5, reason: 'attendance', at: a.enteredAt });
          commit({ type: 'attendance.updated', sessionId });
          return { entry: { userId: u, name: a.name, enteredAt: a.enteredAt }, pointsAwarded: 5, alreadyPresent: false } satisfies AttendanceResult;
        }),

      list: (t, sessionId) =>
        guarded(() => {
          need(sessionId, who(t), 'attendance.view', 'فقط کادر جلسه به فهرست حاضرین دسترسی دارد.');
          const items = load()
            .attendance.filter((a) => a.sessionId === sessionId)
            .sort((a, b) => a.enteredAt.localeCompare(b.enteredAt))
            .map(({ userId, name, enteredAt }) => ({ userId, name, enteredAt }));
          return { items, total: items.length };
        }, true),
    },

    queue: {
      join: (t, sessionId) =>
        guarded(() => {
          const u = who(t);
          const s = sessionOrThrow(sessionId);
          const m = approvedMember(sessionId, u);
          if (!m.roles.includes('quran_student')) throw forbidden('پیوستن به صف مخصوص قرآن‌آموزان است.');
          if (s.status !== 'started') throw conflict('SESSION_LOCKED', 'صف فقط وقتی جلسه شروع شده فعال است.');
          const st = load();
          if (!st.attendance.some((a) => a.sessionId === sessionId && a.userId === u))
            throw conflict('NOT_PRESENT', 'ابتدا حضور خود را ثبت کنید.');
          if (st.queue.some((x) => x.sessionId === sessionId && x.userId === u && x.status !== 'done'))
            throw conflict('ALREADY_IN_QUEUE', 'شما در صف هستید.');
          const item: MQueue = {
            id: `q-${++st.seq}`,
            sessionId,
            userId: u,
            name: m.name,
            status: 'waiting',
            order: Math.max(0, ...st.queue.filter((x) => x.sessionId === sessionId).map((x) => x.order)) + 1,
            joinedAt: new Date().toISOString()
          };
          st.queue.push(item);
          commit({ type: 'queue.updated', sessionId });
          return queueState(sessionId, u).myItem as QueueItem;
        }),

      leave: (t, sessionId) =>
        guarded(() => {
          const u = who(t);
          const st = load();
          const i = st.queue.findIndex((x) => x.sessionId === sessionId && x.userId === u && x.status === 'waiting');
          if (i < 0) throw notFound('شما در صف نیستید.');
          st.queue.splice(i, 1);
          commit({ type: 'queue.updated', sessionId });
        }),

      state: (t, sessionId) =>
        guarded(() => {
          const u = who(t);
          approvedMember(sessionId, u);
          return queueState(sessionId, u);
        }, true),

      next: (t, sessionId) =>
        guarded(() => {
          const u = who(t);
          const s = sessionOrThrow(sessionId);
          need(sessionId, u, 'queue.manage', 'فقط مدیر، پشتیبان و معلم جلسه صف را مدیریت می‌کنند.');
          if (s.status !== 'started') throw conflict('SESSION_LOCKED', 'صف فقط وقتی جلسه شروع شده فعال است.');
          const { now } = advance(sessionId);
          const events: LiveEvent[] = [{ type: 'queue.updated', sessionId }];
          if (now) events.push({ type: 'queue.turned', sessionId, payload: { userId: now.userId } });
          commit(...events);
          return queueState(sessionId, u);
        }),

      act: (t, sessionId, itemId, action: QueueAction) =>
        guarded(() => {
          const u = who(t);
          need(sessionId, u, 'queue.manage', 'فقط مدیر، پشتیبان و معلم جلسه صف را مدیریت می‌کنند.');
          const st = load();
          const waiting = st.queue.filter((x) => x.sessionId === sessionId && x.status === 'waiting').sort((a, b) => a.order - b.order);
          const idx = waiting.findIndex((x) => x.id === itemId);
          if (idx < 0) throw notFound('این مورد در صف منتظر پیدا نشد.');
          const item = waiting[idx];
          if (action === 'remove') st.queue.splice(st.queue.indexOf(item), 1);
          else if (action === 'skip') item.order = Math.max(...waiting.map((x) => x.order)) + 1;
          else {
            const other = waiting[action === 'up' ? idx - 1 : idx + 1];
            if (other) [item.order, other.order] = [other.order, item.order];
          }
          commit({ type: 'queue.updated', sessionId });
          return queueState(sessionId, u);
        }),
    },

    evaluations: {
      submit: (t, sessionId, input) =>
        guarded(() => {
          const u = who(t);
          sessionOrThrow(sessionId);
          need(sessionId, u, 'eval.submit', 'ثبت ارزیابی فقط برای معلم و پشتیبان جلسه مجاز است.');
          const errs = validateEvaluation(input);
          if (Object.keys(errs).length) throw fieldsError(errs);
          const st = load();
          const item = st.queue.find((x) => x.id === input.queueItemId && x.sessionId === sessionId);
          if (!item || item.status === 'waiting') throw notFound('این نوبت برای ارزیابی پیدا نشد.');
          if (st.evals.some((e) => e.queueItemId === item.id)) throw conflict('ALREADY_EVALUATED', 'برای این نوبت قبلاً ارزیابی ثبت شده است.');
          const ev = createEval(sessionId, item, input, displayName(u));
          commit({ type: 'eval.updated', sessionId });
          return ev;
        }),

      list: (t, sessionId) =>
        guarded((): Page<Evaluation> => {
          const u = who(t);
          approvedMember(sessionId, u);
          const p = perms(sessionId, u);
          const all = load()
            .evals.filter((e) => e.sessionId === sessionId && (p.includes('eval.submit') || p.includes('queue.manage') || e.userId === u))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          return { items: all, page: 1, pageSize: all.length || 1, total: all.length };
        }, true),

      weights: () => DEFAULT_WEIGHTS,
    },

    live: {
      subscribe: (t, sessionId, handler) => {
        who(t);
        load();
        let set = listeners.get(sessionId);
        if (!set) listeners.set(sessionId, (set = new Set()));
        set.add(handler);
        startBot(sessionId);
        return () => {
          set.delete(handler);
          if (set.size === 0) {
            listeners.delete(sessionId);
            stopBot(sessionId);
          }
        };
      },
    },
  };
  return api;
}

export const midMockApi = createMidApi();
