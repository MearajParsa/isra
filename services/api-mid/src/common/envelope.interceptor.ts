import { createHash } from 'node:crypto';
import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { type Observable, map } from 'rxjs';
import { HEADERS } from '@isra/api-types';
import { EP_KEY, endpoint } from './ep';
import type { IsraRequest } from './request-context';

export interface ListResult<T = unknown> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
export const isListResult = (v: unknown): v is ListResult =>
  !!v && typeof v === 'object' && Array.isArray((v as ListResult).items) && typeof (v as ListResult).total === 'number';

/** envelope یکسان + هدرهای cache/ETag طبق تعریف endpoint در قرارداد */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const id = this.reflector.get<string>(EP_KEY, ctx.getHandler());
    if (!id) return next.handle();
    const def = endpoint(id);
    const http = ctx.switchToHttp();
    const req = http.getRequest<IsraRequest>();
    const res = http.getResponse<Response>();

    return next.handle().pipe(
      map((value: unknown) => {
        const cache = def.cache ?? 'no-store';
        if (cache === 'no-store') res.setHeader('Cache-Control', 'no-store');
        else {
          const swr = cache.staleWhileRevalidateSec ? `, stale-while-revalidate=${cache.staleWhileRevalidateSec}` : '';
          res.setHeader('Cache-Control', `${cache.scope}, max-age=${cache.maxAgeSec}${swr}`);
          res.setHeader('Vary', 'Accept-Encoding');
        }

        const body: unknown = def.raw
          ? value
          : def.list && isListResult(value)
            ? { success: true, data: value.items, meta: { requestId: req.ctx.requestId, page: value.page, pageSize: value.pageSize, total: value.total } }
            : { success: true, data: value ?? {}, meta: { requestId: req.ctx.requestId } };

        if (typeof cache === 'object' && cache.etag) {
          // ETag روی data (meta.requestId هر بار فرق دارد)
          const stable = def.raw ? body : (body as { data: unknown }).data;
          const etag = `"${createHash('sha1').update(JSON.stringify(stable)).digest('base64url').slice(0, 27)}"`;
          res.setHeader(HEADERS.etag, etag);
          if (req.header(HEADERS.ifNoneMatch) === etag) {
            res.status(304);
            return undefined;
          }
        }
        return body;
      })
    );
  }
}
