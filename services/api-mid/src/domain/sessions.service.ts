import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { SessionInput } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { LiveService } from '../live/live.service';
import { MembersAccess, type SessionRow, sortRoles } from './access.service';
import { conflict, parseJson, type Q } from './db';
import { canTransition, isStaffRole, permissionsFor, type SessionRole, type SessionState } from './rules';
import { type Schedule, nextStartMs, nextStartsAt, toTehranIso } from './schedule';

type Input = z.infer<typeof SessionInput>;

export interface SessionDto {
  id: string;
  title: string;
  description: string;
  schedule: Schedule;
  nextStartsAt: string | null;
  location: { label: string };
  status: SessionState;
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly access: MembersAccess,
    private readonly live: LiveService
  ) {}

  toDto(r: SessionRow): SessionDto {
    const schedule = parseJson<Schedule>(r.schedule);
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      schedule,
      nextStartsAt: r.status === 'ended' ? null : nextStartsAt(schedule, this.clock.now()),
      location: { label: r.location_label },
      status: r.status
    };
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
        `INSERT INTO sessions (id, title, description, status, schedule_type, schedule, next_starts_at, location_label, created_by, version, created_at, updated_at)
         VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, 1, ?, ?)`,
        [uuidToBuf(id), input.title, input.description, input.schedule.type, JSON.stringify(input.schedule), this.snapshot(input.schedule), input.location.label, uuidToBuf(userId), now, now]
      );
      const memberId = uuidv7(now.getTime());
      await m.query("INSERT INTO session_members (id, session_id, user_id, status, requested_at, decided_by, decided_at) VALUES (?, ?, ?, 'approved', ?, ?, ?)", [uuidToBuf(memberId), uuidToBuf(id), uuidToBuf(userId), now, uuidToBuf(userId), now]);
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
      if (session.status !== 'draft' && session.status !== 'scheduled') throw conflict('SESSION_LOCKED', 'جلسهٔ شروع‌شده یا پایان‌یافته قابل ویرایش نیست.');
      await m.query('UPDATE sessions SET title = ?, description = ?, schedule_type = ?, schedule = ?, next_starts_at = ?, location_label = ?, version = version + 1, updated_at = ? WHERE id = ?', [
        input.title,
        input.description,
        input.schedule.type,
        JSON.stringify(input.schedule),
        this.snapshot(input.schedule),
        input.location.label,
        this.clock.now(),
        uuidToBuf(sessionId)
      ]);
    });
    return this.dtoById(this.ds, sessionId);
  }

  async transition(userId: string, sessionId: string, to: SessionState): Promise<SessionDto> {
    await this.ds.transaction(async (m) => {
      const { session } = await this.access.load(m, sessionId, userId, 'session.transition', true);
      if (!canTransition(session.status, to)) throw new AppError('SESSION_INVALID_TRANSITION', { details: { from: session.status, to } });
      await m.query('UPDATE sessions SET status = ?, version = version + 1, updated_at = ? WHERE id = ?', [to, this.clock.now(), uuidToBuf(sessionId)]);
    });
    this.live.emit(sessionId, 'session.state', { status: to });
    return this.dtoById(this.ds, sessionId);
  }

  async me(userId: string, sessionId: string) {
    const { session, membership, permissions } = await this.access.load(this.ds, sessionId, userId);
    const att = (await this.ds.query('SELECT entered_at FROM attendance_entries WHERE session_id = ? AND user_id = ?', [uuidToBuf(sessionId), uuidToBuf(userId)])) as { entered_at: Date }[];
    return {
      session: this.toDto(session),
      membership: membership ? { status: membership.status, roles: membership.roles } : null,
      permissions,
      myAttendance: att[0] ? { enteredAt: att[0].entered_at.toISOString() } : null
    };
  }

  async caps(userId: string, canCreate: boolean) {
    const r = (await this.ds.query("SELECT 1 AS x FROM session_members m JOIN session_member_roles r ON r.member_id = m.id WHERE m.user_id = ? AND m.status = 'approved' AND r.role <> 'quran_student' LIMIT 1", [uuidToBuf(userId)])) as unknown[];
    return { canCreateSession: canCreate, hasStaffRole: r.length > 0 };
  }

  async mySessions(userId: string, scope: 'all' | 'staff', page: number, pageSize: number) {
    const uid = uuidToBuf(userId);
    const staff = scope === 'staff' ? "AND m.status = 'approved' AND EXISTS (SELECT 1 FROM session_member_roles x WHERE x.member_id = m.id AND x.role <> 'quran_student')" : '';
    const [rows, cnt] = await Promise.all([
      this.ds.query(
        `SELECT s.id, s.title, s.description, s.status, s.schedule, s.location_label, s.created_by, s.created_at, s.next_starts_at, m.status AS m_status,
                (SELECT GROUP_CONCAT(r.role) FROM session_member_roles r WHERE r.member_id = m.id) AS roles
           FROM session_members m JOIN sessions s ON s.id = m.session_id
          WHERE m.user_id = ? ${staff}
          ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`,
        [uid, pageSize, (page - 1) * pageSize]
      ) as Promise<(Omit<SessionRow, 'id' | 'created_by'> & { id: Buffer; created_by: Buffer; m_status: 'pending' | 'approved' | 'rejected'; roles: string | null })[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM session_members m WHERE m.user_id = ? ${staff}`, [uid]) as Promise<{ n: string | number }[]>
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

  /** فهرست عمومی (draft هرگز) برای low via internal REST */
  async publicList(page: number, pageSize: number, status?: string) {
    const where = status ? 'status = ?' : "status <> 'draft'";
    const args: unknown[] = status ? [status] : [];
    const [rows, cnt] = await Promise.all([
      this.ds.query(`SELECT id, title, description, status, schedule, location_label, created_by, created_at, next_starts_at FROM sessions WHERE ${where} ORDER BY FIELD(status,'started','scheduled','ended'), COALESCE(next_starts_at, created_at) ASC, id ASC LIMIT ? OFFSET ?`, [...args, pageSize, (page - 1) * pageSize]) as Promise<(Omit<SessionRow, 'id' | 'created_by'> & { id: Buffer; created_by: Buffer })[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM sessions WHERE ${where}`, args) as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map((r) => this.toDto({ ...r, id: bufToUuid(r.id), created_by: bufToUuid(r.created_by) })), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  async publicOne(id: string): Promise<SessionDto> {
    const r = await this.access.session(this.ds, id);
    if (!r || r.status === 'draft') throw new AppError('NOT_FOUND');
    return this.toDto(r);
  }

  /** شمار جلسات per وضعیت (برای نمای کلی api-high via internal REST) */
  async stats() {
    const rows = (await this.ds.query('SELECT status, COUNT(*) AS n FROM sessions GROUP BY status')) as { status: string; n: string | number }[];
    const out = { draft: 0, scheduled: 0, started: 0, ended: 0 };
    for (const r of rows) if (r.status in out) out[r.status as keyof typeof out] = Number(r.n);
    return out;
  }

  /** job دوره‌ای: next_starts_at جلسات تکرارشونده را تازه می‌کند (مرتب‌سازی فهرست عمومی) */
  async refreshSnapshots(limit = 500): Promise<number> {
    const now = this.clock.now();
    const rows = (await this.ds.query("SELECT id, schedule FROM sessions WHERE status IN ('scheduled','started') AND schedule_type <> 'once' AND (next_starts_at IS NULL OR next_starts_at < ?) LIMIT ?", [now, limit])) as { id: Buffer; schedule: unknown }[];
    for (const r of rows) {
      const ms = nextStartMs(parseJson<Schedule>(r.schedule), now.getTime());
      await this.ds.query('UPDATE sessions SET next_starts_at = ? WHERE id = ?', [ms === null ? null : new Date(ms), r.id]);
    }
    return rows.length;
  }
}

export { isStaffRole, toTehranIso };
export type { SessionRole };
