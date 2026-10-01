/**
 * نوع‌های مشترک: خطا/صفحه‌بندی + auth به low (docs-v2/15). ⚠ پیش‌نویس؛ بعداً packages/api-types.
 */

export type ApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_STEP_UP_REQUIRED'
  | 'AUTH_FORBIDDEN'
  | 'AUTH_OTP_INVALID'
  | 'AUTH_OTP_EXPIRED'
  | 'AUTH_OTP_EXHAUSTED'
  | 'AUTH_OTP_SEND_FAILED'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_REFRESH_INVALID'
  | 'VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  /** فقط سمت کلاینت: قطع شبکه */
  | 'NETWORK_ERROR';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  get retryAfterSec(): number | undefined {
    const v = this.details.retryAfterSec;
    return typeof v === 'number' ? v : undefined;
  }
  get attemptsLeft(): number | undefined {
    const v = this.details.attemptsLeft;
    return typeof v === 'number' ? v : undefined;
  }
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface OtpChallenge {
  challengeId: string;
  expiresInSec: number;
  resendAfterSec: number;
}

export interface AuthUser {
  id: string;
  phone: string;
  isNewUser: boolean;
  profileComplete: boolean;
  hasPassword: boolean;
}

export interface AuthResult {
  accessToken: string;
  tokenType: 'Bearer';
  accessExpiresIn: number;
  sessionId: string;
  user: AuthUser;
}

export interface RefreshResult {
  accessToken: string;
  tokenType: 'Bearer';
  accessExpiresIn: number;
}

export interface DeviceInfo {
  deviceId: string;
  deviceLabel: string;
}
