import { z } from 'zod';
import { IranMobile, IsoDateTime, Uuid } from '../core/primitives';
import { PermissionKey, SystemRoleKey } from '../high/schemas';
import { AnonPhone, UserStatus } from '../high/schemas';

/**
 * رویدادهای تازهٔ outbox (علاوه بر user.registered / user.profile.updated / system.* / inbox.message.created / session.revoked).
 * فرستنده: low ⇒ mid و high.
 */
export const EVENT_TYPES_V14 = ['user.phone.changed', 'user.status.changed'] as const;

/** high: user_directory.phone را به‌روز می‌کند */
export const UserPhoneChanged = z.object({ userId: Uuid, phone: IranMobile, changedAt: IsoDateTime });
/**
 * `deleted`: high شمارهٔ ناشناس و status=deleted می‌گذارد؛ mid نام را در user_directory به «کاربر حذف‌شده» (رشتهٔ خالی + پرچم) تبدیل می‌کند.
 * `disabled/active`: فقط status در high (فهرست/فیلتر کاربران).
 */
export const UserStatusChanged = z.object({ userId: Uuid, status: UserStatus, changedAt: IsoDateTime, anonymizedPhone: AnonPhone.optional(), source: z.enum(['self', 'admin']).optional().meta({ description: '۱.۶.۰: حذف توسط خود کاربر یا ادمین' }) });

// ───────────────────────── ۱.۶.۰ (docs-v2/30) ─────────────────────────
export const EVENT_TYPES_V16 = ['inbox.messages.created', 'inbox.broadcast.created', 'badge.catalog.changed', 'points.changed'] as const;

const InboxKindV16 = z.enum(['membership', 'turn', 'evaluation', 'system', 'announcement', 'session']);
const InboxRefV16 = z.string().regex(/^(session:[A-Za-z0-9_-]{1,64}|points|badge:[A-Za-z0-9_-]{1,64}|announcement:[A-Za-z0-9_-]{1,64})$/).max(200).nullable();

/**
 * فرستنده: mid یا high ⇒ low. چند پیام در یک رویداد (fan-out بدون یک HTTP per گیرنده).
 * low: INSERT IGNORE چندردیفی فقط برای کاربران active؛ کلید یکتایی source_event_id = `${eventId}:${index}`.
 */
export const InboxMessagesCreated = z.object({
  items: z.array(z.object({ userId: Uuid, kind: InboxKindV16, title: z.string().min(1).max(120), body: z.string().max(500), ref: InboxRefV16 })).min(1).max(200)
});
/**
 * فرستنده: فقط high ⇒ low. low آن را ذخیره و یک job نگه‌داری به‌صورت دسته‌ای (۲۰۰۰تایی، cursor روی user id) تحویل می‌دهد.
 * یکتایی: UNIQUE(broadcast_id, user_id).
 */
export const InboxBroadcastCreated = z.object({
  broadcastId: Uuid,
  segment: z.discriminatedUnion('type', [
    z.object({ type: z.literal('all') }),
    z.object({ type: z.literal('users'), userIds: z.array(Uuid).min(1).max(1000) }),
    z.object({ type: z.literal('role'), role: SystemRoleKey })
  ]),
  title: z.string().min(2).max(120),
  body: z.string().min(2).max(500),
  ref: InboxRefV16,
  createdBy: Uuid
});
/** فرستنده: high ⇒ mid و low. کاتالوگ کامل نشان‌ها (بدون باینری تصویر؛ low تصویر را با HIGH_INTERNAL.badgeImage می‌گیرد) */
export const BadgeCatalogChanged = z.object({
  version: z.number().int().min(1),
  badges: z
    .array(
      z.object({
        id: Uuid,
        key: z.string().max(40),
        title: z.string().max(60),
        description: z.string().max(300),
        threshold: z.number().int().min(1),
        active: z.boolean(),
        sortOrder: z.number().int().min(0),
        imageHash: z.string().regex(/^[a-f0-9]{16,64}$/).nullable()
      })
    )
    .max(50)
});
/** فرستنده: mid ⇒ low. low کش L-21/L-23 همان کاربر را باطل می‌کند */
export const PointsChanged = z.object({ userId: Uuid, total: z.number().int().min(0) });

// ───────────────────────── ۱.۷.۰ (docs-v2/31) ─────────────────────────
export const EVENT_TYPES_V17 = ['evaluation.criteria.changed', 'tier.baseline.changed'] as const;

/**
 * فرستنده: high ⇒ mid. کاتالوگ کامل معیارها (فعال و غیرفعال). mid کش محلی (M-45، اعتبارسنجی M-40) را با `version` بزرگ‌تر جایگزین می‌کند؛
 * نسخهٔ کوچک‌تر/مساوی ⇒ no-op (ترتیب تحویل outbox تضمین نیست).
 */
export const EvaluationCriteriaChanged = z.object({
  version: z.number().int().min(1),
  criteria: z
    .array(
      z.object({
        id: Uuid,
        key: z.string().max(32),
        title: z.string().max(60),
        description: z.string().max(300),
        weight: z.number().int().min(1).max(100),
        maxScore: z.number().int().min(1).max(100),
        active: z.boolean(),
        sortOrder: z.number().int().min(0)
      })
    )
    .min(1)
    .max(15)
});
/**
 * فرستنده: high ⇒ low و mid. مجوزهای مؤثر نقش‌های ضمنی: `guest` (درخواست بی‌توکن) و `quran_student` (هر کاربر ثبت‌نام‌کرده).
 * مصرف‌کننده: مجوز مؤثر = baseline ∪ claim JWT؛ کش با `version` (کوچک‌تر/مساوی ⇒ no-op).
 */
export const TierBaselineChanged = z.object({
  version: z.number().int().min(1),
  guest: z.array(PermissionKey).max(256),
  quran_student: z.array(PermissionKey).max(256)
});
