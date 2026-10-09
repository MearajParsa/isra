import type { Q } from '../domain/db';

/**
 * دادهٔ پایهٔ RBAC (docs-v2/27 §1، docs-v2/31 §۱). کلیدهای موجود بدون تغییر می‌مانند تا JWT/mid سازگار بماند.
 * فقط برای migration و بازگردانی تست استفاده می‌شود؛ منطق runtime از DB می‌خواند.
 */
export type StepUpMode = 'required' | 'none';
export type Tier = 'high' | 'mid' | 'low';
/** نسخهٔ دادهٔ پایه: هر migration فقط دادهٔ زمان خودش را می‌کارد (ستون‌های بعدی هنوز وجود ندارند) */
export type SeedVersion = 'v15' | 'v16' | 'v17';
const ORDER: Record<SeedVersion, number> = { v15: 15, v16: 16, v17: 17 };
const upTo = (v: SeedVersion, max: SeedVersion) => ORDER[v] <= ORDER[max];

export const DEVELOPER = 'developer';
export const SUPER_ADMIN = 'super_admin';
export const TEACHER = 'teacher';
export const GUEST = 'guest';
export const QURAN_STUDENT = 'quran_student';
/** نقش‌های v1 (InitSchema)؛ ثابت و مستقل از نقش‌های ۱.۷.۰ */
export const ROLE_KEYS: readonly string[] = [DEVELOPER, SUPER_ADMIN];
/** ۱.۷.۰: نقش‌های ثابت (حذف‌نشدنی) هر سه سطح */
export const FIXED_ROLES: readonly string[] = [DEVELOPER, SUPER_ADMIN, TEACHER, GUEST, QURAN_STUDENT];
/** ۱.۷.۰: نقش‌های ضمنی (قابل اختصاص نیستند): guest = درخواست بی‌توکن، quran_student = هر کاربر ثبت‌نام‌کرده */
export const IMPLICIT_ROLES: readonly string[] = [GUEST, QURAN_STUDENT];

export const ROLE_TEXT: Record<string, { title: string; description: string; tier: Tier; since: SeedVersion }> = {
  developer: { title: 'توسعه‌دهنده', description: 'دسترسی فنی کامل؛ ماتریس مجوز این نقش ثابت است و حذف نمی‌شود.', tier: 'high', since: 'v15' },
  super_admin: { title: 'مدیر کل', description: 'مدیریت سیستم، کاربران و تنظیمات سراسری؛ مجوزهای قفل‌شده قابل حذف نیستند.', tier: 'high', since: 'v15' },
  teacher: { title: 'استاد', description: 'صاحب جلسه‌های خودش: ساخت و مدیریت جلسه، اعضا، صف، حضور، ارزیابی، گالری و پشتیبان‌ها.', tier: 'mid', since: 'v17' },
  guest: { title: 'مهمان', description: 'درخواست بدون ورود (ضمنی؛ قابل اختصاص نیست).', tier: 'low', since: 'v17' },
  quran_student: { title: 'قرآن‌آموز', description: 'هر کاربر ثبت‌نام‌کرده (ضمنی؛ قابل اختصاص نیست).', tier: 'low', since: 'v17' }
};

interface SeedModule {
  key: string;
  title: string;
  description: string;
  sortOrder: number;
  tier: Tier;
  since: SeedVersion;
  /** آخرین نسخه‌ای که این ماژول seed می‌شود (ماژول `sessions` در ۱.۷.۰ با `teaching` جایگزین شد) */
  until?: SeedVersion;
}

