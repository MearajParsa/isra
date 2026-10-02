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
| `PASSWORD_PEPPER` | **production الزامی**؛ argon2id: `ARGON2_MEMORY_KIB=65536 ARGON2_TIME=3 ARGON2_PARALLELISM=1`، `HASH_CONCURRENCY=4` |
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

## افزوده‌های پیاده‌سازی api-low (۱۴۰۵/۰۷/۱۰)
| متغیر | توضیح |
|-------|-------|
| `SMS_PROVIDER` | `faraz` (production) \| `console` (توسعه) \| `capture` (تست)؛ در production فقط `faraz` |
| `SMS_DAILY_BUDGET` | سقف روزانهٔ پیامک (ضد SMS-pumping)؛ پیش‌فرض ۵۰۰۰ |
| `TRUST_PROXY` | تعداد hopهای reverse-proxy مورد اعتماد برای IP کلاینت (۰ = بدون اعتماد به `X-Forwarded-For`)؛ باید با زیرساخت یکی باشد وگرنه rate-limit دور زده/مسدود می‌شود |
| `DB_QUERY_TIMEOUT_MS`, `DB_POOL_MAX` | تایم‌اوت و اندازهٔ pool |
| `REFRESH_GRACE_SEC` | پنجرهٔ grace وب برای مسابقهٔ چند-tab (پیش‌فرض ۱۰) |
| `OUTBOX_ENABLED/OUTBOX_POLL_MS`, `MAINTENANCE_ENABLED` | worker outbox و job پاکسازی |
| `INTERNAL_URL_MID/HIGH`, `INTERNAL_TIMEOUT_MS`, `INTERNAL_SHARED_SECRET` | internal REST؛ `INTERNAL_URL_MID` در production الزامی |
نمونه: `services/api-low/.env.example`.

## api-mid (۱۴۰۵/۰۷/۱۱) — نمونه: `services/api-mid/.env.example`
| متغیر | توضیح |
|-------|-------|
| `DB_*` | دیتابیس جدا (`schema_mid` / روی cPanel مثلاً `israappi_mid`) با کاربر جدا |
| `LOW_JWKS_URL` | آدرس JWKS سرویس low (مثلاً `https://api.israapp.ir/c/.well-known/jwks.json`) |
| `JWT_ISSUER`, `JWT_AUDIENCE` | باید با low یکی باشد (`isra-low`/`isra`) |
| `INTERNAL_SHARED_SECRET` | **دقیقاً همان** مقدار low؛ `INTERNAL_URL_LOW` برای outbox (production الزامی) |
| `SOCKET_ENABLED`, `SOCKET_PATH` | پیش‌فرض فعال و `/o/v1/socket.io` |
| `SCHEDULER_ENABLED`, `OUTBOX_*`, `MAINTENANCE_ENABLED` | jobها |
| `NESHAN_API_KEY` | (بعداً) کلید نشان؛ فقط env سرور |

## api-high (۱۴۰۵/۰۷/۱۱) — نمونه: `services/api-high/.env.example`
| متغیر | توضیح |
|-------|-------|
| `DB_*` | دیتابیس جدا (`schema_high` / cPanel: مثلاً `israappi_high`) با کاربر جدا |
| `LOW_JWKS_URL`, `JWT_ISSUER`, `JWT_AUDIENCE` | مثل mid؛ برای access و step-up JWT |
| `INTERNAL_SHARED_SECRET` | همان مقدار low/mid؛ `INTERNAL_URL_LOW` و `INTERNAL_URL_MID` (production الزامی) |
| `BOOTSTRAP_DEVELOPER_PHONE` | شمارهٔ اولین توسعه‌دهنده؛ فقط وقتی developer وجود ندارد اثر دارد (بعد از اولین بار می‌توانید حذفش کنید) |
**low:** `INTERNAL_URL_HIGH` (برای ارسال `user.*` به high) اضافه شد.
