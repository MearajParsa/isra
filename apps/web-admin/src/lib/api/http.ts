import { ApiError, type ApiErrorCode } from './types';

export interface HttpConfig {
  base: string;
  /** مقدار X-Isra-Client (web-main | web-admin) */
  client: string;
  version: string;
  /** timeout هر درخواست */
  timeoutMs?: number;
}

export interface CallOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string | null;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  stepUp?: string;
  /** cookie refresh (فقط مسیرهای auth سرویس low) */
  credentials?: boolean;
  idempotencyKey?: boolean;
  signal?: AbortSignal;
}

export interface Envelope<T> {
  data: T;
  meta: { requestId?: string; page?: number; pageSize?: number; total?: number };
}

const KNOWN: ReadonlySet<string> = new Set<ApiErrorCode>([
  'AUTH_REQUIRED',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_TOKEN_INVALID',
  'AUTH_STEP_UP_REQUIRED',
  'AUTH_FORBIDDEN',
  'AUTH_PERM_STALE',
  'AUTH_OTP_INVALID',
  'AUTH_OTP_EXPIRED',
  'AUTH_OTP_EXHAUSTED',
  'AUTH_OTP_SEND_FAILED',
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_REFRESH_INVALID',
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'NOT_FOUND',
  'CONFLICT',
  'SESSION_INVALID_TRANSITION',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE'
]);

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const uuid = () => uuidv4();

/** پایهٔ تماس با API واقعی: envelope استاندارد، نگاشت خطا به ApiError، timeout، هدرهای قرارداد */
export function createHttp(cfg: HttpConfig) {
  async function raw<T>(path: string, o: CallOptions = {}): Promise<Envelope<T>> {
    const url = new URL(`${cfg.base}${path}`);
    for (const [k, v] of Object.entries(o.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));

    const headers: Record<string, string> = { Accept: 'application/json', 'X-Isra-Client': cfg.client, 'X-Isra-Client-Version': cfg.version };
    if (o.token) headers.Authorization = `Bearer ${o.token}`;
    if (o.stepUp) headers['X-Step-Up-Token'] = o.stepUp;
    if (o.idempotencyKey) headers['Idempotency-Key'] = uuid();
    if (o.body !== undefined) headers['Content-Type'] = 'application/json';

    const timeout = AbortSignal.timeout(cfg.timeoutMs ?? 15_000);
    const signal = o.signal ? AbortSignal.any([o.signal, timeout]) : timeout;

    let res: Response;
    try {
      res = await fetch(url, { method: o.method ?? 'GET', headers, credentials: o.credentials ? 'include' : 'omit', body: o.body === undefined ? undefined : JSON.stringify(o.body), signal });
    } catch (e) {
      if (o.signal?.aborted) throw e;
      throw new ApiError('NETWORK_ERROR', 'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.', 0);
    }

    type Body = { success?: boolean; data?: T; error?: { code?: string; message?: string; details?: Record<string, unknown> }; meta?: Envelope<T>['meta'] };
    let json = null as Body | null;
    try {
      json = (await res.json()) as Body;
    } catch {
      /* بدنهٔ غیر JSON (مثلاً خطای proxy) */
    }

    if (!res.ok || !json || json.success !== true) {
      const e = json?.error;
      const code: ApiErrorCode = e?.code && KNOWN.has(e.code) ? (e.code as ApiErrorCode) : res.status === 503 || res.status === 502 || res.status === 504 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR';
      const details = { ...(e?.details ?? {}) } as Record<string, unknown>;
      const ra = Number(res.headers.get('Retry-After'));
      if (ra > 0 && details.retryAfterSec === undefined) details.retryAfterSec = ra;
      throw new ApiError(code, e?.message ?? (code === 'SERVICE_UNAVAILABLE' ? 'سرویس در دسترس نیست. کمی بعد دوباره تلاش کنید.' : 'مشکلی در سرور پیش آمد. دوباره تلاش کنید.'), res.status, details);
    }
    return { data: json.data as T, meta: json.meta ?? {} };
  }

  const call = async <T>(path: string, o?: CallOptions): Promise<T> => (await raw<T>(path, o)).data;

  /** لیست صفحه‌بندی‌شده ⇒ { items, page, pageSize, total } */
  async function list<T>(path: string, o?: CallOptions) {
    const r = await raw<T[]>(path, o);
    return { items: r.data, page: r.meta.page ?? 1, pageSize: r.meta.pageSize ?? r.data.length, total: r.meta.total ?? r.data.length };
  }

  /** همهٔ صفحه‌ها تا سقف (برای فهرست‌های کوچک مثل «جلسه‌های من») */
  async function listAll<T>(path: string, o: CallOptions = {}, pageSize = 50, maxPages = 6): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const r = await list<T>(path, { ...o, query: { ...o.query, page, pageSize } });
      out.push(...r.items);
      if (out.length >= r.total || r.items.length === 0) break;
    }
    return out;
  }

  return { call, list, listAll, raw };
}

export type Http = ReturnType<typeof createHttp>;
