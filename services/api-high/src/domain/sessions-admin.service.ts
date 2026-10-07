import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import { type high, type internal, mid as midTypes } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf } from '../common/ids';
import { normalizePhone } from '../common/phone';
import { type Paged, LowAdminClient, MidAdminClient } from '../internal/admin-clients';
import { TtlLru } from './access/lru';
import { forbidden } from './access/write-helpers';
import { AuditService } from './audit.service';
import { conflict } from './db';

type Member = z.infer<typeof internal.MidAdminMember>;
type Session = z.infer<typeof internal.MidAdminSession>;
type SessionInput = z.infer<typeof internal.MidAdminPatchSession>;
type AddBody = z.infer<typeof high.AdminAddMembersBody>;
type Outcome = z.infer<typeof midTypes.AddMemberOutcome>;
type StaffRole = z.infer<typeof midTypes.StaffAssignableRole>;
const REAL_PHONE = /^09\d{9}$/;
const OUTCOMES = midTypes.AddMemberOutcome.options;

export interface SessionActor {
  id: string;
  perms: readonly string[];
}

interface DirRow {
  user_id: Buffer;
  phone: string;
  first_name: string;
  last_name: string;
  status: string;
}

/**
 * مدیریت جلسه‌ها (H-60..H-79، H-53، H-95/H-96): واسطهٔ mid؛ high عضو را با شمارهٔ دایرکتوری غنی و audit می‌نویسد.
 * نوشتن‌های عضو بدون GET اضافهٔ جلسه (docs-v2/30 §۳ کارایی): برچسب audit از کش عنوان‌ها (پر از پاسخ‌های mid) و در نبود آن شناسه.
 * هیچ HTTP داخل تراکنش DB نیست؛ audit پس از موفقیت مبدأ.
 */
