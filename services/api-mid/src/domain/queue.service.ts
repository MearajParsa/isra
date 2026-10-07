import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { LiveService } from '../live/live.service';
import { MembersAccess, type SessionRow } from './access.service';
import { AttendanceService } from './attendance.service';
import { NAME_SQL, conflict, displayName, withRetry, type Q } from './db';
import { OccurrencesService, type OccRow } from './occurrences.service';
import { emitInbox } from './outbox.writer';
import { PointsService } from './points.service';
import { PostCommit } from './post-commit';

interface Row {
  id: Buffer;
  user_id: Buffer;
  status: 'waiting' | 'current' | 'done';
  position: number | null;
  joined_at: Date;
  name: string;
  evaluated: number;
}

export type QueueAction = 'up' | 'down' | 'skip' | 'remove';
const DONE_LIMIT = 50;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * صف نوبت per نوبت برگزاری (docs-v2/30 §۱.۱): نوشتن‌ها فقط روی نوبت live (وگرنه OCCURRENCE_CLOSED)؛ خواندن پیش‌فرض live یا آخرین.
 * سریال‌سازی نوشتن‌ها با قفل ردیف جلسه (بستن نوبت هم همان قفل را می‌گیرد)؛ یکتایی active_key per (occurrence,user) در DB.
 */
