import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { LiveService } from '../live/live.service';
import { MembersAccess } from './access.service';
import type { Catalog } from './badges.service';
import { NAME_SQL, conflict, displayName, withRetry, type Q } from './db';
import { OccurrencesService, type OccRow } from './occurrences.service';
import { PointsService } from './points.service';
import { PostCommit } from './post-commit';
import { attendanceRef } from './refs';
import { ATTENDANCE_POINTS } from './rules';

export type AttendanceSource = 'self' | 'staff' | 'admin';
export type MarkOutcome = 'marked' | 'already' | 'not_member';

interface EntryRow {
  id: Buffer;
  user_id: Buffer;
  entered_at: Date;
  source: AttendanceSource;
}
export interface MarkItem {
  userId: string;
  outcome: MarkOutcome;
  pointsAwarded: 0 | 5;
  enteredAt: Date | null;
  source: AttendanceSource | null;
}

const ph = (n: number) => Array.from({ length: n }, () => '?').join(', ');
const NIL = Buffer.alloc(16);
const REF_PROBE = 20;

const entryDto = (r: { user_id: Buffer; entered_at: Date; source: AttendanceSource; name: string; occurrence_id: Buffer }) => ({
  userId: bufToUuid(r.user_id),
  name: r.name || displayName(),
  enteredAt: r.entered_at.toISOString(),
  source: r.source,
  occurrenceId: bufToUuid(r.occurrence_id)
});

