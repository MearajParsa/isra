# ۲۵ — راهنمای اجرا: محلی (ویندوز/مک/لینوکس) و استقرار روی cPanel

**هیچ secret واقعی‌ای در ریپو نیست.** همه را فقط در `.env.local` (محلی، gitignore) یا Environment Variables پنل cPanel بگذارید.
> کلیدهایی که قبلاً در چت/فایل متنی منتشر شده‌اند (Faraz، Neshan، JWT قدیمی، Map.ir، رمز دیتابیس) را **بچرخانید (rotate)**.

## الف) اجرای محلی
پیش‌نیاز: Node 22+، pnpm، MySQL 8 یا MariaDB (ترجیحاً ≥ 10.6). روی MariaDB قدیمی‌تر (مثلاً 10.4 در XAMPP) outbox خودکار به `FOR UPDATE` ساده برمی‌گردد و کار می‌کند؛ ولی نسخهٔ جدید توصیه می‌شود.
1. سه دیتابیس بسازید: `schema_low`، `schema_mid`، `schema_high` (utf8mb4) و برای هرکدام یک کاربر جدا.
2. `pnpm install` و `pnpm --filter @isra/api-types bundle`.
3. در هر `services/api-*/` فایل `.env.example` را به `.env.local` کپی و پر کنید:
   - `DB_USER`/`DB_PASSWORD`/`DB_NAME` ← اطلاعات دیتابیس همان سرویس (همین‌جا جای اتصال DB است).
   - secret سرویس‌به‌سرویس **per جفت** است: `INTERNAL_SECRET_*` (low↔mid، low↔high، mid↔high) — هر مقدار دقیقاً در دو سرویس یکسان و از جفت‌های دیگر متفاوت؛ `scripts/gen-env.mjs` خودکار می‌سازد. `DB_PASSWORD` عمداً خالی تولید می‌شود؛ خودتان پر کنید. `NODE_ENV` پیش‌فرض اکنون `production` است (fail-closed)؛ `INTERNAL_ALLOWED_IPS=<IP سرور>` را هم بگذارید.
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
PUBLIC_API_LOW_URL=https://capi.israapp.ir PUBLIC_API_MID_URL=https://oapi.israapp.ir \
  pnpm --filter @isra/web-main build && node scripts/pack-web.mjs
VITE_API_LOW_URL=https://capi.israapp.ir VITE_API_HIGH_URL=https://sapi.israapp.ir \
  pnpm --filter @isra/web-admin build     # خروجی static: apps/web-admin/build (با .htaccess)
