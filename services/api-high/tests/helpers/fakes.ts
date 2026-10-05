import { randomUUID } from 'node:crypto';
import { uuidv7 } from '../../src/common/ids';
import { type TestApp, type User, failReply, okReply } from './app';

const LOW = '/c/internal/v1/admin';
const MID = '/o/internal/v1/admin';
const iso = () => new Date().toISOString();

export interface LowUser {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  status: 'active' | 'disabled' | 'deleted';
  hasPassword: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastActiveAt: string | null;
  activeSessions: number;
  sessionsByClient: Record<string, number>;
  /** رمز فعلی (فقط داخل fake؛ برای تطبیق verified=current) */
  _password?: string;
}
export interface LowSession {
  id: string;
  deviceLabel: string;
  platform: 'web' | 'android';
  client: string | null;
  ip: string;
  createdAt: string;
  lastActiveAt: string;
  revokedAt: string | null;
}

/** low جعلی با حالت درون‌حافظه‌ای: کاربر/نشست/رمز؛ همهٔ مسیرهای LOW_ADMIN */
export function installFakeLow(t: TestApp) {
  const users = new Map<string, LowUser>();
  const sessions = new Map<string, LowSession[]>();
  const strip = ({ _password: _p, ...u }: LowUser) => u;
  const find = (id: string) => users.get(id);
  const nf = () => failReply(404, 'NOT_FOUND', 'کاربر پیدا نشد.');
  const A = t.fake.admin;

  const addUser = (u: User, over: Partial<LowUser> = {}): LowUser => {
    const [first, ...rest] = u.name.split(' ');
    const lu: LowUser = { id: u.id, phone: u.phone, firstName: first ?? '', lastName: rest.join(' '), status: 'active', hasPassword: false, mustChangePassword: false, createdAt: iso(), lastActiveAt: null, activeSessions: 0, sessionsByClient: {}, ...over };
    users.set(u.id, lu);
    return lu;
  };
  const addSession = (userId: string, over: Partial<LowSession> = {}): LowSession => {
    const s: LowSession = { id: randomUUID(), deviceLabel: 'Chrome', platform: 'web', client: 'web-admin', ip: '5.6.7.8', createdAt: iso(), lastActiveAt: iso(), revokedAt: null, ...over };
    sessions.set(userId, [...(sessions.get(userId) ?? []), s]);
    return s;
  };

  A.on('POST', `${LOW}/users`, (c) => {
    if ([...users.values()].some((u) => u.phone === c.body.phone && u.status !== 'deleted')) return failReply(409, 'CONFLICT', 'شماره تکراری است.', { reason: 'PHONE_TAKEN' });
    const id = uuidv7();
    const lu: LowUser = { id, phone: c.body.phone, firstName: c.body.firstName, lastName: c.body.lastName, status: 'active', hasPassword: !!c.body.password, mustChangePassword: !!c.body.password, createdAt: iso(), lastActiveAt: null, activeSessions: 0, sessionsByClient: {}, _password: c.body.password };
    users.set(id, lu);
    return okReply(strip(lu));
  });
  A.on('GET', `${LOW}/users/:id`, (_c, p) => (find(p.id!) ? okReply(strip(find(p.id!)!)) : nf()));
  A.on('PATCH', `${LOW}/users/:id`, (c, p) => {
    const u = find(p.id!);
    if (!u) return nf();
    if (c.body.phone && [...users.values()].some((x) => x.id !== u.id && x.phone === c.body.phone)) return failReply(409, 'CONFLICT', 'شماره تکراری است.', { reason: 'PHONE_TAKEN' });
    Object.assign(u, c.body);
    return okReply(strip(u));
  });
  A.on('DELETE', `${LOW}/users/:id`, (_c, p) => {
    const u = find(p.id!);
    if (!u) return nf();
    Object.assign(u, { status: 'deleted', phone: `d${p.id!.replace(/-/g, '').slice(0, 10)}`, firstName: '', lastName: '', hasPassword: false });
    return okReply({});
  });
  A.on('POST', `${LOW}/users/:id/status`, (c, p) => {
    const u = find(p.id!);
    if (!u) return nf();
    u.status = c.body.status;
    return okReply(strip(u));
  });
  A.on('PUT', `${LOW}/users/:id/password`, (c, p) => {
    const u = find(p.id!);
    if (!u) return nf();
    if (c.body.action === 'set') Object.assign(u, { hasPassword: true, mustChangePassword: true, _password: c.body.password });
    else Object.assign(u, { hasPassword: false, mustChangePassword: false, _password: undefined });
    return okReply({});
  });
  A.on('POST', `${LOW}/users/:id/change-password`, (c, p) => {
    const u = find(p.id!);
    if (!u) return nf();
    if (c.body.verified === 'current' && (!u.mustChangePassword || c.body.currentPassword !== u._password)) return failReply(401, 'AUTH_INVALID_CREDENTIALS', 'رمز فعلی درست نیست.');
    Object.assign(u, { hasPassword: true, mustChangePassword: false, _password: c.body.newPassword });
    for (const s of sessions.get(p.id!) ?? []) if (s.id !== c.body.keepSessionId) s.revokedAt ??= iso();
    return okReply({});
  });
  A.on('POST', `${LOW}/users/:id/logout-all`, (_c, p) => {
    if (!find(p.id!)) return nf();
    for (const s of sessions.get(p.id!) ?? []) s.revokedAt ??= iso();
    return okReply({});
  });
  A.on('GET', `${LOW}/users/:id/sessions`, (c, p) => {
    if (!find(p.id!)) return nf();
    const page = Number(c.query.page ?? 1);
    const pageSize = Number(c.query.pageSize ?? 20);
    let all = sessions.get(p.id!) ?? [];
    if (c.query.activeOnly === 'true') all = all.filter((s) => !s.revokedAt);
    return okReply(all.slice((page - 1) * pageSize, page * pageSize), { page, pageSize, total: all.length });
  });
  A.on('DELETE', `${LOW}/users/:id/sessions/:sessionId`, (_c, p) => {
    const s = (sessions.get(p.id!) ?? []).find((x) => x.id === p.sessionId);
    if (!s) return failReply(404, 'NOT_FOUND', 'نشست پیدا نشد.');
    s.revokedAt ??= iso();
    return okReply({});
  });
  return { users, sessions, addUser, addSession, A };
}

