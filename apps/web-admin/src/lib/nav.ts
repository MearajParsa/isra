import type { IconName } from '$lib/components/ui/Icon.svelte';
import type { PermissionKey } from '$lib/api';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** نمایش فقط با این مجوز (سرور هم اعمال می‌کند) */
  perm?: PermissionKey;
  match: (path: string) => boolean;
}

const exact = (p: string) => (path: string) => path === p;
const prefix = (p: string) => (path: string) => path === p || path.startsWith(p + '/');

export const NAV: NavItem[] = [
  { href: '/', label: 'نمای کلی', icon: 'grid', match: exact('/') },
  { href: '/users', label: 'کاربران', icon: 'users', perm: 'system.users.view', match: prefix('/users') },
  { href: '/roles', label: 'نقش‌ها و مجوزها', icon: 'key', match: prefix('/roles') },
  { href: '/settings', label: 'تنظیمات', icon: 'sliders', perm: 'system.settings.view', match: prefix('/settings') },
  { href: '/audit', label: 'گزارش‌ها', icon: 'list', perm: 'system.audit.view', match: prefix('/audit') }
];
