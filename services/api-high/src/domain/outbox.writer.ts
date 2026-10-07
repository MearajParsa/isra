import { uuidToBuf, uuidv7 } from '../common/ids';
import type { Peer } from '../internal/internal-auth';
import type { Q } from './db';

/**
 * مسیریابی per مقصد (docs-v2/30 §۳ کارایی): هر نوع رویداد فقط به سرویس‌هایی که آن را مصرف می‌کنند.
 *  - system.role.changed ⇒ low (claim در JWT)؛ mid آن را مصرف نمی‌کند
 *  - system.settings.changed ⇒ low (پرچم‌ها) + mid (وزن/آستانهٔ fallback)
 *  - system.permission.changed ⇒ low (پذیرش no-op؛ سازگاری)
 *  - badge.catalog.changed ⇒ mid (اعطا/پس‌گیری) + low (L-32/L-33)
 *  - inbox.broadcast.created ⇒ فقط low
 */
export const EVENT_ROUTES: Readonly<Record<string, readonly Peer[]>> = {
  'system.role.changed': ['low'],
  'system.settings.changed': ['low', 'mid'],
  'system.permission.changed': ['low'],
  'badge.catalog.changed': ['mid', 'low'],
  'inbox.broadcast.created': ['low']
};

export const routeOf = (type: string): readonly Peer[] => EVENT_ROUTES[type] ?? [];

/** رویداد outbox در همان تراکنش تغییر؛ worker بعد از commit به مقصدهای همان نوع می‌فرستد (at-least-once، consumer idempotent) */
export async function emit(q: Q, now: Date, type: string, payload: Record<string, unknown>): Promise<void> {
  await emitMany(q, now, [{ type, payload }]);
}

/** چند رویداد با یک INSERT (انتشار claim دسته‌ای) */
export async function emitMany(q: Q, now: Date, events: readonly { type: string; payload: Record<string, unknown> }[]): Promise<void> {
  if (events.length === 0) return;
  const args: unknown[] = [];
  for (const e of events) args.push(uuidToBuf(uuidv7(now.getTime())), e.type, JSON.stringify(e.payload), now, 0, now, routeOf(e.type).join(','));
  await q.query(`INSERT INTO outbox_events (id, type, payload, created_at, attempts, next_attempt_at, pending_peers) VALUES ${events.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',')}`, args);
}