/**
 * حضور per نوبت (docs-v2/30 §۱.۱–۱.۲): +۵ یک‌بار per (نوبت، کاربر).
 * سه لایهٔ ضمانت: UNIQUE(occurrence_id,user_id) روی حضور (فقط تراکنشِ درج‌کننده اعطا می‌کند)، ref قطعی UUIDv5
 * و UNIQUE(user_id,reason,ref_id) در دفتر. لغو ⇒ حذف ردیف + attendance_reversal با همان ref؛ ثبت دوباره ⇒ ref شمارهٔ بعد.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly access: MembersAccess,
    private readonly points: PointsService,
    private readonly occurrences: OccurrencesService,
    private readonly live: LiveService,
    private readonly post: PostCommit
  ) {}

  private nameOf = async (userId: string): Promise<string> => {
    const r = (await this.ds.query(`SELECT ${NAME_SQL} AS name FROM user_directory d WHERE d.user_id = ?`, [uuidToBuf(userId)])) as { name: string }[];
    return r[0]?.name || displayName();
  };

  /** ref +۵ برای هر کاربر: نخستین ref استفاده‌نشده در دنبالهٔ قطعی attendance:{occ}:{user}[:n] */
  private async refsFor(m: Q, occurrenceId: string, users: readonly string[]): Promise<Map<string, string>> {
    const out = new Map(users.map((u) => [u, attendanceRef(occurrenceId, u, 1)]));
    const used = (await m.query(`SELECT user_id FROM point_ledger WHERE reason = 'attendance' AND user_id IN (${ph(users.length)}) AND ref_id IN (${ph(users.length)})`, [...users.map(uuidToBuf), ...users.map((u) => uuidToBuf(out.get(u)!))])) as { user_id: Buffer }[];
    for (const r of used) {
      const u = bufToUuid(r.user_id);
      for (let from = 2; ; from += REF_PROBE) {
        const cands = Array.from({ length: REF_PROBE }, (_, i) => attendanceRef(occurrenceId, u, from + i));
        const taken = new Set(((await m.query(`SELECT ref_id FROM point_ledger WHERE user_id = ? AND reason = 'attendance' AND ref_id IN (${ph(cands.length)})`, [uuidToBuf(u), ...cands.map(uuidToBuf)])) as { ref_id: Buffer }[]).map((x) => bufToUuid(x.ref_id)));
        const free = cands.find((c) => !taken.has(c));
        if (free) {
          out.set(u, free);
          break;
        }
      }
    }
    return out;
  }

  /**
   * ثبت حضور گروهی روی یک نوبت داخل تراکنش (درج چندردیفی). فقط تراکنشی که ردیف را درج کرد +۵ می‌گیرد ⇒ هم‌زمانی
   * ثبت کادر و خود کاربر دقیقاً یک +۵. `requireMember` ⇒ فقط اعضای تأییدشده (بقیه not_member).
   */
  async markIn(m: Q, sessionId: string, occ: OccRow, userIds: readonly string[], source: AttendanceSource, actorId: string, cat: Catalog, opts: { requireMember: boolean; note?: string | null }): Promise<{ items: MarkItem[]; marked: boolean }> {
    const uniq = [...new Set(userIds)];
    let ok = uniq;
    if (opts.requireMember && uniq.length) {
      const mem = (await m.query(`SELECT user_id FROM session_members WHERE session_id = ? AND status = 'approved' AND user_id IN (${ph(uniq.length)})`, [uuidToBuf(sessionId), ...uniq.map(uuidToBuf)])) as { user_id: Buffer }[];
      const set = new Set(mem.map((r) => bufToUuid(r.user_id)));
      ok = uniq.filter((u) => set.has(u));
    }
    const byUser = new Map<string, EntryRow>();
    const fresh = new Set<string>();
    const awarded = new Set<string>();
    ok = [...ok].sort(); // ترتیب قفل ثابت بین تراکنش‌های گروهی هم‌زمان
    if (ok.length) {
      const now = this.clock.now();
      const refs = await this.refsFor(m, occ.id, ok);
      const ids = new Map(ok.map((u) => [u, uuidv7(now.getTime())]));
      await m.query(
        `INSERT IGNORE INTO attendance_entries (id, session_id, occurrence_id, user_id, entered_at, source, marked_by, award_ref) VALUES ${ok.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
        ok.flatMap((u) => [uuidToBuf(ids.get(u)!), uuidToBuf(sessionId), uuidToBuf(occ.id), uuidToBuf(u), now, source, uuidToBuf(actorId), uuidToBuf(refs.get(u)!)])
      );
      const rows = (await m.query(`SELECT id, user_id, entered_at, source FROM attendance_entries WHERE occurrence_id = ? AND user_id IN (${ph(ok.length)})`, [uuidToBuf(occ.id), ...ok.map(uuidToBuf)])) as EntryRow[];
      for (const r of rows) {
        const u = bufToUuid(r.user_id);
        byUser.set(u, r);
        if (bufToUuid(r.id) === ids.get(u)) fresh.add(u);
      }
      const list = ok.filter((u) => fresh.has(u));
      if (list.length) {
        const res = await this.points.apply(
          m,
          list.map((u) => ({ userId: u, points: ATTENDANCE_POINTS, reason: 'attendance' as const, refId: refs.get(u)!, sessionId, note: opts.note ?? null, actorId: source === 'self' ? null : actorId })),
          cat
        );
        const lost: Buffer[] = [];
        list.forEach((u, i) => (res.applied[i] ? awarded.add(u) : lost.push(uuidToBuf(ids.get(u)!))));
        if (lost.length) await m.query(`UPDATE attendance_entries SET award_ref = NULL WHERE id IN (${ph(lost.length)})`, lost);
      }
    }
    const items = uniq.map((u): MarkItem => {
      const r = byUser.get(u);
      if (!r) return { userId: u, outcome: 'not_member', pointsAwarded: 0, enteredAt: null, source: null };
      return { userId: u, outcome: fresh.has(u) ? 'marked' : 'already', pointsAwarded: awarded.has(u) ? 5 : 0, enteredAt: r.entered_at, source: r.source };
    });
    if (fresh.size) this.post.after(m, () => this.live.emit(sessionId, 'attendance.updated', { occurrenceId: occ.id }));
    return { items, marked: fresh.size > 0 };
  }

  /**
   * لغو حضور داخل تراکنش: حذف ردیف + صف منتظر همان نوبت، و attendance_reversal (−۵ تا کف ۰) با همان ref.
   * idempotent: نبود حضور ⇒ revoked=false. `guard` پیش از حذف (مجوز) روی ردیف قفل‌شده.
   */
  async revokeIn(m: Q, sessionId: string, occ: OccRow, userId: string, actorId: string, note: string, cat: Catalog, guard?: (markedBy: string | null) => void) {
    const rows = (await m.query('SELECT id, award_ref, marked_by FROM attendance_entries WHERE occurrence_id = ? AND user_id = ? FOR UPDATE', [uuidToBuf(occ.id), uuidToBuf(userId)])) as { id: Buffer; award_ref: Buffer | null; marked_by: Buffer | null }[];
    const r = rows[0];
    if (!r) return { occurrenceId: occ.id, revoked: false, pointsReversed: 0 };
    guard?.(r.marked_by ? bufToUuid(r.marked_by) : null);
    await m.query('DELETE FROM attendance_entries WHERE id = ?', [r.id]);
    const q = (await m.query("DELETE FROM queue_items WHERE occurrence_id = ? AND user_id = ? AND status = 'waiting'", [uuidToBuf(occ.id), uuidToBuf(userId)])) as { affectedRows?: number };
    let reversed = 0;
    if (r.award_ref) {
      const res = await this.points.apply(m, [{ userId, points: -ATTENDANCE_POINTS, reason: 'attendance_reversal', refId: bufToUuid(r.award_ref), sessionId, note, actorId }], cat);
      reversed = -(res.actual[0] ?? 0);
    }
    this.post.after(m, () => {
      this.live.emit(sessionId, 'attendance.updated', { occurrenceId: occ.id });
      if (q.affectedRows) this.live.emit(sessionId, 'queue.updated');
    });
    return { occurrenceId: occ.id, revoked: true, pointsReversed: reversed };
  }

  /** M-20: ثبت حضور خودم روی نوبت باز؛ idempotent */
  async checkIn(userId: string, sessionId: string) {
    const { session, membership } = await this.access.load(this.ds, sessionId, userId);
    if (membership?.status !== 'approved') throw new AppError('AUTH_FORBIDDEN', { message: 'ابتدا باید عضو تأییدشدهٔ این جلسه باشید.' });
    if (session.status !== 'started') throw conflict('SESSION_LOCKED', 'ثبت حضور فقط وقتی جلسه شروع شده ممکن است.');
    const [name, cat] = await Promise.all([this.nameOf(userId), this.points.catalog()]);
    const { item, occ } = await withRetry(() =>
      this.ds.transaction(async (m) => {
        const occ = await this.occurrences.requireLive(m, sessionId);
        const r = await this.markIn(m, sessionId, occ, [userId], 'self', userId, cat, { requireMember: false });
        return { item: r.items[0]!, occ };
      })
    );
    return {
      entry: { userId, name, enteredAt: (item.enteredAt ?? this.clock.now()).toISOString(), source: item.source ?? 'self', occurrenceId: occ.id },
      pointsAwarded: item.pointsAwarded,
      alreadyPresent: item.outcome !== 'marked'
    };
  }

  /** M-22: ثبت حضور اعضا توسط کادر (نوبت باز) */
  async mark(actorId: string, sessionId: string, userIds: readonly string[]) {
    const { session } = await this.access.load(this.ds, sessionId, actorId, 'attendance.manage');
    if (session.status !== 'started') throw conflict('SESSION_LOCKED', 'ثبت حضور فقط وقتی جلسه شروع شده ممکن است.');
    const cat = await this.points.catalog();
    return withRetry(() =>
      this.ds.transaction(async (m) => {
        const occ = await this.occurrences.requireLive(m, sessionId);
        const r = await this.markIn(m, sessionId, occ, userIds, 'staff', actorId, cat, { requireMember: true });
        return { occurrenceId: occ.id, items: r.items.map((x) => ({ userId: x.userId, outcome: x.outcome, pointsAwarded: x.pointsAwarded })) };
      })
    );
  }

  /** M-23: لغو حضور (صاحب جلسه یا ثبت‌کنندهٔ همان حضور، با attendance.manage)؛ فقط نوبت باز */
  async revoke(actorId: string, sessionId: string, userId: string, occurrenceId: string | undefined, reason: string) {
    const { role } = await this.access.load(this.ds, sessionId, actorId, 'attendance.manage');
    const isManager = role === 'owner';
    const cat = await this.points.catalog();
    return withRetry(() =>
      this.ds.transaction(async (m) => {
        const occ = await this.occurrences.resolve(m, sessionId, occurrenceId, 'share');
        if (!occ) throw new AppError('NOT_FOUND', { message: 'نوبت برگزاری پیدا نشد.' });
        if (occ.status !== 'live') throw conflict('OCCURRENCE_CLOSED', 'نوبت برگزاری بسته است.');
        return this.revokeIn(m, sessionId, occ, userId, actorId, reason, cat, (markedBy) => {
          if (!isManager && markedBy !== actorId) throw new AppError('AUTH_FORBIDDEN', { message: 'فقط صاحب جلسه یا ثبت‌کنندهٔ همین حضور می‌تواند آن را لغو کند.' });
        });
      })
    );
  }

  private async page(occ: OccRow | null, page: number, pageSize: number) {
    if (!occ) return { items: [], total: 0, occurrenceId: null };
    const oid = uuidToBuf(occ.id);
    const [rows, cnt] = await Promise.all([
      this.ds.query(
        `SELECT a.user_id, a.entered_at, a.source, a.occurrence_id, ${NAME_SQL} AS name FROM attendance_entries a LEFT JOIN user_directory d ON d.user_id = a.user_id
          WHERE a.occurrence_id = ? ORDER BY a.entered_at ASC, a.id ASC LIMIT ? OFFSET ?`,
        [oid, pageSize, (page - 1) * pageSize]
      ) as Promise<{ user_id: Buffer; entered_at: Date; source: AttendanceSource; occurrence_id: Buffer; name: string }[]>,
      this.ds.query('SELECT COUNT(*) AS n FROM attendance_entries WHERE occurrence_id = ?', [oid]) as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map(entryDto), total: Number(cnt[0]?.n ?? 0), occurrenceId: occ.id };
  }

  /** M-21 */
  async list(userId: string, sessionId: string, q: { occurrenceId?: string; page: number; pageSize: number }) {
    await this.access.load(this.ds, sessionId, userId, 'staff');
    return this.page(await this.occurrences.resolve(this.ds, sessionId, q.occurrenceId), q.page, q.pageSize);
  }

  /** MID_ADMIN.attendance (فراخوان وجود جلسه را بررسی کرده است؛ حذف‌شده هم) */
  async adminList(sessionId: string, q: { occurrenceId?: string; page: number; pageSize: number }) {
    return this.page(await this.occurrences.resolve(this.ds, sessionId, q.occurrenceId), q.page, q.pageSize);
  }

  /** M-18: اعضای تأییدشده با حضور/غیاب و وضعیت صف در یک نوبت */
  async roster(userId: string, sessionId: string, q: { occurrenceId?: string; present?: 'true' | 'false'; q?: string; page: number; pageSize: number }) {
    await this.access.load(this.ds, sessionId, userId, 'staff');
    const occ = await this.occurrences.resolve(this.ds, sessionId, q.occurrenceId);
    const oid = occ ? uuidToBuf(occ.id) : NIL;
    const where = ["m.session_id = ?", "m.status = 'approved'"];
    const args: unknown[] = [uuidToBuf(sessionId)];
    if (q.present === 'true') where.push('a.id IS NOT NULL');
    if (q.present === 'false') where.push('a.id IS NULL');
    if (q.q) {
      where.push("CONCAT(COALESCE(d.first_name,''), ' ', COALESCE(d.last_name,'')) LIKE ?");
      args.push(`%${q.q.replace(/[\\%_]/g, '\\$&')}%`);
    }
    const from = `FROM session_members m LEFT JOIN user_directory d ON d.user_id = m.user_id LEFT JOIN attendance_entries a ON a.occurrence_id = ? AND a.user_id = m.user_id WHERE ${where.join(' AND ')}`;
    const [rows, cnt] = await Promise.all([
      this.ds.query(
        `SELECT m.id, m.user_id, ${NAME_SQL} AS name, a.entered_at, a.source,
                (SELECT x.status FROM queue_items x WHERE x.occurrence_id = ? AND x.user_id = m.user_id ORDER BY FIELD(x.status, 'current', 'waiting', 'done'), x.joined_at DESC LIMIT 1) AS queue_status
           ${from} ORDER BY name ASC, m.id ASC LIMIT ? OFFSET ?`,
        [oid, oid, ...args, q.pageSize, (q.page - 1) * q.pageSize]
      ) as Promise<{ id: Buffer; user_id: Buffer; name: string; entered_at: Date | null; source: AttendanceSource | null; queue_status: 'waiting' | 'current' | 'done' | null }[]>,
      this.ds.query(`SELECT COUNT(*) AS n ${from}`, [oid, ...args]) as Promise<{ n: string | number }[]>
    ]);
    return {
      items: rows.map((r) => ({
        memberId: bufToUuid(r.id),
        userId: bufToUuid(r.user_id),
        name: r.name || displayName(),
        enteredAt: r.entered_at ? r.entered_at.toISOString() : null,
        attendanceSource: r.entered_at ? (r.source ?? 'self') : null,
        queueStatus: r.queue_status ?? null
      })),
      page: q.page,
      pageSize: q.pageSize,
      total: Number(cnt[0]?.n ?? 0)
    };
  }
}
