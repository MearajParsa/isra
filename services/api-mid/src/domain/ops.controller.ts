import { Controller, Req } from '@nestjs/common';
import type { z } from 'zod';
import type { mid } from '@isra/api-types';
import { In, Route } from '../common/ep';
import type { IsraRequest } from '../common/request-context';
import { AttendanceService } from './attendance.service';
import { EvaluationsService } from './evaluations.service';
import { OccurrencesService } from './occurrences.service';
import { PointsService } from './points.service';
import { QueueService } from './queue.service';

type Page = { page: number; pageSize: number };
type Id = { params: { id: string } };
const uid = (r: IsraRequest) => r.user!.userId;

/**
 * ۱.۶.۰ (docs-v2/30 §۱.۱–۱.۲): نوبت برگزاری، حضور و غیاب، ثبت/لغو حضور توسط کادر، صف توسط کادر،
 * ویرایش/باطل ارزیابی و دفتر امتیاز. مسیر/اعتبارسنجی از قرارداد (`@Route`).
 */
@Controller()
export class OpsController {
  constructor(
    private readonly occurrences: OccurrencesService,
    private readonly attendance: AttendanceService,
    private readonly queue: QueueService,
    private readonly evals: EvaluationsService,
    private readonly points: PointsService
  ) {}

  @Route('M-08')
  occurrencesList(@Req() r: IsraRequest, @In() { params, query }: Id & { query: Page }) {
    return this.occurrences.list(uid(r), params.id, query.page, query.pageSize);
  }

  @Route('M-09')
  openOccurrence(@Req() r: IsraRequest, @In() { params }: Id) {
    return this.occurrences.open(uid(r), params.id);
  }

  @Route('M-19')
  closeOccurrence(@Req() r: IsraRequest, @In() { params }: { params: { id: string; occurrenceId: string } }) {
    return this.occurrences.close(uid(r), params.id, params.occurrenceId);
  }

  @Route('M-18')
  roster(@Req() r: IsraRequest, @In() { params, query }: Id & { query: z.infer<typeof mid.RosterQuery> }) {
    return this.attendance.roster(uid(r), params.id, query);
  }

  @Route('M-22')
  markAttendance(@Req() r: IsraRequest, @In() { params, body }: Id & { body: z.infer<typeof mid.MarkAttendanceBody> }) {
    return this.attendance.mark(uid(r), params.id, body.userIds);
  }

  @Route('M-23')
  revokeAttendance(@Req() r: IsraRequest, @In() { params, body }: { params: { id: string; userId: string }; body: z.infer<typeof mid.RevokeAttendanceBody> }) {
    return this.attendance.revoke(uid(r), params.id, params.userId, body.occurrenceId, body.reason);
  }

  @Route('M-35')
  enqueue(@Req() r: IsraRequest, @In() { params, body }: Id & { body: z.infer<typeof mid.EnqueueBody> }) {
    return this.queue.enqueue(uid(r), params.id, body.userId, body.markPresent);
  }

  @Route('M-43')
  patchEval(@Req() r: IsraRequest, @In() { params, body }: { params: { id: string; evalId: string }; body: z.infer<typeof mid.EvaluationPatchBody> }) {
    return this.evals.patch(uid(r), params.id, params.evalId, body);
  }

  @Route('M-44')
  voidEval(@Req() r: IsraRequest, @In() { params, body }: { params: { id: string; evalId: string }; body: z.infer<typeof mid.VoidEvaluationBody> }) {
    return this.evals.void(uid(r), params.id, params.evalId, body.reason);
  }

  @Route('M-46')
  myLedger(@Req() r: IsraRequest, @In() { query }: { query: Page }) {
    return this.points.ledger(uid(r), query.page, query.pageSize);
  }
}
