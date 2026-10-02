import { ERROR_CATALOG, type ErrorCode } from '@isra/api-types';

export interface AppErrorOptions {
  message?: string;
  details?: Record<string, unknown>;
}

/** خطای دامنه: به‌صورت `{success:false,error:{code,message,details}}` برمی‌گردد (status از ERROR_CATALOG) */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, opts: AppErrorOptions = {}) {
    super(opts.message ?? ERROR_CATALOG[code].messageFa);
    this.code = code;
    this.status = ERROR_CATALOG[code].status;
    this.details = opts.details;
  }

  get retryAfterSec(): number | undefined {
    const v = this.details?.retryAfterSec;
    return typeof v === 'number' ? v : undefined;
  }
}

export const conflict = (reason: string, message: string, extra: Record<string, unknown> = {}) =>
  new AppError('CONFLICT', { message, details: { reason, ...extra } });