export const SEED_MODULES: readonly SeedModule[] = [
  { key: 'users', title: 'کاربران', description: 'دیدن و مدیریت کاربران', sortOrder: 10, tier: 'high', since: 'v15' },
  { key: 'access', title: 'نقش‌ها و دسترسی', description: 'نقش‌ها، مجوزها، ماژول‌ها و step-up', sortOrder: 20, tier: 'high', since: 'v15' },
  { key: 'settings', title: 'تنظیمات', description: 'تنظیمات سراسری سیستم', sortOrder: 30, tier: 'high', since: 'v15' },
  { key: 'audit', title: 'گزارش اقدام‌ها', description: 'گزارش اقدام‌های ادمین‌ها', sortOrder: 40, tier: 'high', since: 'v15' },
  { key: 'sessions_admin', title: 'مدیریت جلسه‌ها', description: 'دیدن و مدیریت همهٔ جلسه‌ها', sortOrder: 50, tier: 'high', since: 'v15' },
  { key: 'reports', title: 'گزارش‌های تحلیلی', description: 'گزارش‌ها و نمودارهای تحلیلی', sortOrder: 60, tier: 'high', since: 'v15' },
  { key: 'sessions', title: 'جلسه‌ها', description: 'مجوزهای مربوط به جلسه‌های کاربران', sortOrder: 70, tier: 'high', since: 'v15', until: 'v16' },
  // ۱.۶.۰ (docs-v2/30)
  { key: 'gamification', title: 'امتیاز و نشان', description: 'اصلاح امتیاز و مدیریت نشان‌ها', sortOrder: 80, tier: 'high', since: 'v16' },
  { key: 'messaging', title: 'پیام همگانی', description: 'ارسال پیام همگانی درون‌برنامه‌ای', sortOrder: 90, tier: 'high', since: 'v16' },
  { key: 'exports', title: 'خروجی داده', description: 'خروجی CSV کاربران، جلسه‌ها و گزارش اقدام‌ها', sortOrder: 100, tier: 'high', since: 'v16' },
  // ۱.۷.۰ (docs-v2/31 §۱)
  { key: 'teaching', title: 'تدریس (استاد)', description: 'ساخت و مدیریت جلسه‌های خود، پشتیبان‌ها، ارزیابی و گالری', sortOrder: 110, tier: 'mid', since: 'v17' },
  { key: 'learning', title: 'یادگیری (قرآن‌آموز و مهمان)', description: 'مرور و عضویت جلسه، کامنت، دیدن گالری و امتیاز', sortOrder: 120, tier: 'low', since: 'v17' },
  { key: 'evaluation', title: 'معیارهای ارزیابی', description: 'مدیریت معیارهای پویای ارزیابی', sortOrder: 130, tier: 'high', since: 'v17' },
  { key: 'content_admin', title: 'نظارت محتوا', description: 'گالری و کامنت همهٔ جلسه‌ها', sortOrder: 140, tier: 'high', since: 'v17' }
];

interface SeedPerm {
  key: string;
  module: string;
  /** ماژول پیش از ۱.۷.۰ (اگر جابه‌جا شده) */
  legacyModule?: string;
  title: string;
  description: string;
  grantable: boolean;
  stepUp: StepUpMode;
  since: SeedVersion;
}
const P = (since: SeedVersion, key: string, module: string, title: string, grantable: boolean, stepUp: StepUpMode, description = '', legacyModule?: string): SeedPerm => ({
  key,
  module,
  title,
  description,
  grantable,
  stepUp,
  since,
  ...(legacyModule ? { legacyModule } : {})
});

