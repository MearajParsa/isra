import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { LiveService } from '../live/live.service';
import { type Access, MembersAccess, type CommentVisibility } from './access.service';
import { conflict, displayName, nameSql, type Q } from './db';
import { OccurrencesService } from './occurrences.service';
import { isStaff, type SessionRole } from './rules';

export const COMMENTS_PER_MINUTE = 30;

interface Raw {
  id: Buffer;
  session_id: Buffer;
  occurrence_id: Buffer;
  queue_item_id: Buffer | null;
  reciter_id: Buffer | null;
  author_id: Buffer;
  body: string;
  at_sec: number | null;
  hidden: number;
  created_at: Date;
  author_name: string | null;
  reciter_name: string | null;
}

const SELECT = `SELECT c.id, c.session_id, c.occurrence_id, c.queue_item_id, c.reciter_id, c.author_id, c.body, c.at_sec, c.hidden, c.created_at,
                       ${nameSql('a')} AS author_name, ${nameSql('r')} AS reciter_name
                  FROM comments c LEFT JOIN user_directory a ON a.user_id = c.author_id LEFT JOIN user_directory r ON r.user_id = c.reciter_id`;

const dto = (c: Raw, viewerId: string | null) => ({
  id: bufToUuid(c.id),
  sessionId: bufToUuid(c.session_id),
  occurrenceId: bufToUuid(c.occurrence_id),
  queueItemId: c.queue_item_id ? bufToUuid(c.queue_item_id) : null,
  reciter: c.reciter_id ? { id: bufToUuid(c.reciter_id), name: c.reciter_name || displayName() } : null,
  author: { id: bufToUuid(c.author_id), name: c.author_name || displayName() },
  body: c.body,
  atSec: c.at_sec === null ? null : Number(c.at_sec),
  hidden: !!Number(c.hidden),
  mine: viewerId !== null && bufToUuid(c.author_id) === viewerId,
  createdAt: c.created_at.toISOString()
});
export type CommentDto = ReturnType<typeof dto>;

export interface CommentsQuery {
  queueItemId?: string;
  scope: 'all' | 'general' | 'recitation';
  page: number;
  pageSize: number;
}

/**
 * قاعدهٔ دیدن (docs-v2/31 §۵؛ پیاده‌سازی SQL و تست واحد): کادر ⇒ همه (حتی پنهان)؛ دیگران پنهان را نمی‌بینند.
 * public ⇒ همهٔ بینندگان جلسه؛ reciter_only ⇒ کامنت تلاوت فقط نویسنده/خواننده، کامنت عمومی نوبت فقط اعضا.
 */
export function canSeeComment(c: { hidden: boolean; queueItemId: string | null; authorId: string; reciterId: string | null }, viewer: { userId: string; role: SessionRole | null }, visibility: CommentVisibility): boolean {
  if (isStaff(viewer.role)) return true;
  if (c.hidden) return false;
  if (visibility === 'public') return true;
  if (c.queueItemId === null) return viewer.role === 'member';
  return c.authorId === viewer.userId || c.reciterId === viewer.userId;
}

const notFound = () => new AppError('NOT_FOUND', { message: 'کامنت پیدا نشد.' });

