import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v5 (docs-v2/31 §۱، api-types ۱.۷.۰): کش baseline نقش‌های ضمنی guest/quran_student در `settings_cache`.
 * seed با version=0 و پیش‌فرض‌های قفل‌شدهٔ مالک تا L-30/L-31 پیش از نخستین `tier.baseline.changed` (version ≥ ۱) رفتار تعریف‌شده داشته باشند.
 * idempotent: ردیف موجود (مثلاً رویداد زودتر رسیده) دست نمی‌خورد.
 */
const BASELINE_KEY = 'tier_baseline';
/** پیش‌فرض‌های قفل‌شدهٔ مالک (docs-v2/31 §۱)؛ ثابت در migration (تغییر بعدی فقط با رویداد high) */
export const BASELINE_SEED = {
  guest: ['session.browse', 'gallery.view'],
  quran_student: ['session.browse', 'session.join', 'comment.post', 'gallery.view', 'points.view']
} as const;

export class LowV171728800000010 implements MigrationInterface {
  name = 'LowV171728800000010';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('INSERT IGNORE INTO settings_cache (setting_key, value, version, updated_at) VALUES (?, ?, 0, NOW(3))', [BASELINE_KEY, JSON.stringify(BASELINE_SEED)]);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DELETE FROM settings_cache WHERE setting_key = ?', [BASELINE_KEY]);
  }
}
