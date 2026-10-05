import { AppError } from '../../common/app-error';
import { type Q, conflict } from '../db';
import type { UserAccess } from './policy';
import { missingForActor } from './policy';

export const unique = <T>(xs: readonly T[]): T[] => [...new Set(xs)];
export const ph = (n: number): string => Array.from({ length: n }, () => '?').join(',');
export const isDupKey = (e: unknown): boolean => ((e as { errno?: number; driverError?: { errno?: number } }).errno ?? (e as { driverError?: { errno?: number } }).driverError?.errno) === 1062;

export const keyTaken = (what: string): AppError => conflict('KEY_TAKEN', `این کلید ${what} قبلاً استفاده شده است.`, { field: 'key' });
export const systemProtected = (what: string): AppError => conflict('SYSTEM_PROTECTED', `${what} سیستمی است و قابل این اقدام نیست.`);
export const forbidden = (message: string, details?: Record<string, unknown>): AppError => new AppError('AUTH_FORBIDDEN', { message, ...(details ? { details } : {}) });
export const invalid = (field: string, message: string): AppError => new AppError('VALIDATION_FAILED', { details: { fields: { [field]: message } } });
export const developerImmutable = (): AppError => forbidden('نقش توسعه‌دهنده ثابت است و قابل تغییر نیست.');

/** E2 (ضد ارتقا): کاربر فقط چیزی را می‌دهد که خودش (همهٔ مجوزهای مؤثرش) دارد؛ developer معاف */
export function requireHeld(actor: Pick<UserAccess, 'roles' | 'permissions'>, needed: Iterable<string>, what: string): void {
  const missing = missingForActor(actor, needed);
  if (missing.length) throw forbidden(`شما همهٔ مجوزهای لازم برای ${what} را ندارید.`, { missing });
}

/** مجوزها باید موجود باشند (NOT_FOUND)؛ قفل اشتراکی ردیف‌ها تا هم‌زمان حذف نشوند */
export async function requirePermissions(m: Q, keys: readonly string[]): Promise<Map<string, { grantable: boolean; isSystem: boolean }>> {
  const out = new Map<string, { grantable: boolean; isSystem: boolean }>();
  if (keys.length === 0) return out;
  const rows = (await m.query(`SELECT permission_key, grantable, is_system FROM permissions WHERE permission_key IN (${ph(keys.length)}) LOCK IN SHARE MODE`, [...keys])) as { permission_key: string; grantable: number; is_system: number }[];
  for (const r of rows) out.set(r.permission_key, { grantable: !!r.grantable, isSystem: !!r.is_system });
  const missing = keys.filter((k) => !out.has(k));
  if (missing.length) throw new AppError('NOT_FOUND', { message: 'مجوز پیدا نشد.', details: { missing } });
  return out;
}

export async function requireModules(m: Q, keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  const rows = (await m.query(`SELECT module_key FROM system_modules WHERE module_key IN (${ph(keys.length)}) LOCK IN SHARE MODE`, [...keys])) as { module_key: string }[];
  const have = new Set(rows.map((r) => r.module_key));
  const missing = keys.filter((k) => !have.has(k));
  if (missing.length) throw new AppError('NOT_FOUND', { message: 'ماژول پیدا نشد.', details: { missing } });
}

export async function permissionsOfModules(m: Q, modules: readonly string[]): Promise<string[]> {
  if (modules.length === 0) return [];
  const rows = (await m.query(`SELECT permission_key FROM permissions WHERE module_key IN (${ph(modules.length)})`, [...modules])) as { permission_key: string }[];
  return rows.map((r) => r.permission_key);
}

export interface RoleLock {
  key: string;
  title: string;
  undeletable: boolean;
}
/** قفل ردیف نقش؛ ناموجود ⇒ NOT_FOUND */
export async function lockRole(m: Q, key: string): Promise<RoleLock> {
  const r = (await m.query('SELECT role_key, title, undeletable FROM system_roles WHERE role_key = ? FOR UPDATE', [key])) as { role_key: string; title: string; undeletable: number }[];
  if (!r[0]) throw new AppError('NOT_FOUND', { message: 'نقش پیدا نشد.' });
  return { key: r[0].role_key, title: r[0].title, undeletable: !!r[0].undeletable };
}

/** مجوزهای مؤثر مجموعه‌ای از نقش‌ها (صریح ∪ ماژول) — برای ضد ارتقا هنگام تخصیص نقش */
export async function effectiveOfRoles(m: Q, roles: readonly string[]): Promise<string[]> {
  if (roles.length === 0) return [];
  const rows = (await m.query(
    `SELECT permission_key AS k FROM role_permissions WHERE role_key IN (${ph(roles.length)})
     UNION SELECT p.permission_key FROM role_modules rm JOIN permissions p ON p.module_key = rm.module_key WHERE rm.role_key IN (${ph(roles.length)})`,
    [...roles, ...roles]
  )) as { k: string }[];
  return rows.map((r) => r.k);
}
