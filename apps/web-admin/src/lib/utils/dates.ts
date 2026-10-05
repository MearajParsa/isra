/** کمک‌های بازهٔ تاریخ (تقویم Asia/Tehran؛ رشتهٔ YYYY-MM-DD) */

export const MAX_RANGE_DAYS = 366;
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const p2 = (n: number) => String(n).padStart(2, '0');
const toStr = (d: Date) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
};

/** تاریخ امروز به وقت تهران */
export function todayTehran(now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now)
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}`;
}

export function isValidIsoDate(s: string | null | undefined): s is string {
  if (!s || !ISO_DATE.test(s)) return false;
  return toStr(parse(s)) === s;
}

export function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toStr(d);
}

/** تعداد روز بین دو تاریخ (to - from) */
export function diffDays(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

export type RangePreset = '7d' | '30d' | '90d' | 'year' | 'custom';
export const PRESET_DAYS: Record<Exclude<RangePreset, 'custom'>, number> = { '7d': 7, '30d': 30, '90d': 90, year: 365 };
export const PRESET_LABEL: Record<RangePreset, string> = { '7d': '۷ روز', '30d': '۳۰ روز', '90d': '۹۰ روز', year: 'یک سال', custom: 'بازهٔ دلخواه' };

/** بازهٔ شامل امروز: «۷ روز» = ۷ تاریخ پایانی (امروز و ۶ روز قبل) */
export function presetRange(p: Exclude<RangePreset, 'custom'>, today: string): { from: string; to: string } {
  return { from: addDays(today, -(PRESET_DAYS[p] - 1)), to: today };
}

/** تشخیص پیش‌تنظیم از روی بازه؛ در غیر این صورت custom */
export function detectPreset(from: string, to: string, today: string): RangePreset {
  if (to !== today) return 'custom';
  for (const p of ['7d', '30d', '90d', 'year'] as const) if (from === presetRange(p, today).from) return p;
  return 'custom';
}

export type RangeCheck = { ok: true } | { ok: false; error: string };
/** اعتبارسنجی بازه: ترتیب و سقف ۳۶۶ روز (قرارداد) */
export function validateRange(from: string, to: string): RangeCheck {
  if (!isValidIsoDate(from) || !isValidIsoDate(to)) return { ok: false, error: 'تاریخ شروع و پایان را کامل انتخاب کنید.' };
  if (to < from) return { ok: false, error: 'پایان بازه نباید قبل از شروع باشد.' };
  if (diffDays(from, to) + 1 > MAX_RANGE_DAYS) return { ok: false, error: 'بازه حداکثر ۳۶۶ روز می‌تواند باشد.' };
  return { ok: true };
}
