import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { SessionInput } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { LiveService } from '../live/live.service';
import { type CommentVisibility, MembersAccess, SESSION_COLS, type JoinPolicy, type RawSessionRow, type SessionRow, type Visibility, fromRawSession } from './access.service';
import { OccurrencesService } from './occurrences.service';
import { conflict, parseJson, type Q } from './db';
import { emitInboxBatch } from './outbox.writer';
import { type Permission, type SessionRole, type SessionState, canTransition, effectivePermissions, parsePermissions } from './rules';
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
  commentsEnabled: boolean;
  commentVisibility: CommentVisibility;
}

const fromRaw = fromRawSession;
const likeArg = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

@Injectable()
export class SessionsService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly access: MembersAccess,
    private readonly live: LiveService,
    private readonly occurrences: OccurrencesService
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
      visibility: r.visibility ?? 'public',
      commentsEnabled: r.comments_enabled === undefined ? true : !!Number(r.comments_enabled),
      commentVisibility: r.comment_visibility ?? 'public'
    };
  }

  /** PublicSession (strict): بدون visibility؛ draft هرگز به اینجا نمی‌رسد */
  publicDto(r: SessionRow) {
    const { visibility: _v, commentsEnabled: _c, commentVisibility: _cv, ...rest } = this.toDto(r);
    return { ...rest, status: rest.status as Exclude<SessionState, 'draft'> };
  }

  private snapshot(schedule: Schedule): Date | null {
    const ms = nextStartMs(schedule, this.clock.now().getTime());
    return ms === null ? null : new Date(ms);
  }

  /** ۱.۷.۰: سازنده صاحب (owner_id) جلسه است و ردیف عضویت ندارد؛ پشتیبان‌های ثابت او خودکار مؤثرند */
  async create(userId: string, input: Input): Promise<SessionDto> {
    const now = this.clock.now();
    const id = uuidv7(now.getTime());
    await this.ds.query(
      `INSERT INTO sessions (id, title, description, status, schedule_type, schedule, next_starts_at, location_label, location_route_url, join_policy, visibility, capacity, comments_enabled, comment_visibility, created_by, owner_id, version, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        uuidToBuf(id),
        input.title,
        input.description,
        input.schedule.type,
        JSON.stringify(input.schedule),
        this.snapshot(input.schedule),
        input.location.label,
        input.location.routeUrl ?? null,
        input.joinPolicy,
        input.visibility,
        input.capacity ?? null,
        input.commentsEnabled ? 1 : 0,
        input.commentVisibility,
        uuidToBuf(userId),
        uuidToBuf(userId),
        now,
        now
      ]
    );
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
      `UPDATE sessions SET title = ?, description = ?, schedule_type = ?, schedule = ?, next_starts_at = ?, location_label = ?, location_route_url = ?, join_policy = ?, visibility = ?, comments_enabled = ?, comment_visibility = ?${input.capacity === undefined ? '' : ', capacity = ?'}, version = version + 1, updated_at = ? WHERE id = ?`,
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
        input.commentsEnabled ? 1 : 0,
        input.commentVisibility,
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

  /** اعضای تأییدشده + کادر (صاحب/پشتیبان‌ها) جلسه (به‌جز exclude) */
  private async memberIds(m: Q, sessionId: string, exclude: string | null): Promise<string[]> {
    const rows = (await m.query("SELECT user_id FROM session_members WHERE session_id = ? AND status = 'approved'", [uuidToBuf(sessionId)])) as { user_id: Buffer }[];
    const all = new Set([...rows.map((r) => bufToUuid(r.user_id)), ...(await this.access.staffUserIds(sessionId, m))]);
    if (exclude) all.delete(exclude);
    return [...all];
  }

  async transition(userId: string, sessionId: string, to: SessionState): Promise<SessionDto> {
    await this.ds.transaction(async (m) => {
      const { session } = await this.access.load(m, sessionId, userId, 'session.edit', true);
      await this.applyTransition(m, session, to);
    });
    this.live.emit(sessionId, 'session.state', { status: to });
    return this.dtoById(this.ds, sessionId);
  }

  private async applyTransition(m: Q, session: SessionRow, to: SessionState): Promise<void> {
    if (!canTransition(session.status, to)) throw new AppError('SESSION_INVALID_TRANSITION', { details: { from: session.status, to } });
    await m.query('UPDATE sessions SET status = ?, version = version + 1, updated_at = ? WHERE id = ?', [to, this.clock.now(), uuidToBuf(session.id)]);
    await this.occurrences.onTransition(m, session, to);
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

  /** M-07: حذف نرم جلسهٔ draft توسط صاحب/پشتیبانِ session.edit؛ غیر draft ⇒ SESSION_LOCKED */
  async deleteDraft(userId: string, sessionId: string): Promise<Record<string, never>> {
    const { session } = await this.access.load(this.ds, sessionId, userId, 'session.edit');
    if (session.status !== 'draft') throw conflict('SESSION_LOCKED', 'فقط جلسهٔ پیش‌نویس قابل حذف است.');
    await this.softDelete(sessionId, userId, true);
    return {};
  }

  /** M-02: نقش (owner/supporter/member)، عضویت من و مجوزهای مؤثر */
  async me(userId: string, sessionId: string) {
    const { session, membership, permissions, role } = await this.access.load(this.ds, sessionId, userId);
    const occ = await this.occurrences.forMe(this.ds, sessionId, userId);
    return {
      session: this.toDto(session),
      role,
      membership: membership ? { status: membership.status } : null,
      permissions,
      myAttendance: occ.myAttendance,
      occurrence: occ.occurrence
    };
  }

  /** M-00: hasStaffRole = صاحب یا پشتیبان دست‌کم یک جلسهٔ موجود، یا پشتیبان ثابت یک استاد */
  async caps(userId: string, canCreate: boolean) {
    const u = uuidToBuf(userId);
    const r = (await this.ds.query(
      `SELECT EXISTS(SELECT 1 FROM sessions WHERE owner_id = ? AND deleted_at IS NULL)
           OR EXISTS(SELECT 1 FROM session_supporters x JOIN sessions s ON s.id = x.session_id AND s.deleted_at IS NULL WHERE x.user_id = ?)
           OR EXISTS(SELECT 1 FROM teacher_supporters WHERE user_id = ?) AS staff`,
      [u, u, u]
    )) as { staff: number | string }[];
    return { canCreateSession: canCreate, hasStaffRole: Number(r[0]?.staff ?? 0) > 0 };
  }

  /**
   * M-01: جلسه‌های من = صاحب ∪ پشتیبان (per جلسه یا ثابتِ استاد صاحب) ∪ عضو (هر وضعیت). نقش = بالاترین (owner > supporter > member).
   * draft فقط برای کادر. `scope=staff` ⇒ فقط owner/supporter. pendingCount فقط برای دارندگان membership.approve.
   */
  async mySessions(userId: string, scope: 'all' | 'staff', page: number, pageSize: number, filter: { status?: SessionState; role?: SessionRole } = {}) {
    const u = uuidToBuf(userId);
    const ROLE = `CASE WHEN s.owner_id = ? THEN 'owner'
                       WHEN EXISTS (SELECT 1 FROM session_supporters x WHERE x.session_id = s.id AND x.user_id = ?)
                         OR EXISTS (SELECT 1 FROM teacher_supporters t WHERE t.teacher_id = s.owner_id AND t.user_id = ?) THEN 'supporter'
                       ELSE 'member' END`;
    const ids = `SELECT id AS sid FROM sessions WHERE owner_id = ?
                 UNION SELECT session_id FROM session_supporters WHERE user_id = ?
                 UNION SELECT s2.id FROM teacher_supporters t2 JOIN sessions s2 ON s2.owner_id = t2.teacher_id WHERE t2.user_id = ?
                 UNION SELECT session_id FROM session_members WHERE user_id = ?`;
    const conds: string[] = ['r.d_at IS NULL', "(r.role <> 'member' OR r.status <> 'draft')"];
    const extra: unknown[] = [];
    if (scope === 'staff') conds.push("r.role <> 'member'");
    if (filter.status) {
      conds.push('r.status = ?');
      extra.push(filter.status);
    }
    if (filter.role) {
      conds.push('r.role = ?');
      extra.push(filter.role);
      if (filter.role === 'member') conds.push("r.m_status = 'approved'");
    }
    const derived = `FROM (SELECT ${SESSION_COLS}, s.deleted_at AS d_at, ${ROLE} AS role, m.status AS m_status
                             FROM (SELECT DISTINCT sid FROM (${ids}) u) i
                             JOIN sessions s ON s.id = i.sid
                             LEFT JOIN session_members m ON m.session_id = s.id AND m.user_id = ?) r
                    WHERE ${conds.join(' AND ')}`;
    // ترتیب placeholderها: ROLE (۳) ← ids (۴) ← join عضویت (۱) ← فیلترها
    const args = [u, u, u, u, u, u, u, u, ...extra];
    const [rows, cnt] = await Promise.all([
      this.ds.query(`SELECT r.* ${derived} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`, [...args, pageSize, (page - 1) * pageSize]) as Promise<(RawSessionRow & { role: SessionRole; m_status: 'pending' | 'approved' | 'rejected' | null })[]>,
      this.ds.query(`SELECT COUNT(*) AS n ${derived}`, args) as Promise<{ n: string | number }[]>
    ]);

    // مجوز مؤثر پشتیبان‌ها (دسته‌ای) برای pendingCount
    const sup = rows.filter((r) => r.role === 'supporter');
    const perms = new Map<string, Permission[]>();
    if (sup.length) {
      const sids = sup.map((r) => r.id);
      const owners = [...new Map(sup.map((r) => [r.owner_id.toString('hex'), r.owner_id])).values()];
      const [sp, tp] = await Promise.all([
        this.ds.query(`SELECT session_id, permissions FROM session_supporters WHERE user_id = ? AND session_id IN (${sids.map(() => '?').join(',')})`, [u, ...sids]) as Promise<{ session_id: Buffer; permissions: unknown }[]>,
        this.ds.query(`SELECT teacher_id, permissions FROM teacher_supporters WHERE user_id = ? AND teacher_id IN (${owners.map(() => '?').join(',')})`, [u, ...owners]) as Promise<{ teacher_id: Buffer; permissions: unknown }[]>
      ]);
      const spm = new Map(sp.map((x) => [bufToUuid(x.session_id), parsePermissions(x.permissions)]));
      const tpm = new Map(tp.map((x) => [bufToUuid(x.teacher_id), parsePermissions(x.permissions)]));
      for (const r of sup) perms.set(bufToUuid(r.id), effectivePermissions('supporter', tpm.get(bufToUuid(r.owner_id)) ?? null, spm.get(bufToUuid(r.id)) ?? null));
    }
    const approver = (r: (typeof rows)[number]) => r.role === 'owner' || (r.role === 'supporter' && (perms.get(bufToUuid(r.id)) ?? []).includes('membership.approve'));
    const approvers = rows.filter(approver);
    const pending = new Map<string, number>();
    if (approvers.length) {
      const pc = (await this.ds.query(`SELECT session_id, COUNT(*) AS n FROM session_members WHERE status = 'pending' AND session_id IN (${approvers.map(() => '?').join(',')}) GROUP BY session_id`, approvers.map((r) => r.id))) as { session_id: Buffer; n: string | number }[];
      for (const p of pc) pending.set(bufToUuid(p.session_id), Number(p.n));
    }

    return {
      items: rows.map((r) => {
        const s = fromRaw(r);
        return {
          session: this.toDto(s),
          role: r.role,
          membership: r.role === 'member' ? (r.m_status ?? 'pending') : null,
          ...(approver(r) ? { pendingCount: pending.get(s.id) ?? 0 } : {})
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
    if (!rows.length) return 0;
    // یک UPDATE دسته‌ای (docs-v2/30 §۱.۷) به‌جای یک کوئری per جلسه
    const vals = rows.map((r) => {
      const ms = nextStartMs(parseJson<Schedule>(r.schedule), now.getTime());
      return [r.id, ms === null ? null : new Date(ms)] as const;
    });
    await this.ds.query(`UPDATE sessions SET next_starts_at = CASE id ${vals.map(() => 'WHEN ? THEN ?').join(' ')} END WHERE id IN (${vals.map(() => '?').join(', ')})`, [...vals.flat(), ...vals.map((v) => v[0])]);
    return rows.length;
  }
}

export { toTehranIso };
export type { SessionRole };
