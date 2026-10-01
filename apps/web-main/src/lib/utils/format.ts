import type { SessionSchedule, SessionStatus } from '$lib/api/types';
import type { SessionState } from '$lib/api/mid-types';

const TZ = 'Asia/Tehran';

const dateFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long'
});
const dateTimeFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});
const shortDateFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: TZ,
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});
const timeFmt = new Intl.DateTimeFormat('fa-IR', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});
const numFmt = new Intl.NumberFormat('fa-IR');

export const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'] as const;

export const formatNumber = (n: number) => numFmt.format(n);
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));
export const formatShortDate = (iso: string) => shortDateFmt.format(new Date(iso));
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));

/** «۱۲:۳۰» از رشتهٔ HH:mm */
export function formatTimeOfDay(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return numFmt.format(h).padStart(2, '۰') + ':' + numFmt.format(m).padStart(2, '۰');
}

/** زمان نسبی کوتاه برای اینباکس */
export function formatRelative(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'همین حالا';
  if (min < 60) return `${numFmt.format(min)} دقیقه پیش`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${numFmt.format(h)} ساعت پیش`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${numFmt.format(d)} روز پیش`;
  return formatShortDate(iso);
}

function weekdaysLabel(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'همهٔ روزها';
  return sorted.map((d) => WEEKDAYS[d]).join('، ');
}

/** عنوان فارسی برای زمان‌بندی جلسه */
export function scheduleLabel(s: SessionSchedule): string {
  switch (s.type) {
    case 'once':
      return `${formatDate(s.startsAt)}، ساعت ${formatTime(s.startsAt)}`;
    case 'recurring':
      return `هر ${weekdaysLabel(s.weekdays)}، ساعت ${formatTimeOfDay(s.timeOfDay)}`;
    case 'range':
      return `هر ${weekdaysLabel(s.weekdays)}، ساعت ${formatTimeOfDay(s.timeOfDay)} · از ${formatShortDate(s.rangeFrom)} تا ${formatShortDate(s.rangeTo)}`;
  }
}

export const scheduleTypeLabel: Record<SessionSchedule['type'], string> = {
  once: 'یک‌باره',
  recurring: 'تکرارشونده',
  range: 'بازهٔ محدود'
};

export const statusLabel: Record<SessionStatus, string> = {
  scheduled: 'پیش‌رو',
  started: 'در حال برگزاری',
  ended: 'پایان‌یافته'
};

/** «۲:۰۰» برای شمارنده */
export function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${numFmt.format(m)}:${numFmt.format(s).padStart(2, '۰')}`;
}

export const sessionStateLabel: Record<SessionState, string> = {
  draft: 'پیش‌نویس',
  scheduled: 'پیش‌رو',
  started: 'در حال برگزاری',
  ended: 'پایان‌یافته'
};

/** مقدار input[type=datetime-local] (YYYY-MM-DDTHH:mm) ← ISO، به وقت تهران */
export function toTehranInput(iso: string): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
    .formatToParts(new Date(iso))
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export const toTehranDateInput = (iso: string) => toTehranInput(iso).slice(0, 10);

/** input (وقت تهران، بدون DST) ← ISO؛ ناقص ⇒ '' */
export function fromTehranInput(value: string): string {
  if (!value) return '';
  const v = value.length === 10 ? `${value}T00:00` : value;
  const d = new Date(`${v}:00+03:30`);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
