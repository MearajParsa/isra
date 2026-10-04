/** فقط مسیرهای داخلی؛ جلوگیری از open-redirect */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (typeof next !== 'string' || next === '') return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f\\]/.test(next)) return fallback;
  // اسلش/بک‌اسلش/کنترل‌کاراکتر با percent-encoding
  if (/%(2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(next)) return fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  try {
    const base = 'http://x.invalid';
    const u = new URL(next, base);
    if (u.origin !== base) return fallback;
    if (u.pathname + u.search + u.hash !== next) return fallback;
  } catch {
    return fallback;
  }
  return next;
}
