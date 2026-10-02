import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
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

  async session(q: Q, sessionId: string, lock = false): Promise<SessionRow | null> {
    if (!isUuid(sessionId)) return null;
    const rows = (await q.query(`SELECT id, title, description, status, schedule, location_label, location_route_url, created_by, created_at, next_starts_at FROM sessions WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [uuidToBuf(sessionId)])) as (Omit<SessionRow, 'id' | 'created_by'> & { id: Buffer; created_by: Buffer })[];
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
    return (await this.membership(this.ds, sessionId, userId))?.status === 'approved';
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
