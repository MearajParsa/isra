import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../common/app-error';
import { bufToUuid, isUuid, uuidToBuf } from '../common/ids';
import { type Q } from './db';
import { type Permission, type SessionRole, type SessionState, effectivePermissions, isStaff, parsePermissions, roleOf } from './rules';

export interface SessionRow {
  id: string;
  title: string;
  description: string;
  status: SessionState;
  schedule: unknown;
  location_label: string;
  location_route_url: string | null;
  created_by: string;
  /** ۱.۷.۰: استاد صاحب جلسه */
  owner_id: string;
  created_at: Date;
  next_starts_at: Date | null;
  join_policy: JoinPolicy;
  visibility: Visibility;
  capacity: number | null;
  comments_enabled: number | boolean;
  comment_visibility: CommentVisibility;
  /** اعضای تأییدشده */
  member_count: number | string;
}

export type JoinPolicy = 'request' | 'open' | 'invite_only';
export type Visibility = 'public' | 'unlisted';
export type CommentVisibility = 'public' | 'reciter_only';
export type MemberStatus = 'pending' | 'approved' | 'rejected';

const BASE_COLS =
  's.id, s.title, s.description, s.status, s.schedule, s.location_label, s.location_route_url, s.created_by, s.owner_id, s.created_at, s.next_starts_at, s.join_policy, s.visibility, s.capacity, s.comments_enabled, s.comment_visibility';
/** ستون‌های SessionRow با alias جدول `s` (شامل شمار اعضای تأییدشده) */
export const SESSION_COLS = `${BASE_COLS}, (SELECT COUNT(*) FROM session_members mc WHERE mc.session_id = s.id AND mc.status = 'approved') AS member_count`;
/** ستون‌ها بدون زیرپرسمان شمارش (برای SELECT … FOR UPDATE تا ردیف‌های عضویت قفل نشوند) */
const LOCK_COLS = `${BASE_COLS}, 0 AS member_count`;

export type RawSessionRow = Omit<SessionRow, 'id' | 'created_by' | 'owner_id'> & { id: Buffer; created_by: Buffer; owner_id: Buffer };
export const fromRawSession = (r: RawSessionRow): SessionRow => ({ ...r, id: bufToUuid(r.id), created_by: bufToUuid(r.created_by), owner_id: bufToUuid(r.owner_id) });

/** شمار اعضای تأییدشده با خواندن قفل‌دار (آخرین commit)؛ فقط پس از قفل ردیف جلسه در همان تراکنش */
export async function approvedCount(q: Q, sessionId: string): Promise<number> {
  const r = (await q.query("SELECT COUNT(*) AS n FROM session_members WHERE session_id = ? AND status = 'approved' LOCK IN SHARE MODE", [uuidToBuf(sessionId)])) as { n: string | number }[];
  return Number(r[0]?.n ?? 0);
}

export interface Membership {
  memberId: string;
  status: MemberStatus;
}

export interface SupporterSources {
  teacher: Permission[] | null;
  session: Permission[] | null;
}

/** نیاز دسترسی: مجوز درون‌جلسه، یا `staff` (صاحب/پشتیبان)، یا `owner` */
export type Need = Permission | 'staff' | 'owner';

export interface Access {
  session: SessionRow;
  role: SessionRole | null;
  membership: Membership | null;
  permissions: Permission[];
  sources: SupporterSources;
}

/** نیاز ⇒ برقرار است؟ */
export const satisfies = (a: Pick<Access, 'role' | 'permissions'>, need: Need): boolean =>
  need === 'owner' ? a.role === 'owner' : need === 'staff' ? isStaff(a.role) : a.permissions.includes(need);

/**
 * دسترسی درون‌جلسه (۱.۷.۰؛ docs-v2/31 §۲) — همیشه از DB (نه JWT):
 * owner (sessions.owner_id) ⇒ همهٔ مجوزها؛ supporter ⇒ اجتماع teacher_supporters(owner) ∪ session_supporters؛ member ⇒ [].
 */
@Injectable()
export class MembersAccess {
  constructor(private readonly ds: DataSource) {}

  /** جلسهٔ حذف‌نرم‌شده مثل «وجود ندارد» است مگر `includeDeleted` (فقط مسیرهای ادمین) */
  async session(q: Q, sessionId: string, lock = false, includeDeleted = false): Promise<SessionRow | null> {
    if (!isUuid(sessionId)) return null;
    const rows = (await q.query(`SELECT ${lock ? LOCK_COLS : SESSION_COLS} FROM sessions s WHERE s.id = ?${includeDeleted ? '' : ' AND s.deleted_at IS NULL'}${lock ? ' FOR UPDATE' : ''}`, [uuidToBuf(sessionId)])) as RawSessionRow[];
    return rows[0] ? fromRawSession(rows[0]) : null;
  }

