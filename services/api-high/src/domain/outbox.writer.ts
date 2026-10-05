import { uuidToBuf, uuidv7 } from '../common/ids';
import type { Q } from './db';

/** رویداد outbox در همان تراکنش تغییر؛ worker بعد از commit به low/mid می‌فرستد (at-least-once، consumer idempotent) */
export async function emit(q: Q, now: Date, type: string, payload: Record<string, unknown>): Promise<void> {
  await q.query('INSERT INTO outbox_events (id, type, payload, created_at, attempts, next_attempt_at) VALUES (?, ?, ?, ?, 0, ?)', [uuidToBuf(uuidv7(now.getTime())), type, JSON.stringify(payload), now, now]);
}

/** چند رویداد با یک INSERT (انتشار claim دسته‌ای) */
export async function emitMany(q: Q, now: Date, events: readonly { type: string; payload: Record<string, unknown> }[]): Promise<void> {
  if (events.length === 0) return;
  const args: unknown[] = [];
  for (const e of events) args.push(uuidToBuf(uuidv7(now.getTime())), e.type, JSON.stringify(e.payload), now, 0, now);
  await q.query(`INSERT INTO outbox_events (id, type, payload, created_at, attempts, next_attempt_at) VALUES ${events.map(() => '(?, ?, ?, ?, ?, ?)').join(',')}`, args);
}