export const SEED_PERMISSIONS: readonly SeedPerm[] = [
  P('v15', 'system.users.view', 'users', 'دیدن کاربران', false, 'none'),
  P('v15', 'system.users.manage', 'users', 'مدیریت کاربران (ساخت، ویرایش، غیرفعال‌سازی، حذف، رمز و نشست‌ها)', false, 'required'),
  P('v15', 'system.role.assign', 'access', 'تخصیص و برداشتن نقش سیستم و مجوز کاربر', false, 'required'),
  P('v15', 'system.permission.edit', 'access', 'ویرایش ماتریس مجوز نقش‌ها', false, 'required'),
  P('v15', 'system.role.manage', 'access', 'مدیریت نقش‌ها (ساخت، ویرایش، حذف، ماژول‌ها)', false, 'required', 'ساخت، ویرایش و حذف نقش‌های پویا و تعیین ماژول‌های نقش'),
  P('v15', 'system.permission.manage', 'access', 'مدیریت مجوزها و ماژول‌ها', false, 'required', 'ساخت، ویرایش و حذف مجوزها و ماژول‌های پویا'),
  P('v15', 'system.stepup.manage', 'access', 'مدیریت قواعد step-up', false, 'required', 'تعیین اینکه هر نقش برای کدام مجوز تأیید هویت دوباره بدهد'),
  P('v15', 'system.settings.view', 'settings', 'دیدن تنظیمات سراسری', false, 'none'),
  P('v15', 'system.settings.edit', 'settings', 'ویرایش تنظیمات سراسری', false, 'required'),
  P('v15', 'system.audit.view', 'audit', 'دیدن گزارش اقدام‌ها', false, 'none'),
  P('v15', 'system.sessions.view', 'sessions_admin', 'دیدن همهٔ جلسه‌ها (اعضا، حضور، صف و ارزیابی)', false, 'none'),
  P('v15', 'system.sessions.manage', 'sessions_admin', 'مدیریت جلسه‌ها (ساخت، ویرایش، حذف و اعضا)', false, 'required'),
  P('v15', 'system.reports.view', 'reports', 'دیدن گزارش‌های تحلیلی', false, 'none'),
  P('v15', 'session.create', 'teaching', 'ساخت جلسه', true, 'none', '', 'sessions'),
  // ۱.۶.۰ (docs-v2/30 §۳)
  P('v16', 'system.sessions.moderate', 'sessions_admin', 'اصلاح و نظارت جلسه (حضور و صف)', false, 'none'),
  P('v16', 'system.points.manage', 'gamification', 'اصلاح دستی امتیاز کاربران', false, 'required'),
  P('v16', 'system.badges.manage', 'gamification', 'مدیریت نشان‌ها', false, 'required'),
  P('v16', 'system.inbox.send', 'messaging', 'ارسال پیام همگانی', false, 'required'),
  P('v16', 'system.data.export', 'exports', 'خروجی CSV داده‌ها', false, 'required'),
  // ۱.۷.۰ (docs-v2/31 §۱)
  P('v17', 'session.manage_own', 'teaching', 'مدیریت جلسه‌های خود (ویرایش، اعضا، صف، حضور)', true, 'none'),
  P('v17', 'supporter.manage_own', 'teaching', 'تعیین پشتیبان‌های خود', true, 'none'),
  P('v17', 'evaluation.submit_own', 'teaching', 'ارزیابی در جلسه‌های خود', true, 'none'),
  P('v17', 'gallery.manage_own', 'teaching', 'مدیریت گالری جلسه‌های خود', true, 'none'),
  P('v17', 'session.browse', 'learning', 'مرور جلسه‌ها', true, 'none'),
  P('v17', 'session.join', 'learning', 'درخواست عضویت در جلسه', true, 'none'),
  P('v17', 'comment.post', 'learning', 'ثبت کامنت', true, 'none'),
  P('v17', 'gallery.view', 'learning', 'دیدن گالری', true, 'none'),
  P('v17', 'points.view', 'learning', 'دیدن امتیاز و نشان', true, 'none'),
  P('v17', 'system.evaluation.manage', 'evaluation', 'مدیریت معیارهای ارزیابی', false, 'required'),
  P('v17', 'system.content.moderate', 'content_admin', 'نظارت گالری و کامنت همهٔ جلسه‌ها', false, 'none'),
  P('v17', 'system.roles.mid.manage', 'access', 'مدیریت نقش‌های سطح میانی (استاد و …)', false, 'required'),
  P('v17', 'system.roles.low.manage', 'access', 'مدیریت نقش‌های سطح پایین (مهمان، قرآن‌آموز و …)', false, 'required')
];

export const ALL_PERMISSIONS: readonly string[] = SEED_PERMISSIONS.map((p) => p.key);
export const PERMISSION_TITLES: Record<string, { title: string; group: 'system' | 'session' }> = Object.fromEntries(SEED_PERMISSIONS.map((p) => [p.key, { title: p.title, group: p.key.startsWith('system.') ? 'system' : 'session' }]));

