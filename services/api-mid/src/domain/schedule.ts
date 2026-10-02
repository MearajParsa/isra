import type { z } from 'zod';
import type { SessionSchedule } from '@isra/api-types';

export type Schedule = z.infer<typeof SessionSchedule>;

/** ایران ثابت UTC+03:30 (DST لغو شده)؛ هفته: ۰=شنبه … ۶=جمعه */
const TEHRAN_OFFSET_MS = 3.5 * 3_600_000;
const DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC ms ⇒ ISO با offset +03:30 (قرارداد IsoDateTime) */
export function toTehranIso(ms: number): string {
  const d = new Date(ms + TEHRAN_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+03:30`;
}

/** شروع بعدی (UTC ms) یا null اگر دیگر رخدادی نیست */
export function nextStartMs(s: Schedule, nowMs: number): number | null {
  if (s.type === 'once') return Date.parse(s.endsAt) > nowMs ? Date.parse(s.startsAt) : null;

  const [hh, mm] = s.timeOfDay.split(':').map(Number) as [number, number];
  const startOfTehranDay = Math.floor((nowMs + TEHRAN_OFFSET_MS) / DAY) * DAY - TEHRAN_OFFSET_MS;
  const from = s.type === 'range' ? Date.parse(s.rangeFrom) : -Infinity;
  const to = s.type === 'range' ? Date.parse(s.rangeTo) : Infinity;
  const horizon = s.type === 'range' ? Math.min(400, Math.ceil((to - nowMs) / DAY) + 2) : 8;

  for (let d = 0; d <= Math.max(horizon, 0); d++) {
    const dayStart = startOfTehranDay + d * DAY;
    const jsDay = new Date(dayStart + TEHRAN_OFFSET_MS).getUTCDay(); // 0=یکشنبه
    const weekday = (jsDay + 1) % 7; // 0=شنبه
    if (!s.weekdays.includes(weekday)) continue;
    const start = dayStart + (hh * 60 + mm) * 60_000;
    if (start < nowMs || start < from || start > to) continue;
    return start;
  }
  return null;
}

export const nextStartsAt = (s: Schedule, now: Date): string | null => {
  const ms = nextStartMs(s, now.getTime());
  return ms === null ? null : toTehranIso(ms);
};
