import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { LiveService } from '../live/live.service';
import { MembersAccess, type SessionRow } from './access.service';
import { conflict, parseJson, type Q } from './db';
import { PostCommit } from './post-commit';
import type { SessionState } from './rules';
import type { Schedule } from './schedule';

export interface OccRow {
  id: string;
  sessionId: string;
  seq: number;
  status: 'live' | 'closed';
  openedAt: Date;
  closedAt: Date | null;
}
type Raw = { id: Buffer; session_id: Buffer; seq: number; status: 'live' | 'closed'; opened_at: Date; closed_at: Date | null };
export type OccLock = '' | 'share' | 'update';

const COLS = 'id, session_id, seq, status, opened_at, closed_at';
const LOCKS: Record<OccLock, string> = { '': '', share: ' LOCK IN SHARE MODE', update: ' FOR UPDATE' };
const row = (r: Raw): OccRow => ({ id: bufToUuid(r.id), sessionId: bufToUuid(r.session_id), seq: Number(r.seq), status: r.status, openedAt: r.opened_at, closedAt: r.closed_at });

/** شمارش‌های نوبت: حضور و ارزیابی‌های فعال (باطل‌شده نه) */
const DTO_SQL = `SELECT o.id, o.session_id, o.seq, o.status, o.opened_at, o.closed_at,
        (SELECT COUNT(*) FROM attendance_entries a WHERE a.occurrence_id = o.id) AS c_att,
        (SELECT COUNT(*) FROM evaluations e WHERE e.occurrence_id = o.id AND e.status = 'active') AS c_ev
   FROM session_occurrences o`;
type DtoRaw = Raw & { c_att: string | number; c_ev: string | number };
const dto = (r: DtoRaw) => ({
  id: bufToUuid(r.id),
  seq: Number(r.seq),
  status: r.status,
  openedAt: r.opened_at.toISOString(),
  closedAt: r.closed_at ? r.closed_at.toISOString() : null,
  counts: { attendance: Number(r.c_att), evaluations: Number(r.c_ev) }
});
export type OccurrenceDto = ReturnType<typeof dto>;

/**
 * نوبت برگزاری (docs-v2/30 §۱.۱، قفل #17): حداکثر یک نوبت live per جلسه (قفل ردیف جلسه + UNIQUE live_key).
 * once: started ⇒ نوبت #۱ خودکار؛ ended (هر نوع جلسه) ⇒ بستن نوبت باز. بستن: صف current⇒done و waiting حذف.
 */