/**
 * کامنت (۱.۷.۰؛ docs-v2/31 §۵، T8): حین تلاوت (وصل به آیتم current صف، at_sec محاسبهٔ سرور از queue_items.started_at)
 * یا عمومی نوبت. تنظیم جلسه: commentsEnabled و commentVisibility (public | reciter_only). مدیریت: نویسنده حذف؛ کادر با
 * comment.moderate پنهان/حذف. realtime فقط به سوکت‌های مجاز.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly access: MembersAccess,
    private readonly occurrences: OccurrencesService,
    private readonly live: LiveService,
    private readonly limiter: RateLimitService
  ) {}

  private async raw(q: Q, sessionId: string, commentId: string, includeDeleted = false): Promise<Raw & { deleted_at?: Date | null }> {
    if (!isUuid(commentId)) throw notFound();
    const r = (await q.query(`${SELECT.replace('c.created_at,', 'c.created_at, c.deleted_at,')} WHERE c.id = ? AND c.session_id = ?${includeDeleted ? '' : ' AND c.deleted_at IS NULL'}`, [uuidToBuf(commentId), uuidToBuf(sessionId)])) as (Raw & { deleted_at: Date | null })[];
    if (!r[0]) throw notFound();
    return r[0];
  }

  /** فیلتر SQL دیدن برای غیرکادر (همان canSeeComment) */
  private visibilityWhere(a: Pick<Access, 'role' | 'session'>, userId: string): { sql: string; args: unknown[] } {
    if (isStaff(a.role)) return { sql: '1 = 1', args: [] };
    if (a.session.comment_visibility !== 'reciter_only') return { sql: 'c.hidden = 0', args: [] };
    const u = uuidToBuf(userId);
    return { sql: `c.hidden = 0 AND ((c.queue_item_id IS NULL AND ${a.role === 'member' ? '1 = 1' : '1 = 0'}) OR (c.queue_item_id IS NOT NULL AND (c.author_id = ? OR c.reciter_id = ?)))`, args: [u, u] };
  }

  private filters(q: { queueItemId?: string; scope: 'all' | 'general' | 'recitation' }): { sql: string[]; args: unknown[] } {
    const sql: string[] = [];
    const args: unknown[] = [];
    if (q.queueItemId) {
      if (!isUuid(q.queueItemId)) sql.push('1 = 0');
      else {
        sql.push('c.queue_item_id = ?');
        args.push(uuidToBuf(q.queueItemId));
      }
    }
    if (q.scope === 'general') sql.push('c.queue_item_id IS NULL');
    if (q.scope === 'recitation') sql.push('c.queue_item_id IS NOT NULL');
    return { sql, args };
  }

  private async page(where: string[], args: unknown[], page: number, pageSize: number, viewerId: string | null) {
    const w = ['c.deleted_at IS NULL', ...where].join(' AND ');
    const [rows, cnt] = await Promise.all([
      this.ds.query(`${SELECT} WHERE ${w} ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`, [...args, pageSize, (page - 1) * pageSize]) as Promise<Raw[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM comments c WHERE ${w}`, args) as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map((r) => dto(r, viewerId)), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  /** M-80: هر بینندهٔ جلسه (draft فقط کادر)؛ فیلتر دیدن سمت سرور؛ جدیدترین اول */
  async list(userId: string, sessionId: string, occurrenceId: string, q: CommentsQuery) {
    const a = await this.access.load(this.ds, sessionId, userId);
    await this.occurrences.byId(this.ds, sessionId, occurrenceId);
    const v = this.visibilityWhere(a, userId);
    const f = this.filters(q);
    return this.page(['c.occurrence_id = ?', v.sql, ...f.sql], [uuidToBuf(occurrenceId), ...v.args, ...f.args], q.page, q.pageSize, userId);
  }

  /**
   * M-81: عضو تأییدشده یا کادر (مجوز سیستمی comment.post در guard). commentsEnabled=false ⇒ COMMENTS_DISABLED؛
   * نوبت بسته ⇒ فقط کادر (OCCURRENCE_CLOSED)؛ queueItemId فقط وقتی current (NOT_RECITING)؛ at_sec = now − started_at.
   */
  async create(userId: string, sessionId: string, occurrenceId: string, b: { body: string; queueItemId?: string }) {
    const h = await this.limiter.hit('durable', `m81:u:${userId}`, COMMENTS_PER_MINUTE, 60);
    if (!h.allowed) throw new AppError('RATE_LIMITED', { details: { retryAfterSec: h.resetSec } });
    let id = '';
    let route: { visibility: CommentVisibility; recitation: boolean; reciter: string | null } = { visibility: 'public', recitation: false, reciter: null };
    await this.ds.transaction(async (m) => {
      const a = await this.access.load(m, sessionId, userId);
      if (!a.role) throw new AppError('AUTH_FORBIDDEN', { message: 'فقط اعضای تأییدشده و کادر جلسه می‌توانند کامنت بگذارند.' });
      if (!Number(a.session.comments_enabled)) throw conflict('COMMENTS_DISABLED', 'کامنت در این جلسه غیرفعال است.');
      const occ = await this.occurrences.byId(m, sessionId, occurrenceId, 'share');
      if (occ.status !== 'live' && !isStaff(a.role)) throw conflict('OCCURRENCE_CLOSED', 'این نوبت برگزاری بسته شده است.');
      const now = this.clock.now();
      let reciter: Buffer | null = null;
      let atSec: number | null = null;
      let item: Buffer | null = null;
      if (b.queueItemId) {
        if (!isUuid(b.queueItemId)) throw new AppError('NOT_FOUND', { message: 'این نوبت صف پیدا نشد.' });
        const qi = (await m.query('SELECT id, user_id, status, started_at FROM queue_items WHERE id = ? AND occurrence_id = ? LOCK IN SHARE MODE', [uuidToBuf(b.queueItemId), uuidToBuf(occurrenceId)])) as { id: Buffer; user_id: Buffer; status: string; started_at: Date | null }[];
        if (!qi[0]) throw new AppError('NOT_FOUND', { message: 'این نوبت صف پیدا نشد.' });
        if (qi[0].status !== 'current') throw conflict('NOT_RECITING', 'این قرآن‌آموز هم‌اکنون در حال تلاوت نیست.');
        item = qi[0].id;
        reciter = qi[0].user_id;
        atSec = qi[0].started_at ? Math.max(0, Math.floor((now.getTime() - qi[0].started_at.getTime()) / 1000)) : null;
      }
      id = uuidv7(now.getTime());
      await m.query('INSERT INTO comments (id, session_id, occurrence_id, queue_item_id, reciter_id, author_id, body, at_sec, hidden, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)', [
        uuidToBuf(id),
        uuidToBuf(sessionId),
        uuidToBuf(occurrenceId),
        item,
        reciter,
        uuidToBuf(userId),
        b.body,
        atSec,
        now
      ]);
      route = { visibility: a.session.comment_visibility, recitation: item !== null, reciter: reciter ? bufToUuid(reciter) : null };
    });
    await this.signal(sessionId, 'comment.created', { commentId: id, occurrenceId, queueItemId: b.queueItemId ?? null }, route, userId);
    return dto(await this.raw(this.ds, sessionId, id), userId);
  }

  /**
   * سیگنال realtime فقط به مجازها: public یا کامنت عمومی نوبت ⇒ اتاق جلسه (فقط اعضا/کادر در آن‌اند)؛
   * reciter_only + تلاوت ⇒ اتاق شخصی `u:{id}` نویسنده، خواننده و کادر.
   */
  private async signal(sessionId: string, type: 'comment.created' | 'comment.updated', payload: Record<string, unknown>, r: { visibility: CommentVisibility; recitation: boolean; reciter: string | null }, authorId: string) {
    if (r.visibility === 'public' || !r.recitation) return this.live.emit(sessionId, type, payload);
    const staff = await this.access.staffUserIds(sessionId);
    this.live.emitToUsers(sessionId, [...new Set([authorId, ...(r.reciter ? [r.reciter] : []), ...staff])], type, payload);
  }

  private async routeOf(sessionId: string, c: Raw) {
    const s = await this.access.session(this.ds, sessionId, false, true);
    return { visibility: (s?.comment_visibility ?? 'public') as CommentVisibility, recitation: c.queue_item_id !== null, reciter: c.reciter_id ? bufToUuid(c.reciter_id) : null };
  }

  /** M-82: نویسنده یا کادر با comment.moderate؛ حذف نرم؛ idempotent */
  async remove(userId: string, sessionId: string, commentId: string): Promise<Record<string, never>> {
    const a = await this.access.load(this.ds, sessionId, userId);
    const c = await this.raw(this.ds, sessionId, commentId, true);
    const mine = bufToUuid(c.author_id) === userId;
    if (!mine && !a.permissions.includes('comment.moderate')) {
      // کامنتی که کاربر نمی‌بیند وجودش هم نشت نکند
      const visible = canSeeComment({ hidden: !!Number(c.hidden), queueItemId: c.queue_item_id ? 'x' : null, authorId: bufToUuid(c.author_id), reciterId: c.reciter_id ? bufToUuid(c.reciter_id) : null }, { userId, role: a.role }, a.session.comment_visibility);
      if (!visible || c.deleted_at) throw notFound();
      throw new AppError('AUTH_FORBIDDEN');
    }
    if (c.deleted_at) return {};
    await this.ds.query('UPDATE comments SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL', [this.clock.now(), uuidToBuf(userId), c.id]);
    await this.signal(sessionId, 'comment.updated', { commentId, occurrenceId: bufToUuid(c.occurrence_id), deleted: true }, await this.routeOf(sessionId, c), bufToUuid(c.author_id));
    return {};
  }

  private async moderateIn(sessionId: string, commentId: string, hidden: boolean, actorId: string, viewerId: string | null) {
    const c = await this.raw(this.ds, sessionId, commentId);
    await this.ds.query('UPDATE comments SET hidden = ?, hidden_by = ? WHERE id = ?', [hidden ? 1 : 0, hidden ? uuidToBuf(actorId) : null, c.id]);
    await this.signal(sessionId, 'comment.updated', { commentId, occurrenceId: bufToUuid(c.occurrence_id), hidden }, await this.routeOf(sessionId, c), bufToUuid(c.author_id));
    return dto(await this.raw(this.ds, sessionId, commentId), viewerId);
  }

  /** M-83 (comment.moderate) */
  async moderate(userId: string, sessionId: string, commentId: string, hidden: boolean) {
    await this.access.load(this.ds, sessionId, userId, 'comment.moderate');
    return this.moderateIn(sessionId, commentId, hidden, userId, userId);
  }

  // ───── ادمین (MID_ADMIN؛ شامل پنهان‌ها؛ mine=false) ─────
  async adminList(sessionId: string, q: CommentsQuery & { occurrenceId?: string; authorId?: string; hidden?: 'true' | 'false' }) {
    if (!(await this.access.session(this.ds, sessionId, false, true))) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    const where = ['c.session_id = ?'];
    const args: unknown[] = [uuidToBuf(sessionId)];
    if (q.occurrenceId) {
      where.push('c.occurrence_id = ?');
      args.push(isUuid(q.occurrenceId) ? uuidToBuf(q.occurrenceId) : Buffer.alloc(16));
    }
    if (q.authorId) {
      where.push('c.author_id = ?');
      args.push(isUuid(q.authorId) ? uuidToBuf(q.authorId) : Buffer.alloc(16));
    }
    if (q.hidden) where.push(q.hidden === 'true' ? 'c.hidden = 1' : 'c.hidden = 0');
    const f = this.filters(q);
    return this.page([...where, ...f.sql], [...args, ...f.args], q.page, q.pageSize, null);
  }

  async adminModerate(sessionId: string, commentId: string, hidden: boolean, actorId: string) {
    if (!(await this.access.session(this.ds, sessionId))) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    return this.moderateIn(sessionId, commentId, hidden, actorId, null);
  }

  async adminRemove(sessionId: string, commentId: string, actorId: string): Promise<Record<string, never>> {
    if (!(await this.access.session(this.ds, sessionId))) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    const c = await this.raw(this.ds, sessionId, commentId, true);
    if (c.deleted_at) return {};
    await this.ds.query('UPDATE comments SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL', [this.clock.now(), uuidToBuf(actorId), c.id]);
    await this.signal(sessionId, 'comment.updated', { commentId, occurrenceId: bufToUuid(c.occurrence_id), deleted: true }, await this.routeOf(sessionId, c), bufToUuid(c.author_id));
    return {};
  }
}
