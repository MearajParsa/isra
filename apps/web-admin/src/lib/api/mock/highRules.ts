/** قواعد خالص high (بدون وابستگی مرورگر) — قابل تست */
import type { EvalWeights, Grant, PermissionKey, SettingsInput, SystemRoleKey } from '../high-types';

export const ALL_PERMISSIONS: PermissionKey[] = [
  'system.users.view',
  'system.role.assign',
  'system.permission.edit',
  'system.settings.view',
  'system.settings.edit',
  'system.audit.view',
  'session.create'
];

/** مجوزهای قفل‌شده per نقش (قابل حذف نیستند) */
export const LOCKED: Record<SystemRoleKey, PermissionKey[]> = {
  developer: ALL_PERMISSIONS,
  super_admin: ['system.users.view', 'system.role.assign', 'system.permission.edit', 'system.audit.view']
};

export const DEFAULT_ROLE_PERMS: Record<SystemRoleKey, PermissionKey[]> = {
  developer: ALL_PERMISSIONS,
  super_admin: ['system.users.view', 'system.role.assign', 'system.permission.edit', 'system.settings.view', 'system.settings.edit', 'system.audit.view', 'session.create']
};

export const ALLOWED_GRANTS: Grant[] = ['session.create'];
export const ALLOWED_FLAGS = ['maintenance_mode', 'registration_open'] as const;
export const DEFAULT_WEIGHTS: EvalWeights = { voice: 40, tone: 30, tajweed: 30 };
export const DEFAULT_THRESHOLDS: [number, number, number, number] = [50, 150, 300, 500];

export const permissionsOf = (roles: SystemRoleKey[], perms: Record<SystemRoleKey, PermissionKey[]>): PermissionKey[] => [
  ...new Set(roles.flatMap((r) => perms[r]))
];

/** ماتریس جدید نقش: مجوزهای قفل‌شده باید بمانند؛ مجوز ناشناخته مجاز نیست */
export function validateRolePermissions(role: SystemRoleKey, next: PermissionKey[]): { ok: true } | { ok: false; reason: 'DEVELOPER_FIXED' | 'LOCKED_PERMISSION' | 'UNKNOWN_PERMISSION'; missing?: PermissionKey[] } {
  if (role === 'developer') return { ok: false, reason: 'DEVELOPER_FIXED' };
  if (next.some((p) => !ALL_PERMISSIONS.includes(p))) return { ok: false, reason: 'UNKNOWN_PERMISSION' };
  const missing = LOCKED[role].filter((p) => !next.includes(p));
  return missing.length ? { ok: false, reason: 'LOCKED_PERMISSION', missing } : { ok: true };
}

/** برداشتن آخرین دارندهٔ نقش ممنوع (D5). holdersAfter = دارندگان پس از تغییر */
export const wouldLeaveNoHolder = (holdersAfter: number) => holdersAfter < 1;

/** فقط developer می‌تواند نقش developer را عوض کند (D6) */
export function touchesDeveloper(before: SystemRoleKey[], after: SystemRoleKey[]): boolean {
  return before.includes('developer') !== after.includes('developer');
}

export function validateSettings(i: SettingsInput): Record<string, string> {
  const e: Record<string, string> = {};
  const w = i.evalWeights;
  const parts = [w.voice, w.tone, w.tajweed];
  if (parts.some((x) => !Number.isInteger(x) || x < 0 || x > 100)) e.evalWeights = 'هر وزن عددی صحیح بین ۰ تا ۱۰۰ باشد.';
  else if (parts.reduce((a, b) => a + b, 0) !== 100) e.evalWeights = 'مجموع وزن‌ها باید دقیقاً ۱۰۰ باشد.';

  const t = i.badgeThresholds;
  if (t.length !== 4 || t.some((x) => !Number.isInteger(x) || x <= 0)) e.badgeThresholds = 'چهار آستانهٔ صحیح و مثبت لازم است.';
  else if (!t.every((x, k) => k === 0 || x > t[k - 1])) e.badgeThresholds = 'آستانه‌ها باید اکیداً صعودی باشند.';

  const keys = Object.keys(i.flags);
  if (keys.some((k) => !(ALLOWED_FLAGS as readonly string[]).includes(k))) e.flags = 'پرچم ناشناخته است.';
  return e;
}

/** score ۰..۱۰۰ با وزن‌های داده‌شده (برای پیش‌نمایش) */
export function previewScore(i: { voice: number; tone: number; tajweed: number }, w: EvalWeights): number {
  const sum = w.voice + w.tone + w.tajweed || 1;
  return Math.round(((i.voice * w.voice + i.tone * w.tone + i.tajweed * w.tajweed) / sum) * 10);
}