/** سه مجوز تازهٔ ۱.۵ که فقط developer دارد */
const NEW_V15 = ['system.role.manage', 'system.permission.manage', 'system.stepup.manage'];
/** مجوزهای ۱.۶.۰: قفل برای developer؛ پیش‌فرض بدون super_admin (docs-v2/30 §۳) */
export const NEW_V16 = SEED_PERMISSIONS.filter((p) => p.since === 'v16').map((p) => p.key);
/** مجوزهای ۱.۷.۰: قفل برای developer؛ super_admin «مثل قبل» (هیچ‌کدام) */
export const NEW_V17 = SEED_PERMISSIONS.filter((p) => p.since === 'v17').map((p) => p.key);
/** ماژول‌های تازهٔ ۱.۷.۰ */
export const NEW_V17_MODULES = SEED_MODULES.filter((m) => m.since === 'v17').map((m) => m.key);

export const LOCKED: Record<string, readonly string[]> = {
  developer: ALL_PERMISSIONS,
  super_admin: ['system.users.view', 'system.role.assign', 'system.permission.edit', 'system.audit.view']
};

/** پیش‌فرض نقش‌های ثابت: مجوز صریح و ماژول کامل (docs-v2/31 §۱) */
export const DEFAULT_ROLE_PERMS: Record<string, readonly string[]> = {
  developer: ALL_PERMISSIONS,
  super_admin: ALL_PERMISSIONS.filter((p) => !NEW_V15.includes(p) && !NEW_V16.includes(p) && !NEW_V17.includes(p) && p !== 'system.users.manage' && p !== 'system.sessions.manage'),
  teacher: [],
  quran_student: [],
  guest: ['session.browse', 'gallery.view']
};
export const DEFAULT_ROLE_MODULES: Record<string, readonly string[]> = {
  teacher: ['teaching', 'learning'],
  quran_student: ['learning']
};

export interface SeedOptions {
  /** فقط migration ۱.۵ (DynamicRbac): ردیف‌های قبلی هنوز grantable/step_up/عنوان درست ندارند ⇒ overwrite متادیتای مجوزهای سیستمی */
  initialize?: boolean;
  /** آخرین نسخهٔ دادهٔ پایه (پیش‌فرض v17)؛ migrationهای قدیمی نسخهٔ خودشان را می‌دهند (ستون tier پیش از v17 نیست) */
  upTo?: SeedVersion;
  /**
   * بازگردانی (فقط تست): پیش‌فرض نقش‌های ثابت وقتی هیچ مجوز/ماژولی ندارند دوباره کاشته می‌شود.
   * در production پیش‌فرض نقش ثابت فقط هنگام ساخت همان نقش کاشته می‌شود (ویرایش مالک هرگز برنمی‌گردد).
   */
  restoreDefaults?: boolean;
}

/**
 * seed idempotent: ماژول/مجوز/نقش ثابت، developer = همه (قفل).
 * ۱.۶.۰ (docs-v2/30 §۳ امنیت ۸): ویرایش مالک (عنوان/توضیح، grantable، step_up) هرگز overwrite نمی‌شود — فقط درج ردیف نبوده؛
 * تنها `is_system` و ماژولِ مجوز سیستمی (که قابل‌تغییر نیستند، E4) و `tier` نقش/ماژول ثابت تضمین می‌شوند.
 * ۱.۷.۰: پیش‌فرض مجوز نقش‌های ثابت (super_admin، teacher، guest، quran_student) فقط هنگام ساخت نقش (یا initialize/restoreDefaults)
 * کاشته می‌شود؛ پیش از این super_admin در هر اجرا دوباره INSERT IGNORE می‌شد و حذف مالک را برمی‌گرداند.
 * `rbac_meta` اگر نبود با version=1 ساخته می‌شود.
 */