```
(آدرس‌ها بدون پیشوند مسیر هستند؛ کلاینت‌ها خودشان `/c/v1`، `/o/v1`، `/s/v1` را اضافه می‌کنند.)

### ۴) سه API (Setup Node.js App)
برای هر سرویس: Node 22، Application root = پوشهٔ آپلودشدهٔ `deploy/api-*`، Application URL = `capi.israapp.ir/c` (یا `oapi.israapp.ir/o`، `sapi.israapp.ir/s`)، Startup file = `app.js` → «Run NPM Install» → env را وارد کنید → Restart.

**نصب بازتولیدپذیر:** `pack-service.mjs` در بسته `package.json` با نسخه‌های دقیق (از `pnpm-lock.yaml`؛ بدون `^`/`~`)، `package-lock.json` (با `npm install --package-lock-only --ignore-scripts`) و `.npmrc` (`audit=false`, `fund=false`, `save-exact=true`) می‌گذارد. دکمهٔ «Run NPM Install» در cPanel وجود `package-lock.json` را رعایت می‌کند و همان درخت وابستگی را نصب می‌کند؛ روی SSH معادل آن `npm ci --omit=dev --ignore-scripts` است. هیچ وابستگی‌ای install script ندارد (`@node-rs/argon2` باینری prebuilt می‌گیرد)، پس `--ignore-scripts` امن است؛ اگر در آینده وابستگی‌ای script لازم داشت، این فلگ را از `deploy-ssh.sh` بردارید. توجه: ساخت `package-lock.json` هنگام pack به دسترسی شبکه به registry نیاز دارد و نسخهٔ transitiveها را در همان لحظه قفل می‌کند؛ lock را همراه بسته آپلود کنید و دستی `npm install` نزنید.

| متغیر | low | mid | high | توضیح |
|---|:-:|:-:|:-:|---|
| `NODE_ENV=production` | ✓ | ✓ | ✓ | |
| `TRUST_PROXY=1` | ✓ | ✓ | ✓ | پشت Passenger/Apache |
| `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` | ✓ | ✓ | ✓ | دیتابیس همان سرویس |
| `DB_MIGRATIONS_RUN=true` | ✓ | ✓ | ✓ | در نصب/ارتقا |
| `CORS_ORIGINS=https://israapp.ir,https://panel.israapp.ir` | ✓ | ✓ | ✓ | |
| `SWAGGER_ENABLED=false` | ✓ | ✓ | ✓ | (در صورت نیاز true) |
| `INTERNAL_SECRET_MID` / `_HIGH` (low)، `_LOW` / `_HIGH` (mid)، `_LOW` / `_MID` (high) | ✓ | ✓ | ✓ | per جفت؛ دو سر یکسان |
| `JWT_PRIVATE_KEY_PEM`، `OTP_PEPPER` | ✓ | | | از gen-secrets |
| `PUBLIC_BASE_URL=https://capi.israapp.ir`، `SESSION_MAX_AGE_SEC=7776000` | ✓ | | | |
| `SMS_PROVIDER=faraz`، `FARAZ_API_KEY`، `FARAZ_SENDER`، `FARAZ_PATTERN_CODE`، `FARAZ_CODE_VAR` | ✓ | | | کلید Faraz فقط اینجا |
| `LOW_JWKS_URL=https://capi.israapp.ir/c/.well-known/jwks.json`، `JWT_ISSUER`، `JWT_AUDIENCE` | | ✓ | ✓ | |
| `INTERNAL_URL_LOW=https://capi.israapp.ir/c` | | ✓ | ✓ | |
| `INTERNAL_URL_MID=https://oapi.israapp.ir/o` | ✓ | | ✓ | |
| `INTERNAL_URL_HIGH=https://sapi.israapp.ir/s` | ✓ | | | |
| `BOOTSTRAP_DEVELOPER_PHONE` | | | ✓ | شمارهٔ شما |

ترتیب راه‌اندازی: low ← mid ← high. سپس با شمارهٔ bootstrap وارد پنل ادمین شوید.

### ۵) web-main
Node app با Application URL = `israapp.ir`، root = `deploy/web-main`، Startup = `app.js`. env: `ORIGIN=https://israapp.ir`، `PUBLIC_API_LOW_URL`، `PUBLIC_API_MID_URL` (همان مقدار زمان build). نیازی به npm install نیست.

### ۶) web-admin
محتوای `apps/web-admin/build` را در docroot ساب‌دامنهٔ `panel.israapp.ir` آپلود کنید (`.htaccess` شامل fallback SPA است).

### ۷) تأیید
- `https://capi.israapp.ir/c/health/ready` (و `https://oapi.israapp.ir/o/health/ready`، `https://sapi.israapp.ir/s/health/ready`) = 200 (مسیر `/c/health` وجود ندارد)؛ `/c/.well-known/jwks.json` کلید می‌دهد.
- ثبت‌نام با OTP واقعی، ساخت جلسه، ورود ادمین با step-up.
- `https://israapp.ir/manifest.webmanifest` و نصب PWA.

### نکات
- Socket.IO (`/o/v1/socket.io`): اگر WebSocket روی هاست بسته بود، کلاینت به polling برمی‌گردد. فقط یک instance پشتیبانی می‌شود.
- Rollback: بستهٔ قبلی را برگردانید؛ migrationها فقط رو به جلو هستند (قبل از ارتقا از دیتابیس backup بگیرید).
- نشان (Neshan): هنوز پیاده نشده؛ `NESHAN_API_KEY` سمت سرور خواهد بود، هرگز کلاینت.