  async membership(q: Q, sessionId: string, userId: string): Promise<Membership | null> {
    const rows = (await q.query('SELECT id, status FROM session_members WHERE session_id = ? AND user_id = ?', [uuidToBuf(sessionId), uuidToBuf(userId)])) as { id: Buffer; status: MemberStatus }[];
    const r = rows[0];
    return r ? { memberId: bufToUuid(r.id), status: r.status } : null;
  }

  /** مجوزهای پشتیبان: ثابت (استاد صاحب) و per جلسه؛ null = ردیف ندارد */
  async supporterSources(q: Q, session: Pick<SessionRow, 'id' | 'owner_id'>, userId: string): Promise<SupporterSources> {
    const u = uuidToBuf(userId);
    const r = (await q.query('SELECT (SELECT permissions FROM session_supporters WHERE session_id = ? AND user_id = ?) AS sp, (SELECT permissions FROM teacher_supporters WHERE teacher_id = ? AND user_id = ?) AS tp', [
      uuidToBuf(session.id),
      u,
      uuidToBuf(session.owner_id),
      u
    ])) as { sp: unknown; tp: unknown }[];
    const row = r[0];
    return { teacher: row?.tp == null ? null : parsePermissions(row.tp), session: row?.sp == null ? null : parsePermissions(row.sp) };
  }

  /** نقش و مجوز مؤثر یک کاربر روی جلسهٔ بارگذاری‌شده */
  async accessOf(q: Q, session: SessionRow, userId: string): Promise<Omit<Access, 'session'>> {
    const isOwner = session.owner_id === userId;
    const [membership, sources] = await Promise.all([this.membership(q, session.id, userId), isOwner ? Promise.resolve({ teacher: null, session: null }) : this.supporterSources(q, session, userId)]);
    const role = roleOf(isOwner, sources.teacher !== null || sources.session !== null, membership?.status);
    return { role, membership, permissions: effectivePermissions(role, sources.teacher, sources.session), sources };
  }

  async isApprovedMember(sessionId: string, userId: string): Promise<boolean> {
    if (!isUuid(sessionId)) return false;
    if (!(await this.session(this.ds, sessionId))) return false;
    return (await this.membership(this.ds, sessionId, userId))?.status === 'approved';
  }

  /** ورود به اتاق realtime: عضو تأییدشده یا کادر (صاحب/پشتیبان) */
  async canJoinRoom(sessionId: string, userId: string): Promise<boolean> {
    if (!isUuid(sessionId) || !isUuid(userId)) return false;
    const s = await this.session(this.ds, sessionId);
    if (!s) return false;
    const a = await this.accessOf(this.ds, s, userId);
    return a.role !== null;
  }

  /** کاربرانی که این مجوز را در جلسه دارند: صاحب + پشتیبان‌های دارای مجوز (ثابت استاد یا per جلسه) */
  async userIdsWithPermission(sessionId: string, perm: Permission | null, q: Q = this.ds): Promise<Set<string>> {
    if (!isUuid(sessionId)) return new Set();
    const sid = uuidToBuf(sessionId);
    const cond = perm ? ' AND JSON_CONTAINS(x.permissions, JSON_QUOTE(?))' : '';
    const args = perm ? [sid, sid, perm, sid, perm] : [sid, sid, sid];
    const rows = (await q.query(
      `SELECT s.owner_id AS user_id FROM sessions s WHERE s.id = ?
       UNION SELECT x.user_id FROM session_supporters x WHERE x.session_id = ?${cond}
       UNION SELECT x.user_id FROM teacher_supporters x JOIN sessions s2 ON s2.owner_id = x.teacher_id WHERE s2.id = ?${cond}`,
      args
    )) as { user_id: Buffer }[];
    return new Set(rows.map((r) => bufToUuid(r.user_id)));
  }

  /** کادر جلسه (صاحب + همهٔ پشتیبان‌ها) */
  staffUserIds(sessionId: string, q: Q = this.ds): Promise<Set<string>> {
    return this.userIdsWithPermission(sessionId, null, q);
  }

  /**
   * بارگذاری جلسه + نقش کاربر با قاعدهٔ دیده‌شدن: جلسهٔ draft فقط برای صاحب/پشتیبان وجود دارد (وگرنه NOT_FOUND).
   * اگر `need` داده شود و برقرار نباشد ⇒ AUTH_FORBIDDEN.
   */
  async load(q: Q, sessionId: string, userId: string, need?: Need, lock = false): Promise<Access> {
    const session = await this.session(q, sessionId, lock);
    if (!session) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    const a = await this.accessOf(q, session, userId);
    if (session.status === 'draft' && !isStaff(a.role)) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    if (need && !satisfies(a, need)) throw new AppError('AUTH_FORBIDDEN');
    return { session, ...a };
  }
}