export async function seedRbac(q: Q, now: Date, opts: SeedOptions = {}): Promise<void> {
  const init = opts.initialize ?? false;
  const max = opts.upTo ?? 'v17';
  const v17 = upTo('v17', max);
  const modules = SEED_MODULES.filter((m) => upTo(m.since, max) && (!m.until || ORDER[max] <= ORDER[m.until]));
  const perms = SEED_PERMISSIONS.filter((p) => upTo(p.since, max));
  for (const m of modules) {
    if (v17)
      await q.query(
        'INSERT INTO system_modules (module_key, title, description, is_system, sort_order, tier, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE is_system = 1, tier = VALUES(tier)',
        [m.key, m.title, m.description, m.sortOrder, m.tier, now, now]
      );
    else await q.query('INSERT INTO system_modules (module_key, title, description, is_system, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?) ON DUPLICATE KEY UPDATE is_system = 1', [m.key, m.title, m.description, m.sortOrder, now, now]);
  }
  for (const p of perms) {
    const module = v17 ? p.module : (p.legacyModule ?? p.module);
    await q.query(
      `INSERT INTO permissions (permission_key, title, module_key, description, is_system, grantable, step_up) VALUES (?, ?, ?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE module_key = VALUES(module_key), is_system = 1${init ? ', title = VALUES(title), description = VALUES(description), grantable = VALUES(grantable), step_up = VALUES(step_up)' : ''}`,
      [p.key, p.title, module, p.description, p.grantable ? 1 : 0, p.stepUp]
    );
  }

  const created = new Set<string>();
  for (const [role, t] of Object.entries(ROLE_TEXT)) {
    if (!upTo(t.since, max)) continue;
    const exists = ((await q.query('SELECT 1 AS x FROM system_roles WHERE role_key = ?', [role])) as unknown[]).length > 0;
    if (!exists) created.add(role);
    if (v17) await q.query('INSERT INTO system_roles (role_key, title, description, undeletable, tier, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?) ON DUPLICATE KEY UPDATE undeletable = 1, tier = VALUES(tier)', [role, t.title, t.description, t.tier, now, now]);
    else await q.query('INSERT INTO system_roles (role_key, title, description, undeletable, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?) ON DUPLICATE KEY UPDATE undeletable = 1', [role, t.title, t.description, now, now]);
  }

  for (const p of perms) await q.query('INSERT INTO role_permissions (role_key, permission_key, locked) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE locked = 1', [DEVELOPER, p.key]);

  const empty = async (role: string) =>
    ((await q.query('SELECT 1 AS x FROM role_permissions WHERE role_key = ? UNION ALL SELECT 1 FROM role_modules WHERE role_key = ? LIMIT 1', [role, role])) as unknown[]).length === 0;
  const seedDefaults = async (role: string) => created.has(role) || init || (!!opts.restoreDefaults && (await empty(role)));
  const allowed = new Set(perms.map((p) => p.key));

  if (await seedDefaults(SUPER_ADMIN))
    for (const p of DEFAULT_ROLE_PERMS.super_admin!.filter((x) => allowed.has(x))) await q.query('INSERT IGNORE INTO role_permissions (role_key, permission_key, locked) VALUES (?, ?, ?)', [SUPER_ADMIN, p, LOCKED.super_admin!.includes(p) ? 1 : 0]);
  else for (const p of LOCKED.super_admin!) await q.query('INSERT INTO role_permissions (role_key, permission_key, locked) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE locked = 1', [SUPER_ADMIN, p]);

  if (v17)
    for (const role of [TEACHER, GUEST, QURAN_STUDENT]) {
      if (!(await seedDefaults(role))) continue;
      for (const p of DEFAULT_ROLE_PERMS[role] ?? []) await q.query('INSERT IGNORE INTO role_permissions (role_key, permission_key, locked) VALUES (?, ?, 0)', [role, p]);
      for (const m of DEFAULT_ROLE_MODULES[role] ?? []) await q.query('INSERT IGNORE INTO role_modules (role_key, module_key) VALUES (?, ?)', [role, m]);
    }
  await q.query('INSERT IGNORE INTO rbac_meta (id, version) VALUES (1, 1)');
}
