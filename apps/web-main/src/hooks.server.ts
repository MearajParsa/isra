import type { Handle, HandleServerError } from '@sveltejs/kit';

/** هدرهای امنیتی برای همهٔ پاسخ‌ها (CSP را خود SvelteKit با nonce/hash اضافه می‌کند؛ svelte.config.js) */
export const handle: Handle = async ({ event, resolve }) => {
  const res = await resolve(event);
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  // HSTS فقط روی https (پشت reverse-proxy: X-Forwarded-Proto)
  if (event.url.protocol === 'https:' || event.request.headers.get('x-forwarded-proto') === 'https') res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  return res;
};

/** خطای پیش‌بینی‌نشدهٔ SSR: جزئیات فقط در لاگ سرور (بدون نشت stack/وابستگی)؛ کاربر پیام عمومی می‌بیند */
export const handleError: HandleServerError = ({ error, event, status }) => {
  console.error(JSON.stringify({ event: 'ssr-error', status, path: event.url.pathname, err: error instanceof Error ? error.message : 'unknown' }));
  return { message: 'مشکلی پیش آمد. دوباره تلاش کنید.' };
};
