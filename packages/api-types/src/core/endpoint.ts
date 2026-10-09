import type { z } from 'zod';
import type { ErrorCode } from './errors';
import type { ServiceKey } from './version';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
/**
 * `bearerOrSignedUrl`: Bearer یا امضای کوتاه‌عمر در query (`exp` + `sig`) — فقط برای محتوای رسانه
 * که مرورگر در `<img>`/`<audio>` هدر Authorization نمی‌فرستد. امضا HMAC-SHA256 روی
 * `METHOD|path|exp|u` با کلید سرور است و userId درون امضا (پارامتر `u`) مقید می‌شود.
 */
export type AuthKind = 'none' | 'bearer' | 'refreshCookie' | 'bearerOrCookie' | 'bearerOrSignedUrl';

export interface RateLimit {
  /** حداکثر درخواست در پنجره */
  limit: number;
  windowSec: number;
  /** کلید شمارش: IP / شماره / کاربر / ترکیبی */
  key: 'ip' | 'phone' | 'user' | 'ip+phone' | 'user+ip';
}

export type CachePolicy =
  | 'no-store'
  | { scope: 'public' | 'private'; maxAgeSec: number; staleWhileRevalidateSec?: number; etag?: boolean };

export interface EndpointDef {
  /** شناسهٔ پایدار برای ارجاع در docs/تست (L-01، M-20، H-31 …) */
  id: string;
  service: ServiceKey;
  method: HttpMethod;
  /** مسیر نسبت به `/{prefix}/v1` (یا `/{prefix}` اگر unversioned) */
  path: string;
  /** مسیر بدون نسخه (مثل health و JWKS) */
  unversioned?: boolean;
  /** پاسخ خام بدون envelope (JWKS، health، CSV، تصویر) */
  raw?: boolean;
  /** نوع محتوای پاسخ خام غیر JSON (مثلاً `text/csv; charset=utf-8` یا `image/webp`) */
  contentType?: string;
  summary: string;
  description?: string;
  tags: string[];
  auth: AuthKind;
  /** نیازمند هدر X-Step-Up-Token */
  stepUp?: boolean;
  /** مجوز لازم (کلید permission یا توضیح نقش) — x-isra-permission */
  permission?: string;
  /**
   * ۱.۷.۰: مجوزهای جایگزین — داشتن **هر یک** از `permission` یا این‌ها برای عبور از guard کافی است
   * (مثلاً مدیریت نقش per سطح: `system.role.manage` | `system.roles.mid.manage` | `system.roles.low.manage`).
   * بررسی دقیق‌تر (مثلاً tier نقش هدف) در سرویس انجام می‌شود. — x-isra-permission-any
   */
  permissionAny?: readonly string[];
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  /**
   * ۱.۷.۰: بدنهٔ **خام باینری** (نه JSON) — مثل بارگذاری فایل گالری. با `body` هم‌زمان نمی‌آید.
   * سرور Content-Type را با `contentTypes` و سپس magic bytes بررسی می‌کند و بدنه را stream می‌کند (هرگز کل فایل در حافظه).
   * بیش از `maxBytes` ⇒ PAYLOAD_TOO_LARGE؛ نوع دیگر ⇒ UNSUPPORTED_MEDIA_TYPE.
   */
  rawBody?: { contentTypes: readonly string[]; maxBytes: number };
  /** ۱.۷.۰: پاسخ خام از `Range` پشتیبانی می‌کند (206 Partial Content + `Accept-Ranges: bytes`) */
  rangeRequests?: boolean;
  /** schema فیلد `data` (یا آیتم لیست اگر list=true) */
  response: z.ZodType;
  list?: boolean;
  /** کدهای خطای خاص این endpoint (علاوه بر استانداردها) */
  errors?: ErrorCode[];
  /** یک یا چند محدودیت (همه اعمال می‌شوند) */
  rateLimit?: RateLimit | RateLimit[];
  cache?: CachePolicy;
  /** تکرار امن: natural = طبیعتاً idempotent، key = با Idempotency-Key */
  idempotency?: 'natural' | 'key';
  /** هدف تأخیر (p95، میلی‌ثانیه، سمت سرور بدون شبکه) */
  sloP95Ms: number;
  /** نسخهٔ قرارداد که endpoint در آن اضافه شد */
  since: string;
  deprecated?: { since: string; sunset: string; replacement?: string };
  /** پاسخ ممکن است Set-Cookie کند (refresh) */
  setsCookie?: boolean;
  /** عملیات‌های مدیریتی/زیرساخت */
  internalOnly?: boolean;
}

/** helper نوع‌دار برای تعریف endpoint */
export const defineEndpoint = <const T extends EndpointDef>(e: T): T => e;
