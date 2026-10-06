import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { SessionInput } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { LiveService } from '../live/live.service';
import { MembersAccess, SESSION_COLS, type JoinPolicy, type SessionRow, type Visibility, sortRoles } from './access.service';
import { SettingsService } from './settings.service';
import { conflict, parseJson, type Q } from './db';
import { emitInboxBatch } from './outbox.writer';
import { canTransition, isStaffRole, permissionsFor, type SessionRole, type SessionState } from './rules';
import { type Schedule, nextStartMs, nextStartsAt, toTehranIso } from './schedule';

type Input = z.infer<typeof SessionInput>;

export interface SessionDto {
  id: string;
  title: string;
  description: string;
  schedule: Schedule;
  nextStartsAt: string | null;
  location: { label: string; routeUrl: string | null };
  status: SessionState;
  joinPolicy: JoinPolicy;
  capacity: number | null;
  memberCount: number;
  visibility: Visibility;
}

type RawSessionRow = Omit<SessionRow, 'id' | 'created_by'> & { id: Buffer; created_by: Buffer };
const fromRaw = (r: RawSessionRow): SessionRow => ({ ...r, id: bufToUuid(r.id), created_by: bufToUuid(r.created_by) });
const likeArg = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

@Injectable()
export class SessionsService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly access: MembersAccess,
    private readonly live: LiveService,
    private readonly settings: SettingsService
  ) {}

  toDto(r: SessionRow): SessionDto {
    const schedule = parseJson<Schedule>(r.schedule);
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      schedule,
      nextStartsAt: r.status === 'ended' ? null : nextStartsAt(schedule, this.clock.now()),
      location: { label: r.location_label, routeUrl: r.location_route_url },
      status: r.status,
      joinPolicy: r.join_policy ?? 'request',
      capacity: r.capacity ?? null,
      memberCount: Number(r.member_count ?? 0),
      visibility: r.visibility ?? 'public'
    };
  }

  /** PublicSession (strict): بدون visibility؛ draft هرگز به اینجا نمی‌رسد */
  publicDto(r: SessionRow) {
    const { visibility: _v, ...rest } = this.toDto(r);
    return { ...rest, status: rest.status as Exclude<SessionState, 'draft'> };
  }

  private snapshot(schedule: Schedule): Date | null {
    const ms = nextStartMs(schedule, this.clock.now().getTime());
    return ms === null ? null : new Date(ms);
  }

  async create(userId: string, input: Input): Promise<SessionDto> {
    const now = this.clock.now();
    const id = uuidv7(now.getTime());
    await this.ds.transaction(async (m) => {
      await m.query(
        `INSERT INTO sessions (id, title, description, status, schedule_type, schedule, next_starts_at, location_label, location_route_url, join_policy, visibility, capacity, created_by, version, created_at, updated_at)
         VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [uuidToBuf(id), input.title, input.description, input.schedule.type, JSON.stringify(input.schedule), this.snapshot(input.schedule), input.location.label, input.location.routeUrl ?? null, input.joinPolicy, input.visibility, input.capacity ?? null, uuidToBuf(userId), now, now]
      );
      const memberId = uuidv7(now.getTime());
      await m.query("INSERT INTO session_members (id, session_id, user_id, status, requested_at, decided_by, decided_at, source, added_by) VALUES (?, ?, ?, 'approved', ?, ?, ?, 'staff', ?)", [uuidToBuf(memberId), uuidToBuf(id), uuidToBuf(userId), now, uuidToBuf(userId), now, uuidToBuf(userId)]);
      await m.query("INSERT INTO session_member_roles (member_id, role) VALUES (?, 'session_manager')", [uuidToBuf(memberId)]);
    });
    return this.dtoById(this.ds, id);
  }

  private async dtoById(q: Q, id: string): Promise<SessionDto> {
    const r = await this.access.session(q, id);
    if (!r) throw new AppError('NOT_FOUND');
    return this.toDto(r);
  }

  /** ویرایش فقط draft/scheduled (وگرنه CONFLICT)؛ قفل ردیف برای رقابت با transition */
  async edit(userId: string, sessionId: string, input: Input): Promise<SessionDto> {
    await this.ds.transaction(async (m) => {
      const { session } = await this.access.load(m, sessionId, userId, 'session.edit', true);
      await this.applyEdit(m, session, input, userId);
    });
    this.live.emit(sessionId, 'session.updated');
    return this.dtoById(this.ds, sessionId);
  }

  /** capacity نبود ⇒ بدون تغییر. تغییر زمان/مکان ⇒ اعلان inbox `session` به اعضای تأییدشده (به‌جز ویرایشگر) */
  private async applyEdit(m: Q, session: SessionRow, input: Input, actorId: string | null): Promise<void> {
    if (session.status !== 'draft' && session.status !== 'scheduled') throw conflict('SESSION_LOCKED', 'جلسهٔ شروع‌شده یا پایان‌یافته قابل ویرایش نیست.');
    const now = this.clock.now();
    await m.query(
      `UPDATE sessions SET title = ?, description = ?, schedule_type = ?, schedule = ?, next_starts_at = ?, location_label = ?, location_route_url = ?, join_policy = ?, visibility = ?${input.capacity === undefined ? '' : ', capacity = ?'}, version = version + 1, updated_at = ? WHERE id = ?`,
      [
        input.title,
        input.description,
        input.schedule.type,
        JSON.stringify(input.schedule),
        this.snapshot(input.schedule),
        input.location.label,
        input.location.routeUrl ?? null,
        input.joinPolicy,
        input.visibility,
        ...(input.capacity === undefined ? [] : [input.capacity]),
        now,
        uuidToBuf(session.id)
      ]
    );
    const scheduleChanged = JSON.stringify(parseJson<Schedule>(session.schedule)) !== JSON.stringify(input.schedule);
    const placeChanged = session.location_label !== input.location.label || (session.location_route_url ?? null) !== (input.location.routeUrl ?? null);
    if (session.status !== 'draft' && (scheduleChanged || placeChanged)) {
      const users = await this.memberIds(m, session.id, actorId);
      const what = scheduleChanged && placeChanged ? 'زمان و مکان' : scheduleChanged ? 'زمان' : 'مکان';
      await emitInboxBatch(m, now, users.map((userId) => ({ userId, kind: 'session' as const, title: 'تغییر جلسه', body: `${what} جلسهٔ «${input.title}» تغییر کرد.`, ref: `session:${session.id}` })));
    }
  }

  /** اعضای تأییدشدهٔ جلسه (به‌جز exclude) */
  private async memberIds(m: Q, sessionId: string, exclude: string | null): Promise<string[]> {
    const rows = (await m.query("SELECT user_id FROM session_members WHERE session_id = ? AND status = 'approved'", [uuidToBuf(sessionId)])) as { user_id: Buffer }[];
    return rows.map((r) => bufToUuid(r.user_id)).filter((u) => u !== exclude);
  }

  async transition(userId: string, sessionId: string, to: SessionState): Promise<SessionDto> {
    await this.ds.transaction(async (m) => {
      const { session } = await this.access.load(m, sessionId, userId, 'session.transition', true);
      await this.applyTransition(m, session, to);
    });
    this.live.emit(sessionId, 'session.state', { status: to });
    return this.dtoById(this.ds, sessionId);
  }

  private async applyTransition(m: Q, session: SessionRow, to: SessionState): Promise<void> {
    if (!canTransition(session.status, to)) throw new AppError('SESSION_INVALID_TRANSITION', { details: { from: session.status, to } });
    await m.query('UPDATE sessions SET status = ?, version = version + 1, updated_at = ? WHERE id = ?', [to, this.clock.now(), uuidToBuf(session.id)]);
  }

  // ───── مسیرهای ادمین (MID_ADMIN): بدون نیاز به عضویت؛ جلسهٔ حذف‌شده ⇒ NOT_FOUND ─────
  private async adminLoad(m: Q, sessionId: string): Promise<SessionRow> {
    const session = await this.access.session(m, sessionId, true);
    if (!session) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    return session;
  }

  async adminEdit(sessionId: string, input: Input): Promise<void> {
    await this.ds.transaction(async (m) => this.applyEdit(m, await this.adminLoad(m, sessionId), input, null));
    this.live.emit(sessionId, 'session.updated');
  }

  async adminTransition(sessionId: string, to: SessionState): Promise<void> {
    await this.ds.transaction(async (m) => this.applyTransition(m, await this.adminLoad(m, sessionId), to));
    this.live.emit(sessionId, 'session.state', { status: to });
  }

  /**
   * حذف نرم (deleted_at) در هر وضعیتی؛ idempotent (تکرار ⇒ بدون تغییر و بدون رویداد دوباره).
   * اتاق‌های باز (Socket.IO) با `session.state {deleted:true}` مطلع می‌شوند و با REST بعدی 404 می‌گیرند.
   * @returns false اگر جلسه وجود ندارد
   */
  async softDelete(sessionId: string, actorId: string | null = null, requireDraft = false): Promise<boolean> {
    if (!isUuid(sessionId)) return false;
    let status: SessionState | null = null;
    let deleted = false;
    const found = await this.ds.transaction(async (m) => {
      const r = (await m.query('SELECT status, title, deleted_at FROM sessions WHERE id = ? FOR UPDATE', [uuidToBuf(sessionId)])) as { status: SessionState; title: string; deleted_at: Date | null }[];
      const row = r[0];
      if (!row) return false;
      if (row.deleted_at) return true;
      if (requireDraft && row.status !== 'draft') throw conflict('SESSION_LOCKED', 'فقط جلسهٔ پیش‌نویس قابل حذف است.');
      const now = this.clock.now();
      await m.query('UPDATE sessions SET deleted_at = ? WHERE id = ?', [now, uuidToBuf(sessionId)]);
      const users = await this.memberIds(m, sessionId, actorId);
      await emitInboxBatch(m, now, users.map((userId) => ({ userId, kind: 'session' as const, title: 'حذف جلسه', body: `جلسهٔ «${row.title}» حذف شد.`, ref: `session:${sessionId}` })));
      status = row.status;
      deleted = true;
      return true;
    });
    if (deleted) {
      this.live.emit(sessionId, 'session.state', { status, deleted: true });
      this.live.closeRoom(sessionId);
    }
    return found;
  }

  /** M-07: حذف نرم جلسهٔ draft توسط مدیر (session.edit)؛ غیر draft ⇒ SESSION_LOCKED */
  async deleteDraft(userId: string, sessionId: string): Promise<Record<string, never>> {
    const { session } = await this.access.load(this.ds, sessionId, userId, 'session.edit');
    if (session.status !== 'draft') throw conflict('SESSION_LOCKED', 'فقط جلسهٔ پیش‌نویس قابل حذف است.');
    await this.softDelete(sessionId, userId, true);
    return {};
  }

  async me(userId: string, sessionId: string) {
    const { session, membership, permissions } = await this.access.load(this.ds, sessionId, userId);
    const att = (await this.ds.query('SELECT entered_at FROM attendance_entries WHERE session_id = ? AND user_id = ?', [uuidToBuf(sessionId), uuidToBuf(userId)])) as { entered_at: Date }[];
    return {
      session: this.toDto(session),
      membership: membership ? { status: membership.status, roles: membership.roles } : null,
      permissions,
      myAttendance: att[0] ? { enteredAt: att[0].entered_at.toISOString() } : null,
      evalWeights: { ...(await this.settings.get()).weights }
    };
  }

  async caps(userId: string, canCreate: boolean) {
    const r = (await this.ds.query("SELECT 1 AS x FROM session_members m JOIN sessions s ON s.id = m.session_id AND s.deleted_at IS NULL JOIN session_member_roles r ON r.member_id = m.id WHERE m.user_id = ? AND m.status = 'approved' AND r.role <> 'quran_student' LIMIT 1", [uuidToBuf(userId)])) as unknown[];
    return { canCreateSession: canCreate, hasStaffRole: r.length > 0 };
  }

  /** M-01: فیلترهای اختیاری status (وضعیت جلسه) و role (نقش من؛ فقط عضویت تأییدشده) */
  async mySessions(userId: string, scope: 'all' | 'staff', page: number, pageSize: number, filter: { status?: SessionState; role?: SessionRole } = {}) {
    const uid = uuidToBuf(userId);
    const conds: string[] = [];
    const extra: unknown[] = [];
    if (scope === 'staff') conds.push("m.status = 'approved' AND EXISTS (SELECT 1 FROM session_member_roles x WHERE x.member_id = m.id AND x.role <> 'quran_student')");
    if (filter.status) {
      conds.push('s.status = ?');
      extra.push(filter.status);
    }
    if (filter.role) {
      conds.push("m.status = 'approved' AND EXISTS (SELECT 1 FROM session_member_roles y WHERE y.member_id = m.id AND y.role = ?)");
      extra.push(filter.role);
    }
    const staff = conds.map((c) => `AND ${c}`).join(' ');
    const [rows, cnt] = await Promise.all([
      this.ds.query(
        `SELECT ${SESSION_COLS}, m.status AS m_status,
                (SELECT GROUP_CONCAT(r.role) FROM session_member_roles r WHERE r.member_id = m.id) AS roles
           FROM session_members m JOIN sessions s ON s.id = m.session_id
          WHERE m.user_id = ? AND s.deleted_at IS NULL ${staff}
          ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`,
        [uid, ...extra, pageSize, (page - 1) * pageSize]
      ) as Promise<(RawSessionRow & { m_status: 'pending' | 'approved' | 'rejected'; roles: string | null })[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM session_members m JOIN sessions s ON s.id = m.session_id WHERE m.user_id = ? AND s.deleted_at IS NULL ${staff}`, [uid, ...extra]) as Promise<{ n: string | number }[]>
    ]);

    // pendingCount فقط برای دارندگان membership.approve
    const approvers = rows.filter((r) => r.m_status === 'approved' && permissionsFor(sortRoles(r.roles?.split(',') ?? [])).includes('membership.approve'));
    const pending = new Map<string, number>();
    if (approvers.length) {
      const ids = approvers.map((r) => r.id);
      const pc = (await this.ds.query(`SELECT session_id, COUNT(*) AS n FROM session_members WHERE status = 'pending' AND session_id IN (${ids.map(() => '?').join(',')}) GROUP BY session_id`, ids)) as { session_id: Buffer; n: string | number }[];
      for (const p of pc) pending.set(bufToUuid(p.session_id), Number(p.n));
    }

    return {
      items: rows.map((r) => {
        const id = bufToUuid(r.id);
        const roles = sortRoles(r.roles?.split(',') ?? []);
        return {
          session: this.toDto({ ...r, id, created_by: bufToUuid(r.created_by) }),
          roles,
          membership: r.m_status,
          ...(approvers.includes(r) ? { pendingCount: pending.get(id) ?? 0 } : {})
        };
      }),
      page,
      pageSize,
      total: Number(cnt[0]?.n ?? 0)
    };
  }

  /** فهرست عمومی (draft هرگز؛ unlisted هرگز) برای low via internal REST */
  async publicList(page: number, pageSize: number, status?: string) {
    return this.search(page, pageSize, { status });
  }

  /**
   * M-06/L-30: کشف جلسات عمومی (visibility=public، غیر draft). مرتب: جاری، زمان‌بندی‌شده، پایان‌یافته؛ سپس شروع بعدی
   * — با کلید ذخیره‌شدهٔ (sort_rank, sort_at) و ایندکس idx_sessions_public_sort (بدون ORDER BY FIELD).
   * weekday (۰=شنبه): تکرارشونده/بازه از روزهای هفته؛ once از روز شروع بعدی (تهران).
   */
  async search(page: number, pageSize: number, f: { q?: string; status?: string; weekday?: number }) {
    const where = ["s.visibility = 'public'", 's.deleted_at IS NULL'];
    const args: unknown[] = [];
    if (f.status) {
      where.push('s.sort_rank = ?');
      args.push({ started: 0, scheduled: 1, ended: 2 }[f.status as 'started'] ?? 9);
    } else where.push('s.sort_rank < 9');
    if (f.q) {
      where.push('(s.title LIKE ? OR s.location_label LIKE ?)');
      args.push(likeArg(f.q), likeArg(f.q));
    }
    if (f.weekday !== undefined) {
      where.push("((s.schedule_type <> 'once' AND JSON_CONTAINS(s.schedule, ?, '$.weekdays')) OR (s.schedule_type = 'once' AND MOD(DAYOFWEEK(DATE_ADD(s.next_starts_at, INTERVAL 210 MINUTE)), 7) = ?))");
      args.push(String(f.weekday), f.weekday);
    }
    const w = where.join(' AND ');
    const [rows, cnt] = await Promise.all([
      this.ds.query(`SELECT ${SESSION_COLS} FROM sessions s WHERE ${w} ORDER BY s.sort_rank ASC, s.sort_at ASC, s.id ASC LIMIT ? OFFSET ?`, [...args, pageSize, (page - 1) * pageSize]) as Promise<RawSessionRow[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM sessions s WHERE ${w}`, args) as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map((r) => this.publicDto(fromRaw(r))), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  /** L-31: با شناسهٔ مستقیم (unlisted هم) */
  async publicOne(id: string) {
    const r = await this.access.session(this.ds, id);
    if (!r || r.status === 'draft') throw new AppError('NOT_FOUND');
    return this.publicDto(r);
  }

  /** شمار جلسات per وضعیت (برای نمای کلی api-high via internal REST) */
  async stats() {
    const rows = (await this.ds.query('SELECT status, COUNT(*) AS n FROM sessions WHERE deleted_at IS NULL GROUP BY status')) as { status: string; n: string | number }[];
    const out = { draft: 0, scheduled: 0, started: 0, ended: 0 };
    for (const r of rows) if (r.status in out) out[r.status as keyof typeof out] = Number(r.n);
    return out;
  }

  /** job دوره‌ای: next_starts_at جلسات تکرارشونده را تازه می‌کند (مرتب‌سازی فهرست عمومی) */
  async refreshSnapshots(limit = 500): Promise<number> {
    const now = this.clock.now();
    const rows = (await this.ds.query("SELECT id, schedule FROM sessions WHERE deleted_at IS NULL AND status IN ('scheduled','started') AND schedule_type <> 'once' AND (next_starts_at IS NULL OR next_starts_at < ?) LIMIT ?", [now, limit])) as { id: Buffer; schedule: unknown }[];
    for (const r of rows) {
      const ms = nextStartMs(parseJson<Schedule>(r.schedule), now.getTime());
      await this.ds.query('UPDATE sessions SET next_starts_at = ? WHERE id = ?', [ms === null ? null : new Date(ms), r.id]);
    }
    return rows.length;
  }
}

export { isStaffRole, toTehranIso };
export type { SessionRole };
