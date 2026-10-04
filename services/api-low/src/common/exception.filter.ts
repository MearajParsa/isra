import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { ERROR_CATALOG, HEADERS, type ErrorCode } from '@isra/api-types';
import { AppError } from './app-error';
import type { IsraRequest } from './request-context';

interface BodyParserError {
  type?: string;
  status?: number;
  statusCode?: number;
}

/** خطای zod ⇒ details.fields = { 'path.to.field': 'پیام' } */
export function zodFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const i of err.issues) {
    const key = i.path.length ? i.path.join('.') : '_';
    fields[key] ??= i.message;
  }
  return fields;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<IsraRequest>();
    const requestId = req.ctx?.requestId ?? 'unknown';

    let code: ErrorCode = 'INTERNAL_ERROR';
    let message: string = ERROR_CATALOG.INTERNAL_ERROR.messageFa;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof AppError) {
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof ZodError) {
      code = 'VALIDATION_FAILED';
      message = ERROR_CATALOG.VALIDATION_FAILED.messageFa;
      details = { fields: zodFields(exception) };
    } else if ((exception as BodyParserError)?.type === 'entity.too.large') {
      code = 'PAYLOAD_TOO_LARGE';
      message = ERROR_CATALOG.PAYLOAD_TOO_LARGE.messageFa;
    } else if ((exception as BodyParserError)?.type === 'entity.parse.failed') {
      code = 'VALIDATION_FAILED';
      message = 'بدنهٔ JSON نامعتبر است.';
    } else if (exception instanceof HttpException) {
      const s = exception.getStatus();
      if (s === 404) {
        code = 'NOT_FOUND';
        message = 'مسیر پیدا نشد.';
      } else if (s === 413) {
        code = 'PAYLOAD_TOO_LARGE';
        message = ERROR_CATALOG.PAYLOAD_TOO_LARGE.messageFa;
      } else if (s === 415) {
        code = 'UNSUPPORTED_MEDIA_TYPE';
        message = ERROR_CATALOG.UNSUPPORTED_MEDIA_TYPE.messageFa;
      } else if (s === 405 || s === 400) {
        code = 'VALIDATION_FAILED';
        message = ERROR_CATALOG.VALIDATION_FAILED.messageFa;
      } else if (s === 401) {
        code = 'AUTH_REQUIRED';
        message = ERROR_CATALOG.AUTH_REQUIRED.messageFa;
      } else if (s === 403) {
        code = 'AUTH_FORBIDDEN';
        message = ERROR_CATALOG.AUTH_FORBIDDEN.messageFa;
      } else if (s >= 500) {
        this.log.error({ requestId, status: s }, exception.message);
      }
    } else {
      // خطای ناشناخته: جزئیات فقط در لاگ (هرگز در پاسخ)
      this.log.error({ requestId, err: exception instanceof Error ? { name: exception.name, message: exception.message, stack: exception.stack } : String(exception) }, 'unhandled');
    }

    // رویداد امنیتی (ASVS V7.1/V7.2): شکست احراز/مجوز/محدودیت نرخ؛ بدون توکن/OTP/شماره
    if (code.startsWith('AUTH_') || code.startsWith('OTP_') || code === 'RATE_LIMITED') {
      this.log.warn({ event: 'security', code, requestId, method: req.method, path: (req.route as { path?: string } | undefined)?.path ?? 'unmatched', ip: req.ctx?.ip, userId: req.user?.userId }, 'security event');
    }
    const status = ERROR_CATALOG[code].status;
    const retry = typeof details?.retryAfterSec === 'number' ? (details.retryAfterSec as number) : undefined;
    if (retry !== undefined) res.setHeader(HEADERS.retryAfter, String(Math.max(1, Math.ceil(retry))));
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) }, meta: { requestId } });
  }
}
