import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { internal } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf } from '../common/ids';
import { LiveService } from '../live/live.service';
import { MembersAccess } from '../domain/access.service';
import { conflict, parseJson, type Q } from '../domain/db';
import { type AddItem, MembersService, adminMemberDto } from '../domain/members.service';
import { type InboxItem, emitInboxBatch } from '../domain/outbox.writer';
import { ALL_SESSION_PERMISSIONS, type SessionRole, type SessionState } from '../domain/rules';
import { type Schedule, nextStartsAt } from '../domain/schedule';

type AddBody = z.infer<typeof internal.MidAdminAddMembers>;
type OwnerBody = z.infer<typeof internal.MidAdminOwner>;
type NotifyBody = z.infer<typeof internal.MidAdminNotify>;
type MembershipsQuery = z.infer<typeof internal.MidAdminUserMembershipsQuery>;

const INBOX_REF = /^(session:[A-Za-z0-9_-]{1,64}|points|badge:[A-Za-z0-9_-]{1,64}|announcement:[A-Za-z0-9_-]{1,64})$/;
const ref = (id: string) => `session:${id}`;

/**
 * مسیرهای عضویت MID_ADMIN (فقط api-high؛ مجوز و audit در high). قواعد دامنه همان قواعد عادی با استثناهای ادمین
 * (جلسهٔ ended هم قابل افزودن؛ replace؛ ساخت ردیف دایرکتوری با نام ارسالی). جلسهٔ حذف‌شده: خواندن مجاز، نوشتن ⇒ 404.
 */
