const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

export function toLatinDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (d) => {
    const i = FA.indexOf(d);
    return String(i >= 0 ? i : AR.indexOf(d));
  });
}

/** نرمال‌سازی سمت سرور (docs-v2/15 §۸): ارقام فارسی/عربی، +98، 0098، 98، 9xxxxxxxxx ⇒ 09xxxxxxxxx؛ نامعتبر ⇒ ورودی اصلی (تا zod رد کند) */
export function normalizePhone(input: unknown): unknown {
  if (typeof input !== 'string' || input.length > 32) return input;
  let s = toLatinDigits(input).replace(/[\s\-()]/g, '');
  if (s.startsWith('+98')) s = '0' + s.slice(3);
  else if (s.startsWith('0098')) s = '0' + s.slice(4);
  else if (s.startsWith('98') && s.length === 12) s = '0' + s.slice(2);
  else if (/^9\d{9}$/.test(s)) s = '0' + s;
  return /^09\d{9}$/.test(s) ? s : input;
}

/** ورودی بدنه را (در صورت وجود phone) نرمال می‌کند */
export function withNormalizedPhone(body: unknown): unknown {
  if (body && typeof body === 'object' && 'phone' in body) return { ...body, phone: normalizePhone((body as Record<string, unknown>).phone) };
  return body;
}
