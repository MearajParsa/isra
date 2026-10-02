const TZ = 'Asia/Tehran';

const numFmt = new Intl.NumberFormat('fa-IR');
const dateTimeFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: TZ,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});
const dateFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });

export const formatNumber = (n: number) => numFmt.format(n);
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));

/** «۲:۰۰» برای شمارنده */
export function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${numFmt.format(m)}:${numFmt.format(s).padStart(2, '۰')}`;
}

/** زمان نسبی کوتاه */
export function formatRelative(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'همین حالا';
  if (min < 60) return `${numFmt.format(min)} دقیقه پیش`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${numFmt.format(h)} ساعت پیش`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${numFmt.format(d)} روز پیش`;
  return dateFmt.format(new Date(iso));
}
