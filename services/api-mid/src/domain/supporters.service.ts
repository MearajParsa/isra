import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, isUuid, uuidToBuf } from '../common/ids';
import { LiveService } from '../live/live.service';
import { MembersAccess, type SessionRow } from './access.service';
import { NAME_SQL, conflict, displayName, type Q } from './db';
import { MembersService } from './members.service';
import { type InboxItem, emitInboxBatch } from './outbox.writer';
import { type Permission, effectivePermissions, parsePermissions, sanitizePermissions } from './rules';

export const MAX_TEACHER_SUPPORTERS = 50;
export const MAX_SESSION_SUPPORTERS = 20;

export interface UserRef {
  userId?: string;
  phone?: string;
}

const notFoundSupporter = () => new AppError('NOT_FOUND', { message: 'این پشتیبان پیدا نشد.' });
const ref = (sessionId: string) => `session:${sessionId}`;
const ts = (d: Date | null | undefined) => (d ? d.toISOString() : new Date(0).toISOString());

/**
 * پشتیبان‌ها (۱.۷.۰؛ docs-v2/31 §۲، T5): ثابتِ استاد (`teacher_supporters` ⇒ همهٔ جلسه‌های حال و آیندهٔ او) و per جلسه
 * (`session_supporters`). مجوز مؤثر = اجتماع هر دو. ضد ارتقا: فقط کلیدهای کاتالوگ قابل‌واگذاری (`sanitizePermissions`)؛
 * پشتیبان نمی‌تواند پشتیبان تعیین کند (M-65..M-67 فقط صاحب؛ M-60..M-63 فقط برای جلسه‌های خود استاد).
 */
