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

/**
 * اعتبارسنجی env در boot (fail-fast). secret پیش‌فرض ندارد؛ فقط مقدارهای غیرحساس (TTL، پورت) پیش‌فرض دارند.
 * فهرست و توضیح: docs-v2/24-env-draft.md
 */
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0).describe('تعداد hopهای reverse-proxy مورد اعتماد برای IP'),

    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().default(3306),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_NAME: z.string().min(1).default('schema_low'),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(15),
    DB_QUERY_TIMEOUT_MS: z.coerce.number().int().min(100).default(2000),
    DB_MIGRATIONS_RUN: bool.default(false),
    DB_SSL: bool.default(false).describe('TLS به MySQL؛ برای DB_HOST غیر loopback در production الزامی است'),

    CORS_ORIGINS: csv.default([]),
    PUBLIC_BASE_URL: z.url().default('https://api.israapp.ir'),
    SWAGGER_ENABLED: bool.default(false),

    JWT_PRIVATE_KEY_PEM: z.string().optional(),
    JWT_KEY_ID: z.string().min(1).max(64).optional(),
    JWT_ISSUER: z.string().min(1).default('isra-low'),
    JWT_AUDIENCE: z.string().min(1).default('isra'),
    ACCESS_TTL_SEC: z.coerce.number().int().min(60).max(3600).default(1200).describe('قفل #9: ۲۰ دقیقه'),
    REFRESH_TTL_SEC: z.coerce.number().int().min(3600).default(2_592_000).describe('قفل #9: ۳۰ روز'),
    SESSION_MAX_AGE_SEC: z.coerce.number().int().min(86_400).default(7_776_000).describe('سقف مطلق عمر نشست (۹۰ روز)؛ refresh لغزان است و بدون این سقف هرگز تمام نمی‌شد'),
    REFRESH_GRACE_SEC: z.coerce.number().int().min(0).max(60).default(10),

    OTP_PEPPER: z.string().min(32),
    OTP_TTL_SEC: z.coerce.number().int().default(120),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().default(3),
    OTP_RESEND_AFTER_SEC: z.coerce.number().int().default(60),
    PASSWORD_PEPPER: z.string().optional(),
    ARGON2_MEMORY_KIB: z.coerce.number().int().min(8).default(65536),
    ARGON2_TIME: z.coerce.number().int().min(1).default(3),
    ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),
    HASH_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),

    SMS_PROVIDER: z.enum(['faraz', 'console', 'capture']).default('faraz'),
    SMS_PER_PHONE_DAILY: z.coerce.number().int().min(1).default(10).describe('سقف روزانهٔ OTP برای یک شماره (ضد SMS-bombing)'),
    SMS_PER_IP_DAILY: z.coerce.number().int().min(1).default(60).describe('سقف روزانهٔ OTP برای یک IP (NAT اپراتورها ⇒ سخاوتمندانه)'),
    SMS_DAILY_BUDGET: z.coerce.number().int().min(1).default(5000),
    FARAZ_API_KEY: z.string().optional(),
    FARAZ_BASE_URL: z.url().default('https://api.iranpayamak.com'),
    FARAZ_SENDER: z.string().optional().describe('line_number خط ارسال'),
    FARAZ_PATTERN_CODE: z.string().optional(),
    FARAZ_CODE_VAR: z.string().min(1).default('code').describe('نام متغیر کد در الگوی پنل'),
    SMS_TIMEOUT_MS: z.coerce.number().int().min(200).max(10_000).default(2500),

    COOKIE_SECURE: bool.optional(),

    INTERNAL_SECRET_MID: z.string().min(32).describe('secret جفت‌سرویس low↔mid (باید در دو سرویس یکسان و از بقیهٔ جفت‌ها متفاوت باشد)'),
    INTERNAL_SECRET_HIGH: z.string().min(32).describe('secret جفت‌سرویس low↔high (باید در دو سرویس یکسان و از بقیهٔ جفت‌ها متفاوت باشد)'),
    INTERNAL_URL_MID: z.url().optional(),
    INTERNAL_URL_HIGH: z.url().optional(),
    INTERNAL_ALLOWED_IPS: csv.default([]).describe('اختیاری: فقط این IPها به مسیرهای internal دسترسی دارند'),
    INTERNAL_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(2000),
    OUTBOX_POLL_MS: z.coerce.number().int().min(100).default(2000),
    OUTBOX_ENABLED: bool.default(true),
    MAINTENANCE_ENABLED: bool.default(true)
  })
  .superRefine((e, ctx) => {
    const prod = e.NODE_ENV === 'production';
    const need = (cond: boolean, path: string, message: string) => cond && ctx.addIssue({ code: 'custom', path: [path], message });
    need(prod && !e.JWT_PRIVATE_KEY_PEM, 'JWT_PRIVATE_KEY_PEM', 'در production الزامی است (کلید RS256).');
    need(prod && e.SMS_PROVIDER !== 'faraz', 'SMS_PROVIDER', 'در production فقط faraz مجاز است.');
    need(e.SMS_PROVIDER === 'console' && e.NODE_ENV !== 'development', 'SMS_PROVIDER', 'console فقط در development مجاز است (کد OTP در لاگ).');
    need(e.SMS_PROVIDER === 'capture' && e.NODE_ENV !== 'test', 'SMS_PROVIDER', 'capture فقط در test مجاز است.');
    need(e.SMS_PROVIDER === 'faraz' && !e.FARAZ_API_KEY && e.NODE_ENV !== 'test', 'FARAZ_API_KEY', 'برای Faraz الزامی است.');
    need(e.SMS_PROVIDER === 'faraz' && !e.FARAZ_SENDER && e.NODE_ENV !== 'test', 'FARAZ_SENDER', 'برای Faraz الزامی است.');
    need(e.SMS_PROVIDER === 'faraz' && !e.FARAZ_PATTERN_CODE && e.NODE_ENV !== 'test', 'FARAZ_PATTERN_CODE', 'برای Faraz الزامی است.');
    need(prod && !e.PASSWORD_PEPPER, 'PASSWORD_PEPPER', 'در production الزامی است.');
    need(prod && !e.INTERNAL_URL_MID, 'INTERNAL_URL_MID', 'در production الزامی است.');
    need(prod && !!e.INTERNAL_URL_MID && !isSecureUrl(e.INTERNAL_URL_MID), 'INTERNAL_URL_MID', 'در production باید https (یا loopback) باشد.');
    need(prod && !!e.INTERNAL_URL_HIGH && !isSecureUrl(e.INTERNAL_URL_HIGH), 'INTERNAL_URL_HIGH', 'در production باید https (یا loopback) باشد.');
    need(prod && !!e.FARAZ_BASE_URL && !isSecureUrl(e.FARAZ_BASE_URL), 'FARAZ_BASE_URL', 'در production باید https (یا loopback) باشد.');
    need(prod && !!e.PUBLIC_BASE_URL && !isSecureUrl(e.PUBLIC_BASE_URL), 'PUBLIC_BASE_URL', 'در production باید https (یا loopback) باشد.');
    need(prod && !!e.OTP_PEPPER && isWeakSecret(e.OTP_PEPPER), 'OTP_PEPPER', 'در production مقدار نمونه/ضعیف مجاز نیست.');
    need(prod && !!e.PASSWORD_PEPPER && isWeakSecret(e.PASSWORD_PEPPER), 'PASSWORD_PEPPER', 'در production مقدار نمونه/ضعیف مجاز نیست.');
    need(prod && !e.INTERNAL_URL_HIGH, 'INTERNAL_URL_HIGH', 'در production الزامی است.');
    need(prod && e.CORS_ORIGINS.length === 0, 'CORS_ORIGINS', 'در production باید allowlist مشخص باشد.');
    need(prod && e.CORS_ORIGINS.some((o) => o === '*' || !o.startsWith('https://')), 'CORS_ORIGINS', 'در production فقط origin دقیق https مجاز است.');
    const hostLoop = ['localhost', '127.0.0.1', '::1'].includes(e.DB_HOST);
    need(prod && !hostLoop && !e.DB_SSL, 'DB_SSL', 'برای DB_HOST غیر loopback در production باید true باشد.');
    need(e.INTERNAL_SECRET_MID === e.INTERNAL_SECRET_HIGH, 'INTERNAL_SECRET_HIGH', 'secret هر جفت‌سرویس باید مستقل باشد.');
    for (const k of ['INTERNAL_SECRET_MID', 'INTERNAL_SECRET_HIGH'] as const) need(prod && isWeakSecret(e[k]), k, 'در production مقدار نمونه/ضعیف مجاز نیست؛ ۳۲+ نویسهٔ تصادفی بسازید.');
    need(prod && e.SWAGGER_ENABLED, 'SWAGGER_ENABLED', 'در production خاموش بماند.');
    need(prod && e.COOKIE_SECURE === false, 'COOKIE_SECURE', 'در production باید true باشد.');
  });

export type Env = Omit<z.infer<typeof EnvSchema>, 'COOKIE_SECURE'> & { COOKIE_SECURE: boolean };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const r = EnvSchema.safeParse(source);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`پیکربندی نامعتبر است (fail-fast):\n${lines}`);
  }
  return { ...r.data, COOKIE_SECURE: r.data.COOKIE_SECURE ?? r.data.NODE_ENV === 'production' };
}

export const ENV = Symbol('ENV');
