import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock';
import { bufToUuid, uuidToBuf } from '../common/ids';
import { TtlLru } from './access/lru';
import { type AccessRow, type StepUpPolicy, type UserAccess, accessFromRows, ruleKey } from './access/policy';
import { type Q, withRetry } from './db';
import type { PermissionKey, StepUpMode, SystemRoleKey } from './rules';

export type { UserAccess } from './access/policy';

const TTL_MS = 5_000;
const MAX_USERS = 2_000;

/**
 * منبع حقیقت نقش/مجوز سیستمی (DB این سرویس؛ docs-v2/27):
 *  - `access(userId)`: یک query تجمیعی (نقش‌ها + مجوز صریح + ماژول + grant) با کش LRU حافظه (≤۲۰۰۰ کاربر، TTL ۵ ثانیه)
 *  - هر نوشتن محلی (`write()`) پس از commit کش را باطل می‌کند (شمارندهٔ `gen`)؛ instance دیگر حداکثر ۵ ثانیه کهنه می‌ماند
 *  - داخل تراکنش (q ≠ ds) همیشه مستقیم از DB خوانده می‌شود (هرگز کش)
 */
@Injectable()
export class RbacService {
  private gen = 0;
  private readonly users: TtlLru<UserAccess>;
  private policyCache?: { v: StepUpPolicy; exp: number; gen: number };

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock
  ) {
    this.users = new TtlLru<UserAccess>(MAX_USERS, TTL_MS, () => this.clock.now().getTime());
  }

  /** شمارندهٔ باطل‌سازی؛ کش‌های وابسته (رجیستری/ماتریس) با آن هم‌گام می‌شوند */
  get generation(): number {
    return this.gen;
  }

  invalidate(): void {
    this.gen++;
    this.users.clear();
    this.policyCache = undefined;
  }

  /**
   * تراکنش نوشتن RBAC: قفل سراسری ردیف `rbac_meta` در ابتدا ⇒ همهٔ نوشتن‌های ماتریس/نقش/grant پشت‌سرهم اجرا می‌شوند
   * (TOCTOU روی ضد-ارتقا، قفل آخرین دارنده، سقف مجوزها و ترتیب قفل یکسان؛ نوشتن‌ها نادر و ≤۳۰/دقیقه per کاربرند).
   * retry روی deadlock + باطل‌سازی کش پس از commit (در خطا هم، بی‌ضرر).
   */
  async write<T>(fn: (m: Q) => Promise<T>): Promise<T> {
    try {
      return await withRetry(() =>
        this.ds.transaction(async (m) => {
          await m.query('SELECT version FROM rbac_meta WHERE id = 1 FOR UPDATE');
          return fn(m);
        })
      );
    } finally {
      this.invalidate();
    }
  }

  /** افزایش نسخهٔ ماتریس داخل تراکنش (ETag/کش)؛ آخرین نوشتن پیش از commit تا قفل ردیف کوتاه بماند */
  async bump(m: Q): Promise<void> {
    await m.query('UPDATE rbac_meta SET version = version + 1 WHERE id = 1');
  }

  async version(q: Q = this.ds): Promise<number> {
    const r = (await q.query('SELECT version FROM rbac_meta WHERE id = 1')) as { version: string | number }[];
    return Number(r[0]?.version ?? 1);
  }

  async access(userId: string, q: Q = this.ds): Promise<UserAccess> {
    const id = userId.toLowerCase();
    if (q !== this.ds) return (await this.accessMany([id], q)).get(id)!;
    const hit = this.users.get(id);
    if (hit) return hit;
    const gen = this.gen;
    const a = (await this.accessMany([id], q)).get(id)!;
    if (gen === this.gen) this.users.set(id, a);
    return a;
  }

  /** دسترسی مؤثر چند کاربر با یک query (بدون کش؛ برای انتشار claim دسته‌ای) */
  accessMany(userIds: readonly string[], q: Q = this.ds): Promise<Map<string, UserAccess>> {
    return queryAccess(q, userIds);
  }

  /** سیاست step-up (پیش‌فرض مجوزها + overrideهای نقش): کش TTL ۵ ثانیه + باطل‌سازی محلی */
  async policy(q: Q = this.ds): Promise<StepUpPolicy> {
    const now = this.clock.now().getTime();
    const c = this.policyCache;
    if (q === this.ds && c && c.exp > now && c.gen === this.gen) return c.v;
    const gen = this.gen;
    const [perms, rules] = (await Promise.all([q.query('SELECT permission_key, step_up FROM permissions'), q.query('SELECT role_key, permission_key, mode FROM role_step_up')])) as [
      { permission_key: PermissionKey; step_up: StepUpMode }[],
      { role_key: SystemRoleKey; permission_key: PermissionKey; mode: StepUpMode }[]
    ];
    const v: StepUpPolicy = { permDefault: new Map(perms.map((p) => [p.permission_key, p.step_up])), roleRules: new Map(rules.map((r) => [ruleKey(r.role_key, r.permission_key), r.mode])) };
    if (q === this.ds && gen === this.gen) this.policyCache = { v, exp: now + TTL_MS, gen };
    return v;
  }

  /** دارندگان نقش(ها) (برای انتشار claim)؛ بدون تکرار */
  async holders(roleKeys: SystemRoleKey | readonly SystemRoleKey[], q: Q = this.ds): Promise<string[]> {
    const keys = typeof roleKeys === 'string' ? [roleKeys] : [...roleKeys];
    if (keys.length === 0) return [];
    const rows = (await q.query(`SELECT DISTINCT user_id FROM user_system_roles WHERE role_key IN (${keys.map(() => '?').join(',')})`, keys)) as { user_id: Buffer }[];
    return rows.map((r) => bufToUuid(r.user_id));
  }
}

/** دسترسی مؤثر چند کاربر با یک query تجمیعی (نقش + صریح + ماژول + grant + وضعیت دایرکتوری)؛ مستقل از DI (migration هم استفاده می‌کند) */
export async function queryAccess(q: Q, userIds: readonly string[]): Promise<Map<string, UserAccess>> {
  if (userIds.length === 0) return new Map();
  userIds = userIds.map((u) => u.toLowerCase());
  const ids = userIds.map(uuidToBuf);
  const ph = ids.map(() => '?').join(',');
  const rows = (await q.query(
    `SELECT ur.user_id AS uid, 'r' AS t, ur.role_key AS role, NULL AS ref, NULL AS perm FROM user_system_roles ur WHERE ur.user_id IN (${ph})
     UNION ALL
     SELECT ur.user_id, 'p', ur.role_key, rp.role_key, rp.permission_key FROM user_system_roles ur JOIN role_permissions rp ON rp.role_key = ur.role_key WHERE ur.user_id IN (${ph})
     UNION ALL
     SELECT ur.user_id, 'm', ur.role_key, p.module_key, p.permission_key FROM user_system_roles ur JOIN role_modules rm ON rm.role_key = ur.role_key JOIN permissions p ON p.module_key = rm.module_key WHERE ur.user_id IN (${ph})
     UNION ALL
     SELECT g.user_id, 'g', NULL, NULL, g.grant_key FROM user_grants g WHERE g.user_id IN (${ph})
     UNION ALL
     SELECT d.user_id, 's', NULL, d.status, NULL FROM user_directory d WHERE d.user_id IN (${ph})`,
    [...ids, ...ids, ...ids, ...ids, ...ids]
  )) as (Omit<AccessRow, 'uid'> & { uid: Buffer })[];
  return accessFromRows(
    userIds,
    rows.map((r) => ({ ...r, uid: bufToUuid(r.uid) }))
  );
}
