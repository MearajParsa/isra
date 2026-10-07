import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { internal } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { LiveService } from '../live/live.service';
import { sortRoles } from '../domain/access.service';
import { conflict, parseJson, type Q } from '../domain/db';
import { type AddItem, MembersService, adminMemberDto, rolesFa } from '../domain/members.service';
import { type InboxItem, emitInboxBatch } from '../domain/outbox.writer';
import type { SessionRole, SessionState } from '../domain/rules';
import { type Schedule, nextStartsAt } from '../domain/schedule';

type AddBody = z.infer<typeof internal.MidAdminAddMembers>;
type ManagerBody = z.infer<typeof internal.MidAdminManager>;
type NotifyBody = z.infer<typeof internal.MidAdminNotify>;
type MembershipsQuery = z.infer<typeof internal.MidAdminUserMembershipsQuery>;

const INBOX_REF = /^(session:[A-Za-z0-9_-]{1,64}|points|badge:[A-Za-z0-9_-]{1,64}|announcement:[A-Za-z0-9_-]{1,64})$/;
const ph = (n: number) => Array.from({ length: n }, () => '?').join(',');
const ref = (id: string) => `session:${id}`;

/**
 * مسیرهای عضویت MID_ADMIN (فقط api-high؛ مجوز و audit در high). قواعد دامنه همان قواعد عادی با استثناهای ادمین
 * (جلسهٔ ended هم قابل افزودن؛ replace؛ ساخت ردیف دایرکتوری با نام ارسالی). جلسهٔ حذف‌شده: خواندن مجاز، نوشتن ⇒ 404.
 */
