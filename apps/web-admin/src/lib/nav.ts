import type { IconName } from '$lib/components/ui/Icon.svelte';
import type { PermissionKey } from '$lib/api';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** نمایش فقط با این مجوز (سرور هم اعمال می‌کند) */
  perm?: PermissionKey;
  /** در نوار پایین موبایل مستقیماً دیده شود (بقیه زیر «بیشتر») */
  primary?: boolean;
  match: (path: string) => boolean;
}

const exact = (p: string) => (path: string) => path === p;
const prefix = (p: string) => (path: string) => path === p || path.startsWith(p + '/');

export const NAV: NavItem[] = [
  { href: '/', label: 'نمای کلی', icon: 'grid', primary: true, match: exact('/') },
  { href: '/users', label: 'کاربران', icon: 'users', perm: 'system.users.view', primary: true, match: prefix('/users') },
  { href: '/sessions', label: 'جلسه‌ها', icon: 'calendar', perm: 'system.sessions.view', primary: true, match: prefix('/sessions') },
  { href: '/reports', label: 'آمار و گزارش‌ها', icon: 'chart', perm: 'system.reports.view', primary: true, match: prefix('/reports') },
  { href: '/roles', label: 'نقش‌ها و مجوزها', icon: 'key', match: prefix('/roles') },
  { href: '/settings', label: 'تنظیمات', icon: 'sliders', perm: 'system.settings.view', match: prefix('/settings') },
  { href: '/audit', label: 'گزارش اقدام‌ها', icon: 'list', perm: 'system.audit.view', match: prefix('/audit') }
];

export const ACCOUNT_HREF = '/account';

/** حداکثر تب مستقیم در نوار پایین (شامل «بیشتر» اگر لازم باشد) */
export const MOBILE_TABS = 5;

export const visibleNav = (can: (p: PermissionKey) => boolean, items: NavItem[] = NAV): NavItem[] => items.filter((n) => !n.perm || can(n.perm));

/**
 * نوار پایین موبایل: اگر همهٔ آیتم‌ها در ۵ تب جا شوند همه مستقیم‌اند؛ وگرنه ۴ آیتم اصلی + «بیشتر» (بقیه در یک sheet).
 */
export function splitMobileNav(items: NavItem[], max = MOBILE_TABS): { tabs: NavItem[]; more: NavItem[] } {
  if (items.length <= max) return { tabs: items, more: [] };
  const primary = items.filter((i) => i.primary);
  const tabs = (primary.length >= max - 1 ? primary : [...primary, ...items.filter((i) => !i.primary)]).slice(0, max - 1);
  return { tabs, more: items.filter((i) => !tabs.includes(i)) };
}
