import type { z } from 'zod';
import type { high } from '@isra/api-types';

/** کلیدها اکنون رشته‌اند (RBAC پویا)؛ اعتبار واقعی از DB می‌آید */
export type PermissionKey = z.infer<typeof high.PermissionKey>;
export type SystemRoleKey = z.infer<typeof high.SystemRoleKey>;
export type ModuleKey = z.infer<typeof high.ModuleKey>;
export type Grant = z.infer<typeof high.Grant>;
export type StepUpMode = 'required' | 'none';
export type Tier = z.infer<typeof high.Tier>;

export const DEVELOPER: SystemRoleKey = 'developer';
export const SUPER_ADMIN: SystemRoleKey = 'super_admin';
/** ۱.۷.۰ (docs-v2/31 §۱): نقش‌های ثابت سطح میانی/پایین */
export const TEACHER: SystemRoleKey = 'teacher';
export const GUEST: SystemRoleKey = 'guest';
export const QURAN_STUDENT: SystemRoleKey = 'quran_student';
/** نقش‌های ضمنی: قابل اختصاص نیستند (guest = بی‌توکن؛ quran_student = هر کاربر ثبت‌نام‌کرده) */
export const IMPLICIT_ROLES: readonly string[] = [GUEST, QURAN_STUDENT];
export const isImplicitRole = (key: string): boolean => IMPLICIT_ROLES.includes(key);
/** قفل آخرین دارنده (D5) فقط برای نقش‌های ثابت سطح بالا (teacher می‌تواند دارنده نداشته باشد) */
export const LAST_HOLDER_ROLES: readonly string[] = [DEVELOPER, SUPER_ADMIN];
/**
 * مجوز لازم برای مدیریت نقش per سطح (docs-v2/31 §۱): high ⇒ مجوز خودِ endpoint (system.permission.edit / system.role.manage /
 * system.stepup.manage)؛ mid ⇒ system.roles.mid.manage؛ low ⇒ system.roles.low.manage.
 */
export const TIER_MANAGE_PERMISSION: Readonly<Record<Exclude<Tier, 'high'>, PermissionKey>> = { mid: 'system.roles.mid.manage', low: 'system.roles.low.manage' };
export const tierManagePermission = (tier: Tier, highPermission: PermissionKey): PermissionKey => (tier === 'high' ? highPermission : TIER_MANAGE_PERMISSION[tier]);
/** نقش‌های سیستمیِ گزارش‌ها (`byRole`)؛ بقیهٔ نقش‌ها پویا هستند */
export const REPORT_ROLE_KEYS = ['developer', 'super_admin'] as const;

/** سقف مجموع مجوزها؛ تضمین می‌کند مجوز مؤثر هر کاربر از سقف ۲۵۶ claim در low بیشتر نشود (هرگز truncate بی‌صدا نیست) */
export const MAX_PERMISSIONS_TOTAL = 250;
/** `none` فیلتر `UsersQuery.role` است؛ کلید نقش نمی‌شود */
export const RESERVED_ROLE_KEYS: readonly string[] = ['none'];

/** فقط برای migrationهای قدیمی (InitSchema) و seed معیارهای ارزیابی؛ ۱.۷.۰ وزن‌ها ⇒ معیارهای پویا (H-100..H-103) */
export const DEFAULT_WEIGHTS = { voice: 40, tone: 30, tajweed: 30 } as const;
export const DEFAULT_THRESHOLDS = [50, 150, 300, 500] as const;
export const DEFAULT_FLAGS = { maintenance_mode: false, registration_open: true } as const;

/** مجوزهای قفل‌شدهٔ نقش (از DB خوانده می‌شود) که در ماتریس جدید نیستند */
export function missingLocked(locked: readonly PermissionKey[], next: readonly PermissionKey[]): PermissionKey[] {
  return locked.filter((p) => !next.includes(p));
}

/** فقط developer می‌تواند نقش developer را عوض کند (D6) */
export const touchesDeveloper = (before: readonly SystemRoleKey[], after: readonly SystemRoleKey[]): boolean => before.includes(DEVELOPER) !== after.includes(DEVELOPER);

export const sameSet = <T>(a: readonly T[], b: readonly T[]): boolean => a.length === b.length && a.every((x) => b.includes(x));
