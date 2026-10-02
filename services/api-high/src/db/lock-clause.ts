import type { DataSource } from 'typeorm';

/**
 * `FOR UPDATE SKIP LOCKED` فقط از MariaDB 10.6 و MySQL 8.0.1 پشتیبانی می‌شود؛ روی نسخه‌های قدیمی‌تر (مثلاً XAMPP با MariaDB 10.4)
 * به `FOR UPDATE` ساده برمی‌گردیم (برای یک instance کاملاً درست است؛ فقط worker دوم منتظر قفل می‌ماند).
 */
export function supportsSkipLocked(version: string): boolean {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!m) return false;
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (/mariadb/i.test(version)) return maj > 10 || (maj === 10 && min >= 6);
  return maj > 8 || (maj === 8 && (min > 0 || pat >= 1));
}

let cached: Promise<string> | undefined;

export function lockClause(ds: DataSource): Promise<string> {
  cached ??= (ds.query('SELECT VERSION() AS v') as Promise<{ v: string }[]>)
    .then((r) => (supportsSkipLocked(String(r[0]?.v ?? '')) ? 'FOR UPDATE SKIP LOCKED' : 'FOR UPDATE'))
    .catch((e) => {
      cached = undefined;
      throw e;
    });
  return cached;
}
