const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

/** ارقام فارسی/عربی را به لاتین تبدیل می‌کند */
export function toLatinDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (d) => {
    const i = FA.indexOf(d);
    return String(i >= 0 ? i : AR.indexOf(d));
  });
}

/** نرمال‌سازی به 09xxxxxxxxxx؛ در صورت نامعتبر بودن null */
export function normalizePhone(input: string): string | null {
  let s = toLatinDigits(input).replace(/[\s\-()]/g, '');
  if (s.startsWith('+98')) s = '0' + s.slice(3);
  else if (s.startsWith('0098')) s = '0' + s.slice(4);
  else if (s.startsWith('98') && s.length === 12) s = '0' + s.slice(2);
  else if (/^9\d{9}$/.test(s)) s = '0' + s;
  return /^09\d{9}$/.test(s) ? s : null;
}

/** نمایش ماسک‌شدهٔ شماره (برای متن‌ها): ۰۹۱۲ ۱۲۳ ۴۵۶۷ */
export function formatPhone(phone: string): string {
  return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
}

export function toLatinCode(input: string): string {
  return toLatinDigits(input).replace(/\D/g, '');
}
