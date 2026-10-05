import { describe, expect, it } from 'vitest';
import { NAV, splitMobileNav, visibleNav } from '$lib/nav';
import type { PermissionKey } from '$lib/api';

const all = () => true;

describe('nav', () => {
  it('همهٔ مجوزها: ۷ آیتم؛ موبایل ۴ تب + بیشتر', () => {
    const items = visibleNav(all);
    expect(items).toHaveLength(7);
    const { tabs, more } = splitMobileNav(items);
    expect(tabs.map((t) => t.href)).toEqual(['/', '/users', '/sessions', '/reports']);
    expect(more.map((t) => t.href)).toEqual(['/roles', '/settings', '/audit']);
  });
  it('مجوزهای محدود: بدون پنهان‌سازی بیهوده', () => {
    const can = (p: PermissionKey) => p === 'system.users.view' || p === 'system.audit.view';
    const items = visibleNav(can);
    expect(items.map((i) => i.href)).toEqual(['/', '/users', '/roles', '/audit']);
    expect(splitMobileNav(items).more).toEqual([]);
  });
  it('هر آیتم با مسیر خودش و زیرمسیرش active می‌شود', () => {
    const f = (h: string, p: string) => NAV.find((n) => n.href === h)!.match(p);
    expect(f('/users', '/users/abc')).toBe(true);
    expect(f('/users', '/usersx')).toBe(false);
    expect(f('/', '/users')).toBe(false);
    expect(f('/sessions', '/sessions/1')).toBe(true);
  });
  it('اگر آیتم اصلی کم باشد از بقیه پر می‌شود', () => {
    const mk = (i: number, primary = false) => ({ href: `/${i}`, label: `${i}`, icon: 'grid' as const, primary, match: () => false });
    const items = [mk(1, true), mk(2), mk(3), mk(4), mk(5), mk(6)];
    const { tabs, more } = splitMobileNav(items);
    expect(tabs).toHaveLength(4);
    expect(more).toHaveLength(2);
  });
});
