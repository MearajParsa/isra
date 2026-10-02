import { uuidToBuf, uuidv7 } from '../common/ids';
import type { Q } from './db';

export type InboxKind = 'membership' | 'turn' | 'evaluation' | 'system';

/** رویداد اینباکس برای low، در همان تراکنش کسب‌وکار (outbox)؛ worker بعد از commit می‌فرستد */
export async function emitInbox(q: Q, now: Date, userId: string, kind: InboxKind, title: string, body: string, ref: string | null): Promise<void> {
  await q.query('INSERT INTO outbox_events (id, type, payload, created_at, attempts, next_attempt_at) VALUES (?, ?, ?, ?, 0, ?)', [
    uuidToBuf(uuidv7(now.getTime())),
    'inbox.message.created',
    JSON.stringify({ userId, kind, title: title.slice(0, 120), body: body.slice(0, 500), ref }),
    now,
    now
  ]);
}
