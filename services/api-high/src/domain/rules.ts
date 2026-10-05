import type { z } from 'zod';
import type { high } from '@isra/api-types';

export type PermissionKey = z.infer<typeof high.PermissionKey>;
export type SystemRoleKey = z.infer<typeof high.SystemRoleKey>;
export type Grant = z.infer<typeof high.Grant>;

export const ROLE_KEYS: readonly SystemRoleKey[] = ['developer', 'super_admin'];

export const ALL_PERMISSIONS: readonly PermissionKey[] = [
  'system.users.view',
  'system.users.manage',
  'system.role.assign',
  'system.permission.edit',
  'system.settings.view',
  'system.settings.edit',
  'system.audit.view',
  'system.sessions.view',
  'system.sessions.manage',
  'system.reports.view',
  'session.create'
];

export const PERMISSION_TITLES: Record<PermissionKey, { title: string; group: 'system' | 'session' }> = {
  'system.users.view': { title: 'دیدن کاربران', group: 'system' },
  'system.users.manage': { title: 'مدیریت کاربران (ساخت، ویرایش، غیرفعال‌سازی، حذف، رمز و نشست‌ها)', group: 'system' },
  'system.role.assign': { title: 'تخصیص و برداشتن نقش سیستم و مجوز کاربر', group: 'system' },
  'system.permission.edit': { title: 'ویرایش ماتریس مجوز نقش‌ها', group: 'system' },
  'system.settings.view': { title: 'دیدن تنظیمات سراسری', group: 'system' },
  'system.settings.edit': { title: 'ویرایش تنظیمات سراسری', group: 'system' },
  'system.audit.view': { title: 'دیدن گزارش اقدام‌ها', group: 'system' },
  'system.sessions.view': { title: 'دیدن همهٔ جلسه‌ها (اعضا، حضور، صف و ارزیابی)', group: 'system' },
  'system.sessions.manage': { title: 'مدیریت جلسه‌ها (ساخت، ویرایش، حذف و اعضا)', group: 'system' },
  'system.reports.view': { title: 'دیدن گزارش‌های تحلیلی', group: 'system' },
  'session.create': { title: 'ساخت جلسه', group: 'session' }
};

/** مجوزهای قفل‌شدهٔ هر نقش (قابل حذف نیستند)؛ developer همه‌چیز قفل و ثابت است */
export const LOCKED: Record<SystemRoleKey, readonly PermissionKey[]> = {
  developer: ALL_PERMISSIONS,
  super_admin: ['system.users.view', 'system.role.assign', 'system.permission.edit', 'system.audit.view']
};

export const DEFAULT_ROLE_PERMS: Record<SystemRoleKey, readonly PermissionKey[]> = {
  developer: ALL_PERMISSIONS,
  super_admin: ['system.users.view', 'system.role.assign', 'system.permission.edit', 'system.settings.view', 'system.settings.edit', 'system.audit.view', 'system.sessions.view', 'system.reports.view', 'session.create']
};

export const ROLE_TEXT: Record<SystemRoleKey, { title: string; description: string }> = {
  developer: { title: 'توسعه‌دهنده', description: 'دسترسی فنی کامل؛ ماتریس مجوز این نقش ثابت است و حذف نمی‌شود.' },
  super_admin: { title: 'مدیر کل', description: 'مدیریت سیستم، کاربران و تنظیمات سراسری؛ مجوزهای قفل‌شده قابل حذف نیستند.' }
};

export const DEFAULT_WEIGHTS = { voice: 40, tone: 30, tajweed: 30 } as const;
export const DEFAULT_THRESHOLDS = [50, 150, 300, 500] as const;
export const DEFAULT_FLAGS = { maintenance_mode: false, registration_open: true } as const;

/** ماتریس جدید: مجوز قفل‌شده باید بماند (developer ثابت است و جدا بررسی می‌شود) */
export function missingLocked(role: SystemRoleKey, next: readonly PermissionKey[]): PermissionKey[] {
  return LOCKED[role].filter((p) => !next.includes(p));
}

/** فقط developer می‌تواند نقش developer را عوض کند (D6) */
export const touchesDeveloper = (before: readonly SystemRoleKey[], after: readonly SystemRoleKey[]): boolean => before.includes('developer') !== after.includes('developer');

export const sameSet = <T>(a: readonly T[], b: readonly T[]): boolean => a.length === b.length && a.every((x) => b.includes(x));
