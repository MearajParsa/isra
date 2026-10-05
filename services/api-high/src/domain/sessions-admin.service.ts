import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { high, internal } from '@isra/api-types';
import { bufToUuid, isUuid, uuidToBuf } from '../common/ids';
import { type Paged, MidAdminClient } from '../internal/admin-clients';
import { AuditService } from './audit.service';

type Member = z.infer<typeof internal.MidAdminMember>;
type Session = z.infer<typeof internal.MidAdminSession>;
type SessionInput = z.infer<typeof internal.MidAdminPatchSession>;
const REAL_PHONE = /^09\d{9}$/;

/** مدیریت جلسه‌ها (H-60..H-72): واسطهٔ mid؛ high فقط عضو را با شمارهٔ دایرکتوری غنی و audit می‌نویسد. */
@Injectable()
export class SessionsAdminService {
  constructor(
    private readonly ds: DataSource,
    private readonly mid: MidAdminClient,
    private readonly audit: AuditService
  ) {}

  list(query: z.infer<typeof high.AdminSessionsQuery> & { page: number; pageSize: number }): Promise<Paged<Session>> {
    return this.mid.listSessions({ ...query });
  }

  get(id: string) {
    return this.mid.getSession(id);
  }

  private async log(actorId: string, action: string, s: { id: string; title: string }, summary: string, meta: Record<string, unknown> = {}) {
    await this.audit.write(this.ds, { actor: await this.audit.actorOf(actorId), action, target: { type: 'session', id: s.id, label: s.title }, summary: `${summary} «${s.title}»`, meta });
  }

  async create(actorId: string, body: z.infer<typeof high.AdminCreateSessionBody>) {
    const creatorId = body.creatorId ?? actorId;
    const s = await this.mid.createSession({ creatorId, session: body.session });
    await this.log(actorId, 'session.create', s, 'جلسه ساخته شد:', { creatorId });
    return s;
  }

  async update(actorId: string, id: string, body: SessionInput) {
    const s = await this.mid.patchSession(id, body);
    await this.log(actorId, 'session.update', s, 'جلسه ویرایش شد:');
    return s;
  }

  async transition(actorId: string, id: string, to: 'scheduled' | 'started' | 'ended') {
    const s = await this.mid.transition(id, { to });
    await this.log(actorId, 'session.transition', s, `وضعیت جلسه به «${to}» رفت:`, { to });
    return s;
  }

  async remove(actorId: string, id: string): Promise<void> {
    const s = await this.mid.getSession(id); // برچسب audit (و 404 برای جلسهٔ ناموجود)
    await this.mid.deleteSession(id);
    await this.log(actorId, 'session.delete', s, 'جلسه حذف شد:');
  }

  /** شمارهٔ واقعی اعضا از دایرکتوری (mid شماره ندارد)؛ کاربر حذف‌شده/ناشناس ⇒ null */
  private async withPhones(items: Member[]): Promise<Member[]> {
    const ids = [...new Set(items.map((m) => m.userId).filter(isUuid))];
    const phones = new Map<string, string>();
    if (ids.length) {
      const rows = (await this.ds.query(`SELECT user_id, phone FROM user_directory WHERE user_id IN (${ids.map(() => '?').join(',')})`, ids.map(uuidToBuf))) as { user_id: Buffer; phone: string }[];
      for (const r of rows) phones.set(bufToUuid(r.user_id), r.phone);
    }
    return items.map((m) => {
      const p = phones.get(m.userId);
      return { ...m, phone: p && REAL_PHONE.test(p) ? p : null };
    });
  }

  async members(id: string, query: { page: number; pageSize: number; status?: string }) {
    const r = await this.mid.listMembers(id, { ...query });
    return { ...r, items: await this.withPhones(r.items) };
  }

  private async one(m: Member): Promise<Member> {
    return (await this.withPhones([m]))[0]!;
  }

  async decide(actorId: string, id: string, memberId: string, action: 'approve' | 'reject') {
    const s = await this.mid.getSession(id);
    const m = await this.mid.decide(id, memberId, { action });
    await this.log(actorId, 'session.member_decide', s, action === 'approve' ? 'عضویت تأیید شد در' : 'عضویت رد شد در', { memberId, userId: m.userId, action });
    return this.one(m);
  }

  async setRoles(actorId: string, id: string, memberId: string, roles: z.infer<typeof internal.MidAdminSetRoles>['roles']) {
    const s = await this.mid.getSession(id);
    const m = await this.mid.setMemberRoles(id, memberId, { roles });
    await this.log(actorId, 'session.member_roles', s, 'نقش‌های عضو تغییر کرد در', { memberId, userId: m.userId, roles });
    return this.one(m);
  }

  async removeMember(actorId: string, id: string, memberId: string): Promise<void> {
    const s = await this.mid.getSession(id);
    await this.mid.removeMember(id, memberId);
    await this.log(actorId, 'session.member_remove', s, 'عضو حذف شد از', { memberId });
  }

  attendance(id: string) {
    return this.mid.attendance(id);
  }
  queue(id: string) {
    return this.mid.queue(id);
  }
  evaluations(id: string) {
    return this.mid.evaluations(id);
  }
}
