import { Controller, Req } from '@nestjs/common';
import type { z } from 'zod';
import type { SessionInput, mid } from '@isra/api-types';
import { canCreateSession } from '../auth/jwt-verifier';
import { In, Route } from '../common/ep';
import type { IsraRequest } from '../common/request-context';
import { AttendanceService } from './attendance.service';
import { EvaluationsService } from './evaluations.service';
import { MembersService } from './members.service';
import { PointsService } from './points.service';
import { QueueService } from './queue.service';
import { SessionsService } from './sessions.service';

type Page = { page: number; pageSize: number };
type Id = { params: { id: string } };
const uid = (r: IsraRequest) => r.user!.userId;

@Controller()
export class MidController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly members: MembersService,
    private readonly attendance: AttendanceService,
    private readonly queue: QueueService,
    private readonly evals: EvaluationsService,
    private readonly points: PointsService
  ) {}

  @Route('M-00')
  caps(@Req() r: IsraRequest) {
    return this.sessions.caps(uid(r), canCreateSession(r.user!));
  }

  @Route('M-01')
  mine(@Req() r: IsraRequest, @In() { query }: { query: Page & { scope: 'all' | 'staff' } }) {
    return this.sessions.mySessions(uid(r), query.scope, query.page, query.pageSize);
  }

  @Route('M-02')
  sessionMe(@Req() r: IsraRequest, @In() { params }: Id) {
    return this.sessions.me(uid(r), params.id);
  }

  @Route('M-03')
  create(@Req() r: IsraRequest, @In() { body }: { body: z.infer<typeof SessionInput> }) {
    return this.sessions.create(uid(r), body);
  }

  @Route('M-04')
  edit(@Req() r: IsraRequest, @In() { params, body }: Id & { body: z.infer<typeof SessionInput> }) {
    return this.sessions.edit(uid(r), params.id, body);
  }

  @Route('M-05')
  transition(@Req() r: IsraRequest, @In() { params, body }: Id & { body: z.infer<typeof mid.TransitionBody> }) {
    return this.sessions.transition(uid(r), params.id, body.to);
  }

  @Route('M-10')
  requestMembership(@Req() r: IsraRequest, @In() { params }: Id) {
    return this.members.request(uid(r), params.id);
  }

  @Route('M-11')
  listMembers(@Req() r: IsraRequest, @In() { params, query }: Id & { query: Page & { status?: string } }) {
    return this.members.list(uid(r), params.id, query.status, query.page, query.pageSize);
  }

  @Route('M-12')
  decide(@Req() r: IsraRequest, @In() { params, body }: { params: { id: string; memberId: string }; body: z.infer<typeof mid.DecideBody> }) {
    return this.members.decide(uid(r), params.id, params.memberId, body.action);
  }

  @Route('M-13')
  setRoles(@Req() r: IsraRequest, @In() { params, body }: { params: { id: string; memberId: string }; body: z.infer<typeof mid.SetRolesBody> }) {
    return this.members.setRoles(uid(r), params.id, params.memberId, body.roles);
  }

  @Route('M-20')
  checkIn(@Req() r: IsraRequest, @In() { params }: Id) {
    return this.attendance.checkIn(uid(r), params.id);
  }

  @Route('M-21')
  attendanceList(@Req() r: IsraRequest, @In() { params, query }: Id & { query: Page & { occurrenceId?: string } }) {
    return this.attendance.list(uid(r), params.id, query);
  }

  @Route('M-30')
  joinQueue(@Req() r: IsraRequest, @In() { params }: Id) {
    return this.queue.join(uid(r), params.id);
  }

  @Route('M-31')
  leaveQueue(@Req() r: IsraRequest, @In() { params }: Id) {
    return this.queue.leave(uid(r), params.id);
  }

  @Route('M-32')
  queueState(@Req() r: IsraRequest, @In() { params, query }: Id & { query: { occurrenceId?: string } }) {
    return this.queue.view(uid(r), params.id, query.occurrenceId);
  }

  @Route('M-33')
  next(@Req() r: IsraRequest, @In() { params }: Id) {
    return this.queue.next(uid(r), params.id);
  }

  @Route('M-34')
  act(@Req() r: IsraRequest, @In() { params, body }: { params: { id: string; itemId: string }; body: z.infer<typeof mid.QueueActBody> }) {
    return this.queue.act(uid(r), params.id, params.itemId, body.action);
  }

  @Route('M-40')
  submitEval(@Req() r: IsraRequest, @In() { params, body }: Id & { body: z.infer<typeof mid.EvaluationBody> }) {
    return this.evals.submit(uid(r), params.id, body);
  }

  @Route('M-41')
  listEvals(@Req() r: IsraRequest, @In() { params, query }: Id & { query: z.infer<typeof mid.EvaluationsQuery> }) {
    return this.evals.list(uid(r), params.id, query);
  }

  @Route('M-42')
  myPoints(@Req() r: IsraRequest) {
    return this.points.summary(uid(r));
  }
}