@Injectable()
export class SupportersService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly access: MembersAccess,
    private readonly members: MembersService,
    private readonly live: LiveService
  ) {}

  // ───────────────────────── کمکی ─────────────────────────
  /** کاربر هدف: userId یا شماره (resolve از low با سقف durable)؛ نبود ⇒ NOT_FOUND، غیرفعال ⇒ USER_NOT_ACTIVE */
  async resolveTarget(actorId: string, user: UserRef, names?: { firstName?: string; lastName?: string }): Promise<string> {
    const now = this.clock.now();
    let userId: string;
    if (user.userId) {
      if (!isUuid(user.userId)) throw new AppError('NOT_FOUND', { message: 'کاربر پیدا نشد.' });
      userId = user.userId;
      if (names && (names.firstName || names.lastName))
        await this.ds.query('INSERT IGNORE INTO user_directory (user_id, first_name, last_name, updated_at) VALUES (?, ?, ?, ?)', [uuidToBuf(userId), (names.firstName ?? '').slice(0, 40), (names.lastName ?? '').slice(0, 40), now]);
    } else {
      const u = (await this.members.resolvePhones(actorId, [user.phone!])).get(user.phone!);
      if (!u) throw new AppError('NOT_FOUND', { message: 'کاربری با این شماره ثبت‌نام نکرده است.' });
      if (u.status !== 'active') throw conflict('USER_NOT_ACTIVE', 'این کاربر فعال نیست.');
      userId = u.userId;
      await this.ds.query('INSERT IGNORE INTO user_directory (user_id, first_name, last_name, updated_at) VALUES (?, ?, ?, ?)', [uuidToBuf(userId), u.firstName.slice(0, 40), u.lastName.slice(0, 40), now]);
    }
    const d = ((await this.ds.query('SELECT status, deleted FROM user_directory WHERE user_id = ?', [uuidToBuf(userId)])) as { status: string; deleted: number }[])[0];
    if (!d) throw new AppError('NOT_FOUND', { message: 'کاربر پیدا نشد.' });
    if (d.deleted || d.status !== 'active') throw conflict('USER_NOT_ACTIVE', 'این کاربر فعال نیست.');
    return userId;
  }

  /** جلسه‌های موجود و پایان‌نیافتهٔ یک استاد (برای سیگنال/اخراج) */
  private async teacherSessions(teacherId: string): Promise<string[]> {
    const rows = (await this.ds.query("SELECT id FROM sessions WHERE owner_id = ? AND deleted_at IS NULL AND status <> 'ended'", [uuidToBuf(teacherId)])) as { id: Buffer }[];
    return rows.map((r) => bufToUuid(r.id));
  }

  /** پس از حذف/تغییر: سیگنال `supporters.updated` و اخراج socket کاربری که دیگر نقشی ندارد */
  private async after(sessionIds: readonly string[], userId: string | null): Promise<void> {
    for (const sid of sessionIds) {
      this.live.emit(sid, 'supporters.updated');
      if (userId && !(await this.access.canJoinRoom(sid, userId))) this.live.evict(sid, [userId]);
    }
  }

  // ───────────────────────── پشتیبان ثابت استاد (M-60..M-63، H-104..H-106) ─────────────────────────
  private teacherSelect(where: string) {
    return `SELECT t.user_id, t.permissions, t.created_at, ${NAME_SQL} AS name FROM teacher_supporters t LEFT JOIN user_directory d ON d.user_id = t.user_id WHERE ${where}`;
  }

  private teacherDto(r: { user_id: Buffer; permissions: unknown; created_at: Date; name: string | null }) {
    return { userId: bufToUuid(r.user_id), name: r.name || displayName(), permissions: parsePermissions(r.permissions), createdAt: r.created_at.toISOString() };
  }

  async listTeacher(teacherId: string, page: number, pageSize: number) {
    const t = uuidToBuf(teacherId);
    const [rows, cnt] = await Promise.all([
      this.ds.query(`${this.teacherSelect('t.teacher_id = ?')} ORDER BY t.created_at ASC, t.user_id ASC LIMIT ? OFFSET ?`, [t, pageSize, (page - 1) * pageSize]) as Promise<{ user_id: Buffer; permissions: unknown; created_at: Date; name: string | null }[]>,
      this.ds.query('SELECT COUNT(*) AS n FROM teacher_supporters WHERE teacher_id = ?', [t]) as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map((r) => this.teacherDto(r)), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  private async teacherOne(teacherId: string, userId: string) {
    const rows = (await this.ds.query(this.teacherSelect('t.teacher_id = ? AND t.user_id = ?'), [uuidToBuf(teacherId), uuidToBuf(userId)])) as { user_id: Buffer; permissions: unknown; created_at: Date; name: string | null }[];
    if (!rows[0]) throw notFoundSupporter();
    return this.teacherDto(rows[0]);
  }

  /**
   * M-61 (create) / H-105 (upsert): خود استاد ⇒ SELF_PROTECTED؛ موجود ⇒ ALREADY_SUPPORTER (فقط create)؛ سقف ۵۰ ⇒ LIMIT_REACHED.
   */
  async setTeacher(teacherId: string, user: UserRef, permissions: readonly Permission[], o: { actorId: string; mode: 'create' | 'upsert'; names?: { firstName?: string; lastName?: string } }) {
    const perms = sanitizePermissions(permissions);
    if (!perms.length) throw new AppError('VALIDATION_FAILED', { details: { fields: { permissions: 'دست‌کم یک مجوز لازم است.' } } });
    if (user.userId === teacherId) throw conflict('SELF_PROTECTED', 'استاد نمی‌تواند پشتیبان خودش باشد.');
    const userId = await this.resolveTarget(o.actorId, user, o.names);
    if (userId === teacherId) throw conflict('SELF_PROTECTED', 'استاد نمی‌تواند پشتیبان خودش باشد.');
    const now = this.clock.now();
    await this.ds.transaction(async (m) => {
      const t = uuidToBuf(teacherId);
      await m.query('SELECT user_id FROM user_directory WHERE user_id = ? FOR UPDATE', [t]);
      const ex = (await m.query('SELECT 1 AS x FROM teacher_supporters WHERE teacher_id = ? AND user_id = ? FOR UPDATE', [t, uuidToBuf(userId)])) as unknown[];
      if (ex.length) {
        if (o.mode === 'create') throw conflict('ALREADY_SUPPORTER', 'این کاربر قبلاً پشتیبان ثابت شماست.');
        await m.query('UPDATE teacher_supporters SET permissions = ?, updated_at = ? WHERE teacher_id = ? AND user_id = ?', [JSON.stringify(perms), now, t, uuidToBuf(userId)]);
        return;
      }
      const n = (await m.query('SELECT COUNT(*) AS n FROM teacher_supporters WHERE teacher_id = ?', [t])) as { n: string | number }[];
      if (Number(n[0]?.n ?? 0) >= MAX_TEACHER_SUPPORTERS) throw conflict('LIMIT_REACHED', `حداکثر ${MAX_TEACHER_SUPPORTERS} پشتیبان ثابت مجاز است.`);
      await m.query('INSERT INTO teacher_supporters (teacher_id, user_id, permissions, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [t, uuidToBuf(userId), JSON.stringify(perms), uuidToBuf(o.actorId), now, now]);
      const teacherName = ((await m.query(`SELECT ${NAME_SQL} AS name FROM user_directory d WHERE d.user_id = ?`, [t])) as { name: string }[])[0]?.name || displayName();
      await emitInboxBatch(m, now, [{ userId, kind: 'session', title: 'پشتیبان استاد شدید', body: `شما پشتیبان جلسه‌های «${teacherName}» شدید.`, ref: null }]);
    });
    await this.after(await this.teacherSessions(teacherId), null);
    return this.teacherOne(teacherId, userId);
  }

  /** M-62: جایگزینی کامل مجوزها؛ نبود ⇒ NOT_FOUND */
  async patchTeacher(teacherId: string, userId: string, permissions: readonly Permission[]) {
    if (!isUuid(userId)) throw notFoundSupporter();
    const perms = sanitizePermissions(permissions);
    if (!perms.length) throw new AppError('VALIDATION_FAILED', { details: { fields: { permissions: 'دست‌کم یک مجوز لازم است.' } } });
    const r = (await this.ds.query('UPDATE teacher_supporters SET permissions = ?, updated_at = ? WHERE teacher_id = ? AND user_id = ?', [JSON.stringify(perms), this.clock.now(), uuidToBuf(teacherId), uuidToBuf(userId)])) as { affectedRows?: number };
    if (!r.affectedRows) throw notFoundSupporter();
    await this.after(await this.teacherSessions(teacherId), userId);
    return this.teacherOne(teacherId, userId);
  }

  /** M-63 / H-106: idempotent؛ ردیف‌های per جلسه دست نمی‌خورند */
  async removeTeacher(teacherId: string, userId: string): Promise<Record<string, never>> {
    if (!isUuid(userId)) return {};
    const r = (await this.ds.query('DELETE FROM teacher_supporters WHERE teacher_id = ? AND user_id = ?', [uuidToBuf(teacherId), uuidToBuf(userId)])) as { affectedRows?: number };
    if (r.affectedRows) await this.after(await this.teacherSessions(teacherId), userId);
    return {};
  }

  // ───────────────────────── پشتیبان مؤثر جلسه (M-64..M-67، H-107..H-109) ─────────────────────────
  private sessionSelect = `SELECT x.user_id, sp.permissions AS sp, tp.permissions AS tp, LEAST(COALESCE(sp.created_at, tp.created_at), COALESCE(tp.created_at, sp.created_at)) AS created_at, ${NAME_SQL} AS name
       FROM (SELECT user_id FROM session_supporters WHERE session_id = ? UNION SELECT user_id FROM teacher_supporters WHERE teacher_id = ?) x
       LEFT JOIN session_supporters sp ON sp.session_id = ? AND sp.user_id = x.user_id
       LEFT JOIN teacher_supporters tp ON tp.teacher_id = ? AND tp.user_id = x.user_id
       LEFT JOIN user_directory d ON d.user_id = x.user_id
      WHERE x.user_id <> ?`;

  private sessionArgs(s: Pick<SessionRow, 'id' | 'owner_id'>) {
    const sid = uuidToBuf(s.id);
    const own = uuidToBuf(s.owner_id);
    return [sid, own, sid, own, own];
  }

  private sessionDto(r: { user_id: Buffer; sp: unknown; tp: unknown; created_at: Date | null; name: string | null }) {
    const teacher = r.tp == null ? null : parsePermissions(r.tp);
    const session = r.sp == null ? null : parsePermissions(r.sp);
    return { userId: bufToUuid(r.user_id), name: r.name || displayName(), permissions: effectivePermissions('supporter', teacher, session), sources: { teacher, session }, createdAt: ts(r.created_at) };
  }

  async listSessionOf(s: Pick<SessionRow, 'id' | 'owner_id'>, page: number, pageSize: number) {
    const args = this.sessionArgs(s);
    const [rows, cnt] = await Promise.all([
      this.ds.query(`${this.sessionSelect} ORDER BY created_at ASC, x.user_id ASC LIMIT ? OFFSET ?`, [...args, pageSize, (page - 1) * pageSize]) as Promise<{ user_id: Buffer; sp: unknown; tp: unknown; created_at: Date | null; name: string | null }[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM (SELECT user_id FROM session_supporters WHERE session_id = ? UNION SELECT user_id FROM teacher_supporters WHERE teacher_id = ?) x WHERE x.user_id <> ?`, [args[0], args[1], args[4]]) as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map((r) => this.sessionDto(r)), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  async sessionOne(q: Q, s: Pick<SessionRow, 'id' | 'owner_id'>, userId: string) {
    const rows = (await q.query(`${this.sessionSelect} AND x.user_id = ?`, [...this.sessionArgs(s), uuidToBuf(userId)])) as { user_id: Buffer; sp: unknown; tp: unknown; created_at: Date | null; name: string | null }[];
    if (!rows[0]) throw notFoundSupporter();
    return this.sessionDto(rows[0]);
  }

  /** شمار پشتیبان‌های مؤثر (برای AdminSession.counts.supporters) */
  async countEffective(q: Q, s: Pick<SessionRow, 'id' | 'owner_id'>): Promise<number> {
    const own = uuidToBuf(s.owner_id);
    const r = (await q.query('SELECT COUNT(*) AS n FROM (SELECT user_id FROM session_supporters WHERE session_id = ? UNION SELECT user_id FROM teacher_supporters WHERE teacher_id = ?) x WHERE x.user_id <> ?', [uuidToBuf(s.id), own, own])) as { n: string | number }[];
    return Number(r[0]?.n ?? 0);
  }

  /** M-64: صاحب یا پشتیبان */
  async listSession(actorId: string, sessionId: string, page: number, pageSize: number) {
    const { session } = await this.access.load(this.ds, sessionId, actorId, 'staff');
    return this.listSessionOf(session, page, pageSize);
  }

  /**
   * ردیف per جلسه (داخل تراکنش، جلسه قفل): create ⇒ ALREADY_SUPPORTER اگر ردیف per جلسه هست؛ upsert ⇒ جایگزینی.
   * صاحب ⇒ SELF_PROTECTED؛ سقف ۲۰ ردیف per جلسه ⇒ LIMIT_REACHED.
   */
  private async writeSession(m: Q, session: SessionRow, userId: string, perms: Permission[], actorId: string | null, mode: 'create' | 'upsert'): Promise<boolean> {
    if (userId === session.owner_id) throw conflict('SELF_PROTECTED', 'صاحب جلسه همهٔ مجوزها را دارد و پشتیبان نمی‌شود.');
    const now = this.clock.now();
    const sid = uuidToBuf(session.id);
    const ex = (await m.query('SELECT 1 AS x FROM session_supporters WHERE session_id = ? AND user_id = ? FOR UPDATE', [sid, uuidToBuf(userId)])) as unknown[];
    if (ex.length) {
      if (mode === 'create') throw conflict('ALREADY_SUPPORTER', 'این کاربر قبلاً پشتیبان این جلسه است.');
      await m.query('UPDATE session_supporters SET permissions = ?, updated_at = ? WHERE session_id = ? AND user_id = ?', [JSON.stringify(perms), now, sid, uuidToBuf(userId)]);
      return false;
    }
    const n = (await m.query('SELECT COUNT(*) AS n FROM session_supporters WHERE session_id = ?', [sid])) as { n: string | number }[];
    if (Number(n[0]?.n ?? 0) >= MAX_SESSION_SUPPORTERS) throw conflict('LIMIT_REACHED', `حداکثر ${MAX_SESSION_SUPPORTERS} پشتیبان برای هر جلسه مجاز است.`);
    await m.query('INSERT INTO session_supporters (session_id, user_id, permissions, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [sid, uuidToBuf(userId), JSON.stringify(perms), actorId ? uuidToBuf(actorId) : null, now, now]);
    const inbox: InboxItem[] = [{ userId, kind: 'session', title: 'پشتیبان جلسه شدید', body: `شما پشتیبان جلسهٔ «${session.title}» شدید.`, ref: ref(session.id) }];
    await emitInboxBatch(m, now, inbox);
    return true;
  }

  /** M-65: فقط صاحب */
  async addSession(actorId: string, sessionId: string, user: UserRef, permissions: readonly Permission[]) {
    const perms = sanitizePermissions(permissions);
    const pre = await this.access.load(this.ds, sessionId, actorId, 'owner');
    if (user.userId === pre.session.owner_id) throw conflict('SELF_PROTECTED', 'صاحب جلسه همهٔ مجوزها را دارد و پشتیبان نمی‌شود.');
    const userId = await this.resolveTarget(actorId, user);
    let session!: SessionRow;
    await this.ds.transaction(async (m) => {
      ({ session } = await this.access.load(m, sessionId, actorId, 'owner', true));
      await this.writeSession(m, session, userId, perms, actorId, 'create');
    });
    await this.after([sessionId], null);
    return this.sessionOne(this.ds, session, userId);
  }

  /** M-66: فقط ردیف per جلسه؛ نبود ⇒ NOT_FOUND */
  async patchSession(actorId: string, sessionId: string, userId: string, permissions: readonly Permission[]) {
    const perms = sanitizePermissions(permissions);
    const { session } = await this.access.load(this.ds, sessionId, actorId, 'owner');
    if (!isUuid(userId)) throw notFoundSupporter();
    const r = (await this.ds.query('UPDATE session_supporters SET permissions = ?, updated_at = ? WHERE session_id = ? AND user_id = ?', [JSON.stringify(perms), this.clock.now(), uuidToBuf(sessionId), uuidToBuf(userId)])) as { affectedRows?: number };
    if (!r.affectedRows) throw notFoundSupporter();
    await this.after([sessionId], userId);
    return this.sessionOne(this.ds, session, userId);
  }

  /** M-67: idempotent (پشتیبان ثابت با این مسیر حذف نمی‌شود) */
  async removeSession(actorId: string | null, sessionId: string, userId: string): Promise<Record<string, never>> {
    if (actorId) await this.access.load(this.ds, sessionId, actorId, 'owner');
    else if (!(await this.access.session(this.ds, sessionId))) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    if (!isUuid(userId)) return {};
    const r = (await this.ds.query('DELETE FROM session_supporters WHERE session_id = ? AND user_id = ?', [uuidToBuf(sessionId), uuidToBuf(userId)])) as { affectedRows?: number };
    if (r.affectedRows) await this.after([sessionId], userId);
    return {};
  }

  /** H-108 ⇒ MID_ADMIN.supporter PUT: upsert ردیف per جلسه (کاربر فعال؛ صاحب ⇒ SELF_PROTECTED) */
  async adminPutSession(sessionId: string, userId: string, permissions: readonly Permission[], actorId: string, names?: { firstName?: string; lastName?: string }) {
    const perms = sanitizePermissions(permissions);
    const pre = await this.access.session(this.ds, sessionId);
    if (!pre) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
    if (userId === pre.owner_id) throw conflict('SELF_PROTECTED', 'صاحب جلسه همهٔ مجوزها را دارد و پشتیبان نمی‌شود.');
    await this.resolveTarget(actorId, { userId }, names);
    let session!: SessionRow;
    await this.ds.transaction(async (m) => {
      const s = await this.access.session(m, sessionId, true);
      if (!s) throw new AppError('NOT_FOUND', { message: 'جلسه پیدا نشد.' });
      session = s;
      await this.writeSession(m, s, userId, perms, actorId, 'upsert');
    });
    await this.after([sessionId], userId);
    return this.sessionOne(this.ds, session, userId);
  }
}
