import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { internal } from '@isra/api-types';
import { AppError, conflict as conflictX } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { ENV, type Env } from '../config/env';
import { internalHeaders } from '../internal/internal-auth';
import { LiveService } from '../live/live.service';
import { MembersAccess, type SessionRow, approvedCount, satisfies } from './access.service';
import { NAME_SQL, conflict, displayName, type Q } from './db';
import { type InboxItem, emitInboxBatch } from './outbox.writer';

export interface MemberRow {
  id: Buffer;
  user_id: Buffer;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: Date;
  name: string | null;
  decided_at?: Date | null;
}

export type MemberStatus = MemberRow['status'];
export type AddOutcome = 'added' | 'approved' | 'unchanged' | 'not_found' | 'not_active' | 'full';
export type DecideOutcome = 'approved' | 'rejected' | 'skipped' | 'full' | 'not_found';

export const MEMBER_SELECT = `SELECT m.id, m.user_id, m.status, m.requested_at, m.decided_at, ${NAME_SQL} AS name
                  FROM session_members m LEFT JOIN user_directory d ON d.user_id = m.user_id`;

/** ۱.۷.۰: Member فقط عضو (بدون نقش) */
export const memberDto = (r: MemberRow) => ({ id: bufToUuid(r.id), userId: bufToUuid(r.user_id), name: r.name || displayName(), status: r.status, requestedAt: r.requested_at.toISOString() });
export const adminMemberDto = (r: MemberRow) => ({ ...memberDto(r), phone: null, decidedAt: r.decided_at ? r.decided_at.toISOString() : null });

const COOLDOWN_MS = 7 * 86_400_000;
const PHONE_LIMITS = [
  { windowSec: 60, limit: 20 },
  { windowSec: 86_400, limit: 100 }
] as const;

const notFound = () => new AppError('NOT_FOUND', { message: 'این عضو پیدا نشد.' });
const ph = (n: number) => Array.from({ length: n }, () => '?').join(',');
export const likeArg = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;
const ref = (sessionId: string) => `session:${sessionId}`;

/** مورد افزودن پس از resolve: userId (یا نتیجهٔ پیشین not_found/not_active برای شمارهٔ ناشناس/غیرفعال) */
export interface AddItem {
  userId: string | null;
  pre?: 'not_found' | 'not_active';
}
export interface AddOpts {
  actorId: string | null;
  source: 'staff' | 'admin';
  notify: boolean;
  /** ردیف دایرکتوری برای کاربر نبوده (ادمین؛ یا شمارهٔ resolve‌شده از low) با این نام‌ها ساخته می‌شود */
  ensureDirectory?: ReadonlyMap<string, { firstName: string; lastName: string }>;
}
export interface AddResultItem {
  index: number;
  userId: string | null;
  outcome: AddOutcome;
  memberId: string | null;
}

export interface ResolvedUser {
  phone: string;
  userId: string;
  firstName: string;
  lastName: string;
  status: 'active' | 'disabled' | 'deleted';
}

/**
 * عضویت جلسه (۱.۷.۰؛ docs-v2/31 §۲): `session_members` فقط اعضا (قرآن‌آموز) با وضعیت pending/approved/rejected.
 * صاحب و پشتیبان‌ها جدا (sessions.owner_id، session_supporters/teacher_supporters).
 * همهٔ نوشتن‌های رقابتی (ظرفیت) زیر قفل ردیف جلسه؛ اعلان‌ها با رویداد دسته‌ای inbox.messages.created (outbox)؛
 * رویداد realtime `members.updated` و اخراج socket پس از commit.
 */
