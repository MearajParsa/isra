import type { CookieOptions, Request, Response } from 'express';
import { REFRESH_COOKIES, type ClientId } from '@isra/api-types';
import type { Env } from '../config/env';

export const COOKIE_PATH = '/c/v1/auth';

/**
 * نام cookie refresh برای کلاینت وب؛ غیر وب ⇒ null (body).
 * با Secure ⇒ پیشوند `__Secure-` (مرورگر فقط روی https می‌پذیرد). `__Host-` ممکن نیست چون Path محدود است.
 * Domain هرگز تنظیم نمی‌شود (host-only ⇒ زیردامنه‌های دیگر cookie را نمی‌بینند).
 */
export const refreshCookieName = (client: ClientId | null, secure = false): string | null =>
  client === 'web-main' || client === 'web-admin' ? `${secure ? '__Secure-' : ''}${REFRESH_COOKIES[client]}` : null;

const opts = (env: Env): CookieOptions => ({ httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path: COOKIE_PATH });

export function setRefreshCookie(res: Response, env: Env, client: ClientId | null, value: string) {
  const name = refreshCookieName(client, env.COOKIE_SECURE);
  if (name) res.cookie(name, value, { ...opts(env), maxAge: env.REFRESH_TTL_SEC * 1000 });
}

export function clearRefreshCookie(res: Response, env: Env, client: ClientId | null) {
  const name = refreshCookieName(client, env.COOKIE_SECURE);
  if (name) res.clearCookie(name, opts(env));
}

export function readRefreshCookie(req: Request, client: ClientId | null, secure = false): string | undefined {
  const name = refreshCookieName(client, secure);
  const v = name ? (req.cookies as Record<string, unknown> | undefined)?.[name] : undefined;
  return typeof v === 'string' && v.length >= 16 && v.length <= 512 ? v : undefined;
}
