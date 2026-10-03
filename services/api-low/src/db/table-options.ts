import type { QueryRunner } from 'typeorm';

/**
 * گزینه‌های جدول: collation را از پیش‌فرض خود دیتابیس می‌گیرد (مثلاً `utf8mb4_persian_ci` که مالک روی هاست تنظیم کرده)
 * تا همهٔ جدول‌ها یک collation داشته باشند و «Illegal mix of collations» پیش نیاید.
 * اگر پیش‌فرض دیتابیس utf8mb4 نبود (مثلاً latin1 روی MariaDB قدیمی) ⇒ `utf8mb4_unicode_ci`.
 */
export async function tableOptions(q: QueryRunner): Promise<string> {
  const rows = (await q.query('SELECT @@collation_database AS c')) as { c: string }[];
  const c = String(rows[0]?.c ?? '');
  const collation = /^utf8mb4_[a-z0-9_]+$/.test(c) ? c : 'utf8mb4_unicode_ci';
  return `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=${collation}`;
}