## ج) استقرار خودکار (GitHub Actions + SSH)
با هر ادغام در `master`، workflow `.github/workflows/deploy.yml` بیلد و بسته‌بندی می‌کند، با `rsync` روی هاست می‌فرستد، در صورت تغییر `package.json`/`package-lock.json`/`.npmrc`/tarball روی هاست `npm ci --omit=dev --ignore-scripts` می‌زند، اپ را با `tmp/restart.txt` restart می‌کند و `/health` را چک می‌کند (ترتیب: low ← mid ← high ← web-main ← web-admin). اجرای دستی: Actions ← Deploy ← Run workflow (با انتخاب هدف‌ها).

**یک‌بار دستی:** ساخت ۴ اپ در Setup Node.js App و وارد کردن env (بخش ب). Application root هر اپ باید `apps/<نام>` باشد (یا `APPS_DIR` را تغییر دهید).

**کلید SSH:** روی سیستم خودتان `ssh-keygen -t ed25519 -f isra_deploy -N ""` ← محتوای `isra_deploy.pub` را در cPanel ← SSH Access ← Import Key و Authorize کنید؛ `isra_deploy` (خصوصی) فقط در GitHub Secret می‌رود. `SSH_KNOWN_HOSTS`: خروجی `ssh-keyscan -p 22 <host>`.

**GitHub ← Settings ← Secrets and variables ← Actions**
| نوع | نام | مقدار |
|---|---|---|
| Secret | `SSH_HOST` | آدرس سرور |
| Secret | `SSH_USER` | کاربر cPanel |
| Secret | `SSH_PRIVATE_KEY` | کل محتوای فایل خصوصی |
| Secret | `SSH_KNOWN_HOSTS` | خروجی ssh-keyscan |
| Variable | `DEPLOY_ENABLED` | `true` (تا نباشد workflow کاری نمی‌کند) |
| Variable (اختیاری) | `SSH_PORT`، `APPS_DIR` (apps)، `ADMIN_DOCROOT` (panel.israapp.ir)، `NODE_VERSION` (22)، `API_LOW_URL`/`API_MID_URL`/`API_HIGH_URL` | |

Environment variables اپ‌ها (رمز دیتابیس، کلید Faraz …) **فقط در پنل cPanel** می‌مانند و هرگز به GitHub نمی‌روند. اگر `NODE_VERSION` یا مسیر `~/nodevenv/<approot>/<نسخه>` روی هاست فرق دارد، با `ls ~/nodevenv/apps/api-low` بررسی کنید.

**اگر GitHub به SSH هاست نرسید:** بسیاری از هاست‌های ایرانی IPهای خارج از کشور (از جمله runnerهای GitHub) را در فایروال می‌بندند (خطای `Connection timed out` در مرحلهٔ «استقرار»). راه‌حل جایگزین — استقرار از سیستم خودتان (WSL/لینوکس/مک با `rsync` و `ssh`):
```
pnpm install && pnpm turbo build --filter='!@isra/web-main' --filter='!@isra/web-admin' && pnpm --filter @isra/api-types bundle
for s in api-low api-mid api-high; do node scripts/pack-service.mjs $s; done
PUBLIC_API_LOW_URL=https://capi.israapp.ir PUBLIC_API_MID_URL=https://oapi.israapp.ir pnpm --filter @isra/web-main build && node scripts/pack-web.mjs
VITE_API_LOW_URL=https://capi.israapp.ir VITE_API_HIGH_URL=https://sapi.israapp.ir pnpm --filter @isra/web-admin build
SSH_TARGET=user@host SSH_KEY_FILE=~/.ssh/isra_deploy SSH_KNOWN_HOSTS=~/.ssh/known_hosts \
HEALTH_URL_LOW=https://capi.israapp.ir/c/health/ready HEALTH_URL_MID=https://oapi.israapp.ir/o/health/ready HEALTH_URL_HIGH=https://sapi.israapp.ir/s/health/ready \
bash scripts/deploy-ssh.sh
```
رمز SSH هرگز در GitHub/چت گذاشته نمی‌شود؛ فقط کلید (مرحلهٔ بالا).

