import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { high } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { uuidToBuf } from '../common/ids';
import { maskIp } from '../common/phone';
import { LowAdminClient, MidAdminClient } from '../internal/admin-clients';
import { AuditService } from './audit.service';
import { ClaimsService } from './claims.service';
import { conflict, displayName } from './db';
import { RbacService } from './rbac.service';
import type { SystemRoleKey } from './rules';
import { type DirectoryRow, UsersService } from './users.service';
import { forbidden, requireHeld } from './access/write-helpers';

type Body<K extends keyof typeof high> = (typeof high)[K] extends z.ZodType ? z.infer<(typeof high)[K]> : never;
export interface Actor {
  id: string;
  roles: readonly SystemRoleKey[];
}

/**
 * شمارهٔ ناشناس جایگزین (فقط وقتی low مقدارش را نداده): `d` + ۱۰ هگز **آخر** شناسه.
 * ۱۰ هگز اولِ UUIDv7 بخشی از timestamp است (دو کاربر ساخته‌شده در یک بازهٔ ~۲۵۶ms همان پیشوند را دارند ⇒ نقض UNIQUE)؛
 * بخش پایانی تصادفی است. مرجع شمارهٔ ناشناس همیشه low است و رویداد/پاسخ low بر این مقدار می‌نشیند.
 */
export const anonPhone = (userId: string): string => `d${userId.replace(/-/g, '').slice(-10)}`;
const ANON = /^d[0-9a-f]{10}$/;

const zeros = { points: { total: 0, badges: 0 }, sessions: { created: 0, memberships: 0, attended: 0 } };

/**
 * مدیریت کاربر (H-21، H-24..H-29، H-50/51): دادهٔ حساب مال low است؛ high دایرکتوری/نقش/grant و audit را نگه می‌دارد.
 * ترتیب: حفاظت‌ها (محلی) ⇒ فراخوانی low ⇒ به‌روزرسانی دایرکتوری ⇒ audit (شکست مبدأ ⇒ بدون audit).
 */
