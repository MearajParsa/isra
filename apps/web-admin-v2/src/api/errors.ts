/**
 * ApiError and Error Handling Infrastructure
 */

export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: {
    fields?: Record<string, string>;
    reason?: string;
    retryAfterSec?: number;
    attemptsLeft?: number;
    [key: string]: unknown;
  };
  public readonly requestId?: string;

  constructor(
    code: string,
    message: string,
    status: number = 400,
    details?: {
      fields?: Record<string, string>;
      reason?: string;
      retryAfterSec?: number;
      attemptsLeft?: number;
      [key: string]: unknown;
    },
    requestId?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /**
   * Returns a friendly Persian translation of the conflict reason if present
   */
  getReasonMessage(): string {
    const reason = this.details?.reason;
    if (!reason) return this.message;

    switch (reason) {
      case 'LAST_HOLDER':
        return 'این کاربر آخرین دارنده این نقش حیاتی در سامانه است و نمی‌توان آن را سلب یا حذف کرد.';
      case 'LOCKED_PERMISSION':
        return 'این مجوز برای این نقش سیستمی قفل شده و قابل حذف یا ویرایش نیست.';
      case 'KEY_TAKEN':
        return 'این شناسه (کلید) قبلاً در سیستم ثبت شده است؛ لطفاً شناسه دیگری انتخاب کنید.';
      case 'SYSTEM_PROTECTED':
        return 'این مورد سیستمی و محافظت‌شده است و امکان حذف یا تغییر ساختاری آن وجود ندارد.';
      case 'ROLE_IN_USE':
        return 'این نقش دارای کاربر فعال است. ابتدا کاربران این نقش را بازتخصیص دهید.';
      case 'MODULE_NOT_EMPTY':
        return 'این ماژول شامل مجوزهای فعال است؛ ابتدا مجوزهای درون آن را حذف یا جابه‌جا کنید.';
      case 'PHONE_TAKEN':
        return 'این شماره موبایل قبلاً برای کاربر دیگری در سامانه ثبت شده است.';
      case 'SELF_PROTECTED':
        return 'امکان انجام این اقدام حساس روی حساب کاربری جاری خودتان وجود ندارد.';
      case 'USER_NOT_ACTIVE':
        return 'کاربر مورد نظر غیرفعال یا حذف شده است و امکان این عملیات وجود ندارد.';
      case 'VERSION_MISMATCH':
        return 'تنظیمات همزمان توسط مدیر دیگری ویرایش شده است. لطفاً صفحه را تازه‌سازی کنید.';
      default:
        return this.message || reason;
    }
  }
}

/**
 * Maps raw fetch or HTTP errors into friendly Persian ApiError
 */
export function normalizeApiError(error: unknown, defaultMessage = 'خطایی در ارتباط با سرور رخ داده است'): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ApiError('REQUEST_ABORTED', 'درخواست لغو شد', 0);
  }

  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new ApiError(
      'NETWORK_ERROR',
      'سرویس موقتاً در دسترس نیست؛ اتصال اینترنت خود را بررسی کرده و چند لحظه بعد دوباره تلاش کنید.',
      0
    );
  }

  if (error instanceof Error) {
    return new ApiError('UNKNOWN_ERROR', error.message || defaultMessage, 500);
  }

  return new ApiError('UNKNOWN_ERROR', defaultMessage, 500);
}