@Injectable()
export class QueueService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly access: MembersAccess,
    private readonly live: LiveService,
    private readonly occurrences: OccurrencesService,
    private readonly attendance: AttendanceService,
    private readonly points: PointsService,
    private readonly post: PostCommit
  ) {}

  private select(where: string, tail = '') {
    return `SELECT q.id, q.user_id, q.status, q.position, q.joined_at, ${NAME_SQL} AS name, EXISTS(SELECT 1 FROM evaluations e WHERE e.queue_item_id = q.id) AS evaluated
              FROM queue_items q LEFT JOIN user_directory d ON d.user_id = q.user_id WHERE ${where} ${tail}`;
  }

  /** حریم خصوصی (D4): غیرکادر فقط نفر جاری، جایگاه خودش و تعداد منتظران را می‌بیند؛ userId دیگران خالی است */
  private item(r: Row, viewerId: string, full: boolean, position: number | null) {
    const uid = bufToUuid(r.user_id);
    const isMe = uid === viewerId;
    return { id: bufToUuid(r.id), userId: full || isMe ? uid : '', name: full || isMe || r.status === 'current' ? r.name || displayName() : null, status: r.status, position, joinedAt: r.joined_at.toISOString(), evaluated: !!r.evaluated, isMe };
  }

  /** وضعیت صف یک نوبت (null ⇒ صف خالی با occurrenceId=null) */
  async state(q: Q, occ: OccRow | null, viewerId: string, full: boolean) {
    if (!occ) return { occurrenceId: null, current: null, waiting: [], done: [], myItem: null, myPosition: null, waitingCount: 0 };
    const oid = uuidToBuf(occ.id);
    const [waiting, current, done, mine] = await Promise.all([
      q.query(this.select("q.occurrence_id = ? AND q.status = 'waiting'", 'ORDER BY q.position ASC, q.id ASC'), [oid]) as Promise<Row[]>,
      q.query(this.select("q.occurrence_id = ? AND q.status = 'current'", 'LIMIT 1'), [oid]) as Promise<Row[]>,
      full ? (q.query(this.select("q.occurrence_id = ? AND q.status = 'done'", `ORDER BY q.finished_at DESC, q.id DESC LIMIT ${DONE_LIMIT}`), [oid]) as Promise<Row[]>) : Promise.resolve([] as Row[]),
      q.query(this.select('q.occurrence_id = ? AND q.user_id = ?', 'ORDER BY q.joined_at DESC, q.id DESC LIMIT 1'), [oid, uuidToBuf(viewerId)]) as Promise<Row[]>
    ]);
    const posOf = (id: Buffer) => waiting.findIndex((w) => w.id.equals(id)) + 1;
    const wItems = waiting.map((r, i) => this.item(r, viewerId, full, i + 1));
    const myRow = mine[0];
    const myItem = myRow ? this.item(myRow, viewerId, full, myRow.status === 'waiting' ? posOf(myRow.id) : null) : null;
    return {
      occurrenceId: occ.id,
      current: current[0] ? this.item(current[0], viewerId, full, null) : null,
      waiting: full ? wItems : [],
      done: done.map((r) => this.item(r, viewerId, full, null)),
      myItem,
      myPosition: myItem && myItem.status === 'waiting' ? myItem.position : null,
      waitingCount: waiting.length
    };
  }

  /** M-32: هر عضو تأییدشده؛ کادر (queue.manage) نام‌ها را کامل می‌بیند */
  async view(userId: string, sessionId: string, occurrenceId?: string) {
    const { membership, permissions } = await this.access.load(this.ds, sessionId, userId);
    if (membership?.status !== 'approved') throw new AppError('AUTH_FORBIDDEN');
    return this.state(this.ds, await this.occurrences.resolve(this.ds, sessionId, occurrenceId), userId, permissions.includes('queue.manage'));
  }

  /** نمای کامل ادمین (استثنای حریم D4) */
  async adminView(sessionId: string, occurrenceId?: string) {
    return this.state(this.ds, await this.occurrences.resolve(this.ds, sessionId, occurrenceId), NIL_UUID, true);
  }

  private liveForWrite = async (m: Q, session: SessionRow): Promise<OccRow> => {
    if (session.status !== 'started') throw conflict('SESSION_LOCKED', 'صف فقط وقتی جلسه شروع شده فعال است.');
    const occ = await this.occurrences.liveOf(m, session.id);
    if (!occ) throw conflict('OCCURRENCE_CLOSED', 'نوبت برگزاری باز نیست.');
    return occ;
  };

  private async insertWaiting(m: Q, occ: OccRow, userId: string): Promise<string> {
    const now = this.clock.now();
    const max = (await m.query("SELECT COALESCE(MAX(position), 0) AS p FROM queue_items WHERE occurrence_id = ? AND status = 'waiting'", [uuidToBuf(occ.id)])) as { p: number }[];
    const itemId = uuidv7(now.getTime());
    const r = (await m.query("INSERT IGNORE INTO queue_items (id, session_id, occurrence_id, user_id, status, position, joined_at) VALUES (?, ?, ?, ?, 'waiting', ?, ?)", [
      uuidToBuf(itemId),
      uuidToBuf(occ.sessionId),
      uuidToBuf(occ.id),
      uuidToBuf(userId),
      Number(max[0]?.p ?? 0) + 1,
      now
    ])) as { affectedRows?: number };
    if (!r.affectedRows) throw conflict('ALREADY_IN_QUEUE', 'این کاربر در صف است.');
    return itemId;
  }

  private present = async (m: Q, occ: OccRow, userId: string): Promise<boolean> =>
    ((await m.query('SELECT 1 AS x FROM attendance_entries WHERE occurrence_id = ? AND user_id = ?', [uuidToBuf(occ.id), uuidToBuf(userId)])) as unknown[]).length > 0;

  /** M-30: قرآن‌آموزِ حاضر در نوبت باز */
  async join(userId: string, sessionId: string) {
    const occ = await withRetry(() =>
      this.ds.transaction(async (m) => {
        const { session, membership } = await this.access.load(m, sessionId, userId, undefined, true);
        if (membership?.status !== 'approved' || !membership.roles.includes('quran_student')) throw new AppError('AUTH_FORBIDDEN', { message: 'فقط قرآن‌آموز عضو جلسه می‌تواند وارد صف شود.' });
        const occ = await this.liveForWrite(m, session);
        if (!(await this.present(m, occ, userId))) throw conflict('NOT_PRESENT', 'ابتدا حضور خود را ثبت کنید.');
        await this.insertWaiting(m, occ, userId);
        return occ;
      })
    );
    this.live.emit(sessionId, 'queue.updated');
    const s = await this.state(this.ds, occ, userId, false);
    return s.myItem!;
  }

  /** M-31: فقط آیتم منتظر در نوبت باز */
  async leave(userId: string, sessionId: string) {
    await this.access.load(this.ds, sessionId, userId);
    const occ = await this.occurrences.liveOf(this.ds, sessionId);
    const r = occ ? ((await this.ds.query("DELETE FROM queue_items WHERE occurrence_id = ? AND user_id = ? AND status = 'waiting'", [uuidToBuf(occ.id), uuidToBuf(userId)])) as { affectedRows?: number }) : {};
    if (!r.affectedRows) throw new AppError('NOT_FOUND', { message: 'شما در صف منتظر نیستید.' });
    this.live.emit(sessionId, 'queue.updated');
    return {};
  }

  /** M-35: قرار دادن قرآن‌آموز توسط کادر؛ غایب ⇒ NOT_PRESENT مگر markPresent (+attendance.manage) */
  async enqueue(actorId: string, sessionId: string, targetId: string, markPresent: boolean) {
    const cat = await this.points.catalog();
    const occ = await withRetry(() =>
      this.ds.transaction(async (m) => {
        const { session, permissions } = await this.access.load(m, sessionId, actorId, 'queue.manage', true);
        const occ = await this.liveForWrite(m, session);
        const target = await this.access.membership(m, sessionId, targetId);
        if (!target) throw new AppError('NOT_FOUND', { message: 'این کاربر عضو جلسه نیست.' });
        if (target.status !== 'approved') throw conflict('NOT_APPROVED', 'عضویت این کاربر تأیید نشده است.');
        if (!target.roles.includes('quran_student')) throw conflict('NOT_STUDENT', 'فقط قرآن‌آموز در صف قرار می‌گیرد.');
        if (!(await this.present(m, occ, targetId))) {
          if (!markPresent) throw conflict('NOT_PRESENT', 'این قرآن‌آموز در این نوبت حاضر نیست.');
          if (!permissions.includes('attendance.manage')) throw new AppError('AUTH_FORBIDDEN', { message: 'مجوز ثبت حضور ندارید.' });
          await this.attendance.markIn(m, sessionId, occ, [targetId], 'staff', actorId, cat, { requireMember: true });
        }
        await this.insertWaiting(m, occ, targetId);
        return occ;
      })
    );
    this.live.emit(sessionId, 'queue.updated');
    return this.state(this.ds, occ, actorId, true);
  }

  /**
   * نفر بعدی (داخل تراکنش، جلسه قفل): جاری ⇒ done، اولین منتظر ⇒ current؛ اعلان نوبت (inbox) + queue.turned پس از commit.
   * `expectCurrentItemId` (ادمین): ناهمخوان با نفر جاری ⇒ QUEUE_STATE_CHANGED.
   */
  async nextIn(m: Q, session: SessionRow, expectCurrentItemId?: string | null): Promise<OccRow> {
    const occ = await this.liveForWrite(m, session);
    const now = this.clock.now();
    const oid = uuidToBuf(occ.id);
    const cur = (await m.query("SELECT id FROM queue_items WHERE occurrence_id = ? AND status = 'current' LIMIT 1 FOR UPDATE", [oid])) as { id: Buffer }[];
    if (expectCurrentItemId !== undefined && (cur[0] ? bufToUuid(cur[0].id) : null) !== expectCurrentItemId) throw conflict('QUEUE_STATE_CHANGED', 'صف تغییر کرده است؛ دوباره بارگذاری کنید.');
    await m.query("UPDATE queue_items SET status = 'done', position = NULL, finished_at = ? WHERE occurrence_id = ? AND status = 'current'", [now, oid]);
    const first = (await m.query("SELECT id, user_id FROM queue_items WHERE occurrence_id = ? AND status = 'waiting' ORDER BY position ASC, id ASC LIMIT 1", [oid])) as { id: Buffer; user_id: Buffer }[];
    if (first[0]) {
      await m.query("UPDATE queue_items SET status = 'current', position = NULL WHERE id = ?", [first[0].id]);
      await emitInbox(m, now, bufToUuid(first[0].user_id), 'turn', 'نوبت شماست', `نوبت شما در «${session.title}» رسید.`, `session:${session.id}`);
    }
    // queue.turned: LiveService userId را فقط به کادر و خود نفر می‌دهد (حریم D4، docs-v2/30 §۱.۵)
    const turned = first[0] ? bufToUuid(first[0].user_id) : null;
    this.post.after(m, () => {
      this.live.emit(session.id, 'queue.updated');
      if (turned) this.live.emit(session.id, 'queue.turned', { userId: turned });
    });
    return occ;
  }

  /** M-33 */
  async next(userId: string, sessionId: string) {
    const occ = await withRetry(() =>
      this.ds.transaction(async (m) => {
        const { session } = await this.access.load(m, sessionId, userId, 'queue.manage', true);
        return this.nextIn(m, session);
      })
    );
    return this.state(this.ds, occ, userId, true);
  }

  /** بالا/پایین/انتها/حذف (داخل تراکنش، جلسه قفل)؛ `expectPosition` (ادمین) ناهمخوان ⇒ QUEUE_STATE_CHANGED */
  async actIn(m: Q, session: SessionRow, itemId: string, action: QueueAction, expectPosition?: number): Promise<OccRow> {
    if (!isUuid(itemId)) throw new AppError('NOT_FOUND', { message: 'این مورد در صف منتظر پیدا نشد.' });
    const occ = await this.liveForWrite(m, session);
    const waiting = (await m.query("SELECT id, position FROM queue_items WHERE occurrence_id = ? AND status = 'waiting' ORDER BY position ASC, id ASC FOR UPDATE", [uuidToBuf(occ.id)])) as { id: Buffer; position: number }[];
    const idx = waiting.findIndex((w) => bufToUuid(w.id) === itemId);
    if (idx < 0) throw new AppError('NOT_FOUND', { message: 'این مورد در صف منتظر پیدا نشد.' });
    if (expectPosition !== undefined && expectPosition !== idx + 1) throw conflict('QUEUE_STATE_CHANGED', 'صف تغییر کرده است؛ دوباره بارگذاری کنید.');
    const it = waiting[idx]!;
    if (action === 'remove') await m.query('DELETE FROM queue_items WHERE id = ?', [it.id]);
    else if (action === 'skip') await m.query('UPDATE queue_items SET position = ? WHERE id = ?', [Math.max(...waiting.map((w) => w.position)) + 1, it.id]);
    else {
      const other = waiting[action === 'up' ? idx - 1 : idx + 1];
      if (other) {
        await m.query('UPDATE queue_items SET position = ? WHERE id = ?', [other.position, it.id]);
        await m.query('UPDATE queue_items SET position = ? WHERE id = ?', [it.position, other.id]);
      }
    }
    this.post.after(m, () => this.live.emit(session.id, 'queue.updated'));
    return occ;
  }

  /** M-34: فقط نوبت باز */
  async act(userId: string, sessionId: string, itemId: string, action: QueueAction) {
    const occ = await withRetry(() =>
      this.ds.transaction(async (m) => {
        const { session } = await this.access.load(m, sessionId, userId, 'queue.manage', true);
        return this.actIn(m, session, itemId, action);
      })
    );
    return this.state(this.ds, occ, userId, true);
  }
}
