# ۲۵ — راهنمای اجرا: محلی (ویندوز/مک/لینوکس) و استقرار روی cPanel

**هیچ secret واقعی‌ای در ریپو نیست.** همه را فقط در `.env.local` (محلی، gitignore) یا Environment Variables پنل cPanel بگذارید.
> کلیدهایی که قبلاً در چت/فایل متنی منتشر شده‌اند (Faraz، Neshan، JWT قدیمی، Map.ir، رمز دیتابیس) را **بچرخانید (rotate)**.

## الف) اجرای محلی
پیش‌نیاز: Node 22+، pnpm، MySQL 8 یا MariaDB (ترجیحاً ≥ 10.6). روی MariaDB قدیمی‌تر (مثلاً 10.4 در XAMPP) outbox خودکار به `FOR UPDATE` ساده برمی‌گردد و کار می‌کند؛ ولی نسخهٔ جدید توصیه می‌شود.
1. سه دیتابیس بسازید: `schema_low`، `schema_mid`، `schema_high` (utf8mb4) و برای هرکدام یک کاربر جدا.
2. `pnpm install` و `pnpm --filter @isra/api-types bundle`.
3. در هر `services/api-*/` فایل `.env.example` را به `.env.local` کپی و پر کنید:
   - `DB_USER`/`DB_PASSWORD`/`DB_NAME` ← اطلاعات دیتابیس همان سرویس (همین‌جا جای اتصال DB است).
   - `INTERNAL_SHARED_SECRET` در هر سه **دقیقاً یکی**.
   - `SMS_PROVIDER=console` ⇒ کد OTP در ترمینال api-low چاپ می‌شود. (برای پیامک واقعی: بخش Faraz پایین.)
   - در api-high: `BOOTSTRAP_DEVELOPER_PHONE=<شمارهٔ شما>` ⇒ اولین ورود با این شماره، نقش developer می‌گیرد.
4. اجرا (سه ترمینال یا `pnpm dev` در ریشه): migrationها خودکار اجرا می‌شوند (`DB_MIGRATIONS_RUN=true`).
5. وب: `pnpm --filter @isra/web-main dev` (۵۱۷۳) و `pnpm --filter @isra/web-admin dev` (۵۱۷۴).
6. Swagger: `http://localhost:3001/c/docs` (و `/o/docs`، `/s/docs`).

## ب) استقرار روی cPanel
### چیدمان (ساب‌دامنه‌ها)
| دامنه | چیست | نوع |
|---|---|---|
| `israapp.ir` | web-main (SSR + PWA) | Node app |
| `panel.israapp.ir` | web-admin | فایل static (docroot) |
| `capi.israapp.ir` (`/c`) | api-low (client) | Node app |
| `oapi.israapp.ir` (`/o`) | api-mid (operation) | Node app |
| `sapi.israapp.ir` (`/s`) | api-high (system) | Node app |

پیشوند `/c/v1`، `/o/v1`، `/s/v1` در خود کد ثابت است (آدرس نهایی: `https://capi.israapp.ir/c/v1/...`).

**ساخت خودکار env:** `node scripts/gen-env.mjs <data.json>` ← خروجی `deploy/env/api-{low,mid,high}.env` (gitignore؛ secretهای مشترک تصادفی). هر خط را در پنل وارد کنید.

### ۱) دیتابیس
در cPanel ← MySQL Databases: سه دیتابیس + سه کاربر (هر کاربر فقط به دیتابیس خودش، ALL PRIVILEGES). نام‌ها معمولاً `cpuser_low` و… است؛ همان را در `DB_NAME`/`DB_USER` بگذارید. `DB_HOST=localhost`.

جدول‌ها collation پیش‌فرض خود دیتابیس را می‌گیرند (مثلاً `utf8mb4_persian_ci`)؛ اگر پیش‌فرض utf8mb4 نباشد، `utf8mb4_unicode_ci` استفاده می‌شود. فقط ستون `idem_key` عمداً `utf8mb4_bin` (حساس به حروف) است.

### ۲) secretها
روی سیستم خودتان: `node scripts/gen-secrets.mjs > ~/isra-secrets.txt` (خارج از ریپو). مقادیر را در env هر سرویس بگذارید.