@Injectable()
export class SessionsAdminService {
  private readonly titles: TtlLru<string>;

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly mid: MidAdminClient,
    private readonly low: LowAdminClient,
    private readonly audit: AuditService
  ) {
    this.titles = new TtlLru<string>(5_000, 30 * 60_000, () => this.clock.now().getTime());
  }

  private remember<T extends { id: string; title: string }>(s: T): T {
    this.titles.set(s.id, s.title);
    return s;
  }

  private ref(id: string): { id: string; title: string } {
    return { id, title: this.titles.get(id) ?? 'جلسه' };
  }

  async list(query: z.infer<typeof high.AdminSessionsQuery> & { page: number; pageSize: number }): Promise<Paged<Session>> {
    const r = await this.mid.listSessions({ ...query });
    for (const s of r.items) this.remember(s);
    return r;
  }

  async get(id: string) {
    return this.remember(await this.mid.getSession(id));
  }

  private async log(actorId: string, action: string, s: { id: string; title: string }, summary: string, meta: Record<string, unknown> = {}) {
    await this.audit.write(this.ds, { actor: await this.audit.actorOf(actorId), action, target: { type: 'session', id: s.id, label: s.title }, summary: `${summary} «${s.title}»`, meta });
  }

  /** H-62: creatorId باید در دایرکتوری و فعال باشد (docs-v2/30 §۳ امنیت ۳)؛ Idempotency-Key به mid پاس داده می‌شود */
  async create(actorId: string, body: z.infer<typeof high.AdminCreateSessionBody>, idempotencyKey?: string) {
    const creatorId = body.creatorId ?? actorId;
    if (creatorId.toLowerCase() !== actorId.toLowerCase()) {
      const rows = isUuid(creatorId) ? ((await this.ds.query('SELECT status FROM user_directory WHERE user_id = ?', [uuidToBuf(creatorId)])) as { status: string }[]) : [];
      if (!rows[0]) throw new AppError('NOT_FOUND', { message: 'سازندهٔ جلسه پیدا نشد.' });
      if (rows[0].status !== 'active') throw conflict('USER_NOT_ACTIVE', 'سازندهٔ جلسه فعال نیست.');
    }
    const s = this.remember(await this.mid.createSession({ creatorId, session: body.session }, idempotencyKey));
    await this.log(actorId, 'session.create', s, 'جلسه ساخته شد:', { creatorId });
    return s;
  }

  /** H-63: audit با diff فیلدهای تغییرکرده (GET قبلی برای diff لازم است، نه اضافه) */
  async update(actorId: string, id: string, body: SessionInput) {
    const before = await this.mid.getSession(id);
    const s = this.remember(await this.mid.patchSession(id, body));
    await this.log(actorId, 'session.update', s, 'جلسه ویرایش شد:', { changes: sessionDiff(before, s) });
    return s;
  }

  /** H-64: audit با from/to */
  async transition(actorId: string, id: string, to: 'scheduled' | 'started' | 'ended') {
    const before = await this.mid.getSession(id);
    const s = this.remember(await this.mid.transition(id, { to }));
    await this.log(actorId, 'session.transition', s, `وضعیت جلسه به «${to}» رفت:`, { from: before.status, to });
    return s;
  }

  async remove(actorId: string, id: string): Promise<void> {
    const s = await this.get(id); // برچسب audit (و 404 برای جلسهٔ ناموجود)
    await this.mid.deleteSession(id);
    await this.log(actorId, 'session.delete', s, 'جلسه حذف شد:');
  }

  // ───────── اعضا ─────────
  /** شمارهٔ واقعی اعضا از دایرکتوری (mid شماره ندارد)؛ کاربر حذف‌شده/ناشناس ⇒ null */
  async withPhones<T extends { userId: string }>(items: T[]): Promise<(T & { phone: string | null })[]> {
    const ids = [...new Set(items.map((m) => m.userId).filter(isUuid))];
    const phones = new Map<string, string>();
    if (ids.length) {
      const rows = (await this.ds.query(`SELECT user_id, phone FROM user_directory WHERE user_id IN (${ids.map(() => '?').join(',')})`, ids.map(uuidToBuf))) as { user_id: Buffer; phone: string }[];
      for (const r of rows) phones.set(bufToUuid(r.user_id), r.phone);
    }
    return items.map((m) => {
      const p = phones.get(m.userId.toLowerCase());
      return { ...m, phone: p && REAL_PHONE.test(p) ? p : null };
    });
  }

  /** H-66: q شمارهٔ موبایل ⇒ در high به userId نگاشت می‌شود (شماره هرگز به mid نمی‌رود) */
  async members(id: string, query: z.infer<typeof high.AdminMembersQuery>) {
    const { q, ...rest } = query;
    let filter: Record<string, string | number | undefined> = { ...rest };
    if (q) {
      const phone = normalizePhone(q);
      if (typeof phone === 'string' && REAL_PHONE.test(phone)) {
        const rows = (await this.ds.query('SELECT user_id FROM user_directory WHERE phone = ?', [phone])) as { user_id: Buffer }[];
        if (!rows[0]) return { items: [], page: query.page, pageSize: query.pageSize, total: 0 };
        filter = { ...filter, userId: bufToUuid(rows[0].user_id) };
      } else filter = { ...filter, q };
    }
    const r = await this.mid.listMembers(id, filter);
    return { ...r, items: await this.withPhones(r.items) };
  }

  private async one(m: Member): Promise<Member> {
    return (await this.withPhones([m]))[0]!;
  }

  async decide(actorId: string, id: string, memberId: string, action: 'approve' | 'reject') {
    const m = await this.mid.decide(id, memberId, { action });
    await this.log(actorId, 'session.member_decide', this.ref(id), action === 'approve' ? 'عضویت تأیید شد در' : 'عضویت رد شد در', { memberId, userId: m.userId, action });
    return this.one(m);
  }

  /** H-68 (۱.۶.۰): session_manager هم مجاز (هم‌مدیر)؛ آخرین مدیر ⇒ LAST_HOLDER از mid */
  async setRoles(actorId: string, id: string, memberId: string, roles: z.infer<typeof internal.MidAdminSetRoles>['roles']) {
    const m = await this.mid.setMemberRoles(id, memberId, { roles, actorId });
    await this.log(actorId, 'session.member_roles', this.ref(id), 'نقش‌های عضو تغییر کرد در', { memberId, userId: m.userId, roles });
    return this.one(m);
  }

  async removeMember(actorId: string, id: string, memberId: string): Promise<void> {
    const removed = await this.mid.removeMember(id, memberId);
    await this.log(actorId, 'session.member_remove', this.ref(id), 'عضو حذف شد از', { memberId, userId: removed?.userId ?? null });
  }

  /**
   * H-73 افزودن مستقیم: شماره‌ها در یک query از دایرکتوری high؛ createMissing ⇒ (نیازمند system.users.manage) یک
   * LOW_ADMIN.usersBulk سپس یک MID_ADMIN.membersAdd. کلیدهای idempotency مشتق‌شده به low/mid می‌روند (retry دوباره نمی‌سازد).
   * audit `session.members_add` بدون هیچ شماره‌ای.
   */
  async addMembers(actor: SessionActor, id: string, body: AddBody, keys: { low?: string; mid?: string }) {
    const n = body.items.length;
    const out: { index: number; userId: string | null; outcome: Outcome; code: string | null; member: (Member & { phone: string | null }) | null }[] = body.items.map((_, index) => ({ index, userId: null, outcome: 'failed', code: null, member: null }));
    const phones = [...new Set(body.items.map((i) => i.user.phone).filter((p): p is string => !!p))];
    const ids = [...new Set(body.items.map((i) => i.user.userId?.toLowerCase()).filter((u): u is string => !!u && isUuid(u)))];
    const where: string[] = [];
    const args: unknown[] = [];
    if (phones.length) (where.push(`phone IN (${phones.map(() => '?').join(',')})`), args.push(...phones));
    if (ids.length) (where.push(`user_id IN (${ids.map(() => '?').join(',')})`), args.push(...ids.map(uuidToBuf)));
    const rows = where.length ? ((await this.ds.query(`SELECT user_id, phone, first_name, last_name, status FROM user_directory WHERE ${where.join(' OR ')}`, args)) as DirRow[]) : [];
    const byPhone = new Map(rows.map((r) => [r.phone, r]));
    const byId = new Map(rows.map((r) => [bufToUuid(r.user_id), r]));

    // ساخت کاربران ثبت‌نام‌نکرده (فقط با createMissing و system.users.manage)
    const missing = body.items.map((it, i) => ({ it, i })).filter(({ it }) => it.user.phone && !byPhone.has(it.user.phone));
    const created = new Set<string>();
    if (missing.length && body.createMissing) {
      if (!actor.perms.includes('system.users.manage')) throw forbidden('ساخت کاربر تازه به «system.users.manage» نیاز دارد.', { missing: ['system.users.manage'] });
      const toCreate = new Map<string, { phone: string; firstName: string; lastName: string }>();
      for (const { it, i } of missing) {
        if (!it.firstName || !it.lastName) out[i]!.code = 'NAME_REQUIRED';
        else if (!toCreate.has(it.user.phone!)) toCreate.set(it.user.phone!, { phone: it.user.phone!, firstName: it.firstName, lastName: it.lastName });
      }
      if (toCreate.size) {
        const res = await this.low.usersBulk({ items: [...toCreate.values()] }, keys.low);
        const now = this.clock.now();
        const fresh: DirRow[] = [];
        for (const r of res.items) {
          if (!r.userId || r.outcome === 'failed') {
            for (const { it, i } of missing) if (it.user.phone === r.phone) out[i]!.code = r.code ?? 'CREATE_FAILED';
            continue;
          }
          const src = toCreate.get(r.phone)!;
          const row: DirRow = { user_id: uuidToBuf(r.userId), phone: r.phone, first_name: src.firstName, last_name: src.lastName, status: 'active' };
          byPhone.set(r.phone, row);
          byId.set(r.userId.toLowerCase(), row);
          if (r.outcome === 'created') (fresh.push(row), created.add(r.userId.toLowerCase()));
        }
        // دایرکتوری فوراً (رویداد user.registered بعدی idempotent است)
        if (fresh.length)
          await this.ds.query(
            `INSERT INTO user_directory (user_id, phone, first_name, last_name, status, perm_ver, created_at, updated_at) VALUES ${fresh.map(() => "(?, ?, ?, ?, 'active', 1, ?, ?)").join(',')}
             ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
            fresh.flatMap((f) => [f.user_id, f.phone, f.first_name, f.last_name, now, now])
          );
      }
    }

    // آیتم‌ها ⇒ userId (تکراری: اولین آیتم تعیین‌کننده است)
    const send = new Map<string, { userId: string; roles: StaffRole[]; firstName?: string; lastName?: string }>();
    const idxOf = new Map<string, number[]>();
    body.items.forEach((it, i) => {
      const row = it.user.phone ? byPhone.get(it.user.phone) : byId.get(it.user.userId!.toLowerCase());
      const userId = row ? bufToUuid(row.user_id) : it.user.userId && isUuid(it.user.userId) ? it.user.userId.toLowerCase() : null;
      if (!userId) {
        out[i]!.outcome = out[i]!.code ? 'failed' : 'not_found';
        return;
      }
      out[i]!.userId = userId;
      if (row && row.status !== 'active') {
        out[i]!.outcome = 'not_active';
        return;
      }
      idxOf.set(userId, [...(idxOf.get(userId) ?? []), i]);
      if (!send.has(userId)) send.set(userId, { userId, roles: (it.roles ?? body.defaultRoles) as StaffRole[], ...(row ? { firstName: row.first_name, lastName: row.last_name } : {}) });
    });

    if (send.size) {
      const res = await this.mid.membersAdd(id, { actorId: actor.id, items: [...send.values()], onExisting: body.onExisting, notify: body.notify }, keys.mid);
      const members = await this.withPhones(res.items.flatMap((r) => (r.member ? [r.member] : [])));
      const memberOf = new Map(members.map((m) => [m.userId.toLowerCase(), m]));
      for (const r of res.items) {
        const uid = r.userId.toLowerCase();
        for (const i of idxOf.get(uid) ?? []) {
          const first = idxOf.get(uid)![0] === i;
          const outcome: Outcome = !first ? 'unchanged' : created.has(uid) && (r.outcome === 'added' || r.outcome === 'approved') ? 'created_and_added' : r.outcome;
          Object.assign(out[i]!, { outcome, member: memberOf.get(uid) ?? null, code: null });
        }
      }
    }

    const counts = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;
    for (const o of out) counts[o.outcome]++;
    const s = this.ref(id);
    await this.log(actor.id, 'session.members_add', s, `${n} عضو بررسی شد برای`, {
      items: out.map((o) => ({ userId: o.userId, outcome: o.outcome, roles: o.userId ? (send.get(o.userId)?.roles ?? null) : null })),
      onExisting: body.onExisting,
      createdUserIds: [...created],
      counts
    });
    return { items: out, counts };
  }

  /** H-74 انتقال/تعیین مدیر: کاربر باید در دایرکتوری و فعال باشد (نام برای ساخت ردیف دایرکتوری mid) */
  async transferManager(actorId: string, id: string, body: z.infer<typeof high.TransferManagerBody>) {
    const rows = isUuid(body.userId) ? ((await this.ds.query('SELECT first_name, last_name, status FROM user_directory WHERE user_id = ?', [uuidToBuf(body.userId)])) as { first_name: string; last_name: string; status: string }[]) : [];
    const u = rows[0];
    if (!u) throw new AppError('NOT_FOUND', { message: 'کاربر پیدا نشد.' });
    if (u.status !== 'active') throw conflict('USER_NOT_ACTIVE', 'کاربر فعال نیست.');
    const s = this.remember(await this.mid.manager(id, { actorId, ...body, firstName: u.first_name, lastName: u.last_name }));
    await this.log(actorId, 'session.manager_transfer', s, 'مدیر جلسه تعیین شد:', { userId: body.userId, previous: body.previous, transferCreator: body.transferCreator });
    return s;
  }

  async decideBulk(actorId: string, id: string, body: z.infer<typeof high.AdminDecideBulkBody>) {
    const r = await this.mid.membersDecide(id, { actorId, memberIds: body.memberIds, action: body.action });
    const counts: Record<string, number> = {};
    for (const i of r.items) counts[i.outcome] = (counts[i.outcome] ?? 0) + 1;
    await this.log(actorId, 'session.members_decide', this.ref(id), body.action === 'approve' ? 'تأیید گروهی درخواست‌ها در' : 'رد گروهی درخواست‌ها در', { action: body.action, memberIds: body.memberIds, counts });
    return r;
  }

  occurrences(id: string, query: { page: number; pageSize: number }) {
    return this.mid.occurrences(id, query);
  }

  attendance(id: string, query: { page: number; pageSize: number; occurrenceId?: string }) {
    return this.mid.attendance(id, query);
  }
  queue(id: string, query: { occurrenceId?: string }) {
    return this.mid.queue(id, query);
  }
  evaluations(id: string, query: { page: number; pageSize: number; occurrenceId?: string; includeVoid: string }) {
    return this.mid.evaluations(id, query);
  }

  // ───────── اصلاح حضور/صف/ارزیابی (D6) ─────────
  async markAttendance(actorId: string, id: string, body: z.infer<typeof high.AdminMarkAttendanceBody>) {
    const r = await this.mid.markAttendance(id, { actorId, userIds: body.userIds, occurrenceId: body.occurrenceId, reason: body.reason });
    await this.log(actorId, 'session.attendance_add', this.ref(id), 'حضور ثبت شد در', { occurrenceId: r.occurrenceId, reason: body.reason, items: r.items.map((i) => ({ userId: i.userId, outcome: i.outcome })) });
    return r;
  }

  async revokeAttendance(actorId: string, id: string, userId: string, body: z.infer<typeof high.AdminRevokeAttendanceBody>) {
    const r = await this.mid.revokeAttendance(id, userId, { actorId, occurrenceId: body.occurrenceId, reason: body.reason });
    await this.log(actorId, 'session.attendance_revoke', this.ref(id), 'حضور لغو شد در', { userId, occurrenceId: r.occurrenceId, revoked: r.revoked, pointsReversed: r.pointsReversed, reason: body.reason });
    return r;
  }

  async queueNext(actorId: string, id: string, body: z.infer<typeof high.AdminQueueNextBody>) {
    const r = await this.mid.queueNext(id, { actorId, ...(body.expectCurrentItemId !== undefined ? { expectCurrentItemId: body.expectCurrentItemId } : {}) });
    await this.log(actorId, 'session.queue_next', this.ref(id), 'نوبت بعدی صف اعلام شد در', { occurrenceId: r.occurrenceId, currentItemId: r.current?.id ?? null });
    return r;
  }

  async queueAct(actorId: string, id: string, itemId: string, body: z.infer<typeof high.AdminQueueActBody>, idempotencyKey?: string) {
    const r = await this.mid.queueAct(id, itemId, { actorId, ...body }, idempotencyKey);
    await this.log(actorId, 'session.queue_act', this.ref(id), 'صف اصلاح شد در', { itemId, action: body.action });
    return r;
  }

  async voidEvaluation(actorId: string, id: string, evalId: string, body: z.infer<typeof high.AdminVoidEvaluationBody>) {
    const r = await this.mid.voidEvaluation(id, evalId, { actorId, reason: body.reason });
    await this.log(actorId, 'session.evaluation_void', this.ref(id), 'ارزیابی باطل شد در', { evalId, userId: r.userId, reason: body.reason });
    return r;
  }

  async patchEvaluation(actorId: string, id: string, evalId: string, body: z.infer<typeof high.AdminEvaluationPatchBody>) {
    const r = await this.mid.patchEvaluation(id, evalId, { actorId, ...body });
    const { reason, ...fields } = body;
    await this.log(actorId, 'session.evaluation_patch', this.ref(id), 'ارزیابی اصلاح شد در', { evalId, userId: r.userId, fields: Object.keys(fields), reason, score: r.score });
    return r;
  }
}

/** diff فیلدهای جلسه برای audit (بدون PII؛ متن‌های بلند فقط «تغییر کرد») */
export function sessionDiff(before: Session, after: Session): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const scalar = ['title', 'joinPolicy', 'visibility', 'capacity'] as const;
  for (const k of scalar) if (before[k] !== after[k]) out[k] = { from: before[k] ?? null, to: after[k] ?? null };
  for (const k of ['description', 'schedule', 'location'] as const) if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out[k] = 'changed';
  return out;
}
