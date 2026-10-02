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

const home: NavItem = { href: '/', label: 'خانه', icon: 'home', match: exact('/') };
const sessions: NavItem = {
  href: '/sessions',
  label: 'جلسات',
  icon: 'calendar',
  // اتاق زنده زیر /sessions/:id/live است ولی به «جلسه‌های من» تعلق دارد
  match: (p) => prefix('/sessions')(p) && !p.endsWith('/live')
};
const mySessions: NavItem = {
  href: '/my-sessions',
  label: 'جلسه‌های من',
  icon: 'users',
  match: (p) => prefix('/my-sessions')(p) || p.endsWith('/live')
};
const inbox: NavItem = { href: '/inbox', label: 'اینباکس', icon: 'bell', badge: 'unread', match: prefix('/inbox') };
const account: NavItem = { href: '/account', label: 'حساب', icon: 'user', match: prefix('/account') };
const points: NavItem = { href: '/points', label: 'امتیاز', icon: 'award', match: prefix('/points') };
const manage: NavItem = { href: '/manage', label: 'مدیریت جلسه', icon: 'shield', match: prefix('/manage') };

export const guestNav: NavItem[] = [home, sessions];
/** ناوبری پایین موبایل (۵ تب) */
export const memberNav: NavItem[] = [home, sessions, mySessions, inbox, account];
/** نوار بالای دسکتاپ: «حساب» با آواتار نمایش داده می‌شود */
export const memberDesktopNav = (canManage: boolean): NavItem[] => [
  home,
  sessions,
  mySessions,
  points,
  inbox,
  ...(canManage ? [manage] : [])
];
