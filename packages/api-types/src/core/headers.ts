/** هدرهای قرارداد (نام ثابت؛ حساس‌به‌حروف نیستند ولی همین املا استاندارد است) */
export const HEADERS = {
  requestId: 'X-Request-Id',
  client: 'X-Isra-Client',
  clientVersion: 'X-Isra-Client-Version',
  stepUp: 'X-Step-Up-Token',
  idempotencyKey: 'Idempotency-Key',
  retryAfter: 'Retry-After',
  rateLimitLimit: 'RateLimit-Limit',
  rateLimitRemaining: 'RateLimit-Remaining',
  rateLimitReset: 'RateLimit-Reset',
  deprecation: 'Deprecation',
  sunset: 'Sunset',
  etag: 'ETag',
  ifNoneMatch: 'If-None-Match'
} as const;

/** مقدار مجاز X-Isra-Client (برای تفکیک cookie/body، لاگ و rate-limit) */
export const CLIENTS = ['web-main', 'web-admin', 'android-low', 'android-mid', 'android-high'] as const;
export type ClientId = (typeof CLIENTS)[number];

/** نام cookie refresh per وب‌اپ */
export const REFRESH_COOKIES = { 'web-main': 'isra_rt', 'web-admin': 'isra_rt_admin' } as const;
