# api-high — سرویس مدیریت سیستم (`/s/v1`)

NestJS 12 + TypeORM + MySQL (`schema_high`). مسئول: نقش‌های سیستم (`developer`، `super_admin`)، ماتریس مجوز، grant مستقیم per user، کاربران، تنظیمات سراسری، audit، نمای کلی.
قرارداد (منبع حقیقت): `packages/api-types` (`ENDPOINTS.high`: H-00..H-40 + health). مستندات: `docs-v2/20`، `22`، `23`.

## اجرای لوکال
پیش‌نیاز: api-low بالا باشد (JWKS و OTP/step-up).
```bash
mysql -uroot -p < services/api-high/scripts/local-db.sql        # یک‌بار (یا دیتابیس را دستی بسازید)
cp services/api-high/.env.example services/api-high/.env.local  # ویندوز: copy
pnpm --filter @isra/api-high migration:run                      # schema + دادهٔ پایهٔ سیستم (نقش‌ها، مجوزها، تنظیمات پیش‌فرض)
pnpm --filter @isra/api-high dev                                # http://localhost:3003 — Swagger: /s/docs
```
**اتصال سرویس‌ها (لوکال):** `INTERNAL_SHARED_SECRET` هر سه سرویس یکی باشد؛ در `api-low/.env.local` مقدار `INTERNAL_URL_MID=http://127.0.0.1:3002` و `INTERNAL_URL_HIGH=http://127.0.0.1:3003` و در `api-high/.env.local` مقدار `INTERNAL_URL_LOW` و `INTERNAL_URL_MID` باشد (نمونه در `.env.example`).

### اولین توسعه‌دهنده (ادمین اول)
در `api-high/.env.local` مقدار `BOOTSTRAP_DEVELOPER_PHONE=09xxxxxxxxx` را بگذارید. وقتی این شماره در low ثبت‌نام/ورود کند (رویداد `user.registered`) و هنوز هیچ developer وجود نداشته باشد، خودکار developer می‌شود (audit: `system.bootstrap`). فقط وقتی هیچ developer نیست کار می‌کند؛ بعد از آن بی‌اثر است.
اگر کاربران قبل از راه‌اندازی high ثبت‌نام کرده‌اند: `pnpm --filter @isra/api-low users:replay` (کاربران موجود را دوباره به high/mid می‌فرستد؛ idempotent).

## تست
```bash
pnpm --filter @isra/api-high test       # ۵۲ تست؛ نیاز به MySQL (TEST_DB_* ؛ پیش‌فرض schema_high_test / isra_high)
```
پوشش: دسترسی از DB (نه JWT) و جعل JWT، step-up JWT (کاربر/نشست/lvl/انقضا)، D5 قفل آخرین دارنده (حتی با درخواست موازی)، D6 فقط developer، ماتریس مجوز و قفل‌ها، grant، تنظیمات با optimistic concurrency، audit فقط‌الحاق، bootstrap، انطباق پاسخ‌ها با zod، outbox به low/mid، migration/seed.

## معماری و تصمیم‌ها
- **auth:** access و step-up JWT را محلی با JWKS سرویس low تأیید می‌کند (RS256 pin). step-up یک JWT ۵ دقیقه‌ای متصل به کاربر+نشست با `lvl=stepup` است (low صادر می‌کند؛ بدون hop). **نقش و مجوز هرگز از JWT خوانده نمی‌شود** — منبع حقیقت DB این سرویس است، پس تغییر نقش فوراً اثر می‌کند. همهٔ endpointها دست‌کم یک نقش سیستمی می‌خواهند.
- **claim برای low/mid:** پس از هر تغییر نقش/grant/ماتریس، `system.role.changed` با «مجوزهای مؤثر» (grant ∪ مجوزهای نقش‌ها، با احترام به ماتریس) و `permVer` رو‌به‌جلو منتشر می‌شود؛ low آن را در JWT می‌گذارد و mid (`session.create`) فقط همان `perms` را می‌خواند. تغییر ماتریس claim همهٔ دارندگان نقش را تازه می‌کند. اثر در توکن بعدی (refresh، ≤۱۵ دقیقه).
- **تنظیمات:** `version` خوش‌بینانه (`VERSION_MISMATCH`)؛ رویداد `system.settings.changed` به mid (وزن/آستانه — وزن لحظهٔ ثبت روی ارزیابی ذخیره می‌شود، D2) و low (پرچم‌ها: `maintenance_mode` ⇒ ۵۰۳ برای me/public؛ `registration_open=false` ⇒ ثبت‌نام کاربر جدید رد).
- **audit:** فقط‌الحاق در همان تراکنش تغییر؛ حذف/ویرایش ندارد؛ هرگز پاک نمی‌شود.
- **قفل‌ها:** نقش‌ها undeletable (CHECK در DB)؛ `developer` ثابت؛ مجوزهای قفل‌شدهٔ `super_admin` قابل حذف نیستند؛ شمارش دارندگان داخل تراکنش با قفل ردیف‌ها (ترتیب ثابت).

## قرارداد internal
| جهت | مسیر |
|-----|------|
| low → high | `POST /internal/v1/events` (`user.registered` با phone/نام، `user.profile.updated`) |
| high → low | `system.role.changed`، `system.settings.changed`، `system.permission.changed` |
| high → mid | `system.settings.changed`، (و `system.role.changed`/`permission.changed` که mid نادیده می‌گیرد) |
| high → mid | `GET /internal/v1/stats/sessions` (نمای کلی؛ cache ۱۵s + stale-if-error؛ mid خراب و cache خالی ⇒ 503) |
هدر `X-Internal-Token`؛ فقط شبکهٔ خصوصی.

## محدودیت‌ها / بدهی
- اثر تغییر نقش روی توکن‌های صادرشده تا انقضای access (≤۱۵ دقیقه) برای low/mid؛ خود high فوراً (DB).
- step-up JWT تا ۵ دقیقه قابل استفادهٔ مجدد است و بعد از revoke نشست در low تا انقضا معتبر می‌ماند.
- ساخت نقش سفارشی/حذف نقش وجود ندارد (قفل).
- پیام‌های audit فارسی و ثابت‌اند؛ جست‌وجوی `q` روی summary/actor/target (LIKE) برای حجم بسیار بزرگ باید به ایندکس fulltext برود.
- بار واقعی (k6) اندازه‌گیری نشده.
