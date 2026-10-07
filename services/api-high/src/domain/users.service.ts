import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { high } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { toLatinDigits } from '../common/phone';
import { bufToUuid, isUuid, uuidToBuf } from '../common/ids';
import { startOfDayUtc, parseDay } from '../common/tehran';
import { AuditService } from './audit.service';
import { ClaimsService } from './claims.service';
import { type Q, conflict, displayName } from './db';
import { RbacService, type UserAccess } from './rbac.service';
import { DEVELOPER, type Grant, type SystemRoleKey, sameSet, touchesDeveloper } from './rules';
import { RegistryService } from './access/registry.service';
import { effectiveOfRoles, forbidden, invalid, requireHeld, requirePermissions, unique } from './access/write-helpers';

type UsersQuery = z.infer<typeof high.UsersQuery>;

interface Row {
  user_id: Buffer;
  phone: string;
  first_name: string;
  last_name: string;
  status: UserStatus;
  created_at: Date;
}

export type UserStatus = 'active' | 'disabled' | 'deleted';
export type DirectoryRow = Row;

/** ترتیب‌های مجاز (لیست سفید ثابت؛ ورودی کاربر هرگز در SQL نمی‌آید) */
const ORDER: Record<'newest' | 'oldest' | 'name', string> = {
  newest: 'd.created_at DESC, d.user_id DESC',
  oldest: 'd.created_at ASC, d.user_id ASC',
  name: "CONCAT(d.first_name, ' ', d.last_name) ASC, d.created_at DESC, d.user_id DESC"
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class UsersService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly claims: ClaimsService,
    private readonly registry: RegistryService
  ) {}

  dto(r: Row, a: Pick<UserAccess, 'roles' | 'grants'>) {
    return { id: bufToUuid(r.user_id), name: displayName(r.first_name, r.last_name), phone: r.phone, status: r.status, roles: a.roles, grants: a.grants, createdAt: r.created_at.toISOString() };
  }

  async row(q: Q, id: string): Promise<Row | null> {
    if (!isUuid(id)) return null;
    const rows = (await q.query('SELECT user_id, phone, first_name, last_name, status, created_at FROM user_directory WHERE user_id = ?', [uuidToBuf(id)])) as Row[];
    return rows[0] ?? null;
  }

  /** کاربر باید در دایرکتوری باشد (404) */
  async mustRow(q: Q, id: string): Promise<Row> {
    const r = await this.row(q, id);
    if (!r) throw new AppError('NOT_FOUND', { message: 'کاربر پیدا نشد.' });
    return r;
  }

  async get(id: string) {
    const r = await this.row(this.ds, id);
    if (!r) throw new AppError('NOT_FOUND', { message: 'کاربر پیدا نشد.' });
    return this.dto(r, await this.rbac.access(id));
  }

  /** WHERE پارامتری فیلترهای H-20 (مشترک با خروجی H-43) */
  filterWhere(q: UsersQuery): { clauses: string[]; args: unknown[] } {
    const where: string[] = [];
    const args: unknown[] = [];
    if (q.q) {
      const t = escapeLike(toLatinDigits(q.q));
      // q عددی ⇒ جست‌وجوی پیشوندی روی شماره (ایندکس یکتای phone؛ بدون full scan). «9…» ⇒ «09…»
      if (/^\d{2,11}$/.test(t)) (where.push('d.phone LIKE ?'), args.push(`${t.startsWith('9') ? `0${t}` : t}%`));
      else (where.push("CONCAT(d.first_name, ' ', d.last_name) LIKE ?"), args.push(`%${t}%`));
    }
    if (q.status) (where.push('d.status = ?'), args.push(q.status));
    if (q.grant === 'none') where.push('NOT EXISTS (SELECT 1 FROM user_grants g WHERE g.user_id = d.user_id)');
    else if (q.grant) (where.push('EXISTS (SELECT 1 FROM user_grants g WHERE g.user_id = d.user_id AND g.grant_key = ?)'), args.push(q.grant));
    const from = q.createdFrom ? parseDay(q.createdFrom) : null;
    const to = q.createdTo ? parseDay(q.createdTo) : null;
    if (from !== null) (where.push('d.created_at >= ?'), args.push(startOfDayUtc(from)));
    if (to !== null) (where.push('d.created_at < ?'), args.push(startOfDayUtc(to + 86_400_000)));
    if (q.role === 'none') where.push('NOT EXISTS (SELECT 1 FROM user_system_roles x WHERE x.user_id = d.user_id)');
    else if (q.role) (where.push('EXISTS (SELECT 1 FROM user_system_roles x WHERE x.user_id = d.user_id AND x.role_key = ?)'), args.push(q.role));
    return { clauses: where, args };
  }

  /** نقش‌ها/grantهای چند کاربر با دو query (بدون N+1) */
  async rolesAndGrants(ids: Buffer[]): Promise<{ roles: Map<string, SystemRoleKey[]>; grants: Map<string, Grant[]> }> {
    const roles = new Map<string, SystemRoleKey[]>();
    const grants = new Map<string, Grant[]>();
    if (!ids.length) return { roles, grants };
    const ph = ids.map(() => '?').join(',');
    const [r, g] = await Promise.all([
      this.ds.query(`SELECT user_id, role_key FROM user_system_roles WHERE user_id IN (${ph}) ORDER BY role_key`, ids) as Promise<{ user_id: Buffer; role_key: SystemRoleKey }[]>,
      this.ds.query(`SELECT user_id, grant_key FROM user_grants WHERE user_id IN (${ph}) ORDER BY grant_key`, ids) as Promise<{ user_id: Buffer; grant_key: Grant }[]>
    ]);
    for (const x of r) roles.set(x.user_id.toString('hex'), [...(roles.get(x.user_id.toString('hex')) ?? []), x.role_key]);
    for (const x of g) grants.set(x.user_id.toString('hex'), [...(grants.get(x.user_id.toString('hex')) ?? []), x.grant_key]);
    return { roles, grants };
  }

  /** جست‌وجو روی نام یا شماره (ارقام فارسی هم)؛ فیلتر نقش یا `none`؛ بدون N+1 (نقش/grant دسته‌ای) */
  async list(q: UsersQuery & { page: number; pageSize: number }) {
    const { clauses: where, args } = this.filterWhere(q);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows, cnt] = await Promise.all([
      this.ds.query(`SELECT d.user_id, d.phone, d.first_name, d.last_name, d.status, d.created_at FROM user_directory d ${w} ORDER BY ${ORDER[q.sort ?? 'newest']} LIMIT ? OFFSET ?`, [...args, q.pageSize, (q.page - 1) * q.pageSize]) as Promise<Row[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM user_directory d ${w}`, args) as Promise<{ n: string | number }[]>
    ]);
    const { roles: rm, grants: gm } = await this.rolesAndGrants(rows.map((r) => r.user_id));
    return {
      items: rows.map((r) => this.dto(r, { roles: rm.get(r.user_id.toString('hex')) ?? [], grants: gm.get(r.user_id.toString('hex')) ?? [] })),
      page: q.page,
      pageSize: q.pageSize,
      total: Number(cnt[0]?.n ?? 0)
    };
  }

  /** پیش‌بررسی (پیش از ساخت حساب در low): نقش/grant موجود و E2/D6؛ تصمیم نهایی دوباره داخل تراکنش است */
  async preflightAssign(actorId: string, roles: readonly SystemRoleKey[], grants: readonly Grant[]): Promise<void> {
    if (!roles.length && !grants.length) return;
    const [actor, snap] = await Promise.all([this.rbac.access(actorId), this.registry.snapshot()]);
    const need: string[] = [];
    for (const r of roles) {
      const role = snap.roles.find((x) => x.key === r);
      if (!role) throw new AppError('NOT_FOUND', { message: 'نقش پیدا نشد.', details: { missing: [r] } });
      if (r === DEVELOPER && !actor.roles.includes(DEVELOPER)) throw forbidden('فقط توسعه‌دهنده می‌تواند نقش توسعه‌دهنده بدهد.');
      need.push(...role.effectivePermissions);
    }
    for (const g of grants) {
      const p = snap.permissions.find((x) => x.key === g);
      if (!p) throw new AppError('NOT_FOUND', { message: 'مجوز پیدا نشد.', details: { missing: [g] } });
      if (!p.grantable) throw invalid('grants', `مجوز «${g}» مستقیم قابل‌دادن نیست.`);
      need.push(g);
    }
    requireHeld(actor, need, 'این تخصیص');
  }

  /**
   * تخصیص/برداشتن نقش سیستم:
   *  - D6/E3: تغییر نقش developer فقط با developer
   *  - E2: نقش افزوده‌شده باید همهٔ مجوزهای مؤثرش را خودِ کاربر داشته باشد (developer معاف)؛ نقش ناموجود ⇒ NOT_FOUND
   *  - D5: قفل آخرین دارندهٔ نقش‌های سیستمی (نقش پویا بدون دارنده مجاز است تا حذفش ممکن شود)
   *  - اثر: audit + permVer + `system.role.changed` (همه در یک تراکنش)
   */
  async setRoles(actorId: string, targetId: string, roles: readonly SystemRoleKey[]) {
    const next = unique(roles).sort();
    await this.rbac.write(async (m) => {
      const target = await this.mustRow(m, targetId);
      if (target.status === 'deleted') throw conflict('USER_NOT_ACTIVE', 'کاربر حذف‌شده است.');
      const defs = (await m.query('SELECT role_key, title, undeletable FROM system_roles ORDER BY role_key FOR UPDATE')) as { role_key: string; title: string; undeletable: number }[];
      const missingRoles = next.filter((r) => !defs.some((d) => d.role_key === r));
      if (missingRoles.length) throw new AppError('NOT_FOUND', { message: 'نقش پیدا نشد.', details: { missing: missingRoles } });
      const cur = (await m.query('SELECT role_key FROM user_system_roles WHERE user_id = ? FOR UPDATE', [uuidToBuf(targetId)])) as { role_key: SystemRoleKey }[];
      const before = cur.map((r) => r.role_key).sort();
      if (sameSet(before, next)) return;
      const actor = await this.rbac.access(actorId, m);
      if (touchesDeveloper(before, next) && !actor.roles.includes(DEVELOPER)) throw forbidden('فقط توسعه‌دهنده می‌تواند نقش توسعه‌دهنده را تغییر دهد.');
      const added = next.filter((x) => !before.includes(x));
      const removed = before.filter((x) => !next.includes(x));
      requireHeld(actor, await effectiveOfRoles(m, added), 'تخصیص این نقش');
      // E2 روی برداشتن هم (docs-v2/30 §۳ امنیت ۲): نقشی را که همهٔ مجوزهایش را ندارید نمی‌توانید بردارید
      requireHeld(actor, await effectiveOfRoles(m, removed), 'برداشتن این نقش');
      for (const r of removed) {
        const def = defs.find((d) => d.role_key === r);
        if (!def?.undeletable) continue;
        const h = (await m.query('SELECT COUNT(*) AS n FROM (SELECT user_id FROM user_system_roles WHERE role_key = ? FOR UPDATE) h', [r])) as { n: string | number }[];
        if (Number(h[0]?.n ?? 0) - 1 < 1) throw conflict('LAST_HOLDER', `«${def.title}» باید دست‌کم یک دارنده داشته باشد.`, { role: r });
      }
      const now = this.clock.now();
      for (const r of removed) await m.query('DELETE FROM user_system_roles WHERE user_id = ? AND role_key = ?', [uuidToBuf(targetId), r]);
      for (const r of added) await m.query('INSERT INTO user_system_roles (user_id, role_key, granted_by, granted_at) VALUES (?, ?, ?, ?)', [uuidToBuf(targetId), r, uuidToBuf(actorId), now]);
      const permVer = await this.claims.publish(m, targetId);
      await this.audit.write(m, {
        actor: await this.audit.actorOf(actorId, m),
        action: 'user.roles.updated',
        target: { type: 'user', id: targetId, label: displayName(target.first_name, target.last_name) },
        summary: `نقش‌های سیستمی «${displayName(target.first_name, target.last_name)}» تغییر کرد.`,
        meta: { before, after: next, permVer }
      });
    });
    return this.get(targetId);
  }

  /** grant مستقیم: فقط مجوز `grantable` (NOT_FOUND برای ناموجود، VALIDATION_FAILED برای غیرقابل‌دادن)؛ E2 روی grantهای افزوده */
  async setGrants(actorId: string, targetId: string, grants: readonly Grant[]) {
    const next = unique(grants).sort();
    await this.rbac.write(async (m) => {
      const target = await this.mustRow(m, targetId);
      if (target.status === 'deleted') throw conflict('USER_NOT_ACTIVE', 'کاربر حذف‌شده است.');
      const defs = await requirePermissions(m, next);
      const bad = next.filter((g) => !defs.get(g)!.grantable);
      if (bad.length) throw invalid('grants', `مجوز «${bad[0]}» مستقیم قابل‌دادن نیست.`);
      const cur = (await m.query('SELECT grant_key FROM user_grants WHERE user_id = ? FOR UPDATE', [uuidToBuf(targetId)])) as { grant_key: Grant }[];
      const before = cur.map((c) => c.grant_key).sort();
      const added = next.filter((x) => !before.includes(x));
      requireHeld(await this.rbac.access(actorId, m), added, 'دادن این مجوزها');
      if (sameSet(before, next)) return;
      const now = this.clock.now();
      await m.query('DELETE FROM user_grants WHERE user_id = ?', [uuidToBuf(targetId)]);
      for (const g of next) await m.query('INSERT INTO user_grants (user_id, grant_key, granted_by, granted_at) VALUES (?, ?, ?, ?)', [uuidToBuf(targetId), g, uuidToBuf(actorId), now]);
      const permVer = await this.claims.publish(m, targetId);
      await this.audit.write(m, {
        actor: await this.audit.actorOf(actorId, m),
        action: 'user.grants.updated',
        target: { type: 'user', id: targetId, label: displayName(target.first_name, target.last_name) },
        summary: `مجوزهای مستقیم «${displayName(target.first_name, target.last_name)}» تغییر کرد.`,
        meta: { before, after: next, permVer }
      });
    });
    return this.get(targetId);
  }

  async stats() {
    const r = (await this.ds.query('SELECT (SELECT COUNT(*) FROM user_directory) AS total, (SELECT COUNT(DISTINCT user_id) FROM user_system_roles) AS admins')) as { total: string | number; admins: string | number }[];
    return { total: Number(r[0]?.total ?? 0), admins: Number(r[0]?.admins ?? 0) };
  }
}

