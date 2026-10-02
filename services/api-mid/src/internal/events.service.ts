import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { Clock } from '../common/clock';
import { uuidToBuf } from '../common/ids';
import { SettingsChanged, SettingsService } from '../domain/settings.service';

export interface InboundEvent {
  eventId: string;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

const UserRegistered = z.object({ userId: z.uuid() });
const ProfileUpdated = z.object({ userId: z.uuid(), firstName: z.string().max(40).optional(), lastName: z.string().max(40).optional() });

/**
 * مصرف رویدادهای ورودی (از low: user.*؛ از high: system.settings.changed). at-least-once ⇒ dedupe با eventId
 * در همان تراکنش اثر. نوع ناشناخته پذیرفته و نادیده می‌شود (سازگاری رو‌به‌جلو).
 */
@Injectable()
export class EventsService {
  private readonly log = new Logger('Events');

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly settings: SettingsService
  ) {}

  async handle(e: InboundEvent): Promise<void> {
    const now = this.clock.now();
    await this.ds.transaction(async (m) => {
      const ins = (await m.query('INSERT IGNORE INTO inbox_events (event_id, type, received_at) VALUES (?, ?, ?)', [e.eventId, e.type, now])) as { affectedRows?: number };
      if (!ins.affectedRows) return;

      if (e.type === 'user.registered') {
        const p = UserRegistered.parse(e.payload);
        await m.query('INSERT IGNORE INTO user_directory (user_id, first_name, last_name, updated_at) VALUES (?, ?, ?, ?)', [uuidToBuf(p.userId), '', '', now]);
      } else if (e.type === 'user.profile.updated') {
        const p = ProfileUpdated.parse(e.payload);
        await m.query(
          `INSERT INTO user_directory (user_id, first_name, last_name, updated_at) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), updated_at = VALUES(updated_at)`,
          [uuidToBuf(p.userId), p.firstName ?? '', p.lastName ?? '', now, p.firstName ?? null, p.lastName ?? null]
        );
      } else if (e.type === 'system.settings.changed') {
        await this.settings.apply(SettingsChanged.parse(e.payload));
      } else {
        this.log.debug({ type: e.type }, 'نوع رویداد ناشناخته؛ نادیده');
      }
    });
  }
}
