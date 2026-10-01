import { Controller, Req } from '@nestjs/common';
import type { z } from 'zod';
import { low } from '@isra/api-types';
import { In, Route } from '../common/ep';
import type { IsraRequest } from '../common/request-context';
import { MidClient } from '../mid/mid.client';
import { MeService } from './me.service';

type Page = { page: number; pageSize: number };
const uid = (r: IsraRequest) => r.user!.userId;

@Controller()
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly mid: MidClient
  ) {}

  @Route('L-10')
  getMe(@Req() r: IsraRequest) {
    return this.me.me(uid(r));
  }

  @Route('L-11')
  getProfile(@Req() r: IsraRequest) {
    return this.me.profile(uid(r));
  }

  @Route('L-12')
  patchProfile(@Req() r: IsraRequest, @In() { body }: { body: z.infer<typeof low.ProfilePatchBody> }) {
    return this.me.patchProfile(uid(r), body);
  }

  @Route('L-13')
  setPassword(@Req() r: IsraRequest, @In() { body }: { body: z.infer<typeof low.SetPasswordBody> }) {
    return this.me.setPassword(uid(r), r.user!.sessionId, body.newPassword);
  }

  @Route('L-14')
  sessions(@Req() r: IsraRequest, @In() { query }: { query: Page }) {
    return this.me.listSessions(uid(r), query.page, query.pageSize, r.user!.sessionId);
  }

  @Route('L-15')
  revoke(@Req() r: IsraRequest, @In() { params }: { params: { id: string } }) {
    return this.me.revokeSession(uid(r), params.id);
  }

  @Route('L-16')
  revokeOthers(@Req() r: IsraRequest) {
    return this.me.revokeOthers(uid(r), r.user!.sessionId);
  }

  @Route('L-17')
  inbox(@Req() r: IsraRequest, @In() { query }: { query: Page & { unreadOnly: boolean } }) {
    return this.me.inbox(uid(r), query.page, query.pageSize, query.unreadOnly);
  }

  @Route('L-18')
  unread(@Req() r: IsraRequest) {
    return this.me.unreadCount(uid(r));
  }

  @Route('L-19')
  read(@Req() r: IsraRequest, @In() { params }: { params: { id: string } }) {
    return this.me.markRead(uid(r), params.id);
  }

  @Route('L-20')
  readAll(@Req() r: IsraRequest) {
    return this.me.markAllRead(uid(r));
  }

  @Route('L-21')
  points(@Req() r: IsraRequest) {
    return this.mid.points(uid(r));
  }
}
