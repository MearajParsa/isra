import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { mid } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { bufToUuid, isUuid, uuidToBuf } from '../common/ids';
import { type Q } from './db';
import { type Permission, type SessionRole, type SessionState, permissionsFor } from './rules';

export interface SessionRow {
  id: string;
  title: string;
  description: string;
  status: SessionState;
  schedule: unknown;
  location_label: string;
  location_route_url: string | null;
  created_by: string;
  created_at: Date;
  next_starts_at: Date | null;
  join_policy: JoinPolicy;
  visibility: Visibility;
  capacity: number | null;
  /** اعضای تأییدشده */
  member_count: number | string;
}

export type JoinPolicy = 'request' | 'open' | 'invite_only';
export type Visibility = 'public' | 'unlisted';

const BASE_COLS = 's.id, s.title, s.description, s.status, s.schedule, s.location_label, s.location_route_url, s.created_by, s.created_at, s.next_starts_at, s.join_policy, s.visibility, s.capacity';
/** ستون‌های SessionRow با alias جدول `s` (شامل شمار اعضای تأییدشده) */
export const SESSION_COLS = `${BASE_COLS}, (SELECT COUNT(*) FROM session_members mc WHERE mc.session_id = s.id AND mc.status = 'approved') AS member_count`;
/** ستون‌ها بدون زیرپرسمان شمارش (برای SELECT … FOR UPDATE تا ردیف‌های عضویت قفل نشوند) */
const LOCK_COLS = `${BASE_COLS}, 0 AS member_count`;

/** شمار اعضای تأییدشده با خواندن قفل‌دار (آخرین commit)؛ فقط پس از قفل ردیف جلسه در همان تراکنش */
export async function approvedCount(q: Q, sessionId: string): Promise<number> {
  const r = (await q.query("SELECT COUNT(*) AS n FROM session_members WHERE session_id = ? AND status = 'approved' LOCK IN SHARE MODE", [uuidToBuf(sessionId)])) as { n: string | number }[];
  return Number(r[0]?.n ?? 0);
}

export interface Membership {
  memberId: string;
  status: 'pending' | 'approved' | 'rejected';
  roles: SessionRole[];
}

const ROLE_ORDER: SessionRole[] = ['session_manager', 'session_supporter', 'teacher', 'quran_student'];
export const sortRoles = (r: Iterable<string>): SessionRole[] => ROLE_ORDER.filter((x) => new Set(r).has(x));

/** عضویت و مجوزهای درون‌جلسه (از DB، نه JWT) */
@Injectable()
export class MembersAccess {
  constructor(private readonly ds: DataSource) {}

  /** جلسهٔ حذف‌نرم‌شده مثل «وجود ندارد» است مگر `includeDeleted` (فقط مسیرهای ادمین) */
  async session(q: Q, sessionId: string, lock = false, includeDeleted = false): Promise<SessionRow | null> {
    if (!isUuid(sessionId)) return null;
    const rows = (await q.query(`SELECT ${lock ? LOCK_COLS : SESSION_COLS} FROM sessions s WHERE s.id = ?${includeDeleted ? '' : ' AND s.deleted_at IS NULL'}${lock ? ' FOR UPDATE' : ''}`, [uuidToBuf(sessionId)])) as (Omit<SessionRow, 'id' | 'created_by'> & { id: Buffer; created_by: Buffer })[];
    const r = rows[0];
    return r ? { ...r, id: bufToUuid(r.id), created_by: bufToUuid(r.created_by) } : null;
  }

  async membership(q: Q, sessionId: string, userId: string): Promise<Membership | null> {
    const rows = (await q.query('SELECT m.id, m.status, GROUP_CONCAT(r.role) AS roles FROM session_members m LEFT JOIN session_member_roles r ON r.member_id = m.id WHERE m.session_id = ? AND m.user_id = ? GROUP BY m.id', [uuidToBuf(sessionId), uuidToBuf(userId)])) as {
      id: Buffer;
      status: Membership['status'];
      roles: string | null;
    }[];
    const r = rows[0];
    return r ? { memberId: bufToUuid(r.id), status: r.status, roles: sortRoles(r.roles ? r.roles.split(',') : []) } : null;
  }

  async isApprovedMember(sessionId: string, userId: string): Promise<boolean> {
    if (!isUuid(sessionId)) return false;
    if (!(await this.session(this.ds, sessionId))) return false;
    return (await this.membership(this.ds, sessionId, userId))?.status === 'approved';
  }

  /** اعضای تأییدشده‌ای که (از نقش‌هایشان) این مجوز را دارند */
  async userIdsWithPermission(sessionId: string, perm: Permission, q: Q = this.ds): Promise<Set<string>> {
    const roles = (Object.keys(mid.SESSION_ROLE_PERMISSIONS) as SessionRole[]).filter((r) => permissionsFor([r]).includes(perm));
    if (!roles.length || !isUuid(sessionId)) return new Set();
    const rows = (await q.query(
      `SELECT DISTINCT m.user_id FROM session_members m JOIN session_member_roles r ON r.member_id = m.id WHERE m.session_id = ? AND m.status = 'approved' AND r.role IN (${roles.map(() => '?').join(',')})`,
      [uuidToBuf(sessionId), ...roles]
    )) as { user_id: Buffer }[];
    return new Set(rows.map((r) => bufToUuid(r.user_id)));
  }

  permissions(ms: Membership | null): Permission[] {
    return ms?.status === 'approved' ? permissionsFor(ms.roles) : [];
  }

  /**
   * بارگذاری جلسه + عضویت کاربر با قاعدهٔ دیده‌شدن: جلسهٔ draft فقط برای عضو تأییدشده وجود دارد (وگرنه NOT_FOUND).
   * اگر perm داده شود و کاربر نداشته باشد ⇒ AUTH_FORBIDDEN.
   */
  async load(q: Q, sessionId: string, userId: string, perm?: Permission, lock = false): Promise<{ session: SessionRow; membership: Membership | null; permissions: Permission[] }> {
    const session = await this.session(q, sessionId, lock);
    if (!session) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    const membership = await this.membership(q, sessionId, userId);
    const permissions = this.permissions(membership);
    if (session.status === 'draft' && membership?.status !== 'approved') throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    if (perm && !permissions.includes(perm)) throw new AppError('AUTH_FORBIDDEN');
    return { session, membership, permissions };
  }
}