/** mid جعلی: جلسه‌ها/اعضا + پاسخ‌های ثابت گزارش */
export function installFakeMid(t: TestApp) {
  const A = t.fake.admin;
  const sessions = new Map<string, any>();
  const members = new Map<string, any[]>();
  const nf = () => failReply(404, 'NOT_FOUND', 'جلسه پیدا نشد.');
  const mk = (over: Record<string, unknown> = {}) => {
    const id = (over.id as string) ?? uuidv7();
    const s = {
      id,
      title: 'جلسهٔ آزمایشی',
      description: 'توضیح جلسهٔ آزمایشی برای تست',
      schedule: { type: 'once', startsAt: '2026-10-10T10:00:00+03:30', endsAt: '2026-10-10T12:00:00+03:30' },
      nextStartsAt: '2026-10-10T10:00:00+03:30',
      location: { label: 'مسجد محل' },
      status: 'draft',
      createdBy: { id: uuidv7(), name: 'سازنده' },
      counts: { members: 0, pending: 0, attendance: 0, evaluations: 0 },
      createdAt: iso(),
      updatedAt: iso(),
      deletedAt: null,
      ...over
    };
    sessions.set(id, s);
    return s;
  };

  A.on('GET', `${MID}/sessions`, (c) => {
    const page = Number(c.query.page ?? 1);
    const pageSize = Number(c.query.pageSize ?? 20);
    const all = [...sessions.values()];
    return okReply(all.slice((page - 1) * pageSize, page * pageSize), { page, pageSize, total: all.length });
  });
  A.on('GET', `${MID}/sessions/:id`, (_c, p) => (sessions.get(p.id!) ? okReply(sessions.get(p.id!)) : nf()));
  A.on('POST', `${MID}/sessions`, (c) => okReply(mk({ ...c.body.session, createdBy: { id: c.body.creatorId, name: 'سازنده' } })));
  A.on('PATCH', `${MID}/sessions/:id`, (c, p) => {
    const s = sessions.get(p.id!);
    if (!s) return nf();
    if (s.status === 'started' || s.status === 'ended') return failReply(409, 'CONFLICT', 'قفل', { reason: 'SESSION_LOCKED' });
    Object.assign(s, c.body);
    return okReply(s);
  });
  A.on('POST', `${MID}/sessions/:id/transition`, (c, p) => {
    const s = sessions.get(p.id!);
    if (!s) return nf();
    s.status = c.body.to;
    return okReply(s);
  });
  A.on('DELETE', `${MID}/sessions/:id`, (_c, p) => {
    const s = sessions.get(p.id!);
    if (!s) return nf();
    s.deletedAt = iso();
    return okReply({});
  });
  A.on('GET', `${MID}/sessions/:id/members`, (c, p) => {
    if (!sessions.get(p.id!)) return nf();
    const all = (members.get(p.id!) ?? []).filter((m) => !c.query.status || m.status === c.query.status);
    return okReply(all, { page: Number(c.query.page ?? 1), pageSize: Number(c.query.pageSize ?? 20), total: all.length });
  });
  A.on('PATCH', `${MID}/sessions/:id/members/:memberId`, (c, p) => {
    const m = (members.get(p.id!) ?? []).find((x) => x.id === p.memberId);
    if (!m) return nf();
    m.status = c.body.action === 'approve' ? 'approved' : 'rejected';
    return okReply(m);
  });
  A.on('PUT', `${MID}/sessions/:id/members/:memberId/roles`, (c, p) => {
    const m = (members.get(p.id!) ?? []).find((x) => x.id === p.memberId);
    if (!m) return nf();
    m.roles = c.body.roles.length ? c.body.roles : ['quran_student'];
    return okReply(m);
  });
  A.on('DELETE', `${MID}/sessions/:id/members/:memberId`, (_c, p) => {
    const list = members.get(p.id!) ?? [];
    const m = list.find((x) => x.id === p.memberId);
    if (!m) return nf();
    if (m.roles.includes('session_manager')) return failReply(409, 'CONFLICT', 'مدیر قابل‌حذف نیست.');
    members.set(p.id!, list.filter((x) => x !== m));
    return okReply({});
  });
  A.on('GET', `${MID}/sessions/:id/attendance`, (_c, p) => (sessions.get(p.id!) ? okReply({ items: [], total: 0 }) : nf()));
  A.on('GET', `${MID}/sessions/:id/queue`, (_c, p) => (sessions.get(p.id!) ? okReply({ current: null, waiting: [], done: [], myItem: null, myPosition: null, waitingCount: 0 }) : nf()));
  A.on('GET', `${MID}/sessions/:id/evaluations`, (_c, p) => (sessions.get(p.id!) ? okReply({ items: [], total: 0 }) : nf()));
  A.on('GET', `${MID}/users/:id/summary`, () => okReply({ points: { total: 120, badges: 2 }, sessions: { created: 3, memberships: 5, attended: 4 } }));
  A.on('GET', `${MID}/reports/overview`, () => okReply({ sessions: { total: 9, created: 4, byStatus: { draft: 1, scheduled: 2, started: 3, ended: 3 } }, participation: { attendance: 40, evaluations: 12, avgScore: 77.5, pointsAwarded: 300 } }));
  A.on('GET', `${MID}/reports/sessions`, (c) => okReply({ interval: c.query.interval ?? 'day', items: [{ bucket: c.query.from, created: 1, held: 1, attendance: 5 }] }));
  A.on('GET', `${MID}/reports/leaderboard`, (c) => okReply({ items: [{ userId: uuidv7(), name: 'برتر', points: 500, badges: 4 }].slice(0, Number(c.query.limit ?? 20)) }));

  const addMember = (sessionId: string, over: Record<string, unknown> = {}) => {
    const m = { id: uuidv7(), userId: uuidv7(), name: 'عضو', roles: ['quran_student'], status: 'pending', requestedAt: iso(), phone: null, decidedAt: null, ...over };
    members.set(sessionId, [...(members.get(sessionId) ?? []), m]);
    return m;
  };
  return { sessions, members, mk, addMember };
}

export const lowReports = (t: TestApp) => {
  const P = LOW;
  t.fake.admin.on('GET', `${P}/reports/users`, () => okReply({ total: 50, registered: 5, byStatus: { active: 45, disabled: 3, deleted: 2 }, withPassword: 7, series: { interval: 'day', items: [] } }));
  t.fake.admin.on('GET', `${P}/reports/otp`, (c) => okReply({ interval: c.query.interval ?? 'day', items: [{ bucket: c.query.from, requested: 10, verified: 8 }, { bucket: c.query.to, requested: 5, verified: 4 }] }));
  t.fake.admin.on('GET', `${P}/reports/clients`, () => okReply({ items: [{ client: 'web-admin', activeSessions: 3 }, { client: 'android-low', activeSessions: 9 }] }));
};