@Injectable()
export class UsersAdminService {
  private readonly log = new Logger('UsersAdmin');

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly users: UsersService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly claims: ClaimsService,
    private readonly low: LowAdminClient,
    private readonly mid: MidAdminClient
  ) {}

  /** خواندن اختیاری از مبدأ: خطا ⇒ null (degraded)، نه شکست کل */
  private async soft<T>(p: Promise<T>, what: string): Promise<T | null> {
    try {
      return await p;
    } catch (e) {
      this.log.warn({ what, code: e instanceof AppError ? e.code : 'unknown' }, 'origin read degraded');
      return null;
    }
  }

  /** SystemUserDetail: دایرکتوری + نقش/grant (محلی) + low (حساب/نشست) + mid (امتیاز/جلسه)؛ مبدأ در دسترس نباشد ⇒ صفر/null */
  async detail(row: DirectoryRow, lowUser?: z.infer<typeof import('@isra/api-types').internal.LowAdminUser> | null) {
    const id = row.user_id.toString('hex');
    const uuid = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
    const [access, lu, mu] = await Promise.all([
      this.rbac.access(uuid),
      lowUser === undefined ? this.soft(this.low.getUser(uuid), 'low.getUser') : Promise.resolve(lowUser),
      this.soft(this.mid.userSummary(uuid), 'mid.userSummary')
    ]);
    return {
      ...this.users.dto(row, access),
      firstName: row.first_name,
      lastName: row.last_name,
      hasPassword: lu?.hasPassword ?? false,
      mustChangePassword: lu?.mustChangePassword ?? false,
      lastActiveAt: lu?.lastActiveAt ?? null,
      activeSessions: lu?.activeSessions ?? 0,
      sessionsByClient: lu?.sessionsByClient ?? {},
      points: mu?.points ?? zeros.points,
      sessions: mu?.sessions ?? zeros.sessions
    };
  }

  async get(id: string) {
    return this.detail(await this.users.mustRow(this.ds, id));
  }

  private static label(r: DirectoryRow): string {
    return displayName(r.first_name, r.last_name);
  }

  /**
   * ضد تصاحب حساب (docs-v2/30 §۳ امنیت ۱): روی کاربری که نقش سیستمی دارد، actor باید همهٔ مجوزهای مؤثر هدف را داشته باشد
   * (وگرنه با تغییر شماره/رمز/خروج می‌توانست حساب قوی‌تر را تصاحب کند)؛ حساب developer فقط توسط developer. خودِ actor معاف.
   */
  async guardTarget(actor: Actor, targetId: string): Promise<void> {
    if (actor.id.toLowerCase() === targetId.toLowerCase()) return;
    const [t, a] = await Promise.all([this.rbac.access(targetId), this.rbac.access(actor.id)]);
    if (t.roles.length === 0) return;
    if (t.roles.includes('developer') && !a.roles.includes('developer')) throw forbidden('حساب توسعه‌دهنده را فقط توسعه‌دهنده می‌تواند مدیریت کند.');
    requireHeld(a, t.permissions, 'مدیریت این حساب');
  }

  private async requireActive(r: DirectoryRow, mode: 'active-only' | 'not-deleted'): Promise<void> {
    if (r.status === 'deleted' || (mode === 'active-only' && r.status !== 'active')) throw conflict('USER_NOT_ACTIVE', 'کاربر فعال نیست.');
  }

  // ───────── ساخت ─────────
  async create(actor: Actor, body: Body<'CreateUserBody'>) {
    const roles = [...new Set(body.roles ?? [])] as SystemRoleKey[];
    const grants = [...new Set(body.grants ?? [])];
    // D6/E2/NOT_FOUND پیش از ساخت حساب (تصمیم نهایی دوباره داخل تراکنش تخصیص است)
    await this.users.preflightAssign(actor.id, roles, grants);

    const lu = await this.low.createUser({ phone: body.phone, firstName: body.firstName, lastName: body.lastName, ...(body.password ? { password: body.password } : {}) });
    const now = this.clock.now();
    await this.ds.transaction(async (m) => {
      // upsert فوری؛ رویداد user.registered بعدی idempotent است و status را عوض نمی‌کند
      await m.query(
        `INSERT INTO user_directory (user_id, phone, first_name, last_name, status, perm_ver, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 1, ?, ?)
         ON DUPLICATE KEY UPDATE phone = VALUES(phone), first_name = VALUES(first_name), last_name = VALUES(last_name), status = 'active', updated_at = VALUES(updated_at)`,
        [uuidToBuf(lu.id), lu.phone, lu.firstName, lu.lastName, new Date(lu.createdAt), now]
      );
      await this.audit.write(m, {
        actor: await this.audit.actorOf(actor.id, m),
        action: 'user.create',
        target: { type: 'user', id: lu.id, label: displayName(lu.firstName, lu.lastName) },
        summary: `کاربر «${displayName(lu.firstName, lu.lastName)}» ساخته شد.`,
        meta: { roles, grants, withPassword: !!body.password }
      });
    });
    if (roles.length) await this.users.setRoles(actor.id, lu.id, roles);
    if (grants.length) await this.users.setGrants(actor.id, lu.id, grants);
    return this.detail(await this.users.mustRow(this.ds, lu.id), lu);
  }

  // ───────── ویرایش ─────────
  async update(actor: Actor, id: string, body: Body<'UpdateUserBody'>) {
    const row = await this.users.mustRow(this.ds, id);
    await this.requireActive(row, 'active-only');
    await this.guardTarget(actor, id);
    await this.low.updateUser(id, body);
    const lu = await this.soft(this.low.getUser(id), 'low.getUser');
    await this.ds.transaction(async (m) => {
      await m.query('UPDATE user_directory SET first_name = ?, last_name = ?, phone = ?, updated_at = ? WHERE user_id = ?', [
        lu?.firstName ?? body.firstName ?? row.first_name,
        lu?.lastName ?? body.lastName ?? row.last_name,
        lu?.phone ?? body.phone ?? row.phone,
        this.clock.now(),
        uuidToBuf(id)
      ]);
      await this.audit.write(m, {
        actor: await this.audit.actorOf(actor.id, m),
        action: 'user.update',
        target: { type: 'user', id, label: UsersAdminService.label(row) },
        summary: `اطلاعات «${UsersAdminService.label(row)}» ویرایش شد.`,
        meta: { fields: Object.keys(body) }
      });
    });
    return this.detail(await this.users.mustRow(this.ds, id), lu);
  }

  // ───────── حفاظت‌ها ─────────
  /** تعداد developerهای فعالِ غیر از target */
  private async otherActiveDevelopers(excludeId: string): Promise<number> {
    const r = (await this.ds.query("SELECT COUNT(*) AS n FROM user_system_roles r JOIN user_directory d ON d.user_id = r.user_id WHERE r.role_key = 'developer' AND d.status = 'active' AND r.user_id <> ?", [uuidToBuf(excludeId)])) as { n: string | number }[];
    return Number(r[0]?.n ?? 0);
  }

  private async protect(actor: Actor, id: string, kind: 'disable' | 'delete'): Promise<void> {
    if (actor.id === id) throw conflict('SELF_PROTECTED', 'نمی‌توانید حساب خودتان را غیرفعال یا حذف کنید.');
    const t = await this.rbac.access(id);
    if (t.roles.includes('developer') && (await this.otherActiveDevelopers(id)) === 0) throw conflict('LAST_HOLDER', 'آخرین توسعه‌دهندهٔ فعال سیستم را نمی‌توان غیرفعال یا حذف کرد.', { role: 'developer' });
    if (kind === 'delete') {
      // حذف نقش‌ها را هم می‌برد ⇒ آخرین دارندهٔ هر نقش قابل‌حذف نیست (D5)
      for (const r of t.roles) {
        const n = (await this.ds.query('SELECT COUNT(*) AS n FROM user_system_roles WHERE role_key = ? AND user_id <> ?', [r, uuidToBuf(id)])) as { n: string | number }[];
        if (Number(n[0]?.n ?? 0) === 0) throw conflict('LAST_HOLDER', `آخرین دارندهٔ نقش «${r}» را نمی‌توان حذف کرد.`, { role: r });
      }
    }
  }

  // ───────── وضعیت ─────────
  async setStatus(actor: Actor, id: string, status: 'active' | 'disabled') {
    const row = await this.users.mustRow(this.ds, id);
    await this.requireActive(row, 'not-deleted');
    await this.guardTarget(actor, id);
    if (status === 'disabled') await this.protect(actor, id, 'disable');
    await this.low.setStatus(id, { status });
    await this.ds.transaction(async (m) => {
      await m.query('UPDATE user_directory SET status = ?, updated_at = ? WHERE user_id = ?', [status, this.clock.now(), uuidToBuf(id)]);
      await this.audit.write(m, {
        actor: await this.audit.actorOf(actor.id, m),
        action: 'user.status_change',
        target: { type: 'user', id, label: UsersAdminService.label(row) },
        summary: `«${UsersAdminService.label(row)}» ${status === 'active' ? 'فعال' : 'غیرفعال'} شد.`,
        meta: { before: row.status, after: status }
      });
    });
    return this.detail(await this.users.mustRow(this.ds, id));
  }

  // ───────── حذف ─────────
  async remove(actor: Actor, id: string): Promise<void> {
    const row = await this.users.mustRow(this.ds, id);
    if (row.status === 'deleted') return; // idempotent
    await this.guardTarget(actor, id);
    await this.protect(actor, id, 'delete');
    await this.low.deleteUser(id);
    // شمارهٔ ناشناس را low تعیین کرده است؛ خواندنش ناموفق بود ⇒ جایگزین محلی (رویداد user.status.changed بعداً هم‌ترازش می‌کند)
    const lu = await this.soft(this.low.getUser(id), 'low.getUser');
    await this.anonymize(id, row, actor, lu && ANON.test(lu.phone) ? lu.phone : anonPhone(id));
  }

  /** ناشناس‌سازی محلی (همان اثر رویداد user.status.changed=deleted؛ هر دو idempotent) + audit */
  private async anonymize(id: string, row: DirectoryRow, actor: Actor, phone: string): Promise<void> {
    await this.ds.transaction(async (m) => {
      await this.applyDeleted(m, id, phone, this.clock.now());
      await this.audit.write(m, {
        actor: await this.audit.actorOf(actor.id, m),
        action: 'user.delete',
        target: { type: 'user', id, label: UsersAdminService.label(row) },
        summary: `کاربر «${UsersAdminService.label(row)}» حذف شد.`,
        meta: { before: row.status }
      });
    });
    this.rbac.invalidate();
  }

  /** اثر حذف در دایرکتوری: status/phone/نام + برداشتن نقش‌ها و grantها + claim تازه (فقط اگر چیزی برداشته شد). مشترک با رویداد low. */
  async applyDeleted(m: { query(sql: string, p?: unknown[]): Promise<any> }, id: string, phone: string, now: Date): Promise<void> {
    const buf = uuidToBuf(id);
    await m.query("UPDATE user_directory SET status = 'deleted', phone = ?, first_name = '', last_name = '', updated_at = ? WHERE user_id = ?", [phone, now, buf]);
    const r1 = (await m.query('DELETE FROM user_system_roles WHERE user_id = ?', [buf])) as { affectedRows?: number };
    const r2 = (await m.query('DELETE FROM user_grants WHERE user_id = ?', [buf])) as { affectedRows?: number };
    if ((r1.affectedRows ?? 0) + (r2.affectedRows ?? 0) > 0) await this.claims.publish(m, id);
    this.rbac.invalidate();
  }

  // ───────── رمز / خروج ─────────
  async setPassword(actor: Actor, id: string, body: Body<'UserPasswordBody'>): Promise<void> {
    const row = await this.users.mustRow(this.ds, id);
    await this.requireActive(row, 'not-deleted');
    await this.guardTarget(actor, id);
    await this.low.setPassword(id, body.action === 'set' ? { action: 'set', password: body.password } : { action: 'clear' });
    await this.audit.write(this.ds, {
      actor: await this.audit.actorOf(actor.id),
      action: body.action === 'set' ? 'user.password_set' : 'user.password_clear',
      target: { type: 'user', id, label: UsersAdminService.label(row) },
      summary: body.action === 'set' ? `رمز موقت برای «${UsersAdminService.label(row)}» تعیین شد.` : `رمز «${UsersAdminService.label(row)}» حذف شد.`,
      meta: {}
    });
  }

  async logoutAll(actor: Actor, id: string): Promise<void> {
    const row = await this.users.mustRow(this.ds, id);
    await this.requireActive(row, 'not-deleted');
    await this.guardTarget(actor, id);
    await this.low.logoutAll(id);
    await this.audit.write(this.ds, {
      actor: await this.audit.actorOf(actor.id),
      action: 'user.logout_all',
      target: { type: 'user', id, label: UsersAdminService.label(row) },
      summary: `«${UsersAdminService.label(row)}» از همهٔ نشست‌ها خارج شد.`,
      meta: {}
    });
  }

  // ───────── نشست‌ها ─────────
  async sessions(id: string, page: number, pageSize: number, currentSid?: string) {
    const r = await this.low.listSessions(id, { page, pageSize });
    return { ...r, items: r.items.map((s) => deviceSession(s, currentSid)) };
  }

  async revokeSession(actor: Actor, id: string, sessionId: string): Promise<void> {
    const row = await this.users.mustRow(this.ds, id);
    await this.guardTarget(actor, id);
    await this.low.revokeSession(id, sessionId);
    await this.audit.write(this.ds, {
      actor: await this.audit.actorOf(actor.id),
      action: 'user.session_revoke',
      target: { type: 'user', id, label: UsersAdminService.label(row) },
      summary: `یک نشست «${UsersAdminService.label(row)}» باطل شد.`,
      meta: { sessionId }
    });
  }
}

export function deviceSession(s: { id: string; deviceLabel: string; platform: 'web' | 'android'; client: string | null; ip: string; createdAt: string; lastActiveAt: string; revokedAt: string | null }, currentSid?: string) {
  return { id: s.id, deviceLabel: s.deviceLabel, platform: s.platform, client: s.client, ipMasked: maskIp(s.ip), createdAt: s.createdAt, lastActiveAt: s.lastActiveAt, revokedAt: s.revokedAt, current: !!currentSid && s.id === currentSid };
}
