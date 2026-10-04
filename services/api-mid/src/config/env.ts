import { z } from 'zod';
import { isWeakSecret } from './secrets';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const csv = z.string().transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean));

/** https الزامی؛ http فقط برای loopback (توسعه/تست). پارس واقعی URL (نه substring). */
export function isSecureUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname));
  } catch {
    return false;
  }
}

/** env اعتبارسنجی‌شده در boot (fail-fast)؛ secret پیش‌فرض ندارد. توضیح: docs-v2/24-env-draft.md */
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3002),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),

    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().default(3306),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_NAME: z.string().min(1).default('schema_mid'),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),
    DB_QUERY_TIMEOUT_MS: z.coerce.number().int().min(100).default(2000),
    DB_MIGRATIONS_RUN: bool.default(false),
    DB_SSL: bool.default(false).describe('TLS به MySQL؛ برای DB_HOST غیر loopback در production الزامی است'),

    CORS_ORIGINS: csv.default([]),
    SWAGGER_ENABLED: bool.default(false),

    /** اعتبارسنجی محلی JWT با JWKS سرویس low (بدون hop در هر درخواست) */
    LOW_JWKS_URL: z.url(),
    JWT_ISSUER: z.string().min(1).default('isra-low'),
    JWT_AUDIENCE: z.string().min(1).default('isra'),
    JWKS_TIMEOUT_MS: z.coerce.number().int().min(200).max(10_000).default(3000),

    INTERNAL_SECRET_LOW: z.string().min(32).describe('secret جفت‌سرویس mid↔low (باید در دو سرویس یکسان و از بقیهٔ جفت‌ها متفاوت باشد)'),
    INTERNAL_SECRET_HIGH: z.string().min(32).describe('secret جفت‌سرویس mid↔high (باید در دو سرویس یکسان و از بقیهٔ جفت‌ها متفاوت باشد)'),
    INTERNAL_URL_LOW: z.url().optional(),
    INTERNAL_ALLOWED_IPS: csv.default([]).describe('اختیاری: فقط این IPها به مسیرهای internal دسترسی دارند'),
    INTERNAL_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(2000),
    OUTBOX_POLL_MS: z.coerce.number().int().min(100).default(2000),
    OUTBOX_ENABLED: bool.default(true),
    MAINTENANCE_ENABLED: bool.default(true),
    SCHEDULER_ENABLED: bool.default(true).describe('به‌روزرسانی دوره‌ای next_starts_at جلسات تکرارشونده'),

    SOCKET_ENABLED: bool.default(true),
    SOCKET_PATH: z.string().default('/o/v1/socket.io')
  })
  .superRefine((e, ctx) => {
    const prod = e.NODE_ENV === 'production';
    const need = (cond: boolean, path: string, message: string) => cond && ctx.addIssue({ code: 'custom', path: [path], message });
    need(prod && !e.INTERNAL_URL_LOW, 'INTERNAL_URL_LOW', 'در production الزامی است.');
    need(prod && !isSecureUrl(e.LOW_JWKS_URL), 'LOW_JWKS_URL', 'در production باید https (یا loopback) باشد؛ بررسی با پارس URL.');
    need(prod && !!e.INTERNAL_URL_LOW && !isSecureUrl(e.INTERNAL_URL_LOW), 'INTERNAL_URL_LOW', 'در production باید https (یا loopback) باشد.');
    need(prod && e.CORS_ORIGINS.length === 0, 'CORS_ORIGINS', 'در production باید allowlist مشخص باشد.');
    need(prod && e.CORS_ORIGINS.some((o) => o === '*' || !o.startsWith('https://')), 'CORS_ORIGINS', 'در production فقط origin دقیق https مجاز است.');
    const hostLoop = ['localhost', '127.0.0.1', '::1'].includes(e.DB_HOST);
    need(prod && !hostLoop && !e.DB_SSL, 'DB_SSL', 'برای DB_HOST غیر loopback در production باید true باشد.');
    need(e.INTERNAL_SECRET_LOW === e.INTERNAL_SECRET_HIGH, 'INTERNAL_SECRET_HIGH', 'secret هر جفت‌سرویس باید مستقل باشد.');
    for (const k of ['INTERNAL_SECRET_LOW', 'INTERNAL_SECRET_HIGH'] as const) need(prod && isWeakSecret(e[k]), k, 'در production مقدار نمونه/ضعیف مجاز نیست؛ ۳۲+ نویسهٔ تصادفی بسازید.');
    need(prod && e.SWAGGER_ENABLED, 'SWAGGER_ENABLED', 'در production خاموش بماند.');
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const r = EnvSchema.safeParse(source);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`پیکربندی نامعتبر است (fail-fast):\n${lines}`);
  }
  return r.data;
}

export const ENV = Symbol('ENV');