### ۳) ساخت و بسته‌بندی (روی سیستم شما)
```
pnpm install && pnpm turbo build && pnpm --filter @isra/api-types bundle
node scripts/pack-service.mjs api-low   # api-mid / api-high
PUBLIC_API_LOW_URL=https://api.israapp.ir PUBLIC_API_MID_URL=https://api.israapp.ir \
  pnpm --filter @isra/web-main build && node scripts/pack-web.mjs
VITE_API_LOW_URL=https://api.israapp.ir VITE_API_HIGH_URL=https://api.israapp.ir \
  pnpm --filter @isra/web-admin build     # خروجی static: apps/web-admin/build (با .htaccess)
```
(آدرس‌ها بدون پیشوند مسیر هستند؛ کلاینت‌ها خودشان `/c/v1`، `/o/v1`، `/s/v1` را اضافه می‌کنند.)

### ۴) سه API (Setup Node.js App)
برای هر سرویس: Node 22، Application root = پوشهٔ آپلودشدهٔ `deploy/api-*`، Application URL = `api.israapp.ir/c` (یا `/o`، `/s`)، Startup file = `app.js` → «Run NPM Install» → env را وارد کنید → Restart.

| متغیر | low | mid | high | توضیح |
|---|:-:|:-:|:-:|---|
| `NODE_ENV=production` | ✓ | ✓ | ✓ | |
| `TRUST_PROXY=1` | ✓ | ✓ | ✓ | پشت Passenger/Apache |
| `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` | ✓ | ✓ | ✓ | دیتابیس همان سرویس |
| `DB_MIGRATIONS_RUN=true` | ✓ | ✓ | ✓ | در نصب/ارتقا |
| `CORS_ORIGINS=https://israapp.ir,https://admin.israapp.ir` | ✓ | ✓ | ✓ | |
| `SWAGGER_ENABLED=false` | ✓ | ✓ | ✓ | (در صورت نیاز true) |
| `INTERNAL_SHARED_SECRET` | ✓ | ✓ | ✓ | یکسان |
| `JWT_PRIVATE_KEY_PEM`، `OTP_PEPPER` | ✓ | | | از gen-secrets |
| `COOKIE_DOMAIN=.israapp.ir`، `PUBLIC_BASE_URL=https://api.israapp.ir` | ✓ | | | |
| `SMS_PROVIDER=faraz`، `FARAZ_API_KEY`، `FARAZ_SENDER`، `FARAZ_PATTERN_CODE`، `FARAZ_CODE_VAR` | ✓ | | | کلید Faraz فقط اینجا |
| `LOW_JWKS_URL=https://api.israapp.ir/c/.well-known/jwks.json`، `JWT_ISSUER`، `JWT_AUDIENCE` | | ✓ | ✓ | |
| `INTERNAL_URL_LOW=https://api.israapp.ir/c` | | ✓ | ✓ | |
| `INTERNAL_URL_MID=https://api.israapp.ir/o` | ✓ | | ✓ | |
| `INTERNAL_URL_HIGH=https://api.israapp.ir/s` | ✓ | | | |
| `BOOTSTRAP_DEVELOPER_PHONE` | | | ✓ | شمارهٔ شما |

ترتیب راه‌اندازی: low ← mid ← high. سپس با شمارهٔ bootstrap وارد پنل ادمین شوید.

### ۵) web-main
Node app با Application URL = `israapp.ir`، root = `deploy/web-main`، Startup = `app.js`. env: `ORIGIN=https://israapp.ir`، `PUBLIC_API_LOW_URL`، `PUBLIC_API_MID_URL` (همان مقدار زمان build). نیازی به npm install نیست.

### ۶) web-admin
محتوای `apps/web-admin/build` را در docroot ساب‌دامنهٔ `admin.israapp.ir` آپلود کنید (`.htaccess` شامل fallback SPA است).

### ۷) تأیید
- `https://api.israapp.ir/c/health` (و `/o`، `/s`) = 200؛ `/c/.well-known/jwks.json` کلید می‌دهد.
- ثبت‌نام با OTP واقعی، ساخت جلسه، ورود ادمین با step-up.
- `https://israapp.ir/manifest.webmanifest` و نصب PWA.

### نکات
- Socket.IO (`/o/v1/socket.io`): اگر WebSocket روی هاست بسته بود، کلاینت به polling برمی‌گردد. فقط یک instance پشتیبانی می‌شود.
- Rollback: بستهٔ قبلی را برگردانید؛ migrationها فقط رو به جلو هستند (قبل از ارتقا از دیتابیس backup بگیرید).
- نشان (Neshan): هنوز پیاده نشده؛ `NESHAN_API_KEY` سمت سرور خواهد بود، هرگز کلاینت.
