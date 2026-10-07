import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { mid } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { LiveService } from '../live/live.service';
import { MembersAccess } from './access.service';
import type { Catalog } from './badges.service';
import { NAME_SQL, conflict, displayName, nameSql, parseJson, withRetry, type Q } from './db';
import { OccurrencesService } from './occurrences.service';
import { emitInbox } from './outbox.writer';
import { PointsService } from './points.service';
import { PostCommit } from './post-commit';
import { SettingsService } from './settings.service';
import { type Weights, computeScore, evalPoints } from './rules';

type Body = z.infer<typeof mid.EvaluationBody>;
export interface EvalPatch {
  voice?: number;
  tone?: number;
  tajweed?: number;
  note?: string;
}

interface Row {
  id: Buffer;
  session_id: Buffer;
  occurrence_id: Buffer;
  queue_item_id: Buffer;
  user_id: Buffer;
  evaluator_id: Buffer;
  voice: number;
  tone: number;
  tajweed: number;
  weights: unknown;
  score: number;
  points: number;
  note: string;
  status: 'active' | 'void';
  created_at: Date;
  updated_at: Date | null;
  user_name: string;
  evaluator_name: string;
}

const EDIT_WINDOW_MS = 24 * 3_600_000;

const SELECT = `SELECT e.id, e.session_id, e.occurrence_id, e.queue_item_id, e.user_id, e.evaluator_id, e.voice, e.tone, e.tajweed, e.weights, e.score, e.points, e.note, e.status, e.created_at, e.updated_at,
                       ${nameSql('u')} AS user_name,
                       ${nameSql('v')} AS evaluator_name
                  FROM evaluations e LEFT JOIN user_directory u ON u.user_id = e.user_id LEFT JOIN user_directory v ON v.user_id = e.evaluator_id`;

const dto = (r: Row) => ({
  id: bufToUuid(r.id),
  sessionId: bufToUuid(r.session_id),
  queueItemId: bufToUuid(r.queue_item_id),
  userId: bufToUuid(r.user_id),
  userName: r.user_name || displayName(),
  evaluatorName: r.evaluator_name || displayName(),
  voice: r.voice,
  tone: r.tone,
  tajweed: r.tajweed,
  weights: parseJson<Weights>(r.weights),
  score: r.score,
  points: r.points,
  note: r.note,
  createdAt: r.created_at.toISOString(),
  occurrenceId: bufToUuid(r.occurrence_id),
  status: r.status,
  updatedAt: r.updated_at ? r.updated_at.toISOString() : null
});