@Injectable()
export class MembersService {
  private readonly log = new Logger('Members');

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly access: MembersAccess,
    private readonly live: LiveService,
    @Inject(ENV) private readonly env: Env
  ) {}

  // ───────────────────────── خواندن ─────────────────────────
  async rowsByIds(q: Q, sessionId: string, memberIds: readonly string[]): Promise<Map<string, MemberRow>> {
    if (!memberIds.length) return new Map();
    const rows = (await q.query(`${MEMBER_SELECT} WHERE m.session_id = ? AND m.id IN (${ph(memberIds.length)})`, [uuidToBuf(sessionId), ...memberIds.map(uuidToBuf)])) as MemberRow[];
    return new Map(rows.map((r) => [bufToUuid(r.id), r]));
  }

  async oneRow(q: Q, sessionId: string, memberId: string): Promise<MemberRow> {
    if (!isUuid(memberId)) throw notFound();
    const r = (await this.rowsByIds(q, sessionId, [memberId])).get(memberId);
    if (!r) throw notFound();
    return r;
  }

  private async one(q: Q, sessionId: string, memberId: string) {
    return memberDto(await this.oneRow(q, sessionId, memberId));
  }

  /** فهرست با فیلتر وضعیت/نام (و userId برای ادمین) */
  async query(sessionId: string, f: { status?: string; q?: string; userId?: string }, page: number, pageSize: number) {
    const where = ['m.session_id = ?'];
    const args: unknown[] = [uuidToBuf(sessionId)];
    if (f.status) {
      where.push('m.status = ?');
      args.push(f.status);
    }
    if (f.userId) {
      where.push('m.user_id = ?');
      args.push(uuidToBuf(f.userId));
    }
    let join = '';
    if (f.q) {
      join = 'LEFT JOIN user_directory dq ON dq.user_id = m.user_id';
      where.push("dq.deleted = 0 AND CONCAT(dq.first_name, ' ', dq.last_name) LIKE ?");
      args.push(likeArg(f.q));
    }
    const w = where.join(' AND ');
    const [rows, cnt] = await Promise.all([
      this.ds.query(`${MEMBER_SELECT} ${join} WHERE ${w} ORDER BY m.requested_at DESC, m.id DESC LIMIT ? OFFSET ?`, [...args, pageSize, (page - 1) * pageSize]) as Promise<MemberRow[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM session_members m ${join} WHERE ${w}`, args) as Promise<{ n: string | number }[]>
    ]);
    return { rows, page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  /** M-11: membership.manage یا membership.approve (بررسی درخواست‌ها) */
  async list(userId: string, sessionId: string, f: { status?: string; q?: string }, page: number, pageSize: number) {
    const a = await this.access.load(this.ds, sessionId, userId);
    if (!satisfies(a, 'membership.manage') && !satisfies(a, 'membership.approve')) throw new AppError('AUTH_FORBIDDEN');
    const r = await this.query(sessionId, f, page, pageSize);
    return { items: r.rows.map(memberDto), page, pageSize, total: r.total };
  }

  // ───────────────────────── M-10 درخواست عضویت ─────────────────────────
  /**
   * open ⇒ approved فوری (source=open، با ظرفیت)؛ invite_only ⇒ JOIN_CLOSED؛ request ⇒ pending + اعلان به دارندگان membership.approve.
   * ردشده: پس از ۷ روز دوباره pending (یا approved در open)؛ پیش از آن REQUEST_COOLDOWN + retryAfterSec. صاحب جلسه عضو نمی‌شود.
   */
  async request(userId: string, sessionId: string) {
    let memberId = '';
    await this.ds.transaction(async (m) => {
      const { session, membership, role } = await this.access.load(m, sessionId, userId, undefined, true);
      if (session.status === 'draft') throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
      if (role === 'owner') throw conflict('SESSION_MANAGER_PROTECTED', 'شما صاحب این جلسه هستید.');
      if (session.status === 'ended') throw conflict('SESSION_LOCKED', 'این جلسه پایان یافته است.');
      if (session.join_policy === 'invite_only') throw conflict('JOIN_CLOSED', 'عضویت در این جلسه فقط با دعوت است.');
      const now = this.clock.now();
      const uid = uuidToBuf(userId);
      if (membership && membership.status !== 'rejected') throw conflict('ALREADY_MEMBER', 'قبلاً برای این جلسه درخواست داده‌اید.');
      if (membership) {
        const r = (await m.query('SELECT decided_at FROM session_members WHERE id = ? FOR UPDATE', [uuidToBuf(membership.memberId)])) as { decided_at: Date | null }[];
        const until = (r[0]?.decided_at?.getTime() ?? 0) + COOLDOWN_MS;
        if (until > now.getTime()) throw conflictX('REQUEST_COOLDOWN', 'درخواست قبلی شما رد شده است؛ بعداً دوباره تلاش کنید.', { retryAfterSec: Math.ceil((until - now.getTime()) / 1000) });
      }
      const open = session.join_policy === 'open';
      if (open && session.capacity !== null && (await approvedCount(m, sessionId)) >= session.capacity) throw conflict('SESSION_FULL', 'ظرفیت این جلسه تکمیل است.');
      if (membership) {
        memberId = membership.memberId;
        await m.query('UPDATE session_members SET status = ?, requested_at = ?, decided_by = NULL, decided_at = ?, source = ?, added_by = NULL WHERE id = ?', [open ? 'approved' : 'pending', now, open ? now : null, open ? 'open' : 'request', uuidToBuf(memberId)]);
      } else {
        memberId = uuidv7(now.getTime());
        const r = (await m.query('INSERT IGNORE INTO session_members (id, session_id, user_id, status, requested_at, decided_at, source) VALUES (?, ?, ?, ?, ?, ?, ?)', [uuidToBuf(memberId), uuidToBuf(sessionId), uid, open ? 'approved' : 'pending', now, open ? now : null, open ? 'open' : 'request'])) as { affectedRows?: number };
        if (!r.affectedRows) throw conflict('ALREADY_MEMBER', 'قبلاً برای این جلسه درخواست داده‌اید.');
      }
      if (!open) {
        const staff = [...(await this.access.userIdsWithPermission(sessionId, 'membership.approve', m))].filter((u) => u !== userId);
        await emitInboxBatch(m, now, staff.map((u) => ({ userId: u, kind: 'membership' as const, title: 'درخواست عضویت تازه', body: `درخواست عضویت تازه‌ای برای «${session.title}» رسید.`, ref: ref(sessionId) })));
      }
    });
    this.live.emit(sessionId, 'members.updated');
    return this.one(this.ds, sessionId, memberId);
  }

  // ───────────────────────── تأیید/رد ─────────────────────────
  /**
   * تصمیم دسته‌ای زیر قفل ردیف جلسه (فراخوان قفل را گرفته است). approve: pending/rejected ⇒ approved (ظرفیت ⇒ full)؛
   * reject: فقط pending. بقیه ⇒ skipped. به‌روزرسانی چندردیفی؛ اعلان دسته‌ای.
   */
  async decideMany(m: Q, session: SessionRow, memberIds: readonly string[], action: 'approve' | 'reject', deciderId: string | null): Promise<{ outcomes: Map<string, DecideOutcome>; changedUsers: string[] }> {
    const outcomes = new Map<string, DecideOutcome>();
    const valid = [...new Set(memberIds.filter(isUuid))];
    for (const id of memberIds) outcomes.set(id, 'not_found');
    if (!valid.length) return { outcomes, changedUsers: [] };
    const rows = (await m.query(`SELECT id, user_id, status FROM session_members WHERE session_id = ? AND id IN (${ph(valid.length)}) FOR UPDATE`, [uuidToBuf(session.id), ...valid.map(uuidToBuf)])) as { id: Buffer; user_id: Buffer; status: MemberStatus }[];
    let free = action === 'approve' && session.capacity !== null ? session.capacity - (await approvedCount(m, session.id)) : Infinity;
    const changed: { id: string; userId: string }[] = [];
    const byId = new Map(rows.map((r) => [bufToUuid(r.id), r]));
    for (const id of valid) {
      const r = byId.get(id);
      if (!r) continue;
      if (action === 'approve') {
        if (r.status === 'approved') outcomes.set(id, 'skipped');
        else if (free <= 0) outcomes.set(id, 'full');
        else {
          free--;
          outcomes.set(id, 'approved');
          changed.push({ id, userId: bufToUuid(r.user_id) });
        }
      } else if (r.status === 'pending') {
        outcomes.set(id, 'rejected');
        changed.push({ id, userId: bufToUuid(r.user_id) });
      } else outcomes.set(id, 'skipped');
    }
    if (!changed.length) return { outcomes, changedUsers: [] };
    const now = this.clock.now();
    const ids = changed.map((c) => uuidToBuf(c.id));
    await m.query(`UPDATE session_members SET status = ?, decided_by = ?, decided_at = ? WHERE id IN (${ph(ids.length)})`, [action === 'approve' ? 'approved' : 'rejected', deciderId ? uuidToBuf(deciderId) : null, now, ...ids]);
    await emitInboxBatch(
      m,
      now,
      changed.map((c) => ({
        userId: c.userId,
        kind: 'membership' as const,
        title: action === 'approve' ? 'عضویت تأیید شد' : 'درخواست عضویت رد شد',
        body: action === 'approve' ? `عضویت شما در «${session.title}» تأیید شد.` : `درخواست عضویت شما در «${session.title}» پذیرفته نشد.`,
        ref: ref(session.id)
      }))
    );
    return { outcomes, changedUsers: changed.map((c) => c.userId) };
  }

  /** M-12 و MID_ADMIN.member (PATCH): یک عضو؛ skipped ⇒ ALREADY_DECIDED، full ⇒ SESSION_FULL */
  async decide(actor: string | null, sessionId: string, memberId: string, action: 'approve' | 'reject') {
    if (!isUuid(memberId)) throw notFound();
    let changed: string[] = [];
    await this.ds.transaction(async (m) => {
      const session = actor ? (await this.access.load(m, sessionId, actor, 'membership.approve', true)).session : await this.requireLiveSession(m, sessionId, true);
      const r = await this.decideMany(m, session, [memberId], action, actor);
      const o = r.outcomes.get(memberId);
      if (o === 'not_found') throw notFound();
      if (o === 'skipped') throw conflict('ALREADY_DECIDED', 'این درخواست قبلاً بررسی شده است.');
      if (o === 'full') throw conflict('SESSION_FULL', 'ظرفیت این جلسه تکمیل است.');
      changed = r.changedUsers;
    });
    this.live.emit(sessionId, 'members.updated');
    if (action === 'reject') this.live.evict(sessionId, changed);
    return this.oneRow(this.ds, sessionId, memberId);
  }

  // ───────────────────────── حذف / ترک ─────────────────────────
  /** حذف عضو + آیتم‌های فعال صف (waiting/current)؛ حضور/ارزیابی/دفتر امتیاز می‌ماند */
  async deleteMember(m: Q, sessionId: string, memberId: string, userId: string): Promise<boolean> {
    const q = (await m.query("DELETE FROM queue_items WHERE session_id = ? AND user_id = ? AND status IN ('waiting','current')", [uuidToBuf(sessionId), uuidToBuf(userId)])) as { affectedRows?: number };
    await m.query('DELETE FROM session_members WHERE id = ?', [uuidToBuf(memberId)]);
    return !!q.affectedRows;
  }

  private afterRemoval(sessionId: string, userId: string, queueChanged: boolean, evict = true) {
    this.live.emit(sessionId, 'members.updated');
    if (queueChanged) this.live.emit(sessionId, 'queue.updated');
    if (evict) this.live.evict(sessionId, [userId]);
  }

  /** پس از حذف عضو: اگر کاربر هنوز کادر است socket او نباید از اتاق اخراج شود */
  private async stillStaff(sessionId: string, userId: string): Promise<boolean> {
    return (await this.access.staffUserIds(sessionId)).has(userId);
  }

  /** M-15 (membership.manage): هر عضو یا درخواست. actorId=null ⇒ ادمین (MID_ADMIN.member DELETE). */
  async remove(actorId: string | null, sessionId: string, memberId: string): Promise<{ userId: string }> {
    let removed = { userId: '', queue: false };
    await this.ds.transaction(async (m) => {
      const session = actorId ? (await this.access.load(m, sessionId, actorId, 'membership.manage', true)).session : await this.requireLiveSession(m, sessionId, true);
      if (!isUuid(memberId)) throw notFound();
      const rows = (await m.query('SELECT user_id, status FROM session_members WHERE id = ? AND session_id = ? FOR UPDATE', [uuidToBuf(memberId), uuidToBuf(sessionId)])) as { user_id: Buffer; status: MemberStatus }[];
      const cur = rows[0];
      if (!cur) throw notFound();
      const userId = bufToUuid(cur.user_id);
      const queue = await this.deleteMember(m, sessionId, memberId, userId);
      if (userId !== actorId && cur.status === 'approved') await emitInboxBatch(m, this.clock.now(), [{ userId, kind: 'session', title: 'حذف از جلسه', body: `عضویت شما در جلسهٔ «${session.title}» پایان یافت.`, ref: ref(sessionId) }]);
      removed = { userId, queue };
    });
    this.afterRemoval(sessionId, removed.userId, removed.queue, !(await this.stillStaff(sessionId, removed.userId)));
    return { userId: removed.userId };
  }

  /** M-17: ترک جلسه / لغو درخواست؛ صاحب ⇒ SESSION_MANAGER_PROTECTED؛ ردشده دست نمی‌خورد (cooldown حفظ) */
  async leave(userId: string, sessionId: string): Promise<Record<string, never>> {
    let queue = false;
    await this.ds.transaction(async (m) => {
      const { membership, role } = await this.access.load(m, sessionId, userId, undefined, true);
      if (role === 'owner') throw conflict('SESSION_MANAGER_PROTECTED', 'صاحب جلسه عضو نیست؛ تغییر صاحب فقط از پنل مدیریت ممکن است.');
      if (!membership) throw new AppError('NOT_FOUND', { message: 'عضو این جلسه نیستید.' });
      if (membership.status === 'rejected') return;
      queue = await this.deleteMember(m, sessionId, membership.memberId, userId);
    });
    this.afterRemoval(sessionId, userId, queue, !(await this.stillStaff(sessionId, userId)));
    return {};
  }

  // ───────────────────────── افزودن مستقیم (M-14 / MID_ADMIN.membersAdd) ─────────────────────────
  /**
   * در یک تراکنش (فراخوان ردیف جلسه را قفل کرده است): نبود ⇒ insert approved؛ pending/rejected ⇒ approved؛ approved ⇒ unchanged.
   * صاحب جلسه ⇒ unchanged (عضو نمی‌شود). دایرکتوری ناموجود ⇒ not_found، غیرفعال ⇒ not_active، ظرفیت ⇒ full.
   * همهٔ نوشتن‌ها چندردیفی (بدون حلقهٔ per آیتم روی DB).
   */
  async applyAdd(m: Q, session: SessionRow, items: readonly AddItem[], o: AddOpts): Promise<AddResultItem[]> {
    const now = this.clock.now();
    const ids = [...new Set(items.filter((i) => !i.pre && i.userId).map((i) => i.userId!))];
    const sid = uuidToBuf(session.id);
    if (o.ensureDirectory?.size) {
      const add = [...o.ensureDirectory].filter(([id]) => ids.includes(id));
      if (add.length) await m.query(`INSERT IGNORE INTO user_directory (user_id, first_name, last_name, updated_at) VALUES ${add.map(() => '(?, ?, ?, ?)').join(',')}`, add.flatMap(([id, n]) => [uuidToBuf(id), n.firstName.slice(0, 40), n.lastName.slice(0, 40), now]));
    }
    const dir = new Map<string, boolean>();
    const state = new Map<string, { memberId: string; status: MemberStatus }>();
    if (ids.length) {
      const d = (await m.query(`SELECT user_id, status, deleted FROM user_directory WHERE user_id IN (${ph(ids.length)})`, ids.map(uuidToBuf))) as { user_id: Buffer; status: string; deleted: number }[];
      for (const r of d) dir.set(bufToUuid(r.user_id), r.status === 'active' && !r.deleted);
      const ex = (await m.query(`SELECT id, user_id, status FROM session_members WHERE session_id = ? AND user_id IN (${ph(ids.length)}) FOR UPDATE`, [sid, ...ids.map(uuidToBuf)])) as { id: Buffer; user_id: Buffer; status: MemberStatus }[];
      for (const r of ex) state.set(bufToUuid(r.user_id), { memberId: bufToUuid(r.id), status: r.status });
    }
    let free = session.capacity === null ? Infinity : session.capacity - (await approvedCount(m, session.id));
    const out: AddResultItem[] = [];
    const inserts: { memberId: string; userId: string }[] = [];
    const promote: string[] = [];
    const inbox = new Map<string, InboxItem>();
    items.forEach((it, index) => {
      const userId = it.userId;
      if (it.pre || !userId) return out.push({ index, userId, outcome: it.pre ?? 'not_found', memberId: null });
      if (!dir.has(userId)) return out.push({ index, userId, outcome: 'not_found', memberId: null });
      if (!dir.get(userId)) return out.push({ index, userId, outcome: 'not_active', memberId: null });
      if (userId === session.owner_id) return out.push({ index, userId, outcome: 'unchanged', memberId: null });
      const st = state.get(userId);
      if (st && st.status === 'approved') return out.push({ index, userId, outcome: 'unchanged', memberId: st.memberId });
      if (free <= 0) return out.push({ index, userId, outcome: 'full', memberId: st?.memberId ?? null });
      free--;
      let memberId: string;
      if (st) {
        st.status = 'approved';
        memberId = st.memberId;
        promote.push(memberId);
      } else {
        memberId = uuidv7(now.getTime());
        state.set(userId, { memberId, status: 'approved' });
        inserts.push({ memberId, userId });
      }
      inbox.set(userId, { userId, kind: 'membership', title: 'عضو جلسه شدید', body: `شما به جلسهٔ «${session.title}» افزوده شدید.`, ref: ref(session.id) });
      return out.push({ index, userId, outcome: st ? 'approved' : 'added', memberId });
    });

    const actor = o.actorId ? uuidToBuf(o.actorId) : null;
    if (inserts.length)
      await m.query(
        `INSERT INTO session_members (id, session_id, user_id, status, requested_at, decided_by, decided_at, source, added_by) VALUES ${inserts.map(() => "(?, ?, ?, 'approved', ?, ?, ?, ?, ?)").join(',')}`,
        inserts.flatMap((x) => [uuidToBuf(x.memberId), sid, uuidToBuf(x.userId), now, actor, now, o.source, actor])
      );
    if (promote.length) await m.query(`UPDATE session_members SET status = 'approved', decided_by = ?, decided_at = ?, source = ?, added_by = ? WHERE id IN (${ph(promote.length)})`, [actor, now, o.source, actor, ...promote.map(uuidToBuf)]);
    if (o.notify) await emitInboxBatch(m, now, [...inbox.values()].filter((x) => x.userId !== o.actorId));
    return out;
  }

  /** پس از commit: عضوهای نتیجه با یک پرسمان */
  async resultRows(sessionId: string, items: readonly AddResultItem[]): Promise<Map<string, MemberRow>> {
    return this.rowsByIds(this.ds, sessionId, [...new Set(items.filter((i) => i.memberId).map((i) => i.memberId!))]);
  }

  /**
   * M-14 (membership.manage): فقط عضو. شماره‌ها قبل از تراکنش با low resolve می‌شوند
   * (سقف durable per actor: ۲۰/دقیقه و ۱۰۰/روز؛ شماره هرگز لاگ/ذخیره نمی‌شود). جلسهٔ ended ⇒ SESSION_LOCKED.
   */
  async add(actorId: string, sessionId: string, body: { items: { user: { userId?: string; phone?: string } }[]; notify: boolean }) {
    const pre = await this.access.load(this.ds, sessionId, actorId, 'membership.manage');
    if (pre.session.status === 'ended') throw conflict('SESSION_LOCKED', 'این جلسه پایان یافته است.');

    const phones = [...new Set(body.items.map((i) => i.user.phone).filter((p): p is string => !!p))];
    const resolved = phones.length ? await this.resolvePhones(actorId, phones) : new Map<string, ResolvedUser>();
    const ensure = new Map<string, { firstName: string; lastName: string }>();
    const items: AddItem[] = body.items.map((i) => {
      if (i.user.userId) return { userId: i.user.userId };
      const u = resolved.get(i.user.phone!);
      if (!u) return { userId: null, pre: 'not_found' };
      if (u.status !== 'active') return { userId: u.userId, pre: 'not_active' };
      ensure.set(u.userId, { firstName: u.firstName, lastName: u.lastName });
      return { userId: u.userId };
    });

    const res = await this.ds.transaction(async (m) => {
      const { session } = await this.access.load(m, sessionId, actorId, 'membership.manage', true);
      if (session.status === 'ended') throw conflict('SESSION_LOCKED', 'این جلسه پایان یافته است.');
      return this.applyAdd(m, session, items, { actorId, source: 'staff', notify: body.notify, ensureDirectory: ensure });
    });
    this.live.emit(sessionId, 'members.updated');
    const rows = await this.resultRows(sessionId, res);
    const added = res.filter((r) => r.outcome === 'added' || r.outcome === 'approved').length;
    return {
      items: res.map((r) => ({ index: r.index, userId: r.userId, outcome: r.outcome, member: r.memberId && rows.get(r.memberId) && r.outcome !== 'full' ? memberDto(rows.get(r.memberId)!) : null })),
      added,
      skipped: res.length - added
    };
  }

  /** سقف durable شماره‌ها per actor (افزایش اتمیک به اندازهٔ تعداد شماره در یک اتصال) — مشترک M-14/M-61/M-65 */
  private async chargePhoneQuota(actorId: string, n: number): Promise<void> {
    const nowMs = this.clock.now().getTime();
    for (const l of PHONE_LIMITS) {
      const windowMs = l.windowSec * 1000;
      const start = Math.floor(nowMs / windowMs) * windowMs;
      const hits = await this.ds.transaction(async (m) => {
        await m.query('INSERT INTO rate_limit_counters (counter_key, window_start, hits) VALUES (?, ?, LAST_INSERT_ID(?)) ON DUPLICATE KEY UPDATE hits = LAST_INSERT_ID(hits + ?)', [`m14p:${l.windowSec}:${actorId}`, new Date(start), n, n]);
        return Number(((await m.query('SELECT LAST_INSERT_ID() AS n')) as { n: string | number }[])[0]?.n ?? n);
      });
      if (hits > l.limit) throw new AppError('RATE_LIMITED', { message: 'تعداد افزودن با شماره از سقف مجاز گذشته است.', details: { retryAfterSec: Math.max(1, Math.ceil((start + windowMs - nowMs) / 1000)) } });
    }
  }

  /** POST {low}/internal/v1/users/resolve — بیرون از تراکنش؛ خطا/۵xx ⇒ SERVICE_UNAVAILABLE؛ فقط تعداد لاگ می‌شود */
  async resolvePhones(actorId: string, phones: readonly string[]): Promise<Map<string, ResolvedUser>> {
    await this.chargePhoneQuota(actorId, phones.length);
    const base = this.env.INTERNAL_URL_LOW;
    if (!base) throw new AppError('SERVICE_UNAVAILABLE');
    let data: unknown;
    try {
      const res = await fetch(`${base}/internal/v1${internal.LOW_INTERNAL.resolveUsers}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...internalHeaders(this.env, 'low') },
        body: JSON.stringify({ phones }),
        signal: AbortSignal.timeout(this.env.INTERNAL_TIMEOUT_MS)
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      data = ((await res.json()) as { data?: unknown }).data;
    } catch (e) {
      this.log.warn({ count: phones.length, err: e instanceof Error ? e.message : 'unknown' }, 'resolve users failed');
      throw new AppError('SERVICE_UNAVAILABLE');
    }
    const parsed = internal.LowResolveUsersResult.safeParse(data);
    if (!parsed.success) {
      this.log.warn({ count: phones.length }, 'resolve users: invalid response');
      throw new AppError('SERVICE_UNAVAILABLE');
    }
    return new Map(parsed.data.items.map((u) => [u.phone, u]));
  }

  // ───────────────────────── ادمین ─────────────────────────
  /** جلسهٔ موجود (حذف‌نشده) برای نوشتن‌های ادمین */
  async requireLiveSession(q: Q, sessionId: string, lock = false): Promise<SessionRow> {
    const session = await this.access.session(q, sessionId, lock);
    if (!session) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    return session;
  }
}
