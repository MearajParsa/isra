import { z } from 'zod';
import type { EndpointDef, RateLimit } from '../core/endpoint';
import { ERROR_CATALOG, type ErrorCode } from '../core/errors';
import { ErrorEnvelope, ok, okList } from '../core/envelope';
import { HEADERS } from '../core/headers';
import { API_VERSION, CONTRACT_VERSION, SERVICES, type ServiceKey, versionedPrefix } from '../core/version';
import { LiveEvent, SessionJoinMessage } from '../mid/schemas';
import { ENDPOINTS } from '../registry';

type Json = Record<string, any>;
export type OpenApiDoc = Json;

const REF_PREFIX = '#/components/schemas/';
const registryOf = (s: z.ZodType): string | undefined => (z.globalRegistry.get(s) as { id?: string } | undefined)?.id;

let anon = 0;

/** zod ⇒ JSON Schema 2020-12 (سازگار با OpenAPI 3.1)؛ schemaهای نام‌دار به‌صورت $ref */
function toSchema(schema: z.ZodType, io: 'input' | 'output'): Json {
  const id = registryOf(schema);
  if (id) return { $ref: REF_PREFIX + id };
  // ریشهٔ بی‌نام: موقتاً ثبت می‌شود تا external-ref کار کند و بعد برداشته می‌شود
  const tmp = schema.meta({ id: `__anon_${++anon}` });
  try {
    const out = z.toJSONSchema(tmp, {
      target: 'draft-2020-12',
      io,
      unrepresentable: 'any',
      external: { registry: z.globalRegistry, uri: (i: string) => REF_PREFIX + i, defs: {} }
    } as never) as Json;
    delete out.$schema;
    delete out.$id;
    stripUuidPattern(out);
    return out;
  } finally {
    z.globalRegistry.remove(tmp);
  }
}

/** pattern طولانی UUID کمکی نیست؛ format کافی است */
function stripUuidPattern(node: unknown) {
  if (Array.isArray(node)) return node.forEach(stripUuidPattern);
  if (node && typeof node === 'object') {
    const o = node as Json;
    if (o.format === 'uuid') delete o.pattern;
    Object.values(o).forEach(stripUuidPattern);
  }
}

function componentsFor(refs: Set<string>): Json {
  const all = (z.toJSONSchema(z.globalRegistry, {
    target: 'draft-2020-12',
    unrepresentable: 'any',
    uri: (i: string) => REF_PREFIX + i
  } as never) as { schemas: Json }).schemas;
  const out: Json = {};
  const queue = [...refs];
  while (queue.length) {
    const name = queue.shift()!;
    if (out[name] || !all[name]) continue;
    const def = structuredClone(all[name]) as Json;
    delete def.$schema;
    delete def.$id;
    stripUuidPattern(def);
    out[name] = def;
    collectRefs(def, queue);
  }
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
}

function collectRefs(node: unknown, into: Set<string> | string[]) {
  if (Array.isArray(node)) return node.forEach((n) => collectRefs(n, into));
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string' && v.startsWith(REF_PREFIX)) {
        const name = v.slice(REF_PREFIX.length);
        if (Array.isArray(into)) into.push(name);
        else into.add(name);
      } else collectRefs(v, into);
    }
  }
}

const errorExample = (code: ErrorCode) => ({
  success: false,
  error: { code, message: ERROR_CATALOG[code].messageFa },
  meta: { requestId: '8f14e45f-ceea-467a-9a36-3f1a2b4c5d6e' }
});

const rlText = (r: RateLimit) => `${r.limit} درخواست / ${r.windowSec}ث per ${r.key}`;

function paramsFrom(obj: z.ZodObject | undefined, where: 'path' | 'query'): Json[] {
  if (!obj) return [];
  const js = toSchema(obj, 'output') as Json;
  const required = new Set<string>(js.required ?? []);
  return Object.entries((js.properties ?? {}) as Json).map(([name, schema]) => ({
    name,
    in: where,
    required: where === 'path' ? true : required.has(name) && !('default' in schema),
    schema
  }));
}