## د) صفحهٔ خطای فارسی به‌جای «503» خام هاست
- **API:** پاسخ‌های ۵۰۳ همچنان `503` هستند (معنای HTTP؛ health و کلاینت‌ها به آن وابسته‌اند) ولی بدنهٔ JSON فارسی و خنثی دارند؛ حالت نگهداری واقعی `details.reason="maintenance"` دارد.
- **web-main / web-admin:** خطای ۵xx صفحهٔ فارسی «سرویس لحظه‌ای پاسخگو نیست» با دکمهٔ تلاش دوباره نشان می‌دهد (کد خطا نمایش داده نمی‌شود).
- **وقتی خود اپ Node پایین است** (Passenger/LiteSpeed صفحهٔ خام 503 می‌دهد): فایل `error-503.html` را در docroot همان دامنه بگذارید و در `.htaccess` همان docroot اضافه کنید:
  ```
  ErrorDocument 500 /error-503.html
  ErrorDocument 502 /error-503.html
  ErrorDocument 503 /error-503.html
  ErrorDocument 504 /error-503.html
  ```
  برای web-admin این خطوط در `.htaccess` تولیدشده هست و فایل داخل `build/` است. برای web-main فایل در `deploy/web-main/error-503.html` است. (روی LiteSpeed/CloudLinux بسته به تنظیم هاست ممکن است صفحهٔ خود هاست اولویت داشته باشد؛ در cPanel ← Errors Pages هم می‌توان صفحهٔ 503 دامنه را تنظیم کرد.)

## هـ) web-admin زیر مسیر (مثلاً `israapp.ir/s`) با اپ Node
پنل SPA استاتیک است؛ برای سرو زیر یک مسیر، `BASE_PATH` و آدرس APIها در **زمان build** داخل فایل‌ها ثبت می‌شوند و بعداً با env هاست قابل‌تغییر نیستند. با **یک دستور** (مستقل از shell) build و pack کنید:
```
node scripts/build-web-admin.mjs            # پیش‌فرض: --base /s ، capi.israapp.ir ، sapi.israapp.ir
# سفارشی: node scripts/build-web-admin.mjs --base /admin --low https://capi.example.ir --high https://sapi.example.ir
```
خروجی `deploy/web-admin/` یک اپ Node بدون وابستگی است (`app.js`: fallback به `index.html`، هدرهای امنیتی، CSP با hash). اسکریپت pack اگر build با base/آدرس‌های دیگری ساخته شده باشد خطا می‌دهد (نشانهٔ «اپ بالا است ولی پنل بالا نمی‌آید»: دارایی‌ها از `/_app/...` ریشهٔ دامنه خوانده می‌شوند و API روی `localhost` است).
- cPanel ← Setup Node.js App: Application root = `apps/web-admin`، Application URL = `israapp.ir/s`، Startup file = `app.js`؛ محتوای `deploy/web-admin` را آپلود و Restart کنید. env لازم نیست.
- `CORS_ORIGINS` سه API باید `https://israapp.ir` را داشته باشد (origin بدون مسیر است).
- ورود/نگهداری توکن مثل قبل است؛ ولی admin و web-main اگر هر دو روی `israapp.ir` باشند یک origin را شریک می‌شوند (localStorage/Service Worker/Cache مشترک؛ نام cacheها پیشوند اختصاصی دارد). برای جداسازی کامل، بعداً می‌توان به `panel.israapp.ir` منتقل کرد (بدون BASE_PATH؛ بخش ب-۶).
