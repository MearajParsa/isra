import type { Q } from '../domain/db';

/**
 * دادهٔ پایهٔ RBAC (docs-v2/27 §1). کلیدهای موجود بدون تغییر می‌مانند تا JWT/mid سازگار بماند.
 * فقط برای migration و بازگردانی تست استفاده می‌شود؛ منطق runtime از DB می‌خواند.
 */
export type StepUpMode = 'required' | 'none';

export const DEVELOPER = 'developer';
export const SUPER_ADMIN = 'super_admin';
export const ROLE_KEYS: readonly string[] = [DEVELOPER, SUPER_ADMIN];

export const ROLE_TEXT: Record<string, { title: string; description: string }> = {
  developer: { title: 'توسعه‌دهنده', description: 'دسترسی فنی کامل؛ ماتریس مجوز این نقش ثابت است و حذف نمی‌شود.' },
  super_admin: { title: 'مدیر کل', description: 'مدیریت سیستم، کاربران و تنظیمات سراسری؛ مجوزهای قفل‌شده قابل حذف نیستند.' }
};

export const SEED_MODULES: readonly { key: string; title: string; description: string; sortOrder: number; v16?: true }[] = [
  { key: 'users', title: 'کاربران', description: 'دیدن و مدیریت کاربران', sortOrder: 10 },
  { key: 'access', title: 'نقش‌ها و دسترسی', description: 'نقش‌ها، مجوزها، ماژول‌ها و step-up', sortOrder: 20 },
  { key: 'settings', title: 'تنظیمات', description: 'تنظیمات سراسری سیستم', sortOrder: 30 },
  { key: 'audit', title: 'گزارش اقدام‌ها', description: 'گزارش اقدام‌های ادمین‌ها', sortOrder: 40 },
  { key: 'sessions_admin', title: 'مدیریت جلسه‌ها', description: 'دیدن و مدیریت همهٔ جلسه‌ها', sortOrder: 50 },
  { key: 'reports', title: 'گزارش‌های تحلیلی', description: 'گزارش‌ها و نمودارهای تحلیلی', sortOrder: 60 },
  { key: 'sessions', title: 'جلسه‌ها', description: 'مجوزهای مربوط به جلسه‌های کاربران', sortOrder: 70 },
  // ۱.۶.۰ (docs-v2/30)
  { v16: true, key: 'gamification', title: 'امتیاز و نشان', description: 'اصلاح امتیاز و مدیریت نشان‌ها', sortOrder: 80 },
  { v16: true, key: 'messaging', title: 'پیام همگانی', description: 'ارسال پیام همگانی درون‌برنامه‌ای', sortOrder: 90 },
  { v16: true, key: 'exports', title: 'خروجی داده', description: 'خروجی CSV کاربران، جلسه‌ها و گزارش اقدام‌ها', sortOrder: 100 }
];

interface SeedPerm {
  key: string;
  module: string;
  title: string;
  description: string;
  grantable: boolean;
  stepUp: StepUpMode;
}
const P = (key: string, module: string, title: string, grantable: boolean, stepUp: StepUpMode, description = ''): SeedPerm => ({ key, module, title, description, grantable, stepUp });

export const SEED_PERMISSIONS: readonly SeedPerm[] = [
  P('system.users.view', 'users', 'دیدن کاربران', false, 'none'),
  P('system.users.manage', 'users', 'مدیریت کاربران (ساخت، ویرایش، غیرفعال‌سازی، حذف، رمز و نشست‌ها)', false, 'required'),
  P('system.role.assign', 'access', 'تخصیص و برداشتن نقش سیستم و مجوز کاربر', false, 'required'),
  P('system.permission.edit', 'access', 'ویرایش ماتریس مجوز نقش‌ها', false, 'required'),
  P('system.role.manage', 'access', 'مدیریت نقش‌ها (ساخت، ویرایش، حذف، ماژول‌ها)', false, 'required', 'ساخت، ویرایش و حذف نقش‌های پویا و تعیین ماژول‌های نقش'),
  P('system.permission.manage', 'access', 'مدیریت مجوزها و ماژول‌ها', false, 'required', 'ساخت، ویرایش و حذف مجوزها و ماژول‌های پویا'),
  P('system.stepup.manage', 'access', 'مدیریت قواعد step-up', false, 'required', 'تعیین اینکه هر نقش برای کدام مجوز تأیید هویت دوباره بدهد'),
  P('system.settings.view', 'settings', 'دیدن تنظیمات سراسری', false, 'none'),
  P('system.settings.edit', 'settings', 'ویرایش تنظیمات سراسری', false, 'required'),
  P('system.audit.view', 'audit', 'دیدن گزارش اقدام‌ها', false, 'none'),
  P('system.sessions.view', 'sessions_admin', 'دیدن همهٔ جلسه‌ها (اعضا، حضور، صف و ارزیابی)', false, 'none'),
  P('system.sessions.manage', 'sessions_admin', 'مدیریت جلسه‌ها (ساخت، ویرایش، حذف و اعضا)', false, 'required'),
  P('system.reports.view', 'reports', 'دیدن گزارش‌های تحلیلی', false, 'none'),
  P('session.create', 'sessions', 'ساخت جلسه', true, 'none'),
  // ۱.۶.۰ (docs-v2/30 §۳)
  P('system.sessions.moderate', 'sessions_admin', 'اصلاح و نظارت جلسه (حضور و صف)', false, 'none'),
  P('system.points.manage', 'gamification', 'اصلاح دستی امتیاز کاربران', false, 'required'),
  P('system.badges.manage', 'gamification', 'مدیریت نشان‌ها', false, 'required'),
  P('system.inbox.send', 'messaging', 'ارسال پیام همگانی', false, 'required'),
  P('system.data.export', 'exports', 'خروجی CSV داده‌ها', false, 'required')
];

