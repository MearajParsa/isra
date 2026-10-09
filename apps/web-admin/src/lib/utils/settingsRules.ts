/** اعتبارسنجی سمت کلاینت فرم تنظیمات (UX سریع)؛ منبع حقیقت سرور است (api-high دوباره اعتبارسنجی می‌کند) */
import type { SettingsInput } from '$lib/api/high-types';

export const ALLOWED_FLAGS = ['maintenance_mode', 'registration_open'] as const;

/** ۱.۷.۰: تنظیمات فقط پرچم‌ها (evalWeights/badgeThresholds حذف شدند) */
export function validateSettings(i: SettingsInput): Record<string, string> {
  const e: Record<string, string> = {};
  const keys = Object.keys(i.flags);
  if (keys.some((k) => !(ALLOWED_FLAGS as readonly string[]).includes(k))) e.flags = 'پرچم ناشناخته است.';
  return e;
}
