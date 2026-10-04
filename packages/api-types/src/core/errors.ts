import { z } from 'zod';

/**
 * فهرست پایدار کدهای خطا (07-api-conventions + 15/18/20). کد = SCREAMING_SNAKE انگلیسی، message فارسی.
 * `retriable`: کلاینت می‌تواند همان درخواست را بعد از backoff تکرار کند.
 */
export const ERROR_CATALOG = {
  AUTH_REQUIRED: { status: 401, retriable: false, messageFa: 'برای ادامه وارد شوید.' },
  AUTH_TOKEN_EXPIRED: { status: 401, retriable: false, messageFa: 'نشست منقضی شده است.' },
  AUTH_TOKEN_INVALID: { status: 401, retriable: false, messageFa: 'نشست نامعتبر است.' },
  AUTH_STEP_UP_REQUIRED: { status: 403, retriable: false, messageFa: 'برای این کار باید هویت خود را دوباره تأیید کنید.' },
  AUTH_FORBIDDEN: { status: 403, retriable: false, messageFa: 'برای این کار مجوز ندارید.' },
  AUTH_PERM_STALE: { status: 401, retriable: false, messageFa: 'دسترسی‌های شما تغییر کرده است؛ نشست را تمدید کنید.' },
  AUTH_OTP_INVALID: { status: 400, retriable: false, messageFa: 'کد واردشده درست نیست.' },
  AUTH_OTP_EXPIRED: { status: 400, retriable: false, messageFa: 'کد منقضی شده است. کد جدید دریافت کنید.' },
  AUTH_OTP_EXHAUSTED: { status: 429, retriable: false, messageFa: 'تعداد تلاش‌ها تمام شد. کد جدید دریافت کنید.' },
  AUTH_OTP_SEND_FAILED: { status: 503, retriable: true, messageFa: 'ارسال پیامک ممکن نشد. دوباره تلاش کنید.' },
  AUTH_INVALID_CREDENTIALS: { status: 401, retriable: false, messageFa: 'شماره یا رمز عبور درست نیست.' },
  AUTH_REFRESH_INVALID: { status: 401, retriable: false, messageFa: 'نشست شما پایان یافته است. دوباره وارد شوید.' },
  VALIDATION_FAILED: { status: 400, retriable: false, messageFa: 'اطلاعات واردشده معتبر نیست.' },
  RATE_LIMITED: { status: 429, retriable: true, messageFa: 'تعداد درخواست‌ها زیاد است. کمی بعد دوباره امتحان کنید.' },
  NOT_FOUND: { status: 404, retriable: false, messageFa: 'پیدا نشد.' },
  CONFLICT: { status: 409, retriable: false, messageFa: 'درخواست با وضعیت فعلی منابع سازگار نیست.' },
  SESSION_INVALID_TRANSITION: { status: 409, retriable: false, messageFa: 'تغییر وضعیت جلسه فقط یک‌قدم رو به جلو ممکن است.' },
  PAYLOAD_TOO_LARGE: { status: 413, retriable: false, messageFa: 'حجم درخواست بیش از حد مجاز است.' },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, retriable: false, messageFa: 'نوع محتوا پشتیبانی نمی‌شود.' },
  INTERNAL_ERROR: { status: 500, retriable: true, messageFa: 'مشکلی در سرور پیش آمد. دوباره تلاش کنید.' },
  SERVICE_UNAVAILABLE: { status: 503, retriable: true, messageFa: 'سرویس موقتاً پاسخگو نیست. چند لحظه بعد دوباره تلاش کنید.' }
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOG;
export const ERROR_CODES = Object.keys(ERROR_CATALOG) as [ErrorCode, ...ErrorCode[]];
export const ErrorCodeSchema = z.enum(ERROR_CODES).meta({ id: 'ErrorCode', description: 'کد پایدار خطا' });

/** دلیل ماشین‌خوان برای CONFLICT (`error.details.reason`) */
export const CONFLICT_REASONS = [
  'ALREADY_MEMBER',
  'ALREADY_DECIDED',
  'NOT_APPROVED',
  'NOT_PRESENT',
  'ALREADY_IN_QUEUE',
  'ALREADY_EVALUATED',
  'SESSION_LOCKED',
  'LAST_HOLDER',
  'LOCKED_PERMISSION',
  'VERSION_MISMATCH'
] as const;
export type ConflictReason = (typeof CONFLICT_REASONS)[number];

export const ErrorBody = z
  .object({
    code: ErrorCodeSchema,
    message: z.string().min(1).max(500).meta({ description: 'پیام فارسی برای UI' }),
    details: z.record(z.string(), z.unknown()).optional().meta({ description: 'اختیاری: fields (خطای فیلدی)، reason، retryAfterSec، attemptsLeft' })
  })
  .meta({ id: 'ErrorBody' });
