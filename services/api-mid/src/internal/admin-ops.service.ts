import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { internal } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { MembersAccess, type SessionRow } from '../domain/access.service';
import { AttendanceService } from '../domain/attendance.service';
import { BadgesService } from '../domain/badges.service';
import { conflict, withRetry, type Q } from '../domain/db';
import { EvaluationsService, type ListQuery as EvalListQuery } from '../domain/evaluations.service';
import { OccurrencesService } from '../domain/occurrences.service';
import { PointsService } from '../domain/points.service';
import { type QueueAction, QueueService } from '../domain/queue.service';

type Mark = z.infer<typeof internal.MidAdminMarkAttendance>;
type Revoke = z.infer<typeof internal.MidAdminRevokeAttendance>;
type Patch = z.infer<typeof internal.MidAdminEvaluationPatch>;

const notFound = () => new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });

/**
 * عملیات ادمین روی نوبت/حضور/صف/ارزیابی/امتیاز (MID_ADMIN ۱.۶.۰؛ docs-v2/30). فقط api-high؛ مجوزسنجی و audit در high.
 * خواندن‌ها جلسهٔ حذف‌شده را هم می‌بینند؛ نوشتن روی جلسهٔ حذف‌شده ⇒ NOT_FOUND. ادمین حضور را روی نوبت بسته هم ثبت/لغو می‌کند.
 */
@Injectable()
export class AdminOpsService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: MembersAccess,
    private readonly occurrences: OccurrencesService,
    private readonly attendance: AttendanceService,
    private readonly queue: QueueService,
    private readonly evals: EvaluationsService,
    private readonly points: PointsService,
    private readonly badges: BadgesService
  ) {}

  /** وجود جلسه (حتی حذف‌شده) برای خواندن */
  private async exists(id: string): Promise<string> {
    if (!isUuid(id)) throw notFound();
    const r = (await this.ds.query('SELECT 1 AS x FROM sessions WHERE id = ?', [uuidToBuf(id)])) as unknown[];
    if (!r.length) throw notFound();
    return id;
  }

  /** جلسهٔ موجود و حذف‌نشده برای نوشتن (قفل ردیف) */
  private async writable(m: Q, id: string): Promise<SessionRow> {
    const s = await this.access.session(m, id, true);
    if (!s) throw notFound();
    return s;
  }

  // ───── خواندن ─────
  async occurrencesOf(id: string, page: number, pageSize: number) {
    return this.occurrences.adminList(await this.exists(id), page, pageSize);
  }
  async attendanceOf(id: string, q: { occurrenceId?: string; page: number; pageSize: number }) {
    return this.attendance.adminList(await this.exists(id), q);
  }
  async queueOf(id: string, occurrenceId?: string) {
    return this.queue.adminView(await this.exists(id), occurrenceId);
  }
  async evaluationsOf(id: string, q: EvalListQuery) {
    return this.evals.adminList(await this.exists(id), q);
  }

  // ───── حضور ─────
  /** occurrenceId داده‌شده (باز یا بسته) یا نوبت باز (وگرنه OCCURRENCE_CLOSED)؛ فقط اعضای تأییدشده */
  async attendanceMark(id: string, b: Mark) {
    const cat = await this.points.catalog();
    return withRetry(() =>
      this.ds.transaction(async (m) => {
        await this.writable(m, id);
        const occ = b.occurrenceId ? await this.occurrences.byId(m, id, b.occurrenceId, 'share') : await this.occurrences.requireLive(m, id);
        const r = await this.attendance.markIn(m, id, occ, b.userIds, 'admin', b.actorId, cat, { requireMember: true, note: b.reason });
        return { occurrenceId: occ.id, items: r.items.map((x) => ({ userId: x.userId, outcome: x.outcome, pointsAwarded: x.pointsAwarded })) };
      })
    );
  }

  /** پیش‌فرض: نوبت باز یا آخرین؛ idempotent */
  async attendanceRevoke(id: string, userId: string, b: Revoke) {
    if (!isUuid(userId)) throw new AppError('NOT_FOUND');
    const cat = await this.points.catalog();
    return withRetry(() =>
      this.ds.transaction(async (m) => {
        await this.writable(m, id);
        const occ = await this.occurrences.resolve(m, id, b.occurrenceId, 'share');
        if (!occ) throw new AppError('NOT_FOUND', { message: 'نوبت برگزاری پیدا نشد.' });
        return this.attendance.revokeIn(m, id, occ, userId, b.actorId, b.reason, cat);
      })
    );
  }

  // ───── صف ─────
  async queueNext(id: string, expectCurrentItemId: string | null | undefined) {
    const occ = await withRetry(() => this.ds.transaction(async (m) => this.queue.nextIn(m, await this.writable(m, id), expectCurrentItemId)));
    return this.queue.adminView(id, occ.id);
  }

  async queueItem(id: string, itemId: string, action: QueueAction, expectPosition?: number) {
    const occ = await withRetry(() => this.ds.transaction(async (m) => this.queue.actIn(m, await this.writable(m, id), itemId, action, expectPosition)));
    return this.queue.adminView(id, occ.id);
  }

  // ───── ارزیابی ─────
  evaluationPatch(id: string, evalId: string, b: Patch) {
    if (!isUuid(id)) throw notFound();
    if (b.voice === undefined && b.tone === undefined && b.tajweed === undefined && b.note === undefined) throw new AppError('VALIDATION_FAILED', { message: 'دست‌کم یک فیلد ارزیابی لازم است.' });
    return this.evals.adminPatch(id, evalId, b);
  }

  evaluationVoid(id: string, evalId: string, actorId: string, reason: string) {
    if (!isUuid(id)) throw notFound();
    return this.evals.adminVoid(id, evalId, actorId, reason);
  }

  // ───── امتیاز/نشان ─────
  async userPoints(userId: string, page: number, pageSize: number) {
    if (!isUuid(userId)) throw new AppError('NOT_FOUND', { message: 'کاربر پیدا نشد.' });
    const [summary, ledger] = await Promise.all([this.points.summary(userId), this.points.ledger(userId, page, pageSize)]);
    return { summary, ledger };
  }

  /** اصلاح دستی (admin_adjust): کسر تا کف ۰؛ نشان‌ها اعطا/پس گرفته می‌شوند */
  async pointsAdjust(userId: string, actorId: string, delta: number, reason: string) {
    if (!isUuid(userId)) throw new AppError('NOT_FOUND', { message: 'کاربر پیدا نشد.' });
    const cat = await this.points.catalog();
    const ledgerId = await withRetry(() =>
      this.ds.transaction(async (m) => {
        const r = await this.points.apply(m, [{ userId, points: delta, reason: 'admin_adjust', refId: uuidv7(), note: reason, actorId }], cat);
        const lid = r.ledgerIds[0];
        if (!lid) throw conflict('VERSION_MISMATCH', 'ثبت اصلاح امتیاز ناموفق بود؛ دوباره تلاش کنید.');
        return lid;
      })
    );
    const [summary, entry] = await Promise.all([this.points.summary(userId), this.points.ledgerItem(this.ds, ledgerId)]);
    return { summary, entry };
  }

  badgeHolders() {
    return this.badges.holders();
  }
}
