import type { IconName } from '$lib/components/ui/Icon.svelte';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** نشانگر نخوانده‌ها */
  badge?: 'unread';
  match: (path: string) => boolean;
}

const exact = (p: string) => (path: string) => path === p;
const prefix = (p: string) => (path: string) => path === p || path.startsWith(p + '/');

export const guestNav: NavItem[] = [
  { href: '/', label: 'خانه', icon: 'home', match: exact('/') },
  { href: '/sessions', label: 'جلسات', icon: 'calendar', match: prefix('/sessions') }
];

export const memberNav: NavItem[] = [
  { href: '/', label: 'خانه', icon: 'home', match: exact('/') },
  { href: '/sessions', label: 'جلسات', icon: 'calendar', match: prefix('/sessions') },
  { href: '/points', label: 'امتیاز', icon: 'award', match: prefix('/points') },
  { href: '/inbox', label: 'اینباکس', icon: 'bell', badge: 'unread', match: prefix('/inbox') },
  { href: '/account', label: 'حساب', icon: 'user', match: prefix('/account') }
];
