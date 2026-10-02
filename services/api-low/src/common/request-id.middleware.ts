import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import { HEADERS } from '@isra/api-types';
import { type IsraRequest, parseClient } from './request-context';

const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** شناسهٔ همبستگی: ورودی معتبر را می‌پذیرد وگرنه UUID می‌سازد؛ در پاسخ/لاگ/trace */
export function requestContext(req: IsraRequest, res: Response, next: NextFunction) {
  const incoming = req.header(HEADERS.requestId);
  const requestId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(HEADERS.requestId, requestId);
  req.ctx = {
    requestId,
    ip: req.ip ?? '0.0.0.0',
    client: parseClient(req.header(HEADERS.client)),
    clientVersion: (req.header(HEADERS.clientVersion) ?? '').slice(0, 32) || null
  };
  next();
}