@Injectable()
export class AdminMembersService {
  private ledgerCols?: Promise<{ ledgerSession: boolean; evalStatus: boolean }>;

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly members: MembersService,
    private readonly live: LiveService
  ) {}

  /** وجود جلسه (حتی حذف‌شده) برای خواندن */
  private async exists(id: string): Promise<string> {
    if (!isUuid(id)) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    const r = (await this.ds.query('SELECT 1 AS x FROM sessions WHERE id = ?', [uuidToBuf(id)])) as unknown[];
    if (!r.length) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    return id;
  }

  async list(sessionId: string, f: { status?: string; role?: string; q?: string; userId?: string }, page: number, pageSize: number) {
    const r = await this.members.query(await this.exists(sessionId), f, page, pageSize);
    return { items: r.rows.map(adminMemberDto), page, pageSize, total: r.total };
  }

  async decide(sessionId: string, memberId: string, action: 'approve' | 'reject') {
    return adminMemberDto(await this.members.decide(null, sessionId, memberId, action));
  }

  setRoles(sessionId: string, memberId: string, roles: readonly SessionRole[], actorId: string | null) {
    return this.members.adminSetRoles(sessionId, memberId, roles, actorId);
  }

  removeMember(sessionId: string, memberId: string) {
    return this.members.remove(null, sessionId, memberId);
  }

  /** H-73 ⇒ membersAdd: یک تراکنش چندردیفی؛ کاربر ناموجود در دایرکتوری mid با نام ارسالی ساخته می‌شود */
  async add(sessionId: string, b: AddBody) {
    const ensure = new Map(b.items.map((i) => [i.userId, { firstName: i.firstName ?? '', lastName: i.lastName ?? '' }]));
    const items: AddItem[] = b.items.map((i) => ({ userId: i.userId, roles: i.roles }));
    const res = await this.ds.transaction(async (m) => {
      const session = await this.members.requireLiveSession(m, sessionId, true);
      return this.members.applyAdd(m, session, items, { actorId: b.actorId, source: 'admin', onExisting: b.onExisting, notify: b.notify, ensureDirectory: ensure });
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
   * H-74 ⇒ manager: کاربر مدیر می‌شود (عضو نبود ⇒ عضو approved؛ دایرکتوری نبود ⇒ با نام ارسالی؛ غیرفعال ⇒ USER_NOT_ACTIVE).
   * مدیران قبلی: demote (نقش‌های previousRoles)، remove (حذف عضویت + صف فعال)، keep (هم‌مدیر). transferCreator ⇒ created_by.
   */
  async manager(sessionId: string, b: ManagerBody): Promise<void> {
    const evicted: string[] = [];
    let queueChanged = false;
    await this.ds.transaction(async (m) => {
      const session = await this.members.requireLiveSession(m, sessionId, true);
      const now = this.clock.now();
      const uid = uuidToBuf(b.userId);
      await m.query('INSERT IGNORE INTO user_directory (user_id, first_name, last_name, updated_at) VALUES (?, ?, ?, ?)', [uid, (b.firstName ?? '').slice(0, 40), (b.lastName ?? '').slice(0, 40), now]);
      const d = ((await m.query('SELECT status, deleted FROM user_directory WHERE user_id = ?', [uid])) as { status: string; deleted: number }[])[0];
      if (!d || d.deleted || d.status !== 'active') throw conflict('USER_NOT_ACTIVE', 'این کاربر فعال نیست.');

      const rows = (await m.query(
        "SELECT m.id, m.user_id, m.status, (SELECT GROUP_CONCAT(r.role) FROM session_member_roles r WHERE r.member_id = m.id) AS roles FROM session_members m WHERE m.session_id = ? AND (m.user_id = ? OR (m.status = 'approved' AND EXISTS (SELECT 1 FROM session_member_roles x WHERE x.member_id = m.id AND x.role = 'session_manager'))) FOR UPDATE",
        [uuidToBuf(sessionId), uid]
      )) as { id: Buffer; user_id: Buffer; status: string; roles: string | null }[];
      const target = rows.find((r) => bufToUuid(r.user_id) === b.userId);
      const finals = new Map<string, Set<SessionRole>>();
      const inbox: InboxItem[] = [];
      const actor = uuidToBuf(b.actorId);
      let targetMember: string;
      if (!target) {
        targetMember = uuidv7(now.getTime());
        await m.query("INSERT INTO session_members (id, session_id, user_id, status, requested_at, decided_by, decided_at, source, added_by) VALUES (?, ?, ?, 'approved', ?, ?, ?, 'admin', ?)", [uuidToBuf(targetMember), uuidToBuf(sessionId), uid, now, actor, now, actor]);
        finals.set(targetMember, new Set(['session_manager']));
      } else {
        targetMember = bufToUuid(target.id);
        const cur = sortRoles(target.roles?.split(',') ?? []);
        if (target.status !== 'approved') {
          await m.query("UPDATE session_members SET status = 'approved', decided_by = ?, decided_at = ?, source = 'admin', added_by = ? WHERE id = ?", [actor, now, actor, target.id]);
          finals.set(targetMember, new Set(['session_manager']));
        } else if (!cur.includes('session_manager')) finals.set(targetMember, new Set<SessionRole>(['session_manager', ...cur.filter((r) => r !== 'quran_student')]));
      }
      if (finals.has(targetMember)) inbox.push({ userId: b.userId, kind: 'session', title: 'مدیر جلسه شدید', body: `شما مدیر جلسهٔ «${session.title}» شدید.`, ref: ref(sessionId) });

      for (const p of rows.filter((r) => r !== target && r.status === 'approved')) {
        const pu = bufToUuid(p.user_id);
        if (b.previous === 'keep') continue;
        if (b.previous === 'demote') {
          const next = new Set<SessionRole>(b.previousRoles);
          finals.set(bufToUuid(p.id), next);
          inbox.push({ userId: pu, kind: 'session', title: 'تغییر نقش', body: `نقش شما در جلسهٔ «${session.title}»: ${rolesFa([...next])}`, ref: ref(sessionId) });
        } else {
          const q = (await m.query("DELETE FROM queue_items WHERE session_id = ? AND user_id = ? AND status IN ('waiting','current')", [uuidToBuf(sessionId), p.user_id])) as { affectedRows?: number };
          queueChanged ||= !!q.affectedRows;
          await m.query('DELETE FROM session_member_roles WHERE member_id = ?', [p.id]);
          await m.query('DELETE FROM session_members WHERE id = ?', [p.id]);
          evicted.push(pu);
          inbox.push({ userId: pu, kind: 'session', title: 'حذف از جلسه', body: `عضویت شما در جلسهٔ «${session.title}» پایان یافت.`, ref: ref(sessionId) });
        }
      }
      if (finals.size) {
        const ids = [...finals.keys()].map(uuidToBuf);
        await m.query(`DELETE FROM session_member_roles WHERE member_id IN (${ph(ids.length)})`, ids);
        const pairs = [...finals].flatMap(([id, rs]) => [...rs].map((r) => [uuidToBuf(id), r] as const));
        await m.query(`INSERT INTO session_member_roles (member_id, role) VALUES ${pairs.map(() => '(?, ?)').join(',')}`, pairs.flat());
      }
      if (b.transferCreator) await m.query('UPDATE sessions SET created_by = ?, updated_at = ? WHERE id = ?', [uid, now, uuidToBuf(sessionId)]);
      if (b.notify) await emitInboxBatch(m, now, inbox);
    });
    this.live.emit(sessionId, 'members.updated');
    if (queueChanged) this.live.emit(sessionId, 'queue.updated');
    this.live.evict(sessionId, evicted);
  }

  /** H-52 ⇒ userMemberships: تاریخچهٔ عضویت کاربر با شمارش حضور/ارزیابی/امتیاز per جلسه */
  async userMemberships(userId: string, q: MembershipsQuery) {
    if (!isUuid(userId)) throw new AppError('NOT_FOUND', { message: 'کاربر پیدا نشد.' });
    const cols = await this.columns();
    const u = uuidToBuf(userId);
    const where = ['m.user_id = ?'];
    const args: unknown[] = [u];
    if (q.includeDeleted !== 'true') where.push('s.deleted_at IS NULL');
    if (q.status) {
      where.push('m.status = ?');
      args.push(q.status);
    }
    if (q.role) {
      where.push('EXISTS (SELECT 1 FROM session_member_roles x WHERE x.member_id = m.id AND x.role = ?)');
      args.push(q.role);
    }
    const evActive = cols.evalStatus ? " AND e.status = 'active'" : '';
    const points = cols.ledgerSession
      ? '(SELECT COALESCE(SUM(l.points), 0) FROM point_ledger l WHERE l.user_id = m.user_id AND l.session_id = s.id)'
      : `((SELECT COUNT(*) FROM attendance_entries a2 WHERE a2.session_id = s.id AND a2.user_id = m.user_id) * 5 + (SELECT COALESCE(SUM(e2.points), 0) FROM evaluations e2 WHERE e2.session_id = s.id AND e2.user_id = m.user_id${evActive.replace('e.', 'e2.')}))`;
    const w = where.join(' AND ');
    const [rows, cnt] = await Promise.all([
      this.ds.query(
        `SELECT s.id AS s_id, s.title, s.status AS s_status, s.schedule, s.deleted_at, m.id AS m_id, m.status, m.requested_at, m.decided_at,
                (SELECT GROUP_CONCAT(r.role) FROM session_member_roles r WHERE r.member_id = m.id) AS roles,
                (SELECT COUNT(*) FROM attendance_entries a WHERE a.session_id = s.id AND a.user_id = m.user_id) AS att,
                (SELECT COUNT(*) FROM evaluations e WHERE e.session_id = s.id AND e.user_id = m.user_id${evActive}) AS ev_n,
                (SELECT AVG(e.score) FROM evaluations e WHERE e.session_id = s.id AND e.user_id = m.user_id${evActive}) AS ev_avg,
                ${points} AS pts
           FROM session_members m JOIN sessions s ON s.id = m.session_id
          WHERE ${w} ORDER BY m.requested_at DESC, m.id DESC LIMIT ? OFFSET ?`,
        [...args, q.pageSize, (q.page - 1) * q.pageSize]
      ) as Promise<{ s_id: Buffer; title: string; s_status: SessionState; schedule: unknown; deleted_at: Date | null; m_id: Buffer; status: 'pending' | 'approved' | 'rejected'; requested_at: Date; decided_at: Date | null; roles: string | null; att: string | number; ev_n: string | number; ev_avg: string | null; pts: string | number }[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM session_members m JOIN sessions s ON s.id = m.session_id WHERE ${w}`, args) as Promise<{ n: string | number }[]>
    ]);
    const now = this.clock.now();
    return {
      items: rows.map((r) => ({
        session: { id: bufToUuid(r.s_id), title: r.title, status: r.s_status, nextStartsAt: r.s_status === 'ended' ? null : nextStartsAt(parseJson<Schedule>(r.schedule), now), deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null },
        memberId: bufToUuid(r.m_id),
        roles: sortRoles(r.roles?.split(',') ?? []),
        status: r.status,
        requestedAt: r.requested_at.toISOString(),
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

  /** ستون‌های ۱.۶.۰ نیمهٔ دیگر (point_ledger.session_id، evaluations.status) — سازگار پیش و پس از مهاجرت آن */
  private columns() {
    this.ledgerCols ??= (async () => {
      const rows = (await this.ds.query("SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name = 'point_ledger' AND column_name = 'session_id') OR (table_name = 'evaluations' AND column_name = 'status'))")) as { t: string; c: string }[];
      return { ledgerSession: rows.some((r) => r.t === 'point_ledger'), evalStatus: rows.some((r) => r.t === 'evaluations') };
    })();
    return this.ledgerCols;
  }

  /**
   * H-41 (audience=session) ⇒ notify: پیام به اعضای تأییدشدهٔ فعال (فیلتر نقش اختیاری) با رویداد دسته‌ای inbox.messages.created.
   * idempotent per broadcastId (retry high پیام دوباره نمی‌سازد).
   */
  async notify(sessionId: string, b: NotifyBody): Promise<{ recipients: number }> {
    if (b.ref !== null && !INBOX_REF.test(b.ref)) throw new AppError('VALIDATION_FAILED', { details: { fields: { ref: 'قالب ref نامعتبر است.' } } });
    return this.ds.transaction(async (m: Q) => {
      await this.members.requireLiveSession(m, sessionId);
      const roleCond = b.roles?.length ? `AND EXISTS (SELECT 1 FROM session_member_roles r WHERE r.member_id = x.id AND r.role IN (${ph(b.roles.length)}))` : '';
      const users = (await m.query(
        `SELECT x.user_id FROM session_members x LEFT JOIN user_directory d ON d.user_id = x.user_id
          WHERE x.session_id = ? AND x.status = 'approved' AND (d.user_id IS NULL OR (d.deleted = 0 AND d.status = 'active')) ${roleCond}`,
        [uuidToBuf(sessionId), ...(b.roles ?? [])]
      )) as { user_id: Buffer }[];
      const now = this.clock.now();
      const dedupe = (await m.query('INSERT IGNORE INTO inbox_events (event_id, type, received_at) VALUES (?, ?, ?)', [`notify:${b.broadcastId}`, 'mid.admin.notify', now])) as { affectedRows?: number };
      if (dedupe.affectedRows) await emitInboxBatch(m, now, users.map((u) => ({ userId: bufToUuid(u.user_id), kind: 'announcement' as const, title: b.title, body: b.body, ref: b.ref })));
      return { recipients: users.length };
    });
  }
}
