import { Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { ZodError, z } from 'zod';
import { internal, low } from '@isra/api-types';
import { BadgesService } from '../badges/badges.service';
import { Clock } from '../common/clock';
import { uuidToBuf, uuidv7 } from '../common/ids';
import { MidClient } from '../mid/mid.client';
import { BroadcastService } from '../messaging/broadcast.service';
import { BASELINE_KEY, TierBaselineService } from '../system/baseline.service';
import { FlagsService } from '../system/flags.service';
import type { Peer } from './internal-auth';

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
  ref: low.InboxRef.nullable().default(null)
});

const RoleChanged = z.object({
  userId: z.uuid(),
  systemRoles: z.array(z.string().max(64)).max(32),
  grants: z.array(z.string().max(96)).max(256),
  permVer: z.number().int().min(1)
});

const SettingsChanged = z.object({ version: z.number().int().min(1), flags: z.object({ maintenance_mode: z.boolean(), registration_open: z.boolean() }) });

type Handler = (m: EntityManager, now: Date) => Promise<void>;
type AfterCommit = () => void;

/**
 * مصرف رویدادهای ورودی از mid/high. dedupe با `inbox_events` در همان تراکنش اثر ⇒ تحویل مجدد بی‌اثر است.
 * payload ناسازگار با قرارداد ⇒ dead-letter و 202 (نه 4xx که تولیدکننده را تا ابد retry کند).
 * نوع مجاز ولی بی‌اثر (system.permission.changed) ⇒ پذیرش no-op.
 */