function operation(e: EndpointDef, refsOut: Set<string>): Json {
  const op: Json = { operationId: e.id.replace(/-/g, '_'), summary: e.summary, tags: e.tags };
  if (e.description) op.description = e.description;
  if (e.deprecated) op.deprecated = true;

  const params = [...paramsFrom(e.params, 'path'), ...paramsFrom(e.query, 'query')];
  if (e.idempotency === 'key')
    params.push({
      name: HEADERS.idempotencyKey,
      in: 'header',
      required: false,
      description: 'کلید تکرار امن (UUID)؛ همان کلید ⇒ همان نتیجه، بدون اثر مضاعف (۲۴ ساعت).',
      schema: { type: 'string', minLength: 8, maxLength: 64 }
    });
  if (e.stepUp)
    params.push({ name: HEADERS.stepUp, in: 'header', required: true, description: 'توکن step-up (۵ دقیقه) از L-07', schema: { type: 'string' } });
  if (e.rangeRequests)
    params.push({ name: 'Range', in: 'header', required: false, description: 'یک بازهٔ بایت (`bytes=start-end`) ⇒ 206 Partial Content', schema: { type: 'string', pattern: '^bytes=\\d*-\\d*$' } });
  if (params.length) op.parameters = params;

  if (e.body) op.requestBody = { required: true, content: { 'application/json': { schema: toSchema(e.body, 'input') } } };
  else if (e.rawBody)
    op.requestBody = {
      required: true,
      description: `بدنهٔ خام باینری (نه JSON/multipart)؛ حداکثر ${e.rawBody.maxBytes} بایت؛ نوع با magic bytes بررسی می‌شود`,
      content: Object.fromEntries(e.rawBody.contentTypes.map((t) => [t, { schema: { type: 'string', format: 'binary' } }]))
    };

  // امنیت
  const sec: Json[] = [];
  if (e.auth === 'bearer') sec.push(e.stepUp ? { bearerAuth: [], stepUp: [] } : { bearerAuth: [] });
  else if (e.auth === 'refreshCookie') sec.push({ refreshCookie: [] }, {});
  else if (e.auth === 'bearerOrCookie') sec.push({ bearerAuth: [] }, { refreshCookie: [] });
  else if (e.auth === 'bearerOrSignedUrl') sec.push({ bearerAuth: [] }, { signedUrl: [] });
  op.security = e.auth === 'none' ? [] : sec;

  // پاسخ ۲۰۰
  const dataSchema = e.raw ? toSchema(e.response, 'output') : toSchema(e.list ? okList(e.response) : ok(e.response), 'output');
  const okHeaders: Json = { [HEADERS.requestId]: { $ref: '#/components/headers/RequestId' } };
  const cache = e.cache ?? 'no-store';
  if (cache === 'no-store') okHeaders['Cache-Control'] = { description: 'no-store', schema: { type: 'string', const: 'no-store' } };
  else {
    okHeaders['Cache-Control'] = {
      description: `${cache.scope}, max-age=${cache.maxAgeSec}${cache.staleWhileRevalidateSec ? `, stale-while-revalidate=${cache.staleWhileRevalidateSec}` : ''}`,
      schema: { type: 'string' }
    };
    if (cache.etag) okHeaders[HEADERS.etag] = { description: 'برای If-None-Match ⇒ 304', schema: { type: 'string' } };
  }
  if (e.setsCookie) okHeaders['Set-Cookie'] = { description: 'وب: refresh در cookie HttpOnly; Secure; SameSite=Lax; Path=/c/v1/auth', schema: { type: 'string' } };
  if (e.rateLimit) {
    okHeaders[HEADERS.rateLimitLimit] = { schema: { type: 'integer' } };
    okHeaders[HEADERS.rateLimitRemaining] = { schema: { type: 'integer' } };
  }
  const binary = !!e.contentType && !e.contentType.startsWith('text/') && !e.contentType.includes('json');
  if (e.rangeRequests) okHeaders['Accept-Ranges'] = { description: 'bytes', schema: { type: 'string', const: 'bytes' } };
  const responses: Json = {
    '200': {
      description: 'موفق',
      headers: okHeaders,
      content: { [e.contentType ?? 'application/json']: { schema: binary ? { type: 'string', format: 'binary' } : dataSchema } }
    }
  };
  if (e.rangeRequests)
    responses['206'] = {
      description: 'بخشی از محتوا (Range)',
      headers: {
        [HEADERS.requestId]: { $ref: '#/components/headers/RequestId' },
        'Content-Range': { description: 'bytes start-end/total', schema: { type: 'string' } },
        'Accept-Ranges': { schema: { type: 'string', const: 'bytes' } }
      },
      content: { [e.contentType ?? 'application/octet-stream']: { schema: { type: 'string', format: 'binary' } } }
    };
  if (typeof cache === 'object' && cache.etag) responses['304'] = { description: 'تغییری نکرده (If-None-Match)' };

  // پاسخ‌های خطا (دسته‌بندی بر اساس status)
  const codes = new Set<ErrorCode>(e.errors ?? []);
  if (e.body || e.query || e.params) codes.add('VALIDATION_FAILED');
  if (e.auth !== 'none') codes.add(e.auth === 'refreshCookie' ? 'AUTH_REFRESH_INVALID' : 'AUTH_REQUIRED');
  if (e.stepUp) codes.add('AUTH_STEP_UP_REQUIRED');
  if (e.permission || e.permissionAny) codes.add('AUTH_FORBIDDEN');
  if (e.rateLimit) codes.add('RATE_LIMITED');
  if (e.body || e.rawBody) codes.add('PAYLOAD_TOO_LARGE');
  if (e.rawBody) codes.add('UNSUPPORTED_MEDIA_TYPE');
  codes.add('INTERNAL_ERROR');
  if (!e.raw) codes.add('SERVICE_UNAVAILABLE');
  const byStatus = new Map<number, ErrorCode[]>();
  for (const c of codes) byStatus.set(ERROR_CATALOG[c].status, [...(byStatus.get(ERROR_CATALOG[c].status) ?? []), c]);
  for (const [status, list] of [...byStatus].sort((a, b) => a[0] - b[0])) {
    const headers: Json = { [HEADERS.requestId]: { $ref: '#/components/headers/RequestId' } };
    if (status === 429 || status === 503) headers[HEADERS.retryAfter] = { description: 'ثانیه تا تلاش بعدی', schema: { type: 'integer' } };
    responses[String(status)] = {
      description: list.join(' | '),
      headers,
      content: {
        'application/json': {
          schema: { $ref: REF_PREFIX + 'ErrorEnvelope' },
          examples: Object.fromEntries(list.map((c) => [c, { value: errorExample(c) }]))
        }
      }
    };
  }
  op.responses = responses;

  // افزونه‌های Isra
  op['x-isra-id'] = e.id;
  op['x-isra-since'] = e.since;
  op['x-isra-slo-p95-ms'] = e.sloP95Ms;
  if (e.permission) op['x-isra-permission'] = e.permission;
  if (e.permissionAny?.length) op['x-isra-permission-any'] = [...e.permissionAny];
  if (e.rawBody) op['x-isra-max-body-bytes'] = e.rawBody.maxBytes;
  if (e.rangeRequests) op['x-isra-range'] = true;
  if (e.stepUp) op['x-isra-step-up'] = true;
  if (e.rateLimit) op['x-isra-rate-limit'] = [e.rateLimit].flat().map(rlText);
  if (e.idempotency) op['x-isra-idempotency'] = e.idempotency;
  if (e.internalOnly) op['x-isra-internal'] = true;
  if (e.deprecated) op['x-isra-deprecation'] = e.deprecated;

  collectRefs(op, refsOut);
  return op;
}

