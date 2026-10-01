import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { safeEqualStr } from '../common/crypto';
import type { IsraRequest } from '../common/request-context';
import { ENV, type Env } from '../config/env';

/** احراز سرویس‌به‌سرویس: secret مشترک با مقایسهٔ زمان‌ثابت. فقط شبکهٔ خصوصی؛ هرگز از reverse-proxy عمومی export نمی‌شود. */
@Injectable()
export class InternalGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}
  canActivate(c: ExecutionContext): boolean {
    const req = c.switchToHttp().getRequest<IsraRequest>();
    const t = req.header('x-internal-token');
    if (!t || t.length > 256 || !safeEqualStr(t, this.env.INTERNAL_SHARED_SECRET)) throw new AppError('AUTH_REQUIRED');
    return true;
  }
}
