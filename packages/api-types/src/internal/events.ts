import { z } from 'zod';
import { IranMobile, IsoDateTime, Uuid } from '../core/primitives';
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
export const UserStatusChanged = z.object({ userId: Uuid, status: UserStatus, changedAt: IsoDateTime, anonymizedPhone: AnonPhone.optional() });
