import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { mid } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { LiveService } from '../live/live.service';
import { MembersAccess } from './access.service';
import { NAME_SQL, conflict, displayName, parseJson, withRetry, type Q } from './db';
import { emitInbox } from './outbox.writer';
import { PointsService } from './points.service';
import { SettingsService } from './settings.service';
import { type Weights, computeScore, evalPoints } from './rules';

type Body = z.infer<typeof mid.EvaluationBody>;

interface Row {
  id: Buffer;
  session_id: Buffer;
  queue_item_id: Buffer;
  user_id: Buffer;
  voice: number;
  tone: number;
  tajweed: number;
  weights: unknown;
  score: number;
  points: number;
  note: string;
  created_at: Date;
  user_name: string;
  evaluator_name: string;
}

const SELECT = `SELECT e.id, e.session_id, e.queue_item_id, e.user_id, e.voice, e.tone, e.tajweed, e.weights, e.score, e.points, e.note, e.created_at,
                       TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS user_name,
                       TRIM(CONCAT(COALESCE(v.first_name,''), ' ', COALESCE(v.last_name,''))) AS evaluator_name
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
  createdAt: r.created_at.toISOString()
});

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly access: MembersAccess,
    private readonly settings: SettingsService,
    private readonly points: PointsService,
    private readonly live: LiveService
  ) {}

  private async one(q: Q, id: string) {
    const rows = (await q.query(`${SELECT} WHERE e.id = ?`, [uuidToBuf(id)])) as Row[];
    return dto(rows[0]!);
  }

  /**
   * ثبت ارزیابی: فقط `eval.submit` (teacher/supporter؛ manager به‌تنهایی نه — قفل #15، از اجتماع نقش‌ها محاسبه می‌شود).
   * یک ارزیابی per نوبت (UNIQUE queue_item_id)؛ وزن‌های لحظهٔ ثبت ذخیره می‌شود (تغییر بعدی high روی گذشته اثر ندارد).
   */
  async submit(userId: string, sessionId: string, b: Body) {
    const { weights, thresholds } = await this.settings.get();
    let evalId = '';
    let student = '';
    await withRetry(() => this.ds.transaction(async (m) => {
      const { session } = await this.access.load(m, sessionId, userId, 'eval.submit');
      const items = (await m.query('SELECT user_id, status FROM queue_items WHERE id = ? AND session_id = ? FOR UPDATE', [uuidToBuf(b.queueItemId), uuidToBuf(sessionId)])) as { user_id: Buffer; status: string }[];
      const item = items[0];
      if (!item) throw new AppError('NOT_FOUND', { message: 'این نوبت پیدا نشد.' });
      student = bufToUuid(item.user_id);
      if (student === userId) throw conflict('SELF_EVALUATION', 'ارزیابی خود امکان‌پذیر نیست.');
      if (item.status === 'waiting') throw conflict('QUEUE_ITEM_STATE', 'نوبت هنوز نرسیده است.');
      const now = this.clock.now();
      const score = computeScore(b, weights);
      const pts = evalPoints(score);
      evalId = uuidv7(now.getTime());
      const r = (await m.query('INSERT IGNORE INTO evaluations (id, session_id, queue_item_id, user_id, evaluator_id, voice, tone, tajweed, weights, score, points, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        uuidToBuf(evalId),
        uuidToBuf(sessionId),
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
      await this.points.award(m, student, pts, 'evaluation', evalId, thresholds);
      await emitInbox(m, now, student, 'evaluation', 'ارزیابی شما ثبت شد', `نتیجهٔ ارزیابی شما در «${session.title}»: ${score} از ۱۰۰`, `session:${sessionId}`);
    }));
    this.live.emit(sessionId, 'eval.updated');
    return this.one(this.ds, evalId);
  }

  /** کادر (eval.submit/queue.manage): همه؛ سایرین: فقط ارزیابی‌های خودم */
  async list(userId: string, sessionId: string, page: number, pageSize: number) {
    const { membership, permissions } = await this.access.load(this.ds, sessionId, userId);
    if (membership?.status !== 'approved') throw new AppError('AUTH_FORBIDDEN');
    const staff = permissions.includes('eval.submit') || permissions.includes('queue.manage');
    const where = staff ? 'e.session_id = ?' : 'e.session_id = ? AND e.user_id = ?';
    const args = staff ? [uuidToBuf(sessionId)] : [uuidToBuf(sessionId), uuidToBuf(userId)];
    const [rows, cnt] = await Promise.all([
      this.ds.query(`${SELECT} WHERE ${where} ORDER BY e.created_at DESC, e.id DESC LIMIT ? OFFSET ?`, [...args, pageSize, (page - 1) * pageSize]) as Promise<Row[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM evaluations e WHERE ${where}`, args) as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map(dto), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }
}

export { isUuid, NAME_SQL };
