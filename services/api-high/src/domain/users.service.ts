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
import { type Q, conflict, displayName, withRetry } from './db';
import { RbacService, type UserAccess } from './rbac.service';
import { type Grant, ROLE_KEYS, type SystemRoleKey, sameSet, touchesDeveloper } from './rules';

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
    private readonly claims: ClaimsService
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

  /** جست‌وجو روی نام یا شماره (ارقام فارسی هم)؛ فیلتر نقش یا `none`؛ بدون N+1 (نقش/grant دسته‌ای) */
  async list(q: UsersQuery & { page: number; pageSize: number }) {
    const where: string[] = [];
    const args: unknown[] = [];
    if (q.q) {
      const t = escapeLike(toLatinDigits(q.q));
      where.push("(CONCAT(d.first_name, ' ', d.last_name) LIKE ? OR d.phone LIKE ?)");
      args.push(`%${t}%`, `%${t}%`);
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
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows, cnt] = await Promise.all([
      this.ds.query(`SELECT d.user_id, d.phone, d.first_name, d.last_name, d.status, d.created_at FROM user_directory d ${w} ORDER BY ${ORDER[q.sort ?? 'newest']} LIMIT ? OFFSET ?`, [...args, q.pageSize, (q.page - 1) * q.pageSize]) as Promise<Row[]>,
      this.ds.query(`SELECT COUNT(*) AS n FROM user_directory d ${w}`, args) as Promise<{ n: string | number }[]>
    ]);
    const ids = rows.map((r) => r.user_id);
    const ph = ids.map(() => '?').join(',');
    const [roles, grants] = ids.length
      ? await Promise.all([
          this.ds.query(`SELECT user_id, role_key FROM user_system_roles WHERE user_id IN (${ph}) ORDER BY role_key`, ids) as Promise<{ user_id: Buffer; role_key: SystemRoleKey }[]>,
          this.ds.query(`SELECT user_id, grant_key FROM user_grants WHERE user_id IN (${ph})`, ids) as Promise<{ user_id: Buffer; grant_key: Grant }[]>
        ])
      : [[], []];
    const by = <T extends { user_id: Buffer }>(xs: T[]) => {
      const m = new Map<string, T[]>();
      for (const x of xs) m.set(x.user_id.toString('hex'), [...(m.get(x.user_id.toString('hex')) ?? []), x]);
      return m;
    };
    const rm = by(roles);
    const gm = by(grants);
    return {
      items: rows.map((r) => this.dto(r, { roles: (rm.get(r.user_id.toString('hex')) ?? []).map((x) => x.role_key), grants: (gm.get(r.user_id.toString('hex')) ?? []).map((x) => x.grant_key) })),
      page: q.page,
      pageSize: q.pageSize,
      total: Number(cnt[0]?.n ?? 0)
    };
  }

  /**
   * تخصیص/برداشتن نقش سیستم:
   *  - D6: تغییر نقش developer فقط با developer
   *  - D5: قفل آخرین دارنده — شمارش دارندگان داخل تراکنش و با قفل ردیف‌ها ⇒ دو ادمین هم‌زمان نمی‌توانند آخرین دارنده را بردارند
   *  - اثر: audit + permVer + `system.role.changed`
   */
  async setRoles(actorId: string, actorRoles: readonly SystemRoleKey[], targetId: string, roles: readonly SystemRoleKey[]) {
    const next = [...new Set(roles)].sort() as SystemRoleKey[];
    await withRetry(() =>
      this.ds.transaction(async (m) => {
        const target = await this.mustRow(m, targetId);
        if (target.status === 'deleted') throw conflict('USER_NOT_ACTIVE', 'کاربر حذف‌شده است.');
        // قفل همهٔ ردیف‌های نقش‌های سیستمی (ترتیب ثابت ⇒ بدون deadlock بین دو تراکنش)
        const locked = (await m.query('SELECT user_id, role_key FROM user_system_roles ORDER BY role_key, user_id FOR UPDATE')) as { user_id: Buffer; role_key: SystemRoleKey }[];
        const before = locked.filter((r) => r.user_id.equals(uuidToBuf(targetId))).map((r) => r.role_key).sort() as SystemRoleKey[];
        if (sameSet(before, next)) return;

        if (touchesDeveloper(before, next) && !actorRoles.includes('developer')) throw new AppError('AUTH_FORBIDDEN', { message: 'فقط توسعه‌دهنده می‌تواند نقش توسعه‌دهنده را تغییر دهد.' });
        for (const r of before.filter((x) => !next.includes(x))) {
          const holders = locked.filter((x) => x.role_key === r).length;
          if (holders - 1 < 1) throw conflict('LAST_HOLDER', `«${r === 'developer' ? 'توسعه‌دهنده' : 'مدیر کل'}» باید دست‌کم یک دارنده داشته باشد.`, { role: r });
        }

        const now = this.clock.now();
        for (const r of before.filter((x) => !next.includes(x))) await m.query('DELETE FROM user_system_roles WHERE user_id = ? AND role_key = ?', [uuidToBuf(targetId), r]);
        for (const r of next.filter((x) => !before.includes(x))) await m.query('INSERT INTO user_system_roles (user_id, role_key, granted_by, granted_at) VALUES (?, ?, ?, ?)', [uuidToBuf(targetId), r, uuidToBuf(actorId), now]);
        const permVer = await this.claims.publish(m, targetId);
        await this.audit.write(m, {
          actor: await this.audit.actorOf(actorId, m),
          action: 'user.roles.updated',
          target: { type: 'user', id: targetId, label: displayName(target.first_name, target.last_name) },
          summary: `نقش‌های سیستمی «${displayName(target.first_name, target.last_name)}» تغییر کرد.`,
          meta: { before, after: next, permVer }
        });
      })
    );
    return this.get(targetId);
  }

  async setGrants(actorId: string, targetId: string, grants: readonly Grant[]) {
    const next = [...new Set(grants)].sort() as Grant[];
    await withRetry(() =>
      this.ds.transaction(async (m) => {
        const target = await this.mustRow(m, targetId);
        if (target.status === 'deleted') throw conflict('USER_NOT_ACTIVE', 'کاربر حذف‌شده است.');
        const cur = (await m.query('SELECT grant_key FROM user_grants WHERE user_id = ? FOR UPDATE', [uuidToBuf(targetId)])) as { grant_key: Grant }[];
        const before = cur.map((c) => c.grant_key).sort() as Grant[];
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
      })
    );
    return this.get(targetId);
  }

  async stats() {
    const r = (await this.ds.query('SELECT (SELECT COUNT(*) FROM user_directory) AS total, (SELECT COUNT(DISTINCT user_id) FROM user_system_roles) AS admins')) as { total: string | number; admins: string | number }[];
    return { total: Number(r[0]?.total ?? 0), admins: Number(r[0]?.admins ?? 0) };
  }
}

export { ROLE_KEYS };
