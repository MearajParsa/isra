import type { z } from 'zod';
import type { high } from '@isra/api-types';

/** کلیدها اکنون رشته‌اند (RBAC پویا)؛ اعتبار واقعی از DB می‌آید */
export type PermissionKey = z.infer<typeof high.PermissionKey>;
export type SystemRoleKey = z.infer<typeof high.SystemRoleKey>;
export type ModuleKey = z.infer<typeof high.ModuleKey>;
export type Grant = z.infer<typeof high.Grant>;
export type StepUpMode = 'required' | 'none';

export const DEVELOPER: SystemRoleKey = 'developer';
export const SUPER_ADMIN: SystemRoleKey = 'super_admin';
/** نقش‌های سیستمیِ گزارش‌ها (`byRole`)؛ بقیهٔ نقش‌ها پویا هستند */
export const REPORT_ROLE_KEYS = ['developer', 'super_admin'] as const;

/** سقف مجموع مجوزها؛ تضمین می‌کند مجوز مؤثر هر کاربر از سقف ۲۵۶ claim در low بیشتر نشود (هرگز truncate بی‌صدا نیست) */
export const MAX_PERMISSIONS_TOTAL = 250;
/** `none` فیلتر `UsersQuery.role` است؛ کلید نقش نمی‌شود */
export const RESERVED_ROLE_KEYS: readonly string[] = ['none'];

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
