/** اعتبارسنجی سمت کلاینت فرم تنظیمات (UX سریع)؛ منبع حقیقت سرور است (api-high دوباره اعتبارسنجی می‌کند) */
import type { EvalWeights, SettingsInput } from '$lib/api/high-types';

export const ALLOWED_FLAGS = ['maintenance_mode', 'registration_open'] as const;

export function validateSettings(i: SettingsInput): Record<string, string> {
  const e: Record<string, string> = {};
  const w = i.evalWeights;
  const parts = [w.voice, w.tone, w.tajweed];
  if (parts.some((x) => !Number.isInteger(x) || x < 0 || x > 100)) e.evalWeights = 'هر وزن عددی صحیح بین ۰ تا ۱۰۰ باشد.';
  else if (parts.reduce((a, b) => a + b, 0) !== 100) e.evalWeights = 'مجموع وزن‌ها باید دقیقاً ۱۰۰ باشد.';

  const t = i.badgeThresholds;
  if (t.length !== 4 || t.some((x) => !Number.isInteger(x) || x <= 0)) e.badgeThresholds = 'چهار آستانهٔ صحیح و مثبت لازم است.';
  else if (!t.every((x, k) => k === 0 || x > t[k - 1])) e.badgeThresholds = 'آستانه‌ها باید اکیداً صعودی باشند.';

  const keys = Object.keys(i.flags);
  if (keys.some((k) => !(ALLOWED_FLAGS as readonly string[]).includes(k))) e.flags = 'پرچم ناشناخته است.';
  return e;
}

/** score ۰..۱۰۰ با وزن‌های داده‌شده (برای پیش‌نمایش) */
export function previewScore(i: { voice: number; tone: number; tajweed: number }, w: EvalWeights): number {
  const sum = w.voice + w.tone + w.tajweed || 1;
  return Math.round(((i.voice * w.voice + i.tone * w.tone + i.tajweed * w.tajweed) / sum) * 10);
}
