import { JALALI_MONTHS, gregorianStringToJalali } from './jalali';

const FA = new Intl.NumberFormat('fa-IR', { useGrouping: false });

export type Interval = 'day' | 'week' | 'month';
export const INTERVAL_LABEL: Record<Interval, string> = { day: 'روزانه', week: 'هفتگی', month: 'ماهانه' };

/** برچسب کوتاه محور: «۱۴ مهر» (روز/هفته) یا «مهر ۱۴۰۵» (ماه) از تاریخ آغاز bucket */
export function bucketLabel(bucket: string, interval: Interval): string {
  const j = gregorianStringToJalali(bucket);
  if (!j) return bucket;
  const month = JALALI_MONTHS[j.jm - 1] ?? '';
  return interval === 'month' ? `${month} ${FA.format(j.jy)}` : `${FA.format(j.jd)} ${month}`;
}

/** برچسب کامل (tooltip/جدول): روز ⇒ «۱۴ مهر ۱۴۰۵»؛ هفته ⇒ «هفتهٔ ۱۴ مهر ۱۴۰۵»؛ ماه ⇒ «مهر ۱۴۰۵» */
export function bucketTitle(bucket: string, interval: Interval): string {
  const j = gregorianStringToJalali(bucket);
  if (!j) return bucket;
  const month = JALALI_MONTHS[j.jm - 1] ?? '';
  const full = `${FA.format(j.jd)} ${month} ${FA.format(j.jy)}`;
  if (interval === 'week') return `هفتهٔ ${full}`;
  if (interval === 'month') return `${month} ${FA.format(j.jy)}`;
  return full;
}

/** تاریخ شمسی عددی `1405/07/14` با ارقام فارسی برای CSV و فیلترها */
export function jalaliString(iso: string): string {
  const j = gregorianStringToJalali(iso);
  if (!j) return iso;
  const p2 = (n: number) => FA.format(n).padStart(2, '۰');
  return `${FA.format(j.jy)}/${p2(j.jm)}/${p2(j.jd)}`;
}

/** چند برچسب محور را نشان بدهیم تا شلوغ نشود (حداکثر max)؛ اندیس‌ها */
export function tickIndexes(n: number, max: number): number[] {
  if (n <= 0) return [];
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const step = Math.ceil((n - 1) / (max - 1));
  const out: number[] = [];
  for (let i = 0; i < n; i += step) out.push(i);
  return out;
}

/** سقف «زیبا» برای محور مقدار */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * exp;
}
