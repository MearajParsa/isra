import { base } from '$app/paths';

/** مسیر داخلی اپ ⇒ مسیر کامل با base (پنل می‌تواند زیر `/s` سرو شود؛ BASE_PATH زمان build) */
export const withBase = (p: string): string => `${base}${p}`;

/** pathname مرورگر ⇒ مسیر داخلی اپ (بدون base) برای تطبیق منو و مسیر ورود */
export const appPath = (pathname: string): string => (base && (pathname === base || pathname.startsWith(base + '/')) ? pathname.slice(base.length) || '/' : pathname);
