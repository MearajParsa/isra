export const AUDIT_ACTIONS: Record<string, string> = {
  'system.role.assigned': 'تخصیص نقش',
  'system.role.removed': 'برداشتن نقش',
  'system.grant.added': 'افزودن مجوز کاربر',
  'system.grant.removed': 'برداشتن مجوز کاربر',
  'system.permission.changed': 'تغییر ماتریس مجوز',
  'system.settings.changed': 'تغییر تنظیمات'
};
export const auditLabel = (a: string) => AUDIT_ACTIONS[a] ?? a;

export const ROLE_TITLE: Record<string, string> = { developer: 'توسعه‌دهنده', super_admin: 'مدیر کل' };
export const PERMISSION_TITLE: Record<string, string> = {
  'system.users.view': 'مشاهدهٔ کاربران',
  'system.role.assign': 'تخصیص نقش و مجوز به کاربر',
  'system.permission.edit': 'ویرایش ماتریس مجوز',
  'system.settings.view': 'مشاهدهٔ تنظیمات سراسری',
  'system.settings.edit': 'ویرایش تنظیمات سراسری',
  'system.audit.view': 'مشاهدهٔ گزارش‌ها (audit)',
  'session.create': 'ساخت جلسه'
};
