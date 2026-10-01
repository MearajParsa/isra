# api-low — سرویس حساب و هویت (`/c/v1`)

NestJS 12 + TypeORM + MySQL (`schema_low`). مسئول: OTP (Faraz)، JWT RS256 + JWKS، نشست/refresh، پروفایل، اینباکس، محتوای عمومی (پروکسی internal به mid).
قرارداد (منبع حقیقت): `packages/api-types` — هر route از `ENDPOINTS.low` ساخته می‌شود (`@Route('L-01')`)؛ نبودن شناسه در قرارداد = خطا در boot.
مستندات: `docs-v2/15`، `22` (استاندارد امنیت/SLO)، `23` (DB)، `24` (env).

## اجرای محلی (بدون Docker)
پیش‌نیاز: Node 22 (≥22.9)، pnpm، MySQL 8 (ویندوز: MySQL Installer یا XAMPP/Laragon).
```bash
# ۱) یک‌بار: ساخت دیتابیس و کاربر محلی (با root)
mysql -uroot -p < services/api-low/scripts/local-db.sql
# ۲) env محلی (commit نمی‌شود؛ dev/start/migration خودکار می‌خوانند)
cp services/api-low/.env.example services/api-low/.env.local        # ویندوز: copy
# ۳) از ریشهٔ ریپو
pnpm install
pnpm --filter @isra/api-low migration:run
pnpm --filter @isra/api-low dev        # http://localhost:3001  — Swagger: http://localhost:3001/c/docs
```
در توسعه `SMS_PROVIDER=console`: کد OTP در ترمینال api-low چاپ می‌شود (پیامک واقعی نمی‌رود). کلید JWT خالی ⇒ کلید موقت.
بررسی سریع: `curl http://localhost:3001/c/health/ready` و `curl -XPOST http://localhost:3001/c/v1/auth/otp/request -H "content-type: application/json" -H "X-Isra-Client: web-main" -d "{\"phone\":\"09121234567\"}"`.

## تست
```bash
pnpm --filter @isra/api-low test        # 132 تست؛ نیاز به MySQL (TEST_DB_HOST/USER/PASSWORD/NAME، پیش‌فرض بالا با schema_low_test)
pnpm --filter @isra/api-low test:cov
```
| فایل | پوشش |
|------|------|
| `auth.e2e` | OTP (cooldown، انقضا، ۳ تلاش، حدس موازی، تک‌مصرف)، ورود با رمز، refresh rotation/reuse/grace، logout، step-up، CSRF، rate-limit |
| `security.e2e` | جعل JWT (alg=none، HS256 confusion، کلید دیگر، iss/aud)، IDOR، ورودی (413/415/JSON خراب/pollution)، هدرها/CORS، JWKS |
| `contract.e2e` | route ⇄ قرارداد (بدون یتیم)، ماتریس منفی بدون توکن، انطباق پاسخ‌ها با schemaهای zod، envelope/ETag/304 |
| `integration.e2e` | رویدادهای داخلی (dedupe، ترتیب permVer)، MidClient (cache، breaker، stale-if-error)، outbox (backoff)، maintenance |
| `migrations`، `unit` | up/down، هم‌خوانی entity⇄schema، ایندکس‌های یکتا، env fail-fast، ابزارها |

## معماری (خلاصه)
```
Request → requestContext(X-Request-Id) → helmet/CORS/cookie/json(16kb)
        → EndpointGuard: content-type → CSRF(cookie) → JWT RS256 + نشست فعال(cache ۵s) → step-up → rate-limit → zod(body/query/params)
        → Controller (@Route از قرارداد) → Service → EnvelopeInterceptor (envelope/cache/ETag) → AllExceptionsFilter (ERROR_CATALOG)
```
- **امنیت:** OTP با HMAC+pepper و شمارش اتمی؛ refresh یک‌بار مصرف با reuse-detection (+grace ۱۰s فقط وب)؛ argon2id + pepper + semaphore؛ پاسخ یکسان در مقابل enumeration؛ بدون PII در لاگ؛ secret داخلی با مقایسهٔ زمان‌ثابت.
- **پرفورمنس:** pool تنظیم‌پذیر، query timeout، cache نشست ۵s، `lastActiveAt` throttled، cache/ETag عمومی، cache+coalescing+breaker برای mid.
- **Multi-instance بدون Redis:** rate-limit حساس در MySQL (durable)، بقیه in-memory per instance؛ outbox با `SKIP LOCKED`.

## قرارداد internal (مصرف‌کنندهٔ api-mid/high باید رعایت کند)
| جهت | مسیر | توضیح |
|-----|------|-------|
| low → mid | `GET {INTERNAL_URL_MID}/internal/v1/public/sessions?page&pageSize&status` | envelope `{success,data:PublicSession[],meta:{page,pageSize,total}}` |
| low → mid | `GET …/internal/v1/public/sessions/{id}` | 404 ⇒ NOT_FOUND |
| low → mid | `GET …/internal/v1/users/{id}/points` | `{success,data:PointsSummary}` |
| mid/high → low | `POST /internal/v1/events` `{eventId,type,occurredAt,payload}` | 202؛ dedupe با eventId. انواع: `inbox.message.created`، `system.role.changed` |
| low → mid/high | `POST {url}/internal/v1/events` | `user.registered`، `user.profile.updated` (outbox) |
هدر: `X-Internal-Token: <INTERNAL_SHARED_SECRET>`. این مسیرها باید فقط روی شبکهٔ خصوصی در دسترس باشند (از reverse-proxy عمومی export نشوند).

## محدودیت‌ها / بدهی‌های شناخته‌شده
- Faraz طبق مستندات رسمی (`/ws/v1/sms/pattern`) پیاده شد؛ روی حساب واقعی هنوز تست نشده (تست‌ها با mock). `success` فقط یعنی «در صف»؛ تحویل واقعی با `GET /ws/v1/send_request/{id}/items`.
- `users.status=blocked` فقط در ورود بررسی می‌شود؛ revoke نشست‌های کاربر مسدودشده با رویداد high (کارstream high).
- revoke در instanceهای دیگر تا ۵ ثانیه تأخیر دارد (cache نشست؛ access فقط ۱۵ دقیقه).
- کلید JWT چرخشی (چند kid در JWKS) هنوز پیاده نشده؛ تک‌کلید + `JWT_KEY_ID`.
- بار واقعی (k6) و مقادیر argon2 روی سخت‌افزار تولید اندازه‌گیری نشده.