@Injectable()
export class EventsService {
  private readonly log = new Logger('Events');

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly flags: FlagsService,
    private readonly badges: BadgesService,
    private readonly mid: MidClient,
    private readonly broadcasts: BroadcastService,
    private readonly baseline: TierBaselineService
  ) {}

  async handle(e: InboundEvent, caller: Peer): Promise<{ deadLettered: boolean }> {
    const now = this.clock.now();
    let plan: { run?: Handler; after?: AfterCommit } | null = null;
    let error: string | null = null;
    try {
      plan = this.plan(e);
    } catch (err) {
      if (!(err instanceof ZodError)) throw err;
      error = err.issues
        .slice(0, 10)
        .map((i) => `${i.path.join('.') || '_'}: ${i.message}`)
        .join('; ')
        .slice(0, 1000);
    }

    let fresh = false;
    await this.ds.transaction(async (m) => {
      const ins = (await m.query('INSERT IGNORE INTO inbox_events (event_id, type, received_at) VALUES (?, ?, ?)', [e.eventId, e.type, now])) as { affectedRows?: number };
      if (!ins.affectedRows) return; // تکراری
      fresh = true;
      if (error !== null) {
        await m.query('INSERT INTO dead_letter_events (id, event_id, type, caller, payload, error, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
          uuidToBuf(uuidv7(now.getTime())),
          e.eventId,
          e.type,
          caller,
          JSON.stringify(e.payload),
          error,
          now
        ]);
        return;
      }
      await plan?.run?.(m, now);
    });
    if (error !== null) {
      if (fresh) this.log.warn({ type: e.type, caller, eventId: e.eventId }, 'invalid event payload ⇒ dead-letter');
      return { deadLettered: true };
    }
    if (fresh) plan?.after?.();
    return { deadLettered: false };
  }

  /** اعتبارسنجی payload (پیش از هر نوشتن) و ساخت handler؛ خطای zod ⇒ dead-letter */
  private plan(e: InboundEvent): { run?: Handler; after?: AfterCommit } | null {
    switch (e.type) {
      case 'inbox.message.created': {
        const p = InboxCreated.parse(e.payload);
        return { run: (m, now) => this.insertMessages(m, [p], e.eventId, now, true) };
      }
      case 'inbox.messages.created': {
        const p = internal.InboxMessagesCreated.parse(e.payload);
        return { run: (m, now) => this.insertMessages(m, p.items, e.eventId, now, false) };
      }
      case 'inbox.broadcast.created': {
        const p = internal.InboxBroadcastCreated.parse(e.payload);
        return { run: (m, now) => this.broadcasts.enqueue(m, p, now), after: () => this.broadcasts.kick() };
      }
      case 'badge.catalog.changed': {
        const p = internal.BadgeCatalogChanged.parse(e.payload);
        return { run: async (m, now) => void (await this.badges.applyCatalog(m, p, now)), after: () => this.badges.invalidate() };
      }
      case 'points.changed': {
        const p = internal.PointsChanged.parse(e.payload);
        return { after: () => this.mid.evictUser(p.userId) };
      }
      case 'system.role.changed': {
        const p = RoleChanged.parse(e.payload);
        // permVer فقط رو‌به‌جلو (رویداد قدیمی‌تر نباید claim جدید را بازنویسی کند)
        return {
          run: async (m, now) =>
            void (await m.query(
              `INSERT INTO user_claims (user_id, system_roles, grants, perm_ver, updated_at) VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 system_roles = IF(VALUES(perm_ver) > perm_ver, VALUES(system_roles), system_roles),
                 grants = IF(VALUES(perm_ver) > perm_ver, VALUES(grants), grants),
                 updated_at = IF(VALUES(perm_ver) > perm_ver, VALUES(updated_at), updated_at),
                 perm_ver = GREATEST(perm_ver, VALUES(perm_ver))`,
              [uuidToBuf(p.userId), JSON.stringify(p.systemRoles), JSON.stringify(p.grants), p.permVer, now]
            ))
        };
      }
      case 'system.settings.changed': {
        const p = SettingsChanged.parse(e.payload);
        return {
          run: async (m, now) =>
            void (await m.query(
              `INSERT INTO settings_cache (setting_key, value, version, updated_at) VALUES ('global', ?, ?, ?)
               ON DUPLICATE KEY UPDATE value = IF(VALUES(version) > version, VALUES(value), value), updated_at = IF(VALUES(version) > version, VALUES(updated_at), updated_at), version = GREATEST(version, VALUES(version))`,
              [JSON.stringify({ flags: p.flags }), p.version, now]
            )),
          after: () => this.flags.invalidate()
        };
      }
      case 'tier.baseline.changed': {
        // docs-v2/31 §۱: مجوزهای نقش‌های ضمنی guest/quran_student؛ فقط نسخهٔ بزرگ‌تر جایگزین می‌شود (ترتیب تحویل تضمین نیست)
        const p = internal.TierBaselineChanged.parse(e.payload);
        const value = JSON.stringify({ guest: [...new Set(p.guest)], quran_student: [...new Set(p.quran_student)] });
        return {
          run: async (m, now) =>
            void (await m.query(
              `INSERT INTO settings_cache (setting_key, value, version, updated_at) VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE value = IF(VALUES(version) > version, VALUES(value), value), updated_at = IF(VALUES(version) > version, VALUES(updated_at), updated_at), version = GREATEST(version, VALUES(version))`,
              [BASELINE_KEY, value, p.version, now]
            )),
          after: () => this.baseline.invalidate()
        };
      }
      case 'system.permission.changed':
        return null; // پذیرش no-op: low مالک مجوزها نیست (claimها با system.role.changed می‌رسند)
      default:
        this.log.debug({ type: e.type }, 'نوع رویداد ناشناخته؛ نادیده');
        return null;
    }
  }

  /**
   * درج چندردیفی با یک `INSERT IGNORE … SELECT` فقط برای کاربران active (کاربر ناشناس/غیرفعال/حذف‌شده بی‌صدا رد می‌شود).
   * یکتایی: `source_event_id` = eventId (رویداد تکی قدیمی) یا `${eventId}:${index}` (دسته‌ای).
   */
  private async insertMessages(m: EntityManager, items: { userId: string; kind: string; title: string; body: string; ref: string | null }[], eventId: string, now: Date, single: boolean): Promise<void> {
    if (!items.length) return;
    const rows: string[] = [];
    const args: unknown[] = [];
    items.forEach((it, i) => {
      rows.push(i === 0 ? 'SELECT ? AS id, ? AS uid, ? AS kind, ? AS title, ? AS body, ? AS ref, ? AS sid' : 'SELECT ?, ?, ?, ?, ?, ?, ?');
      args.push(uuidToBuf(uuidv7(now.getTime())), uuidToBuf(it.userId), it.kind, it.title, it.body, it.ref, single ? eventId : `${eventId}:${i}`);
    });
    await m.query(
      `INSERT IGNORE INTO inbox_messages (id, user_id, kind, title, body, ref, created_at, source_event_id)
       SELECT v.id, u.id, v.kind, v.title, v.body, v.ref, ?, v.sid FROM (${rows.join(' UNION ALL ')}) v JOIN users u ON u.id = v.uid AND u.status = 'active'`,
      [now, ...args]
    );
  }
}
