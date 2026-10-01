import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { low } from '@isra/api-types';
import { Clock } from '../common/clock';
import { uuidToBuf, uuidv7 } from '../common/ids';
import { SessionStatusCache } from '../auth/session-status.cache';

export interface InboundEvent {
  eventId: string;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

const InboxCreated = z.object({
  userId: z.uuid(),
  kind: low.InboxKind,
  title: z.string().trim().min(1).max(120),
  body: z.string().max(500),
  ref: z.string().max(200).nullable().default(null)
});

const RoleChanged = z.object({
  userId: z.uuid(),
  systemRoles: z.array(z.string().max(64)).max(32),
  grants: z.array(z.string().max(96)).max(256),
  permVer: z.number().int().min(1)
});

/**
 * مصرف رویدادهای ورودی از mid/high. dedupe با `inbox_events` در همان تراکنش اثر ⇒ تحویل مجدد بی‌اثر است.
 * نوع ناشناخته: پذیرفته و نادیده (سازگاری رو‌به‌جلو؛ producer جدیدتر نباید consumer قدیمی را بشکند).
 */
@Injectable()
export class EventsService {
  private readonly log = new Logger('Events');

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly status: SessionStatusCache
  ) {}

  async handle(e: InboundEvent): Promise<void> {
    const now = this.clock.now();
    await this.ds.transaction(async (m) => {
      const ins = (await m.query('INSERT IGNORE INTO inbox_events (event_id, type, received_at) VALUES (?, ?, ?)', [e.eventId, e.type, now])) as { affectedRows?: number };
      if (!ins.affectedRows) return; // تکراری

      if (e.type === 'inbox.message.created') {
        const p = InboxCreated.parse(e.payload);
        const user = (await m.query('SELECT 1 AS x FROM users WHERE id = ?', [uuidToBuf(p.userId)])) as unknown[];
        if (!user.length) {
          this.log.warn({ type: e.type }, 'کاربر ناشناخته؛ نادیده');
          return;
        }
        await m.query('INSERT IGNORE INTO inbox_messages (id, user_id, kind, title, body, ref, created_at, source_event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
          uuidToBuf(uuidv7(now.getTime())),
          uuidToBuf(p.userId),
          p.kind,
          p.title,
          p.body,
          p.ref,
          now,
          e.eventId
        ]);
      } else if (e.type === 'system.role.changed') {
        const p = RoleChanged.parse(e.payload);
        // permVer فقط رو‌به‌جلو (رویداد قدیمی‌تر نباید claim جدید را بازنویسی کند)
        await m.query(
          `INSERT INTO user_claims (user_id, system_roles, grants, perm_ver, updated_at) VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             system_roles = IF(VALUES(perm_ver) > perm_ver, VALUES(system_roles), system_roles),
             grants = IF(VALUES(perm_ver) > perm_ver, VALUES(grants), grants),
             updated_at = IF(VALUES(perm_ver) > perm_ver, VALUES(updated_at), updated_at),
             perm_ver = GREATEST(perm_ver, VALUES(perm_ver))`,
          [uuidToBuf(p.userId), JSON.stringify(p.systemRoles), JSON.stringify(p.grants), p.permVer, now]
        );
      } else {
        this.log.debug({ type: e.type }, 'نوع رویداد ناشناخته؛ نادیده');
      }
    });
  }

}
