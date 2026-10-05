import { SetMetadata } from '@nestjs/common';
import { AppError } from '../common/app-error';
import type { Env } from '../config/env';

/**
 * احراز سرویس‌به‌سرویس با secret جداگانه برای هر جفت‌سرویس (low↔mid، low↔high، mid↔high):
 * افشای secret یک جفت، جعل هویت جفت دیگر را ممکن نمی‌کند. فرستنده با `X-Internal-Caller` خود را معرفی می‌کند؛
 * گیرنده secret همان جفت را بررسی می‌کند و ACL نوع رویداد/مسیر را برای همان فرستنده اعمال می‌کند.
 */
export const PEERS = ['low', 'mid', 'high'] as const;
export type Peer = (typeof PEERS)[number];
export const SELF: Peer = 'high';

export const HEADER_CALLER = 'X-Internal-Caller';
export const HEADER_TOKEN = 'X-Internal-Token';

/** فرستندگان مجاز به این سرویس (دیگران ⇒ رد) */
export const ACCEPTED_CALLERS: readonly Peer[] = ['low', 'mid'];

/** نوع رویدادهای مجاز هر فرستنده به `/internal/v1/events` این سرویس (allow-list) */
export const EVENT_ACL: Readonly<Partial<Record<Peer, readonly string[]>>> = {
  low: ['user.registered', 'user.profile.updated', 'session.revoked', 'user.phone.changed', 'user.status.changed']
};

export const INTERNAL_KEY = 'isra:internal';
export const CALLERS_KEY = 'isra:internal-callers';
/** علامت کنترلر internal: EndpointGuard سراسری آن را رد نمی‌کند و InternalGuard مسئول احراز است */
export const InternalRoute = () => SetMetadata(INTERNAL_KEY, true);
/** محدودکردن یک مسیر internal به فرستندگان مشخص */
export const InternalCallers = (...p: Peer[]) => SetMetadata(CALLERS_KEY, p);

export const isPeer = (v: unknown): v is Peer => typeof v === 'string' && (PEERS as readonly string[]).includes(v);

/** secret جفت (SELF ↔ peer) از env */
export function peerSecret(env: Env, peer: Peer): string | undefined {
  const v = (env as unknown as Record<string, unknown>)[`INTERNAL_SECRET_${peer.toUpperCase()}`];
  return typeof v === 'string' ? v : undefined;
}

/** هدرهای درخواست خروجی به peer */
export function internalHeaders(env: Env, peer: Peer): Record<string, string> {
  const t = peerSecret(env, peer);
  if (!t) throw new Error(`INTERNAL_SECRET_${peer.toUpperCase()} تنظیم نشده است.`);
  return { [HEADER_CALLER]: SELF, [HEADER_TOKEN]: t };
}

/** نوع رویداد باید در allow-list فرستنده باشد؛ وگرنه 403 */
export function assertEventAllowed(caller: Peer | undefined, type: string): void {
  if (!caller || !EVENT_ACL[caller]?.includes(type)) throw new AppError('AUTH_FORBIDDEN');
}