const REALTIME = {
  transport: 'Socket.IO',
  path: '/o/v1/socket.io',
  auth: 'handshake.auth.token = access JWT؛ توکن نامعتبر ⇒ قطع. انقضا ⇒ تمدید و اتصال مجدد.',
  clientToServer: [{ event: 'session.join', payload: 'SessionJoinMessage', note: 'فقط عضو تأییدشده؛ ack با {ok:boolean}' }],
  serverToClient: [
    { event: 'attendance.updated', payload: 'LiveEvent' },
    { event: 'queue.updated', payload: 'LiveEvent' },
    { event: 'queue.turned', payload: 'LiveEvent', note: 'payload.userId = نفر نوبت‌رسیده' },
    { event: 'eval.updated', payload: 'LiveEvent' },
    { event: 'session.state', payload: 'LiveEvent', note: 'payload.status' },
    { event: 'comment.created', payload: 'LiveEvent', note: '۱.۷.۰: فقط به سوکت‌هایی که اجازهٔ دیدن دارند (reciter_only ⇒ اتاق شخصی `u:{id}`)؛ payload.commentId' }
  ],
  semantics: 'رویداد فقط سیگنال است؛ کلاینت داده را با REST دوباره می‌گیرد (D3). حداکثر اندازهٔ پیام ۲KB.',
  schemas: { LiveEvent: '#/components/schemas/LiveEvent', SessionJoinMessage: '#/components/schemas/SessionJoinMessage' }
};

