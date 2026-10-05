import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { LiveService } from '../live/live.service';
import { MembersAccess, sortRoles } from './access.service';
import { NAME_SQL, conflict, displayName, type Q } from './db';
import { emitInbox } from './outbox.writer';
import type { SessionRole } from './rules';

interface MemberRow {
  id: Buffer;
  user_id: Buffer;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: Date;
  name: string | null;
  roles: string | null;
  decided_at?: Date | null;
}

const SELECT = `SELECT m.id, m.user_id, m.status, m.requested_at, m.decided_at, ${NAME_SQL} AS name, (SELECT GROUP_CONCAT(r.role) FROM session_member_roles r WHERE r.member_id = m.id) AS roles
                  FROM session_members m LEFT JOIN user_directory d ON d.user_id = m.user_id`;

const dto = (r: MemberRow) => ({ id: bufToUuid(r.id), userId: bufToUuid(r.user_id), name: r.name || displayName(), roles: sortRoles(r.roles?.split(',') ?? []), status: r.status, requestedAt: r.requested_at.toISOString() });

@Injectable()
export class MembersService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly access: MembersAccess,
    private readonly live: LiveService
  ) {}

  private async one(q: Q, sessionId: string, memberId: string) {
    const rows = (await q.query(`${SELECT} WHERE m.session_id = ? AND m.id = ?`, [uuidToBuf(sessionId), uuidToBuf(memberId)])) as MemberRow[];
    if (!rows[0]) throw new AppError('NOT_FOUND', { message: 'این عضو پیدا نشد.' });
    return dto(rows[0]);
  }

  /** درخواست عضویت: فقط جلسهٔ scheduled/started؛ تکراری ⇒ CONFLICT (یکتایی DB هم تضمین می‌کند) */
  async request(userId: string, sessionId: string) {
    const now = this.clock.now();
    const memberId = uuidv7(now.getTime());
    const { session, membership } = await this.access.load(this.ds, sessionId, userId);
    if (session.status === 'draft') throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    if (session.status === 'ended') throw conflict('SESSION_LOCKED', 'این جلسه پایان یافته است.');
    if (membership) throw conflict('ALREADY_MEMBER', 'قبلاً برای این جلسه درخواست داده‌اید.');
    const r = (await this.ds.query("INSERT IGNORE INTO session_members (id, session_id, user_id, status, requested_at) VALUES (?, ?, ?, 'pending', ?)", [uuidToBuf(memberId), uuidToBuf(sessionId), uuidToBuf(userId), now])) as { affectedRows?: number };
    if (!r.affectedRows) throw conflict('ALREADY_MEMBER', 'قبلاً برای این جلسه درخواست داده‌اید.');
    return this.one(this.ds, sessionId, memberId);
  }

  async list(userId: string, sessionId: string, status: string | undefined, page: number, pageSize: number) {
    await this.access.load(this.ds, sessionId, userId, 'membership.approve');
    const sid = uuidToBuf(sessionId);
    const where = status ? 'm.session_id = ? AND m.status = ?' : 'm.session_id = ?';
    const args = status ? [sid, status] : [sid];
    const [rows, cnt] = await Promise.all([
      this.ds.query(`${SELECT} WHERE ${where} ORDER BY m.requested_at DESC, m.id DESC LIMIT ? OFFSET ?`, [...args, pageSize, (page - 1) * pageSize]) as Promise<MemberRow[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM session_members m WHERE ${where}`, args) as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map(dto), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  /** تأیید ⇒ نقش قرآن‌آموز؛ فقط از وضعیت pending. اطلاع به کاربر از مسیر اینباکس (outbox) */
  async decide(userId: string, sessionId: string, memberId: string, action: 'approve' | 'reject') {
    if (!isUuid(memberId)) throw new AppError('NOT_FOUND', { message: 'این عضو پیدا نشد.' });
    await this.ds.transaction(async (m) => {
      const { session } = await this.access.load(m, sessionId, userId, 'membership.approve');
      await this.applyDecision(m, session.title, sessionId, memberId, userId, action);
    });
    return this.one(this.ds, sessionId, memberId);
  }

  private async applyDecision(m: Q, title: string, sessionId: string, memberId: string, deciderId: string | null, action: 'approve' | 'reject') {
    const rows = (await m.query('SELECT user_id, status FROM session_members WHERE id = ? AND session_id = ? FOR UPDATE', [uuidToBuf(memberId), uuidToBuf(sessionId)])) as { user_id: Buffer; status: string }[];
    const row = rows[0];
    if (!row) throw new AppError('NOT_FOUND', { message: 'این عضو پیدا نشد.' });
    if (row.status !== 'pending') throw conflict('ALREADY_DECIDED', 'این درخواست قبلاً بررسی شده است.');
    const now = this.clock.now();
    const next = action === 'approve' ? 'approved' : 'rejected';
    await m.query('UPDATE session_members SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?', [next, deciderId ? uuidToBuf(deciderId) : null, now, uuidToBuf(memberId)]);
    if (action === 'approve') await m.query("INSERT IGNORE INTO session_member_roles (member_id, role) VALUES (?, 'quran_student')", [uuidToBuf(memberId)]);
    await emitInbox(m, now, bufToUuid(row.user_id), 'membership', action === 'approve' ? 'عضویت تأیید شد' : 'درخواست عضویت رد شد', action === 'approve' ? `عضویت شما در «${title}» تأیید شد.` : `درخواست عضویت شما در «${title}» پذیرفته نشد.`, `session:${sessionId}`);
  }

  /** نقش مدیر از این مسیر عوض نمی‌شود؛ آرایهٔ خالی = فقط قرآن‌آموز */
  async setRoles(userId: string, sessionId: string, memberId: string, roles: readonly SessionRole[]) {
    if (!isUuid(memberId)) throw new AppError('NOT_FOUND', { message: 'این عضو پیدا نشد.' });
    await this.ds.transaction(async (m) => {
      await this.access.load(m, sessionId, userId, 'membership.roles');
      const rows = (await m.query('SELECT m.status, (SELECT GROUP_CONCAT(r.role) FROM session_member_roles r WHERE r.member_id = m.id) AS roles FROM session_members m WHERE m.id = ? AND m.session_id = ? FOR UPDATE', [uuidToBuf(memberId), uuidToBuf(sessionId)])) as { status: string; roles: string | null }[];
      const row = rows[0];
      if (!row) throw new AppError('NOT_FOUND', { message: 'این عضو پیدا نشد.' });
      if (row.roles?.split(',').includes('session_manager')) throw new AppError('AUTH_FORBIDDEN', { message: 'نقش مدیر جلسه از اینجا قابل تغییر نیست.' });
      if (row.status !== 'approved') throw conflict('NOT_APPROVED', 'ابتدا عضویت باید تأیید شود.');
      const next = roles.length ? [...new Set(roles)] : (['quran_student'] as SessionRole[]);
      await m.query('DELETE FROM session_member_roles WHERE member_id = ?', [uuidToBuf(memberId)]);
      for (const r of next) await m.query('INSERT INTO session_member_roles (member_id, role) VALUES (?, ?)', [uuidToBuf(memberId), r]);
    });
    return this.one(this.ds, sessionId, memberId);
  }

  // ───── مسیرهای ادمین (MID_ADMIN): بدون بررسی عضویت/مجوز درون‌جلسه؛ جلسهٔ حذف‌شده ⇒ NOT_FOUND ─────
  private adminDto(r: MemberRow) {
    return { ...dto(r), phone: null, decidedAt: r.decided_at ? r.decided_at.toISOString() : null };
  }

  /** فهرست اعضا؛ `phone` همیشه null است (api-high از دایرکتوری خودش پر می‌کند). جلسهٔ حذف‌شده هم خوانده می‌شود */
  async adminList(sessionId: string, status: string | undefined, page: number, pageSize: number) {
    const sid = uuidToBuf(sessionId);
    const where = status ? 'm.session_id = ? AND m.status = ?' : 'm.session_id = ?';
    const args = status ? [sid, status] : [sid];
    const [rows, cnt] = await Promise.all([
      this.ds.query(`${SELECT} WHERE ${where} ORDER BY m.requested_at DESC, m.id DESC LIMIT ? OFFSET ?`, [...args, pageSize, (page - 1) * pageSize]) as Promise<MemberRow[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM session_members m WHERE ${where}`, args) as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map((r) => this.adminDto(r)), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  private async adminOne(q: Q, sessionId: string, memberId: string) {
    const rows = (await q.query(`${SELECT} WHERE m.session_id = ? AND m.id = ?`, [uuidToBuf(sessionId), uuidToBuf(memberId)])) as MemberRow[];
    if (!rows[0]) throw new AppError('NOT_FOUND', { message: 'این عضو پیدا نشد.' });
    return this.adminDto(rows[0]);
  }

  private async requireLiveSession(q: Q, sessionId: string) {
    const session = await this.access.session(q, sessionId);
    if (!session) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    return session;
  }

  /** تأیید/رد با همان قواعد دامنه (فقط pending) و همان اعلان اینباکس؛ decided_by = NULL (ادمین سیستمی) */
  async adminDecide(sessionId: string, memberId: string, action: 'approve' | 'reject') {
    if (!isUuid(memberId)) throw new AppError('NOT_FOUND', { message: 'این عضو پیدا نشد.' });
    await this.ds.transaction(async (m) => {
      const session = await this.requireLiveSession(m, sessionId);
      await this.applyDecision(m, session.title, sessionId, memberId, null, action);
    });
    return this.adminOne(this.ds, sessionId, memberId);
  }

  /**
   * نقش‌ها (SetRolesBody): آرایهٔ خالی = فقط قرآن‌آموز؛ فقط عضو تأییدشده.
   * نقش `session_manager` دست‌نخورده می‌ماند (اگر عضو مدیر است، نقش‌های درخواستی کنار مدیر می‌نشینند و آرایهٔ خالی = فقط مدیر).
   */
  async adminSetRoles(sessionId: string, memberId: string, roles: readonly SessionRole[]) {
    if (!isUuid(memberId)) throw new AppError('NOT_FOUND', { message: 'این عضو پیدا نشد.' });
    await this.ds.transaction(async (m) => {
      await this.requireLiveSession(m, sessionId);
      const rows = (await m.query('SELECT m.status, (SELECT GROUP_CONCAT(r.role) FROM session_member_roles r WHERE r.member_id = m.id) AS roles FROM session_members m WHERE m.id = ? AND m.session_id = ? FOR UPDATE', [uuidToBuf(memberId), uuidToBuf(sessionId)])) as { status: string; roles: string | null }[];
      const row = rows[0];
      if (!row) throw new AppError('NOT_FOUND', { message: 'این عضو پیدا نشد.' });
      if (row.status !== 'approved') throw conflict('NOT_APPROVED', 'ابتدا عضویت باید تأیید شود.');
      const isManager = !!row.roles?.split(',').includes('session_manager');
      const requested = [...new Set(roles)];
      const next: SessionRole[] = isManager ? ['session_manager', ...requested] : requested.length ? requested : ['quran_student'];
      await m.query('DELETE FROM session_member_roles WHERE member_id = ?', [uuidToBuf(memberId)]);
      for (const r of next) await m.query('INSERT INTO session_member_roles (member_id, role) VALUES (?, ?)', [uuidToBuf(memberId), r]);
    });
    return this.adminOne(this.ds, sessionId, memberId);
  }

  /**
   * حذف عضو (هر وضعیتی)؛ مدیر جلسه ⇒ 409 CONFLICT. نقش‌ها و آیتم‌های فعال صف (waiting/current) او هم حذف می‌شوند؛
   * نوبت‌های done/ارزیابی/حضور برای تاریخچهٔ امتیاز می‌ماند. کاربر بعداً می‌تواند دوباره درخواست عضویت بدهد.
   */
  async adminRemove(sessionId: string, memberId: string): Promise<void> {
    if (!isUuid(memberId)) throw new AppError('NOT_FOUND', { message: 'این عضو پیدا نشد.' });
    let queueChanged = false;
    await this.ds.transaction(async (m) => {
      await this.requireLiveSession(m, sessionId);
      const rows = (await m.query('SELECT m.user_id, (SELECT GROUP_CONCAT(r.role) FROM session_member_roles r WHERE r.member_id = m.id) AS roles FROM session_members m WHERE m.id = ? AND m.session_id = ? FOR UPDATE', [uuidToBuf(memberId), uuidToBuf(sessionId)])) as { user_id: Buffer; roles: string | null }[];
      const row = rows[0];
      if (!row) throw new AppError('NOT_FOUND', { message: 'این عضو پیدا نشد.' });
      if (row.roles?.split(',').includes('session_manager')) throw conflict('SESSION_MANAGER_PROTECTED', 'مدیر جلسه قابل حذف نیست.');
      const q = (await m.query("DELETE FROM queue_items WHERE session_id = ? AND user_id = ? AND status IN ('waiting','current')", [uuidToBuf(sessionId), row.user_id])) as { affectedRows?: number };
      queueChanged = !!q.affectedRows;
      await m.query('DELETE FROM session_member_roles WHERE member_id = ?', [uuidToBuf(memberId)]);
      await m.query('DELETE FROM session_members WHERE id = ?', [uuidToBuf(memberId)]);
    });
    if (queueChanged) this.live.emit(sessionId, 'queue.updated');
  }
}
