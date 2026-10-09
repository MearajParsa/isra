import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { internal } from '@isra/api-types';
import { RevocationService } from '../auth/revocation.service';
import { Clock } from '../common/clock';
import { bufToUuid, uuidToBuf } from '../common/ids';
import { LiveService } from '../live/live.service';
import { BadgesService } from '../domain/badges.service';
import { SettingsChanged, SettingsService } from '../domain/settings.service';
import { CatalogService } from '../domain/catalog.service';

export interface InboundEvent {
  eventId: string;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

const SessionRevoked = z.object({ sessionIds: z.array(z.uuid()).min(1).max(50), expiresAt: z.iso.datetime({ offset: true }) });
/** low نام را هم می‌فرستد (۱.۶.۰: ذخیره در دایرکتوری)؛ شماره در mid نگه‌داری نمی‌شود */
const UserRegistered = z.object({ userId: z.uuid(), firstName: z.string().max(40).optional(), lastName: z.string().max(40).optional() });
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
    private readonly settings: SettingsService,
    private readonly revocation: RevocationService,
    private readonly live: LiveService,
    private readonly badges: BadgesService,
    private readonly catalog: CatalogService
  ) {}

  async handle(e: InboundEvent): Promise<void> {
    const now = this.clock.now();
    const queueSessions: string[] = [];
    await this.ds.transaction(async (m) => {
      const ins = (await m.query('INSERT IGNORE INTO inbox_events (event_id, type, received_at) VALUES (?, ?, ?)', [e.eventId, e.type, now])) as { affectedRows?: number };
      if (!ins.affectedRows) return;

      if (e.type === 'user.registered') {
        const p = UserRegistered.parse(e.payload);
        await m.query(
          `INSERT INTO user_directory (user_id, first_name, last_name, updated_at) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE first_name = IF(deleted = 1 OR VALUES(first_name) = '', first_name, VALUES(first_name)), last_name = IF(deleted = 1 OR VALUES(last_name) = '', last_name, VALUES(last_name)), updated_at = VALUES(updated_at)`,
          [uuidToBuf(p.userId), (p.firstName ?? '').slice(0, 40), (p.lastName ?? '').slice(0, 40), now]
        );
      } else if (e.type === 'user.profile.updated') {
        const p = ProfileUpdated.parse(e.payload);
        await m.query(
          `INSERT INTO user_directory (user_id, first_name, last_name, updated_at) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE first_name = IF(deleted = 1, '', COALESCE(?, first_name)), last_name = IF(deleted = 1, '', COALESCE(?, last_name)), updated_at = VALUES(updated_at)`,
          [uuidToBuf(p.userId), p.firstName ?? '', p.lastName ?? '', now, p.firstName ?? null, p.lastName ?? null]
        );
      } else if (e.type === 'user.status.changed') {
        // همهٔ وضعیت‌ها در user_directory.status (افزودن عضو: not_active). حذف (برگشت‌ناپذیر): نام پاک + علامت «حذف‌شده»
        // ⇒ همه‌جا «کاربر حذف‌شده» و آیتم‌های فعال صفش حذف (حضور/ارزیابی/امتیاز برای تاریخچه می‌ماند).
        const p = internal.UserStatusChanged.parse(e.payload);
        const uid = uuidToBuf(p.userId);
        if (p.status === 'deleted') {
          await m.query(
            `INSERT INTO user_directory (user_id, first_name, last_name, deleted, status, updated_at) VALUES (?, '', '', 1, 'deleted', ?)
             ON DUPLICATE KEY UPDATE first_name = '', last_name = '', deleted = 1, status = 'deleted', updated_at = VALUES(updated_at)`,
            [uid, now]
          );
          const q = (await m.query("SELECT DISTINCT session_id FROM queue_items WHERE user_id = ? AND status IN ('waiting','current')", [uid])) as { session_id: Buffer }[];
          if (q.length) {
            await m.query("DELETE FROM queue_items WHERE user_id = ? AND status IN ('waiting','current')", [uid]);
            queueSessions.push(...q.map((r) => bufToUuid(r.session_id)));
          }
        } else {
          // حذف برگشت‌ناپذیر است: active/disabled دیرهنگام کاربر حذف‌شده را زنده نمی‌کند
          await m.query(
            `INSERT INTO user_directory (user_id, first_name, last_name, status, updated_at) VALUES (?, '', '', ?, ?)
             ON DUPLICATE KEY UPDATE status = IF(deleted = 1, 'deleted', VALUES(status)), updated_at = VALUES(updated_at)`,
            [uid, p.status, now]
          );
        }
      } else if (e.type === 'user.phone.changed') {
        // شماره در mid نگه‌داری نمی‌شود (فقط high دایرکتوری شماره دارد) ⇒ پذیرفته و نادیده (dedupe ثبت می‌شود)
        this.log.debug({ type: e.type }, 'نادیده');
      } else if (e.type === 'session.revoked') {
        const p = SessionRevoked.parse(e.payload);
        await this.revocation.add(m, p.sessionIds, new Date(p.expiresAt));
      } else if (e.type === 'system.settings.changed') {
        await this.settings.apply(SettingsChanged.parse(e.payload));
      } else if (e.type === 'badge.catalog.changed') {
        // ۱.۶.۰: جایگزینی کامل کاتالوگ اگر version بزرگ‌تر؛ job بازمحاسبه پس از commit (BadgesService)
        await this.badges.applyCatalog(m, internal.BadgeCatalogChanged.parse(e.payload));
      } else if (e.type === 'evaluation.criteria.changed') {
        // ۱.۷.۰: کش معیارهای ارزیابی (M-45، اعتبارسنجی M-40)؛ فقط version بزرگ‌تر
        await this.catalog.applyCriteria(m, internal.EvaluationCriteriaChanged.parse(e.payload));
      } else if (e.type === 'tier.baseline.changed') {
        // ۱.۷.۰: مجوزهای نقش‌های ضمنی guest/quran_student
        await this.catalog.applyBaseline(m, internal.TierBaselineChanged.parse(e.payload));
      } else {
        this.log.debug({ type: e.type }, 'نوع رویداد ناشناخته؛ نادیده');
      }
    });
    for (const sid of queueSessions) this.live.emit(sid, 'queue.updated');
  }
}