@Injectable()
export class AdminMembersService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly members: MembersService,
    private readonly access: MembersAccess,
    private readonly live: LiveService
  ) {}

  /** وجود جلسه (حتی حذف‌شده) برای خواندن */
  private async exists(id: string): Promise<string> {
    if (!isUuid(id)) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    const r = (await this.ds.query('SELECT 1 AS x FROM sessions WHERE id = ?', [uuidToBuf(id)])) as unknown[];
    if (!r.length) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    return id;
  }

  async list(sessionId: string, f: { status?: string; q?: string; userId?: string }, page: number, pageSize: number) {
    const r = await this.members.query(await this.exists(sessionId), f, page, pageSize);
    return { items: r.rows.map(adminMemberDto), page, pageSize, total: r.total };
  }

  async decide(sessionId: string, memberId: string, action: 'approve' | 'reject') {
    return adminMemberDto(await this.members.decide(null, sessionId, memberId, action));
  }

  removeMember(sessionId: string, memberId: string) {
    return this.members.remove(null, sessionId, memberId);
  }

  /** H-73 ⇒ membersAdd: یک تراکنش چندردیفی؛ کاربر ناموجود در دایرکتوری mid با نام ارسالی ساخته می‌شود */
  async add(sessionId: string, b: AddBody) {
    const ensure = new Map(b.items.map((i) => [i.userId, { firstName: i.firstName ?? '', lastName: i.lastName ?? '' }]));
    const items: AddItem[] = b.items.map((i) => ({ userId: i.userId }));
    const res = await this.ds.transaction(async (m) => {
      const session = await this.members.requireLiveSession(m, sessionId, true);
      return this.members.applyAdd(m, session, items, { actorId: b.actorId, source: 'admin', notify: b.notify, ensureDirectory: ensure });
    });
    this.live.emit(sessionId, 'members.updated');
    const rows = await this.members.resultRows(sessionId, res);
    return { items: res.map((r) => ({ userId: r.userId!, outcome: r.outcome, member: r.memberId && r.outcome !== 'full' && rows.get(r.memberId) ? adminMemberDto(rows.get(r.memberId)!) : null })) };
  }

  /** H-53 ⇒ membersDecide: تصمیم گروهی در یک تراکنش */
  async decideBulk(sessionId: string, b: z.infer<typeof internal.MidAdminDecideBulk>) {
    let rejected: string[] = [];
    const outcomes = await this.ds.transaction(async (m) => {
      const session = await this.members.requireLiveSession(m, sessionId, true);
      const r = await this.members.decideMany(m, session, b.memberIds, b.action, b.actorId);
      if (b.action === 'reject') rejected = r.changedUsers;
      return r.outcomes;
    });
    this.live.emit(sessionId, 'members.updated');
    this.live.evict(sessionId, rejected);
    return { items: [...new Set(b.memberIds)].map((memberId) => ({ memberId, outcome: outcomes.get(memberId) ?? 'not_found' })) };
  }

  /**
   * H-74 ⇒ owner (۱.۷.۰): کاربر فعال صاحب جلسه می‌شود (ردیف عضویت و پشتیبان per جلسهٔ او برداشته می‌شود — صاحب همه‌کاره است)؛
   * صاحب قبلی: supporter ⇒ پشتیبان per جلسه با همهٔ مجوزها؛ remove ⇒ بدون نقش. همان صاحب فعلی ⇒ بدون تغییر.
   * پشتیبان‌های ثابت صاحب قبلی دیگر مؤثر نیستند (owner_id عوض می‌شود). created_by دست نمی‌خورد.
   */
  async owner(sessionId: string, b: OwnerBody): Promise<void> {
    const evicted: string[] = [];
    let changed = false;
    let queueChanged = false;
    let prevOwner = '';
    await this.ds.transaction(async (m) => {
      const session = await this.members.requireLiveSession(m, sessionId, true);
      const now = this.clock.now();
      const uid = uuidToBuf(b.userId);
      await m.query('INSERT IGNORE INTO user_directory (user_id, first_name, last_name, updated_at) VALUES (?, ?, ?, ?)', [uid, (b.firstName ?? '').slice(0, 40), (b.lastName ?? '').slice(0, 40), now]);
      const d = ((await m.query('SELECT status, deleted FROM user_directory WHERE user_id = ?', [uid])) as { status: string; deleted: number }[])[0];
      if (!d || d.deleted || d.status !== 'active') throw conflict('USER_NOT_ACTIVE', 'این کاربر فعال نیست.');
      if (session.owner_id === b.userId) return;
      prevOwner = session.owner_id;
      const sid = uuidToBuf(sessionId);
      // صاحب جدید: عضویت (و صف فعالش) و ردیف پشتیبان per جلسه برداشته می‌شود
      const mem = (await m.query('SELECT id FROM session_members WHERE session_id = ? AND user_id = ? FOR UPDATE', [sid, uid])) as { id: Buffer }[];
      if (mem[0]) queueChanged = (await this.members.deleteMember(m, sessionId, bufToUuid(mem[0].id), b.userId)) || queueChanged;
      await m.query('DELETE FROM session_supporters WHERE session_id = ? AND user_id = ?', [sid, uid]);
      await m.query('UPDATE sessions SET owner_id = ?, version = version + 1, updated_at = ? WHERE id = ?', [uid, now, sid]);
      if (b.previousOwner === 'supporter')
        await m.query(
          'INSERT INTO session_supporters (session_id, user_id, permissions, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE permissions = VALUES(permissions), updated_at = VALUES(updated_at)',
          [sid, uuidToBuf(prevOwner), JSON.stringify(ALL_SESSION_PERMISSIONS), uuidToBuf(b.actorId), now, now]
        );
      else evicted.push(prevOwner);
      changed = true;
      if (b.notify) {
        const inbox: InboxItem[] = [{ userId: b.userId, kind: 'session', title: 'استاد صاحب جلسه شدید', body: `شما استاد صاحب جلسهٔ «${session.title}» شدید.`, ref: ref(sessionId) }];
        inbox.push({ userId: prevOwner, kind: 'session', title: 'تغییر استاد جلسه', body: b.previousOwner === 'supporter' ? `صاحب جلسهٔ «${session.title}» تغییر کرد؛ شما پشتیبان آن هستید.` : `صاحب جلسهٔ «${session.title}» تغییر کرد.`, ref: ref(sessionId) });
        await emitInboxBatch(m, now, inbox);
      }
    });
    if (!changed) return;
    this.live.emit(sessionId, 'supporters.updated');
    this.live.emit(sessionId, 'members.updated');
    this.live.emit(sessionId, 'session.updated');
    if (queueChanged) this.live.emit(sessionId, 'queue.updated');
    for (const u of evicted) if (!(await this.access.canJoinRoom(sessionId, u))) this.live.evict(sessionId, [u]);
  }

  /** MID_ADMIN.sessionOwners: صاحبان جلسه‌های موجود با شمار جلسه (مهاجرت high: اعطای نقش teacher) */
  async sessionOwners(page: number, pageSize: number) {
    const [rows, cnt] = await Promise.all([
      this.ds.query('SELECT owner_id, COUNT(*) AS n FROM sessions WHERE deleted_at IS NULL GROUP BY owner_id ORDER BY owner_id LIMIT ? OFFSET ?', [pageSize, (page - 1) * pageSize]) as Promise<{ owner_id: Buffer; n: string | number }[]>,
      this.ds.query('SELECT COUNT(DISTINCT owner_id) AS n FROM sessions WHERE deleted_at IS NULL') as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map((r) => ({ userId: bufToUuid(r.owner_id), sessions: Number(r.n) })), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  /**
   * H-52 ⇒ userMemberships (۱.۷.۰): صاحب ∪ پشتیبان (per جلسه یا ثابت استاد) ∪ عضو؛ نقش = بالاترین. memberId/status فقط اگر ردیف عضویت دارد.
   * شمارش حضور/ارزیابی فعال/امتیاز per جلسه از دفتر.
   */
  async userMemberships(userId: string, q: MembershipsQuery) {
    if (!isUuid(userId)) throw new AppError('NOT_FOUND', { message: 'کاربر پیدا نشد.' });
    const u = uuidToBuf(userId);
    const ROLE = `CASE WHEN s.owner_id = ? THEN 'owner'
                       WHEN EXISTS (SELECT 1 FROM session_supporters x WHERE x.session_id = s.id AND x.user_id = ?)
                         OR EXISTS (SELECT 1 FROM teacher_supporters t WHERE t.teacher_id = s.owner_id AND t.user_id = ?) THEN 'supporter'
                       ELSE 'member' END`;
    const ids = `SELECT id AS sid FROM sessions WHERE owner_id = ?
                 UNION SELECT session_id FROM session_supporters WHERE user_id = ?
                 UNION SELECT s2.id FROM teacher_supporters t2 JOIN sessions s2 ON s2.owner_id = t2.teacher_id WHERE t2.user_id = ?
                 UNION SELECT session_id FROM session_members WHERE user_id = ?`;
    const where: string[] = [];
    const extra: unknown[] = [];
    if (q.includeDeleted !== 'true') where.push('r.deleted_at IS NULL');
    if (q.status) {
      where.push('r.status = ?');
      extra.push(q.status);
    }
    if (q.role) {
      where.push('r.role = ?');
      extra.push(q.role);
    }
    const derived = `FROM (SELECT s.id AS s_id, s.title, s.status AS s_status, s.schedule, s.deleted_at, ${ROLE} AS role,
                                  m.id AS m_id, m.status, m.requested_at, m.decided_at
                             FROM (SELECT DISTINCT sid FROM (${ids}) x) i JOIN sessions s ON s.id = i.sid
                             LEFT JOIN session_members m ON m.session_id = s.id AND m.user_id = ?) r
                    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
    const args = [u, u, u, u, u, u, u, u, ...extra];
    const [rows, cnt] = await Promise.all([
      this.ds.query(
        `SELECT r.*,
                (SELECT COUNT(*) FROM attendance_entries a WHERE a.session_id = r.s_id AND a.user_id = ?) AS att,
                (SELECT COUNT(*) FROM evaluations e WHERE e.session_id = r.s_id AND e.user_id = ? AND e.status = 'active') AS ev_n,
                (SELECT AVG(e.score) FROM evaluations e WHERE e.session_id = r.s_id AND e.user_id = ? AND e.status = 'active') AS ev_avg,
                (SELECT COALESCE(SUM(l.points), 0) FROM point_ledger l WHERE l.user_id = ? AND l.session_id = r.s_id) AS pts
           ${derived} ORDER BY COALESCE(r.requested_at, '1970-01-01') DESC, r.s_id DESC LIMIT ? OFFSET ?`,
        [u, u, u, u, ...args, q.pageSize, (q.page - 1) * q.pageSize]
      ) as Promise<{ s_id: Buffer; title: string; s_status: SessionState; schedule: unknown; deleted_at: Date | null; role: SessionRole; m_id: Buffer | null; status: 'pending' | 'approved' | 'rejected' | null; requested_at: Date | null; decided_at: Date | null; att: string | number; ev_n: string | number; ev_avg: string | null; pts: string | number }[]>,
      this.ds.query(`SELECT COUNT(*) AS n ${derived}`, args) as Promise<{ n: string | number }[]>
    ]);
    const now = this.clock.now();
    return {
      items: rows.map((r) => ({
        session: { id: bufToUuid(r.s_id), title: r.title, status: r.s_status, nextStartsAt: r.s_status === 'ended' ? null : nextStartsAt(parseJson<Schedule>(r.schedule), now), deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null },
        memberId: r.m_id ? bufToUuid(r.m_id) : null,
        role: r.role,
        status: r.m_id ? r.status : null,
        requestedAt: r.requested_at ? r.requested_at.toISOString() : null,
        decidedAt: r.decided_at ? r.decided_at.toISOString() : null,
        attendanceCount: Number(r.att),
        evaluations: { count: Number(r.ev_n), avgScore: r.ev_avg === null ? null : Math.round(Number(r.ev_avg) * 10) / 10 },
        points: Number(r.pts)
      })),
      page: q.page,
      pageSize: q.pageSize,
      total: Number(cnt[0]?.n ?? 0)
    };
  }

  /**
   * H-41 (audience=session) ⇒ notify: گیرندگان فعال طبق roles (owner | supporter | member؛ نبود ⇒ هر سه) با رویداد دسته‌ای
   * inbox.messages.created. idempotent per broadcastId (retry high پیام دوباره نمی‌سازد).
   */
  async notify(sessionId: string, b: NotifyBody): Promise<{ recipients: number }> {
    if (b.ref !== null && !INBOX_REF.test(b.ref)) throw new AppError('VALIDATION_FAILED', { details: { fields: { ref: 'قالب ref نامعتبر است.' } } });
    return this.ds.transaction(async (m: Q) => {
      const session = await this.members.requireLiveSession(m, sessionId);
      const roles = new Set<SessionRole>(b.roles?.length ? b.roles : ['owner', 'supporter', 'member']);
      const sid = uuidToBuf(sessionId);
      const parts: string[] = [];
      const args: unknown[] = [];
      if (roles.has('owner')) {
        parts.push('SELECT ? AS user_id');
        args.push(uuidToBuf(session.owner_id));
      }
      if (roles.has('supporter')) {
        parts.push('SELECT user_id FROM session_supporters WHERE session_id = ?', 'SELECT user_id FROM teacher_supporters WHERE teacher_id = ?');
        args.push(sid, uuidToBuf(session.owner_id));
      }
      if (roles.has('member')) {
        parts.push("SELECT user_id FROM session_members WHERE session_id = ? AND status = 'approved'");
        args.push(sid);
      }
      const users = (await m.query(
        `SELECT DISTINCT x.user_id FROM (${parts.join(' UNION ')}) x LEFT JOIN user_directory d ON d.user_id = x.user_id
          WHERE d.user_id IS NULL OR (d.deleted = 0 AND d.status = 'active')`,
        args
      )) as { user_id: Buffer }[];
      const now = this.clock.now();
      const dedupe = (await m.query('INSERT IGNORE INTO inbox_events (event_id, type, received_at) VALUES (?, ?, ?)', [`notify:${b.broadcastId}`, 'mid.admin.notify', now])) as { affectedRows?: number };
      if (dedupe.affectedRows) await emitInboxBatch(m, now, users.map((u) => ({ userId: bufToUuid(u.user_id), kind: 'announcement' as const, title: b.title, body: b.body, ref: b.ref })));
      return { recipients: users.length };
    });
  }
}
