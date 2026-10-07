import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { type INestApplication, Logger as NestLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { HEADERS } from '@isra/api-types';
import { AppModule } from './app.module';
import type { Clock } from './common/clock';
import { requestContext } from './common/request-id.middleware';
import type { Env } from './config/env';

/** مسیر express برای H-36 (body-parser دوم وقتی بدنه قبلاً پارس شده کاری نمی‌کند) */
const BADGE_IMAGE_PATH = /^\/s\/v1\/system\/badges\/[^/]+\/image$/;

/** ساخت app با همهٔ تنظیمات امنیتی/عملکردی؛ main.ts و تست‌های e2e از همین استفاده می‌کنند (یک مسیر، بدون انحراف) */
export async function createApp(env: Env, opts: { clock?: Clock; silent?: boolean } = {}): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env, opts.clock), { bodyParser: false, bufferLogs: true, ...(opts.silent ? { logger: false as const } : {}) });
  configureApp(app, env, !opts.silent);
  return app;
}

export function configureApp(app: NestExpressApplication, env: Env, useLogger = true) {
  if (useLogger) app.useLogger(app.get(Logger));
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.set('etag', false); // ETag را خودمان (روی data) محاسبه می‌کنیم
  app.enableShutdownHooks();

  app.use(requestContext);
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      hsts: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' }
    })
  );
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', HEADERS.requestId, HEADERS.client, HEADERS.clientVersion, HEADERS.stepUp, HEADERS.idempotencyKey, HEADERS.ifNoneMatch],
    exposedHeaders: [HEADERS.requestId, HEADERS.retryAfter, HEADERS.rateLimitLimit, HEADERS.rateLimitRemaining, HEADERS.rateLimitReset, HEADERS.etag],
    maxAge: 600
  });
  // H-36 (تصویر نشان base64 ≤ ۲۰۰KB خام ≈ ۲۷۴KB متن): فقط همین مسیر سقف بزرگ‌تر دارد؛ بقیه ۱۶KB
  const bigJson = json({ limit: '300kb' });
  app.use((req: { method: string; path: string }, res: unknown, next: () => void) => (req.method === 'PUT' && BADGE_IMAGE_PATH.test(req.path) ? (bigJson as unknown as (a: unknown, b: unknown, c: () => void) => void)(req, res, next) : next()));
  app.use(json({ limit: '16kb' }));

  if (env.SWAGGER_ENABLED && env.NODE_ENV !== 'production') mountDocs(app);
}

/** Swagger UI فقط در توسعه/staging؛ فایل OpenAPI تولیدی از @isra/api-types (منبع حقیقت) */
function mountDocs(app: INestApplication) {
  const spec = readFileSync(require.resolve('@isra/api-types/openapi/high.v1.openapi.json'), 'utf8');
  const http = app.getHttpAdapter();
  http.get('/s/docs/openapi.json', (_req: unknown, res: { type: (t: string) => void; send: (b: string) => void }) => {
    res.type('application/json');
    res.send(spec);
  });
  http.get('/s/docs', (_req: unknown, res: { setHeader: (k: string, v: string) => void; type: (t: string) => void; send: (b: string) => void }) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src https://cdnjs.cloudflare.com 'unsafe-inline'; style-src https://cdnjs.cloudflare.com 'unsafe-inline'; connect-src 'self'; img-src data:");
    res.type('html');
    res.send(
      `<!doctype html><meta charset=utf-8><title>api-high</title><link rel=stylesheet href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css"><div id=ui></div><script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.min.js"></script><script>SwaggerUIBundle({url:'/s/docs/openapi.json',dom_id:'#ui'})</script>`
    );
  });
  new NestLogger('Docs').warn('Swagger UI فعال است (/s/docs) — فقط غیر production');
}

