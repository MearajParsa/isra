import { uuidToBuf, uuidv7 } from '../common/ids';
import type { Q } from './db';

/** رویداد outbox در همان تراکنش تغییر؛ worker بعد از commit به low/mid می‌فرستد (at-least-once، consumer idempotent) */
export async function emit(q: Q, now: Date, type: string, payload: Record<string, unknown>): Promise<void> {
  await q.query('INSERT INTO outbox_events (id, type, payload, created_at, attempts, next_attempt_at) VALUES (?, ?, ?, ?, 0, ?)', [uuidToBuf(uuidv7(now.getTime())), type, JSON.stringify(payload), now, now]);
}