@Injectable()
export class OccurrencesService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly access: MembersAccess,
    private readonly live: LiveService,
    private readonly post: PostCommit
  ) {}

  async liveOf(q: Q, sessionId: string, lock: OccLock = ''): Promise<OccRow | null> {
    const r = (await q.query(`SELECT ${COLS} FROM session_occurrences WHERE session_id = ? AND status = 'live' LIMIT 1${LOCKS[lock]}`, [uuidToBuf(sessionId)])) as Raw[];
    return r[0] ? row(r[0]) : null;
  }

  /** نوبت مشخص همان جلسه؛ نبود ⇒ NOT_FOUND */
  async byId(q: Q, sessionId: string, occurrenceId: string, lock: OccLock = ''): Promise<OccRow> {
    const r = isUuid(occurrenceId) ? ((await q.query(`SELECT ${COLS} FROM session_occurrences WHERE id = ? AND session_id = ?${LOCKS[lock]}`, [uuidToBuf(occurrenceId), uuidToBuf(sessionId)])) as Raw[]) : [];
    if (!r[0]) throw new AppError('NOT_FOUND', { message: 'نوبت برگزاری پیدا نشد.' });
    return row(r[0]);
  }

  /** خواندن‌ها: occurrenceId داده‌شده، وگرنه نوبت live، وگرنه آخرین نوبت؛ هیچ ⇒ null */
  async resolve(q: Q, sessionId: string, occurrenceId?: string, lock: OccLock = ''): Promise<OccRow | null> {
    if (occurrenceId) return this.byId(q, sessionId, occurrenceId, lock);
    const r = (await q.query(`SELECT ${COLS} FROM session_occurrences WHERE session_id = ? ORDER BY status = 'live' DESC, seq DESC LIMIT 1${LOCKS[lock]}`, [uuidToBuf(sessionId)])) as Raw[];
    return r[0] ? row(r[0]) : null;
  }

  /** نوبت live برای نوشتن (قفل اشتراکی تا بستن هم‌زمان منتظر بماند)؛ نبود ⇒ CONFLICT(OCCURRENCE_CLOSED) */
  async requireLive(q: Q, sessionId: string): Promise<OccRow> {
    const o = await this.liveOf(q, sessionId, 'share');
    if (!o) throw conflict('OCCURRENCE_CLOSED', 'نوبت برگزاری باز نیست.');
    return o;
  }

  async dto(q: Q, occurrenceId: string): Promise<OccurrenceDto> {
    const r = (await q.query(`${DTO_SQL} WHERE o.id = ?`, [uuidToBuf(occurrenceId)])) as DtoRaw[];
    return dto(r[0]!);
  }

  private async page(sessionId: string, page: number, pageSize: number) {
    const sid = uuidToBuf(sessionId);
    const [rows, cnt] = await Promise.all([
      this.ds.query(`${DTO_SQL} WHERE o.session_id = ? ORDER BY o.seq DESC LIMIT ? OFFSET ?`, [sid, pageSize, (page - 1) * pageSize]) as Promise<DtoRaw[]>,
      this.ds.query('SELECT COUNT(*) AS n FROM session_occurrences WHERE session_id = ?', [sid]) as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map(dto), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  /** M-08 */
  async list(userId: string, sessionId: string, page: number, pageSize: number) {
    await this.access.load(this.ds, sessionId, userId, 'attendance.view');
    return this.page(sessionId, page, pageSize);
  }

  /** MID_ADMIN.occurrences (فراخوان وجود جلسه را بررسی کرده است) */
  adminList(sessionId: string, page: number, pageSize: number) {
    return this.page(sessionId, page, pageSize);
  }

  /** M-09: جلسه باید started باشد؛ نوبت باز دیگر ⇒ OCCURRENCE_LIVE */
  async open(userId: string, sessionId: string): Promise<OccurrenceDto> {
    const id = await this.ds.transaction(async (m) => {
      const { session } = await this.access.load(m, sessionId, userId, 'occurrence.manage', true);
      return (await this.openIn(m, session, userId)).id;
    });
    return this.dto(this.ds, id);
  }

  /** M-19: idempotent (بسته ⇒ همان) */
  async close(userId: string, sessionId: string, occurrenceId: string): Promise<OccurrenceDto> {
    await this.ds.transaction(async (m) => {
      await this.access.load(m, sessionId, userId, 'occurrence.manage', true);
      await this.closeIn(m, await this.byId(m, sessionId, occurrenceId, 'update'), userId);
    });
    return this.dto(this.ds, occurrenceId);
  }

  /** باز کردن داخل تراکنشی که ردیف جلسه را FOR UPDATE قفل کرده است */
  async openIn(m: Q, session: SessionRow, actorId: string | null): Promise<OccRow> {
    if (session.status !== 'started') throw conflict('SESSION_LOCKED', 'نوبت برگزاری فقط وقتی جلسه شروع شده باز می‌شود.');
    if (await this.liveOf(m, session.id)) throw conflict('OCCURRENCE_LIVE', 'یک نوبت برگزاری هم‌اکنون باز است.');
    const now = this.clock.now();
    const max = (await m.query('SELECT COALESCE(MAX(seq), 0) AS s FROM session_occurrences WHERE session_id = ?', [uuidToBuf(session.id)])) as { s: number | string }[];
    const id = uuidv7(now.getTime());
    const seq = Number(max[0]?.s ?? 0) + 1;
    await m.query("INSERT INTO session_occurrences (id, session_id, seq, status, opened_at, opened_by) VALUES (?, ?, ?, 'live', ?, ?)", [uuidToBuf(id), uuidToBuf(session.id), seq, now, actorId ? uuidToBuf(actorId) : null]);
    this.post.after(m, () => this.live.emit(session.id, 'occurrence.updated', { occurrenceId: id, status: 'live' }));
    return { id, sessionId: session.id, seq, status: 'live', openedAt: now, closedAt: null };
  }

  /** بستن (ردیف نوبت قفل‌شده): صف current⇒done، waiting حذف؛ @returns false اگر قبلاً بسته بود */
  async closeIn(m: Q, occ: OccRow, actorId: string | null): Promise<boolean> {
    if (occ.status !== 'live') return false;
    const now = this.clock.now();
    const oid = uuidToBuf(occ.id);
    await m.query("UPDATE session_occurrences SET status = 'closed', closed_at = ?, closed_by = ? WHERE id = ? AND status = 'live'", [now, actorId ? uuidToBuf(actorId) : null, oid]);
    const done = (await m.query("UPDATE queue_items SET status = 'done', position = NULL, finished_at = ? WHERE occurrence_id = ? AND status = 'current'", [now, oid])) as { affectedRows?: number };
    const del = (await m.query("DELETE FROM queue_items WHERE occurrence_id = ? AND status = 'waiting'", [oid])) as { affectedRows?: number };
    this.post.after(m, () => {
      this.live.emit(occ.sessionId, 'occurrence.updated', { occurrenceId: occ.id, status: 'closed' });
      if (done.affectedRows || del.affectedRows) this.live.emit(occ.sessionId, 'queue.updated');
    });
    return true;
  }

  /**
   * قلاب چرخهٔ حیات (داخل تراکنش transition، ردیف جلسه قفل): once+started ⇒ باز کردن نوبت #۱؛ ended ⇒ بستن نوبت باز.
   * `session` وضعیت پیش از transition را دارد.
   */
  async onTransition(m: Q, session: SessionRow, to: SessionState, actorId: string | null = null): Promise<void> {
    if (to === 'started' && parseJson<Schedule>(session.schedule).type === 'once') {
      if (!(await this.liveOf(m, session.id))) await this.openIn(m, { ...session, status: 'started' }, actorId);
    } else if (to === 'ended') {
      const o = await this.liveOf(m, session.id, 'update');
      if (o) await this.closeIn(m, o, actorId);
    }
  }

  /** SessionMe: نوبت live/آخر و حضور من در آن */
  async forMe(q: Q, sessionId: string, userId: string) {
    const occ = await this.resolve(q, sessionId);
    if (!occ) return { occurrence: null, myAttendance: null };
    const [o, att] = await Promise.all([
      this.dto(q, occ.id),
      q.query('SELECT entered_at FROM attendance_entries WHERE occurrence_id = ? AND user_id = ?', [uuidToBuf(occ.id), uuidToBuf(userId)]) as Promise<{ entered_at: Date }[]>
    ]);
    return { occurrence: o, myAttendance: att[0] ? { enteredAt: att[0].entered_at.toISOString() } : null };
  }
}