export const ALL_PERMISSIONS: readonly string[] = SEED_PERMISSIONS.map((p) => p.key);
export const PERMISSION_TITLES: Record<string, { title: string; group: 'system' | 'session' }> = Object.fromEntries(SEED_PERMISSIONS.map((p) => [p.key, { title: p.title, group: p.key.startsWith('session.') ? 'session' : 'system' }]));

/** سه مجوز تازهٔ ۱.۵ که فقط developer دارد */
const NEW_V15 = ['system.role.manage', 'system.permission.manage', 'system.stepup.manage'];
/** مجوزهای ۱.۶.۰: قفل برای developer؛ پیش‌فرض بدون super_admin (docs-v2/30 §۳) */
export const NEW_V16 = ['system.sessions.moderate', 'system.points.manage', 'system.badges.manage', 'system.inbox.send', 'system.data.export'];

export const LOCKED: Record<string, readonly string[]> = {
  developer: ALL_PERMISSIONS,
  super_admin: ['system.users.view', 'system.role.assign', 'system.permission.edit', 'system.audit.view']
};

export const DEFAULT_ROLE_PERMS: Record<string, readonly string[]> = {
  developer: ALL_PERMISSIONS,
  super_admin: ALL_PERMISSIONS.filter((p) => !NEW_V15.includes(p) && !NEW_V16.includes(p) && p !== 'system.users.manage' && p !== 'system.sessions.manage')
};

/**
 * seed idempotent: ماژول/مجوز/نقش سیستمی، developer = همه (قفل)، super_admin فقط اگر ردیف ندارد.
 * ۱.۶.۰ (docs-v2/30 §۳ امنیت ۸): ویرایش مالک (عنوان/توضیح، grantable، step_up) هرگز overwrite نمی‌شود — فقط درج ردیف نبوده؛
 * تنها `is_system` و ماژولِ مجوز سیستمی (که قابل‌تغییر نیستند، E4) تضمین می‌شوند.
 * `rbac_meta` اگر نبود با version=1 ساخته می‌شود.
 */
export async function seedRbac(q: Q, now: Date, opts: { v16?: boolean } = {}): Promise<void> {
  // migration ۱.۵ (DynamicRbac) فقط دادهٔ زمان خودش را می‌کارد؛ ۱.۶.۰ را OpsExpansion (و بازگردانی تست) اضافه می‌کند
  const v16 = opts.v16 ?? true;
  const modules = SEED_MODULES.filter((m) => v16 || !m.v16);
  const perms = SEED_PERMISSIONS.filter((p) => v16 || !NEW_V16.includes(p.key));
  for (const m of modules) {
    await q.query(
      'INSERT INTO system_modules (module_key, title, description, is_system, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?) ON DUPLICATE KEY UPDATE is_system = 1',
      [m.key, m.title, m.description, m.sortOrder, now, now]
    );
  }
  for (const p of perms) {
    await q.query(
      `INSERT INTO permissions (permission_key, title, module_key, description, is_system, grantable, step_up) VALUES (?, ?, ?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE module_key = VALUES(module_key), is_system = 1`,
      [p.key, p.title, p.module, p.description, p.grantable ? 1 : 0, p.stepUp]
    );
  }
  for (const [role, t] of Object.entries(ROLE_TEXT)) {
    await q.query('INSERT INTO system_roles (role_key, title, description, undeletable, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?) ON DUPLICATE KEY UPDATE undeletable = 1', [role, t.title, t.description, now, now]);
  }
  for (const p of DEFAULT_ROLE_PERMS.developer!.filter((x) => v16 || !NEW_V16.includes(x))) await q.query('INSERT INTO role_permissions (role_key, permission_key, locked) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE locked = 1', [DEVELOPER, p]);
  for (const p of DEFAULT_ROLE_PERMS.super_admin!) await q.query('INSERT IGNORE INTO role_permissions (role_key, permission_key, locked) VALUES (?, ?, ?)', [SUPER_ADMIN, p, LOCKED.super_admin!.includes(p) ? 1 : 0]);
  await q.query('INSERT IGNORE INTO rbac_meta (id, version) VALUES (1, 1)');
}
