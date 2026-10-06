import { uuidToBuf, uuidv7 } from '../common/ids';
import type { Q } from './db';

export type InboxKind = 'membership' | 'turn' | 'evaluation' | 'system' | 'announcement' | 'session';
export interface InboxItem {
  userId: string;
  kind: InboxKind;
  title: string;
  body: string;
  ref: string | null;
}

const BATCH = 200;

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

/**
 * ۱.۶.۰ (docs-v2/30): چند پیام اینباکس در یک رویداد `inbox.messages.created` (دسته‌های ۲۰۰تایی) — fan-out بدون یک HTTP per گیرنده.
 * در همان تراکنش کسب‌وکار فراخوانی شود.
 */
export async function emitInboxBatch(q: Q, now: Date, items: readonly InboxItem[]): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH).map((x) => ({ userId: x.userId, kind: x.kind, title: x.title.slice(0, 120), body: x.body.slice(0, 500), ref: x.ref }));
    await q.query('INSERT INTO outbox_events (id, type, payload, created_at, attempts, next_attempt_at) VALUES (?, ?, ?, ?, 0, ?)', [
      uuidToBuf(uuidv7(now.getTime())),
      'inbox.messages.created',
      JSON.stringify({ items: chunk }),
      now,
      now
    ]);
  }
}
