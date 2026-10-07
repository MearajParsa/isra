import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { AppError } from '../common/app-error';
import type { Clock } from '../common/clock';

const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;
const TTL_MS = 24 * 3_600_000;
/** کاربر مجازی کلیدهای internal (high) در جدول idempotency_keys */
const INTERNAL_USER = Buffer.alloc(16, 0);

/**
 * Idempotency-Key مسیرهای internal (MID_ADMIN.sessions / membersAdd؛ docs-v2/30 §۳.۴): retry همان کلید+بدنه از high
 * همان پاسخ را بدون اثر دوباره برمی‌گرداند؛ بدنهٔ متفاوت ⇒ IDEMPOTENCY_KEY_REUSED؛ هم‌زمان ⇒ IDEMPOTENCY_IN_PROGRESS.
 * خطای دامنه ⇒ تراکنش mid commit نشده ⇒ کلید آزاد می‌شود. نبود کلید ⇒ اجرای عادی.
 */
export async function internalIdempotent<T>(ds: DataSource, clock: Clock, scope: string, key: string | undefined, body: unknown, fn: () => Promise<T>): Promise<T> {
  if (!key) return fn();
  if (!KEY_RE.test(key)) throw new AppError('VALIDATION_FAILED', { details: { fields: { 'Idempotency-Key': 'کلید نامعتبر است.' } } });
  const scoped = `int:${scope}:${key}`.slice(0, 80);
  const hash = createHash('sha256').update(`${scope}\n${JSON.stringify(body ?? {})}`).digest();
  const now = clock.now();
  await ds.query('DELETE FROM idempotency_keys WHERE user_id = ? AND idem_key = ? AND created_at < ?', [INTERNAL_USER, scoped, new Date(now.getTime() - TTL_MS)]);
  const ins = (await ds.query("INSERT IGNORE INTO idempotency_keys (user_id, idem_key, request_hash, status, created_at) VALUES (?, ?, ?, 'pending', ?)", [INTERNAL_USER, scoped, hash, now])) as { affectedRows?: number };
  if (!ins.affectedRows) {
    const row = ((await ds.query('SELECT request_hash, status, response FROM idempotency_keys WHERE user_id = ? AND idem_key = ?', [INTERNAL_USER, scoped])) as { request_hash: Buffer; status: string; response: unknown }[])[0];
    if (!row || !row.request_hash.equals(hash)) throw new AppError('CONFLICT', { message: 'این کلید تکراری با درخواست دیگری استفاده شده است.', details: { reason: 'IDEMPOTENCY_KEY_REUSED' } });
    if (row.status !== 'done') throw new AppError('CONFLICT', { message: 'درخواست قبلی هنوز در حال پردازش است.', details: { reason: 'IDEMPOTENCY_IN_PROGRESS', retryAfterSec: 1 } });
    return (typeof row.response === 'string' ? JSON.parse(row.response) : row.response) as T;
  }
  try {
    const value = await fn();
    await ds.query("UPDATE idempotency_keys SET status = 'done', response = ? WHERE user_id = ? AND idem_key = ?", [JSON.stringify(value ?? {}), INTERNAL_USER, scoped]);
    return value;
  } catch (e) {
    await ds.query('DELETE FROM idempotency_keys WHERE user_id = ? AND idem_key = ?', [INTERNAL_USER, scoped]).catch(() => undefined);
    throw e;
  }
}