export interface ListQuery {
  occurrenceId?: string;
  includeVoid: 'true' | 'false';
  page: number;
  pageSize: number;
}

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly access: MembersAccess,
    private readonly settings: SettingsService,
    private readonly points: PointsService,
    private readonly occurrences: OccurrencesService,
    private readonly live: LiveService,
    private readonly post: PostCommit
  ) {}

  private async one(q: Q, id: string) {
    const rows = (await q.query(`${SELECT} WHERE e.id = ?`, [uuidToBuf(id)])) as Row[];
    return dto(rows[0]!);
  }

  /**
   * ثبت ارزیابی: فقط `eval.submit` (قفل #15). روی آیتم صفِ نوبت live؛ ارزیابی‌شونده هنوز عضو تأییدشده.
   * یک ارزیابی per آیتم صف (UNIQUE queue_item_id)؛ وزن‌های لحظهٔ ثبت ذخیره می‌شود.
   */
  async submit(userId: string, sessionId: string, b: Body) {
    const [{ weights }, cat] = await Promise.all([this.settings.get(), this.points.catalog()]);
    let evalId = '';
    await withRetry(() =>
      this.ds.transaction(async (m) => {
        const { session } = await this.access.load(m, sessionId, userId, 'eval.submit');
        const items = (await m.query('SELECT user_id, status, occurrence_id FROM queue_items WHERE id = ? AND session_id = ? FOR UPDATE', [uuidToBuf(b.queueItemId), uuidToBuf(sessionId)])) as { user_id: Buffer; status: string; occurrence_id: Buffer }[];
        const item = items[0];
        if (!item) throw new AppError('NOT_FOUND', { message: 'این نوبت پیدا نشد.' });
        const student = bufToUuid(item.user_id);
        if (student === userId) throw conflict('SELF_EVALUATION', 'ارزیابی خود امکان‌پذیر نیست.');
        if (item.status === 'waiting') throw conflict('QUEUE_ITEM_STATE', 'نوبت هنوز نرسیده است.');
        const occ = await this.occurrences.byId(m, sessionId, bufToUuid(item.occurrence_id), 'share');
        if (occ.status !== 'live') throw conflict('OCCURRENCE_CLOSED', 'نوبت برگزاری بسته است.');
        if ((await this.access.membership(m, sessionId, student))?.status !== 'approved') throw conflict('NOT_APPROVED', 'ارزیابی‌شونده دیگر عضو تأییدشدهٔ جلسه نیست.');
        const now = this.clock.now();
        const score = computeScore(b, weights);
        const pts = evalPoints(score);
        evalId = uuidv7(now.getTime());
        const r = (await m.query('INSERT IGNORE INTO evaluations (id, session_id, occurrence_id, queue_item_id, user_id, evaluator_id, voice, tone, tajweed, weights, score, points, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          uuidToBuf(evalId),
          uuidToBuf(sessionId),
          item.occurrence_id,
          uuidToBuf(b.queueItemId),
          item.user_id,
          uuidToBuf(userId),
          b.voice,
          b.tone,
          b.tajweed,
          JSON.stringify(weights),
          score,
          pts,
          b.note ?? '',
          now
        ])) as { affectedRows?: number };
        if (!r.affectedRows) throw conflict('ALREADY_EVALUATED', 'برای این نوبت قبلاً ارزیابی ثبت شده است.');
        await this.points.apply(m, [{ userId: student, points: pts, reason: 'evaluation', refId: evalId, sessionId, actorId: userId }], cat);
        await emitInbox(m, now, student, 'evaluation', 'ارزیابی شما ثبت شد', `نتیجهٔ ارزیابی شما در «${session.title}»: ${score} از ۱۰۰`, `session:${sessionId}`);
      })
    );
    this.live.emit(sessionId, 'eval.updated');
    return this.one(this.ds, evalId);
  }

  private async page(sessionId: string, q: ListQuery, onlyUser: string | null, allowVoid: boolean) {
    const where = ['e.session_id = ?'];
    const args: unknown[] = [uuidToBuf(sessionId)];
    if (q.occurrenceId) {
      await this.occurrences.byId(this.ds, sessionId, q.occurrenceId);
      where.push('e.occurrence_id = ?');
      args.push(uuidToBuf(q.occurrenceId));
    }
    if (onlyUser) {
      where.push('e.user_id = ?');
      args.push(uuidToBuf(onlyUser));
    }
    if (!(allowVoid && q.includeVoid === 'true')) where.push("e.status = 'active'");
    const w = where.join(' AND ');
    const [rows, cnt] = await Promise.all([
      this.ds.query(`${SELECT} WHERE ${w} ORDER BY e.created_at DESC, e.id DESC LIMIT ? OFFSET ?`, [...args, q.pageSize, (q.page - 1) * q.pageSize]) as Promise<Row[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM evaluations e WHERE ${w}`, args) as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map(dto), page: q.page, pageSize: q.pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  /** M-41: کادر (eval.submit/queue.manage) همه؛ سایرین فقط خودشان؛ باطل‌شده فقط کادر با includeVoid */
  async list(userId: string, sessionId: string, q: ListQuery) {
    const { membership, permissions } = await this.access.load(this.ds, sessionId, userId);
    if (membership?.status !== 'approved') throw new AppError('AUTH_FORBIDDEN');
    const staff = permissions.includes('eval.submit') || permissions.includes('queue.manage');
    return this.page(sessionId, q, staff ? null : userId, staff);
  }

  /** MID_ADMIN.evaluations (فراخوان وجود جلسه را بررسی کرده است) */
  async adminList(sessionId: string, q: ListQuery) {
    const r = await this.page(sessionId, q, null, true);
    return { items: r.items, total: r.total };
  }

  private async lockEval(m: Q, sessionId: string, evalId: string): Promise<Row> {
    // قفل فقط روی ردیف ارزیابی (نه ردیف‌های join‌شدهٔ دایرکتوری)
    const locked = isUuid(evalId) ? ((await m.query('SELECT id FROM evaluations WHERE id = ? AND session_id = ? FOR UPDATE', [uuidToBuf(evalId), uuidToBuf(sessionId)])) as unknown[]) : [];
    const rows = locked.length ? ((await m.query(`${SELECT} WHERE e.id = ?`, [uuidToBuf(evalId)])) as Row[]) : [];
    if (!rows[0]) throw new AppError('NOT_FOUND', { message: 'ارزیابی پیدا نشد.' });
    return rows[0];
  }

  /** ویرایش داخل تراکنش: بازمحاسبه با وزن‌های ذخیره‌شده؛ تفاضل امتیاز ⇒ evaluation_adjust */
  async patchIn(m: Q, sessionId: string, title: string, r: Row, p: EvalPatch, actorId: string, note: string | null, cat: Catalog): Promise<void> {
    if (r.status === 'void') throw conflict('EVALUATION_VOIDED', 'این ارزیابی باطل شده است.');
    const next = { voice: p.voice ?? r.voice, tone: p.tone ?? r.tone, tajweed: p.tajweed ?? r.tajweed };
    const score = computeScore(next, parseJson<Weights>(r.weights));
    const pts = evalPoints(score);
    const now = this.clock.now();
    await m.query('UPDATE evaluations SET voice = ?, tone = ?, tajweed = ?, note = ?, score = ?, points = ?, updated_at = ? WHERE id = ?', [next.voice, next.tone, next.tajweed, p.note ?? r.note, score, pts, now, r.id]);
    const diff = pts - r.points;
    if (diff !== 0) await this.points.apply(m, [{ userId: bufToUuid(r.user_id), points: diff, reason: 'evaluation_adjust', refId: uuidv7(now.getTime()), sessionId, note, actorId }], cat);
    if (score !== r.score) await emitInbox(m, now, bufToUuid(r.user_id), 'evaluation', 'ارزیابی شما ویرایش شد', `نتیجهٔ ارزیابی شما در «${title}»: ${score} از ۱۰۰`, `session:${sessionId}`);
    this.post.after(m, () => this.live.emit(sessionId, 'eval.updated'));
  }

  /** باطل‌کردن داخل تراکنش (idempotent): evaluation_void با منفیِ امتیاز فعلی (ref = شناسهٔ ارزیابی) */
  async voidIn(m: Q, sessionId: string, title: string, r: Row, actorId: string, reason: string, cat: Catalog): Promise<void> {
    if (r.status === 'void') return;
    const now = this.clock.now();
    await m.query("UPDATE evaluations SET status = 'void', voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ? WHERE id = ?", [now, uuidToBuf(actorId), reason.slice(0, 300), now, r.id]);
    await this.points.apply(m, [{ userId: bufToUuid(r.user_id), points: -r.points, reason: 'evaluation_void', refId: bufToUuid(r.id), sessionId, note: reason, actorId }], cat);
    await emitInbox(m, now, bufToUuid(r.user_id), 'evaluation', 'ارزیابی شما باطل شد', `یکی از ارزیابی‌های شما در «${title}» باطل شد.`, `session:${sessionId}`);
    this.post.after(m, () => this.live.emit(sessionId, 'eval.updated'));
  }

  /** M-43: فقط ارزیاب اصلی و تا ۲۴ ساعت */
  async patch(userId: string, sessionId: string, evalId: string, p: EvalPatch) {
    const cat = await this.points.catalog();
    await withRetry(() =>
      this.ds.transaction(async (m) => {
        const { session } = await this.access.load(m, sessionId, userId, 'eval.submit');
        const r = await this.lockEval(m, sessionId, evalId);
        if (bufToUuid(r.evaluator_id) !== userId) throw new AppError('AUTH_FORBIDDEN', { message: 'فقط ارزیاب همین ارزیابی می‌تواند آن را ویرایش کند.' });
        if (r.status !== 'void' && this.clock.now().getTime() - r.created_at.getTime() > EDIT_WINDOW_MS) throw new AppError('AUTH_FORBIDDEN', { message: 'مهلت ۲۴ ساعتهٔ ویرایش گذشته است.' });
        await this.patchIn(m, sessionId, session.title, r, p, userId, null, cat);
      })
    );
    return this.one(this.ds, evalId);
  }

  /** M-44: ارزیاب اصلی یا مدیر جلسه */
  async void(userId: string, sessionId: string, evalId: string, reason: string) {
    const cat = await this.points.catalog();
    await withRetry(() =>
      this.ds.transaction(async (m) => {
        const { session, membership, permissions } = await this.access.load(m, sessionId, userId);
        const isManager = !!membership?.roles.includes('session_manager') && membership.status === 'approved';
        if (!isManager && !permissions.includes('eval.submit')) throw new AppError('AUTH_FORBIDDEN');
        const r = await this.lockEval(m, sessionId, evalId);
        if (!isManager && bufToUuid(r.evaluator_id) !== userId) throw new AppError('AUTH_FORBIDDEN', { message: 'فقط ارزیاب همین ارزیابی یا مدیر جلسه می‌تواند آن را باطل کند.' });
        await this.voidIn(m, sessionId, session.title, r, userId, reason, cat);
      })
    );
    return this.one(this.ds, evalId);
  }

  /** MID_ADMIN: ویرایش/باطل هر زمان (بدون محدودیت ارزیاب/۲۴ ساعت)؛ جلسهٔ حذف‌شده ⇒ NOT_FOUND */
  async adminPatch(sessionId: string, evalId: string, p: EvalPatch & { actorId: string; reason: string }) {
    const cat = await this.points.catalog();
    await withRetry(() =>
      this.ds.transaction(async (m) => {
        const session = await this.access.session(m, sessionId);
        if (!session) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
        await this.patchIn(m, sessionId, session.title, await this.lockEval(m, sessionId, evalId), p, p.actorId, p.reason, cat);
      })
    );
    return this.one(this.ds, evalId);
  }

  async adminVoid(sessionId: string, evalId: string, actorId: string, reason: string) {
    const cat = await this.points.catalog();
    await withRetry(() =>
      this.ds.transaction(async (m) => {
        const session = await this.access.session(m, sessionId);
        if (!session) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
        await this.voidIn(m, sessionId, session.title, await this.lockEval(m, sessionId, evalId), actorId, reason, cat);
      })
    );
    return this.one(this.ds, evalId);
  }
}

export { isUuid, NAME_SQL };