export function buildOpenApi(service: ServiceKey): OpenApiDoc {
  const svc = SERVICES[service];
  const refs = new Set<string>(['ErrorEnvelope', 'ErrorBody', 'ErrorCode']);
  const paths: Json = {};
  const tags = new Set<string>();

  for (const e of ENDPOINTS[service]) {
    const full = (e.unversioned ? svc.prefix : versionedPrefix(service)) + e.path;
    paths[full] ??= {};
    paths[full][e.method] = operation(e, refs);
    e.tags.forEach((t) => tags.add(t));
  }
  if (service === 'mid') {
    refs.add('LiveEvent');
    refs.add('SessionJoinMessage');
    void LiveEvent;
    void SessionJoinMessage;
  }

  const doc: OpenApiDoc = {
    openapi: '3.1.0',
    info: {
      title: svc.title,
      version: CONTRACT_VERSION,
      summary: `قرارداد ${svc.name} — نسخهٔ مسیر ${API_VERSION}`,
      description: [
        `قرارداد REST سرویس **${svc.name}** (پیشوند \`${versionedPrefix(service)}\`). تولیدشده از schemaهای zod در \`@isra/api-types\`؛ **دستی ویرایش نکنید**.`,
        '',
        '- قالب پاسخ: `{ success, data, meta.requestId }`؛ خطا: `{ success:false, error:{code,message,details}, meta }`. `message` فارسی، `code` پایدار.',
        '- زمان‌ها ISO-8601 با offset؛ منطق کسب‌وکار `Asia/Tehran`؛ هفته شنبه–جمعه.',
        '- امنیت: JWT RS256 (TTL access/refresh از پیکربندی سرور؛ پیش‌فرض ۱۵ دقیقه / ۱۴ روز)، refresh با rotation؛ اقدام حساس ⇒ `X-Step-Up-Token`.',
        '- محدودیت‌ها: بدنهٔ JSON حداکثر ۱۶KB (بارگذاری خام فایل: سقف per endpoint در `x-isra-max-body-bytes`)؛ `pageSize` ≤ سقف هر endpoint؛ بدنه‌های `strict` (فیلد ناشناخته ⇒ `VALIDATION_FAILED`).',
        '- نسخه‌بندی: تغییر ناسازگار فقط با نسخهٔ جدید مسیر (`v2`)؛ سیاست deprecation: هدرهای `Deprecation` و `Sunset` (حداقل ۱۸۰ روز).',
        ...(service === 'mid' ? ['', '**Realtime (Socket.IO):** ببینید `x-isra-realtime`.'] : [])
      ].join('\n'),
      license: { name: 'Proprietary', identifier: 'LicenseRef-Isra-Proprietary' },
      'x-isra-api-version': API_VERSION,
      'x-isra-max-body-bytes': 16384
    },
    servers: [
      { url: 'https://' + ({ low: 'capi', mid: 'oapi', high: 'sapi' } as const)[service] + '.israapp.ir', description: 'تولید' },
      { url: 'http://localhost:' + ({ low: 3001, mid: 3002, high: 3003 } as const)[service], description: 'توسعهٔ محلی (بدون Docker)' }
    ],
    tags: [...tags].sort().map((name) => ({ name })),
    paths: Object.fromEntries(Object.keys(paths).sort().map((k) => [k, paths[k]])),
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'access token RS256؛ تأیید محلی با JWKS از api-low' },
        refreshCookie: { type: 'apiKey', in: 'cookie', name: 'isra_rt', description: 'فقط وب‌اپ: HttpOnly; Secure; SameSite=Lax؛ CSRF: Origin allowlist + هدر X-Isra-Client' },
        signedUrl: { type: 'apiKey', in: 'query', name: 'sig', description: 'URL امضاشدهٔ کوتاه‌عمر (۱۰ دقیقه) که سرور در فیلد `url` آیتم رسانه برمی‌گرداند؛ همراه `exp` و `u`. مقید به مسیر و کاربر؛ قابل جعل/تمدید نیست.' },
        stepUp: { type: 'apiKey', in: 'header', name: HEADERS.stepUp, description: 'توکن کوتاه‌عمر تأیید مجدد هویت (۵ دقیقه)' }
      },
      headers: { RequestId: { description: 'شناسهٔ همبستگی؛ در لاگ‌ها و گزارش خطا استفاده می‌شود', schema: { type: 'string' } } },
      schemas: componentsFor(refs)
    }
  };
  if (service === 'mid') doc['x-isra-realtime'] = REALTIME;
  void ErrorEnvelope;
  return doc;
}
