/** برچسب فارسی همهٔ اقدام‌های audit (docs-v2/26 + اقدام‌های نقش/تنظیمات قبلی) */
export const AUDIT_ACTIONS: Record<string, string> = {
  'system.role.assigned': 'تخصیص نقش',
  'system.role.removed': 'برداشتن نقش',
  'system.grant.added': 'افزودن مجوز کاربر',
  'system.grant.removed': 'برداشتن مجوز کاربر',
  'system.permission.changed': 'تغییر ماتریس مجوز',
  'system.settings.changed': 'تغییر تنظیمات',
  'user.create': 'ساخت کاربر',
  'user.update': 'ویرایش کاربر',
  'user.status_change': 'تغییر وضعیت کاربر',
  'user.delete': 'حذف کاربر',
  'user.password_set': 'تعیین رمز موقت',
  'user.password_clear': 'حذف رمز کاربر',
  'user.logout_all': 'خروج اجباری کاربر',
  'user.session_revoke': 'پایان نشست کاربر',
  'account.profile_update': 'ویرایش پروفایل (حساب من)',
  'account.password_change': 'تغییر رمز (حساب من)',
  'account.session_revoke': 'پایان نشست (حساب من)',
  'session.create': 'ساخت جلسه',
  'session.update': 'ویرایش جلسه',
  'session.transition': 'تغییر وضعیت جلسه',
  'session.delete': 'حذف جلسه',
  'session.member_decide': 'تصمیم دربارهٔ عضویت',
  'session.member_roles': 'تغییر نقش عضو جلسه',
  'session.member_remove': 'حذف عضو از جلسه'
};
export const auditLabel = (a: string) => AUDIT_ACTIONS[a] ?? a;

/** گروه‌های پیشوندی برای فیلتر (action=`user.` همهٔ اقدام‌های کاربر) */
export const AUDIT_PREFIXES: { value: string; label: string }[] = [
  { value: 'user.', label: 'همهٔ اقدام‌های مدیریت کاربر' },
  { value: 'account.', label: 'همهٔ اقدام‌های حساب من' },
  { value: 'session.', label: 'همهٔ اقدام‌های جلسه' },
  { value: 'system.', label: 'نقش، مجوز و تنظیمات' }
];

export const AUDIT_TARGET_TYPES: Record<string, string> = { user: 'کاربر', role: 'نقش', settings: 'تنظیمات', session: 'جلسه' };

export const ROLE_TITLE: Record<string, string> = { developer: 'توسعه‌دهنده', super_admin: 'مدیر کل' };
export const PERMISSION_TITLE: Record<string, string> = {
  'system.users.view': 'مشاهدهٔ کاربران',
  'system.users.manage': 'مدیریت کاربران (ساخت، ویرایش، حذف، رمز)',
  'system.role.assign': 'تخصیص نقش و مجوز به کاربر',
  'system.permission.edit': 'ویرایش ماتریس مجوز',
  'system.settings.view': 'مشاهدهٔ تنظیمات سراسری',
  'system.settings.edit': 'ویرایش تنظیمات سراسری',
  'system.audit.view': 'مشاهدهٔ گزارش‌ها (audit)',
  'system.sessions.view': 'مشاهدهٔ جلسه‌ها',
  'system.sessions.manage': 'مدیریت جلسه‌ها',
  'system.reports.view': 'مشاهدهٔ گزارش‌های تحلیلی',
  'session.create': 'ساخت جلسه'
};
