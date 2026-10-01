# ۲۴ — پیش‌نویس پیکربندی (env)

**وضعیت: قفل مشروط (۱۴۰۵/۰۷/۰۹).** قاعده: همهٔ مقادیر در boot با zod اعتبارسنجی می‌شوند؛ نبود یا نامعتبر بودن ⇒ **fail-fast** (پروسه بالا نمی‌آید). مقدار پیش‌فرض برای secret **ممنوع**. فایل‌های `.env*` commit نمی‌شوند؛ `.env.example` بدون مقدار حساس.

## مشترک (هر سه سرویس)
| متغیر | نوع/مثال | توضیح |
|-------|----------|-------|
| `NODE_ENV` | `development|test|production` | |
| `PORT` | `3001` low، `3002` mid، `3003` high | |
| `LOG_LEVEL` | `info` | pino؛ redact فعال |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | `schema_<svc>` | کاربر مجزا per سرویس؛ در runtime بدون DDL |
| `DB_POOL_MAX` | `15` | |
| `CORS_ORIGINS` | `https://israapp.ir,https://admin.israapp.ir` | allowlist؛ dev: localhost |
| `PUBLIC_BASE_URL` | `https://api.israapp.ir` | |
| `INTERNAL_SHARED_SECRET` | ≥ ۳۲ بایت | احراز internal REST بین سرویس‌ها (یا mTLS) |
| `INTERNAL_URL_LOW` / `_MID` / `_HIGH` | شبکهٔ خصوصی | |
| `JWKS_URL` | `https://api.israapp.ir/c/.well-known/jwks.json` | mid/high |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `isra-low` / `isra` | اعتبارسنجی `iss`/`aud` |
| `METRICS_ENABLED` | `true` | `/metrics` فقط داخلی |
| `SWAGGER_ENABLED` | `false` در production | |

## api-low
| متغیر | توضیح |
|-------|-------|
| `JWT_PRIVATE_KEY_PEM` (یا مسیر فایل) / `JWT_KEY_ID` | RS256؛ **فقط در low**؛ چرخش: دو کلید همزمان در JWKS |
| `ACCESS_TTL_SEC=900` / `REFRESH_TTL_SEC=1209600` | قفل |
| `OTP_PEPPER` | ≥ ۳۲ بایت؛ HMAC کد OTP |
| `PASSWORD_PEPPER` | اختیاری؛ argon2id: `ARGON2_MEMORY_KIB=65536 ARGON2_TIME=3 ARGON2_PARALLELISM=1`، `HASH_CONCURRENCY=4` |
| `FARAZ_API_KEY` / `FARAZ_SENDER` / `FARAZ_PATTERN_CODE` | ارائه‌دهندهٔ SMS؛ timeout ۳ث، circuit-breaker |
| `SMS_DAILY_BUDGET` | سقف روزانه (ضد SMS-pumping) |
| `OTP_PHONE_PER_HOUR=5` `OTP_IP_PER_HOUR=20` | قابل تنظیم |
| `COOKIE_DOMAIN` / `COOKIE_SECURE=true` / `COOKIE_NAME=isra_rt` | refresh وب |
| `ALLOWED_CLIENTS` | `web-main,web-admin,android-low,android-mid,android-high` |
| `MAPS_API_KEY` | Map.ir (فقط سرور) — در صورت فعال‌شدن proxy |

## api-mid
| متغیر | توضیح |
|-------|-------|
| `MAPS_API_KEY` | proxy مکان جلسه |
| `SOCKET_PATH=/o/v1/socket.io` / `SOCKET_MAX_PAYLOAD=2048` | |
| `SOCKET_MAX_CONN_PER_USER=5` | |
| `SETTINGS_CACHE_TTL_SEC=60` | تنظیمات high |
| `ATTENDANCE_POINTS=5` | قفل |

## api-high
| متغیر | توضیح |
|-------|-------|
| `STEP_UP_REQUIRED=true` | همیشه روشن در production |
| `BOOTSTRAP_SUPER_ADMIN_PHONE` | فقط برای seed اولین `super_admin`/`developer`؛ پس از seed حذف شود |
| `AUDIT_DB_USER` | کاربر append-only برای `audit_logs` |

## کلاینت‌ها (وب)
| متغیر | توضیح |
|-------|-------|
| `PUBLIC_API_BASE` | `https://api.israapp.ir` (dev: `http://localhost:3001`) — **هیچ secret/کلیدی در متغیرهای `PUBLIC_*` نیست** |
| `PUBLIC_USE_MOCK` | `true` تا آماده‌شدن بک‌اند؛ در production همیشه `false` |
