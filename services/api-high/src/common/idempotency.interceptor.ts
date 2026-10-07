import { createHash } from 'node:crypto';
import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { type Observable, from, lastValueFrom } from 'rxjs';
import { HEADERS } from '@isra/api-types';
import { AppError } from './app-error';
import { Clock } from './clock';
import { EP_KEY, endpoint } from './ep';
import { uuidToBuf } from './ids';
import type { IsraRequest } from './request-context';

const KEY_RE = /^[A-Za-z0-9_-]{8,80}$/;
const TTL_MS = 24 * 3_600_000;

/**
 * کلید idempotency برای فراخوانی مبدأ (mid/low) مشتق از کلید کلاینت: پایدار بین retryها، scope per کاربر/endpoint/مقصد،
 * و غیرقابل‌حدس برای دیگران (docs-v2/30 §۳ امنیت ۴). نبود کلید کلاینت ⇒ undefined (مبدأ بدون dedupe).
 */
export function originIdempotencyKey(req: IsraRequest, endpointId: string, scope: string): string | undefined {
  const key = req.header(HEADERS.idempotencyKey);
  if (!key || !KEY_RE.test(key) || !req.user) return undefined;
  return createHash('sha256').update(`high\n${req.user.userId}\n${endpointId}\n${scope}\n${key}`).digest('base64url').slice(0, 43);
}

/** خطایی که ممکن است مبدأ را commit‌شده رها کرده باشد (timeout/۵xx/ناشناخته) ⇒ نتیجه «نامعلوم» */
const outcomeUnknown = (e: unknown): boolean => !(e instanceof AppError) || e.status >= 500;

/**
 * Idempotency-Key برای endpointهای `idempotency: 'key'` (H-13/H-24/H-85/H-89): تکرار با همان کلید+بدنه همان نتیجه را بازمی‌گرداند
 * (بدون اثر دوباره)، همان کلید با بدنهٔ دیگر ⇒ 409، درخواست هم‌زمان ⇒ 409 (IDEMPOTENCY_IN_PROGRESS). کلید اختیاری است.
 * داخل EnvelopeInterceptor ثبت می‌شود تا پاسخ ذخیره‌شده هم envelope شود.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly ds: DataSource,
    private readonly clock: Clock
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const id = this.reflector.get<string | undefined>(EP_KEY, ctx.getHandler());
    const def = id ? endpoint(id) : undefined;
    const req = ctx.switchToHttp().getRequest<IsraRequest>();
    const key = req.header(HEADERS.idempotencyKey);
    if (!def || def.idempotency !== 'key' || !key || !req.user) return next.handle();
    if (!KEY_RE.test(key)) throw new AppError('VALIDATION_FAILED', { details: { fields: { [HEADERS.idempotencyKey]: 'کلید نامعتبر است.' } } });
    return from(this.run(req, key, def.id, next));
  }

  private async run(req: IsraRequest, key: string, endpointId: string, next: CallHandler): Promise<unknown> {
    const user = uuidToBuf(req.user!.userId);
    const scoped = `${endpointId}:${key}`.slice(0, 80);
    const hash = createHash('sha256').update(`${req.method} ${req.path}\n${JSON.stringify(req.input?.body ?? {})}`).digest();
    const now = this.clock.now();

    await this.ds.query('DELETE FROM idempotency_keys WHERE user_id = ? AND idem_key = ? AND created_at < ?', [user, scoped, new Date(now.getTime() - TTL_MS)]);
    const ins = (await this.ds.query("INSERT IGNORE INTO idempotency_keys (user_id, idem_key, request_hash, status, created_at) VALUES (?, ?, ?, 'pending', ?)", [user, scoped, hash, now])) as { affectedRows?: number };

    if (!ins.affectedRows) {
      const rows = (await this.ds.query('SELECT request_hash, status, response FROM idempotency_keys WHERE user_id = ? AND idem_key = ?', [user, scoped])) as { request_hash: Buffer; status: string; response: unknown }[];
      const row = rows[0];
      if (!row || !row.request_hash.equals(hash)) throw new AppError('CONFLICT', { message: 'این کلید تکراری با درخواست دیگری استفاده شده است.', details: { reason: 'IDEMPOTENCY_KEY_REUSED' } });
      if (row.status === 'done') return typeof row.response === 'string' ? (JSON.parse(row.response) as unknown) : row.response;
      // نتیجهٔ قبلی نامعلوم (origin شاید commit کرده) ⇒ همین کلید دوباره اجرا می‌شود؛ مبدأ با کلید مشتق‌شده dedupe می‌کند
      const claim = row.status === 'unknown' ? ((await this.ds.query("UPDATE idempotency_keys SET status = 'pending' WHERE user_id = ? AND idem_key = ? AND status = 'unknown'", [user, scoped])) as { affectedRows?: number }) : undefined;
      if (!claim?.affectedRows) throw new AppError('CONFLICT', { message: 'درخواست قبلی هنوز در حال پردازش است.', details: { reason: 'IDEMPOTENCY_IN_PROGRESS', retryAfterSec: 1 } });
    }

    try {
      const value = await lastValueFrom(next.handle());
      await this.ds.query("UPDATE idempotency_keys SET status = 'done', response = ? WHERE user_id = ? AND idem_key = ?", [JSON.stringify(value ?? {}), user, scoped]);
      return value;
    } catch (e) {
      // ۴xx (قطعی، بی‌اثر) ⇒ کلید آزاد؛ ۵xx/timeout (نامعلوم) ⇒ کلید با وضعیت unknown می‌ماند تا retry با همان کلید
      // همان درخواست را با همان کلید مشتق‌شده به مبدأ بفرستد (هرگز دوباره‌سازی) — docs-v2/30 §۳ امنیت ۴
      const sql = outcomeUnknown(e) ? "UPDATE idempotency_keys SET status = 'unknown' WHERE user_id = ? AND idem_key = ?" : 'DELETE FROM idempotency_keys WHERE user_id = ? AND idem_key = ?';
      await this.ds.query(sql, [user, scoped]).catch(() => undefined);
      throw e;
    }
  }
}
