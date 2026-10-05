import { AppError } from './app-error';

/**
 * تاریخ تقویمی به‌وقت Asia/Tehran. ایران از شهریور ۱۴۰۱ ساعت تابستانی ندارد ⇒ offset ثابت +03:30
 * (در SQL هم همین offset ثابت استفاده می‌شود تا نیازی به جدول timezone در MySQL نباشد).
 */
export const TEHRAN_OFFSET_MIN = 210;
const DAY = 86_400_000;

/** `YYYY-MM-DD` معتبر (تاریخ واقعی تقویم) ⇒ ms نیمه‌شب UTC همان تاریخ؛ نامعتبر ⇒ null */
export function parseDay(s: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s ? null : t;
}

export const dayStr = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** امروز (تهران) به‌صورت ms نیمه‌شب UTC همان تاریخ */
export function todayTehran(now: Date): number {
  return Math.floor((now.getTime() + TEHRAN_OFFSET_MIN * 60_000) / DAY) * DAY;
}

/** آغاز روز تهران (۰۰:۰۰ محلی) به‌صورت لحظهٔ UTC */
export const startOfDayUtc = (dayMs: number): Date => new Date(dayMs - TEHRAN_OFFSET_MIN * 60_000);

export interface DayRange {
  from: string;
  to: string;
  /** [fromUtc, toUtcExclusive) برای فیلتر روی ستون‌های UTC */
  fromUtc: Date;
  toUtcExclusive: Date;
}

/** بازهٔ گزارش: پیش‌فرض ۳۰ روز اخیر؛ حداکثر ۳۶۶ روز؛ from ≤ to؛ خطا ⇒ VALIDATION_FAILED با details.fields */
export function resolveRange(now: Date, from?: string, to?: string, maxDays = 366, defaultDays = 30): DayRange {
  const fail = (field: string, message: string) => new AppError('VALIDATION_FAILED', { details: { fields: { [field]: message } } });
  let toMs = todayTehran(now);
  if (to !== undefined) {
    const p = parseDay(to);
    if (p === null) throw fail('to', 'تاریخ نامعتبر است.');
    toMs = p;
  }
  let fromMs = toMs - defaultDays * DAY;
  if (from !== undefined) {
    const p = parseDay(from);
    if (p === null) throw fail('from', 'تاریخ نامعتبر است.');
    fromMs = p;
  }
  if (fromMs > toMs) throw fail('from', 'تاریخ شروع باید قبل از پایان باشد.');
  if ((toMs - fromMs) / DAY > maxDays) throw fail('to', `بازهٔ گزارش حداکثر ${maxDays} روز است.`);
  return { from: dayStr(fromMs), to: dayStr(toMs), fromUtc: startOfDayUtc(fromMs), toUtcExclusive: startOfDayUtc(toMs + DAY) };
}

export type Interval = 'day' | 'week' | 'month';

/** آغاز سطل: day=خود روز، week=شنبهٔ همان هفته، month=اول ماه (میلادی) */
export function bucketStart(dayMs: number, interval: Interval): number {
  if (interval === 'day') return dayMs;
  const d = new Date(dayMs);
  if (interval === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  return dayMs - ((d.getUTCDay() + 1) % 7) * DAY; // شنبه=۶ ⇒ ۰؛ یک‌شنبه=۰ ⇒ ۱ … جمعه=۵ ⇒ ۶
}

const nextBucket = (ms: number, interval: Interval): number => {
  if (interval === 'day') return ms + DAY;
  if (interval === 'week') return ms + 7 * DAY;
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
};

/** سری zero-filled: روزهای شمارش‌شده (`YYYY-MM-DD` ⇒ count) در سطل‌های بازه جمع می‌شوند */
export function fillSeries(range: DayRange, interval: Interval, perDay: Map<string, number>): { bucket: string; count: number }[] {
  const acc = new Map<number, number>();
  const first = bucketStart(parseDay(range.from)!, interval);
  const last = bucketStart(parseDay(range.to)!, interval);
  for (let b = first; b <= last; b = nextBucket(b, interval)) acc.set(b, 0);
  for (const [d, n] of perDay) {
    const ms = parseDay(d);
    if (ms === null) continue;
    const b = bucketStart(ms, interval);
    if (acc.has(b)) acc.set(b, (acc.get(b) ?? 0) + n);
  }
  return [...acc].map(([b, count]) => ({ bucket: dayStr(b), count }));
}
