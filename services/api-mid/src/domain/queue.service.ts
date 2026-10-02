import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { LiveService } from '../live/live.service';
import { MembersAccess } from './access.service';
import { NAME_SQL, conflict, displayName, withRetry, type Q } from './db';
import { emitInbox } from './outbox.writer';

interface Row {
  id: Buffer;
  user_id: Buffer;
  status: 'waiting' | 'current' | 'done';
  position: number | null;
  joined_at: Date;
  name: string;
  evaluated: number;
}

const DONE_LIMIT = 50;

@Injectable()
export class QueueService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly access: MembersAccess,
    private readonly live: LiveService
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

  async state(q: Q, sessionId: string, viewerId: string, full: boolean) {
    const sid = uuidToBuf(sessionId);
    const [waiting, current, done, mine] = await Promise.all([
      q.query(this.select("q.session_id = ? AND q.status = 'waiting'", 'ORDER BY q.position ASC, q.id ASC'), [sid]) as Promise<Row[]>,
      q.query(this.select("q.session_id = ? AND q.status = 'current'", 'LIMIT 1'), [sid]) as Promise<Row[]>,
      full ? (q.query(this.select("q.session_id = ? AND q.status = 'done'", `ORDER BY q.finished_at DESC, q.id DESC LIMIT ${DONE_LIMIT}`), [sid]) as Promise<Row[]>) : Promise.resolve([] as Row[]),
      q.query(this.select('q.session_id = ? AND q.user_id = ?', 'ORDER BY q.joined_at DESC, q.id DESC LIMIT 1'), [sid, uuidToBuf(viewerId)]) as Promise<Row[]>
    ]);
    const posOf = (id: Buffer) => waiting.findIndex((w) => w.id.equals(id)) + 1;
    const wItems = waiting.map((r, i) => this.item(r, viewerId, full, i + 1));
    const myRow = mine[0];
    const myItem = myRow ? this.item(myRow, viewerId, full, myRow.status === 'waiting' ? posOf(myRow.id) : null) : null;
    return {
      current: current[0] ? this.item(current[0], viewerId, full, null) : null,
      waiting: full ? wItems : [],
      done: done.map((r) => this.item(r, viewerId, full, null)),
      myItem,
      myPosition: myItem && myItem.status === 'waiting' ? myItem.position : null,
      waitingCount: waiting.length
    };
  }

  /** مشاهدهٔ صف: هر عضو تأییدشده؛ کادر (queue.manage) نام‌ها را کامل می‌بیند */
  async view(userId: string, sessionId: string) {
    const { membership, permissions } = await this.access.load(this.ds, sessionId, userId);
    if (membership?.status !== 'approved') throw new AppError('AUTH_FORBIDDEN');
    return this.state(this.ds, sessionId, userId, permissions.includes('queue.manage'));
  }

  /** پیوستن: قرآن‌آموزِ حاضر در جلسهٔ started؛ سریال‌سازی با قفل ردیف جلسه، یکتایی active_key هم در DB */
  async join(userId: string, sessionId: string) {
    let itemId = '';
    await withRetry(() => this.ds.transaction(async (m) => {
      const { session, membership } = await this.access.load(m, sessionId, userId, undefined, true);
      if (membership?.status !== 'approved' || !membership.roles.includes('quran_student')) throw new AppError('AUTH_FORBIDDEN', { message: 'فقط قرآن‌آموز عضو جلسه می‌تواند وارد صف شود.' });
      if (session.status !== 'started') throw conflict('SESSION_LOCKED', 'صف فقط وقتی جلسه شروع شده فعال است.');
      const att = (await m.query('SELECT 1 AS x FROM attendance_entries WHERE session_id = ? AND user_id = ?', [uuidToBuf(sessionId), uuidToBuf(userId)])) as unknown[];
      if (!att.length) throw conflict('NOT_PRESENT', 'ابتدا حضور خود را ثبت کنید.');
      const now = this.clock.now();
      const max = (await m.query("SELECT COALESCE(MAX(position), 0) AS p FROM queue_items WHERE session_id = ? AND status = 'waiting'", [uuidToBuf(sessionId)])) as { p: number }[];
      itemId = uuidv7(now.getTime());
      const r = (await m.query("INSERT IGNORE INTO queue_items (id, session_id, user_id, status, position, joined_at) VALUES (?, ?, ?, 'waiting', ?, ?)", [uuidToBuf(itemId), uuidToBuf(sessionId), uuidToBuf(userId), (max[0]?.p ?? 0) + 1, now])) as { affectedRows?: number };
      if (!r.affectedRows) throw conflict('ALREADY_IN_QUEUE', 'شما در صف هستید.');
    }));
    this.live.emit(sessionId, 'queue.updated');
    const s = await this.state(this.ds, sessionId, userId, false);
    return s.myItem!;
  }

  async leave(userId: string, sessionId: string) {
    await this.access.load(this.ds, sessionId, userId);
    const r = (await this.ds.query("DELETE FROM queue_items WHERE session_id = ? AND user_id = ? AND status = 'waiting'", [uuidToBuf(sessionId), uuidToBuf(userId)])) as { affectedRows?: number };
    if (!r.affectedRows) throw new AppError('NOT_FOUND', { message: 'شما در صف منتظر نیستید.' });
    this.live.emit(sessionId, 'queue.updated');
    return {};
  }

  /** نفر بعدی: جاری ⇒ done، اولین منتظر ⇒ current (صف خالی ⇒ current=null)؛ رویداد queue.turned + اعلان اینباکس */
  async next(userId: string, sessionId: string) {
    let turned: string | null = null;
    await withRetry(() => this.ds.transaction(async (m) => {
      const { session } = await this.access.load(m, sessionId, userId, 'queue.manage', true);
      if (session.status !== 'started') throw conflict('SESSION_LOCKED', 'صف فقط وقتی جلسه شروع شده فعال است.');
      const now = this.clock.now();
      await m.query("UPDATE queue_items SET status = 'done', position = NULL, finished_at = ? WHERE session_id = ? AND status = 'current'", [now, uuidToBuf(sessionId)]);
      const first = (await m.query("SELECT id, user_id FROM queue_items WHERE session_id = ? AND status = 'waiting' ORDER BY position ASC, id ASC LIMIT 1", [uuidToBuf(sessionId)])) as { id: Buffer; user_id: Buffer }[];
      if (first[0]) {
        await m.query("UPDATE queue_items SET status = 'current', position = NULL WHERE id = ?", [first[0].id]);
        turned = bufToUuid(first[0].user_id);
        await emitInbox(m, now, turned, 'turn', 'نوبت شماست', `نوبت شما در «${session.title}» رسید.`, `session:${sessionId}`);
      }
    }));
    this.live.emit(sessionId, 'queue.updated');
    if (turned) this.live.emit(sessionId, 'queue.turned', { userId: turned });
    return this.state(this.ds, sessionId, userId, true);
  }

  async act(userId: string, sessionId: string, itemId: string, action: 'up' | 'down' | 'skip' | 'remove') {
    if (!isUuid(itemId)) throw new AppError('NOT_FOUND', { message: 'این مورد در صف منتظر پیدا نشد.' });
    await this.ds.transaction(async (m) => {
      await this.access.load(m, sessionId, userId, 'queue.manage', true);
      const waiting = (await m.query("SELECT id, position FROM queue_items WHERE session_id = ? AND status = 'waiting' ORDER BY position ASC, id ASC", [uuidToBuf(sessionId)])) as { id: Buffer; position: number }[];
      const idx = waiting.findIndex((w) => bufToUuid(w.id) === itemId);
      if (idx < 0) throw new AppError('NOT_FOUND', { message: 'این مورد در صف منتظر پیدا نشد.' });
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
    });
    this.live.emit(sessionId, 'queue.updated');
    return this.state(this.ds, sessionId, userId, true);
  }
}
