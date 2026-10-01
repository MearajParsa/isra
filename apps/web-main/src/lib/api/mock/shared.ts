/** اشتراک‌های بین mock لایهٔ low و mid: توکن‌ها، جستجوی کاربر، تأخیر و سناریو */
import { ApiError } from '../types';
import { getScenario, isReady } from './control';

export const tokens = new Map<string, { sessionId: string; userId: string; exp: number }>();

export interface DirectoryUser {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
}
let lookup: (userId: string) => DirectoryUser | undefined = () => undefined;
export const setUserLookup = (fn: typeof lookup) => {
  lookup = fn;
};
export const lookupUser = (userId: string) => lookup(userId);

export function displayName(userId: string): string {
  const u = lookup(userId);
  return u ? `${u.firstName} ${u.lastName}`.trim() || u.phone : 'کاربر';
}

export async function latency(): Promise<void> {
  if (typeof window === 'undefined') return;
  const slow = getScenario() === 'slow';
  if (!slow && !isReady()) return;
  const ms = slow ? 2600 : 180 + Math.random() * 320;
  await new Promise((r) => setTimeout(r, ms));
}

/** همهٔ فراخوانی‌ها: تأخیر + سناریوهای شبکه/نگهداری */
export async function enter(): Promise<void> {
  await latency();
  const sc = getScenario();
  if (sc === 'offline') throw new ApiError('NETWORK_ERROR', 'اتصال برقرار نشد. اینترنت خود را بررسی کنید.', 0);
  if (sc === 'maintenance')
    throw new ApiError('SERVICE_UNAVAILABLE', 'سرویس در حال نگهداری است. کمی بعد دوباره امتحان کنید.', 503);
}

/** فراخوانی‌های دادهٔ غیر-auth: سناریوی خطای سرور */
export function dataGuard() {
  if (getScenario() === 'error') throw new ApiError('INTERNAL_ERROR', 'مشکلی در سرور پیش آمد. دوباره تلاش کنید.', 500);
}

/** اعتبارسنجی access token (mid/high محلی verify می‌کنند؛ اینجا شبیه‌سازی) */
export function actorFromToken(accessToken: string): { userId: string; sessionId: string } {
  const t = tokens.get(accessToken);
  if (!t || t.exp < Date.now()) throw new ApiError('AUTH_TOKEN_EXPIRED', 'نشست منقضی شده است.', 401);
  return { userId: t.userId, sessionId: t.sessionId };
}

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
