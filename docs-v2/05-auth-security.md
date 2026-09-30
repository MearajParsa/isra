# ۰۵ — احراز هویت و امنیت

## اصول

| اصل | تصمیم |
|-----|-------|
| مالک حساب و صدور توکن | فقط `api-low` |
| مسیر auth تولید | `/c/v1/auth/*` (یا auth مشترک زیر low) روی `api.israapp.ir` |
| استثنای کلاینت | **همه** کلاینت‌ها (low/mid/high/web-admin) فقط برای auth به low؛ بقیه فراخوانی‌ها به سطح خود (`/c/v1`، `/o/v1`، `/s/v1`) |
| اعتبارسنجی mid/high | JWT محلی با **JWKS از low**؛ الگوریتم **RS256** |
| hop به low در هر request غیر-auth | ممنوع |
| نقش سیستم | مالک `api-high`؛ انتشار با internal REST + outbox/inbox |
| Guest | بدون توکن؛ نقش DB ندارد؛ محتوای قابل‌مرور مثل عضو؛ اقدام gated → ثبت‌نام |
| Access / Refresh | **۱۵ دقیقه** / **۱۴ روز** با rotation + revoke خانواده |
| SMS | **Faraz SMS**؛ OTP **۵ رقم**، TTL **۲ دقیقه**، حداکثر **۳ تلاش**؛ تلفن `09xxxxxxxxxx` |
| اقدام حساس | step-up |

## جریان OTP (موبایل ایرانی)

1. کلاینت شماره (`09xxxxxxxxxx`) را به `POST /c/v1/auth/otp/request` روی **low** می‌فرستد.
2. Low نرخ‌محدود می‌کند؛ OTP پنج‌رقمی را از طریق **Faraz SMS** می‌فرستد (ایمیل ساخته نمی‌شود).
3. کلاینت کد را با `POST /c/v1/auth/otp/verify` تأیید می‌کند (حداکثر ۳ تلاش؛ TTL ۲ دقیقه).
4. در صورت موفقیت: access (۱۵م) + refresh (۱۴روز) + شناسهٔ session family؛ RS256.
5. کاربر جدید در صورت نیاز پروفایل حداقلی تکمیل می‌کند.

ورود با رمز: پس از تعیین رمز، `POST /c/v1/auth/login/password` روی low.
Refresh/logout: مسیرهای auth روی low؛ کلاینت mid/high/admin هم همین‌جا می‌آیند.

## JWT

| ادعا (claim) پیشنهادی | معنی |
|----------------------|------|
| `sub` | user id |
| `sid` / `fid` | session id / family id |
| `lvl` یا scopes | سطح دسترسی پایه |
| `roles` / `perms` | نقش‌ها و مجوزها (از high همگام) |
| `did` | device id در صورت binding |
| `exp` / `iat` | استاندارد |

- الگوریتم: **RS256**.
- Mid/High کلید عمومی را از **JWKS** سرویس low می‌خوانند (نه secret مشترک سمت کلاینت).
- Access ۱۵ دقیقه؛ Refresh ۱۴ روز با rotation.
- پکیج اختیاری: `packages/jwt-verify`.

## Session و دستگاه

| قابلیت | توضیح |
|--------|-------|
| Session family | همه refreshهای مشتق‌شده از یک ورود |
| Rotation | هر استفاده از refresh، توکن قبلی باطل |
| Reuse detection | استفادهٔ مجدد refresh باطل → revoke کل family |
| لیست نشست‌ها | کاربر می‌تواند دستگاه/نشست را ببندد |
| Device binding | شناسهٔ دستگاه در claim یا جدول؛ mismatch برای اقدام حساس سخت‌گیرانه |

## Step-up

برای اقدام‌های حساس (مثلاً تغییر نقش سیستم، حذف گسترده، تغییر تنظیمات امنیتی):

1. درخواست معمولی با access کافی نیست.
2. کاربر دوباره OTP یا تأیید رمز می‌دهد (از طریق low).
3. توکن/پرچم step-up کوتاه‌عمر صادر می‌شود.
4. اقدام فقط با آن مجاز است.

لیست دقیق اقدام‌های step-up در پیاده‌سازی high/low قفل جزئی می‌گیرد؛ تا آن زمان حداقل: تغییر نقش سیستم، revoke همگانی، چرخش کلید.

## مدل مجوز (Permissions)

- کلیدها انگلیسی، مثلاً: `session.create`, `session.membership.approve`, `queue.manage`, `eval.submit`, `system.role.assign`.
- نقش سیستم undeletable: `developer`, `super_admin`.
- نقش جلسه context-bound است (روی membership جلسه)، نه جایگزین نقش سیستم.

### ماتریس نقش جلسه (قفل)

| اقدام | manager | supporter | teacher | quran_student |
|-------|:-------:|:---------:|:-------:|:-------------:|
| تنظیمات جلسه | ✓ | ✗ | ✗ | ✗ |
| تأیید عضویت | ✓ | ✓ | ✗ | ✗ |
| مدیریت صف | ✓ | ✓ | ✓ | ✗ |
| ثبت ارزیابی | ✗* | ✓ | ✓ | ✗ |
| پیوستن به صف / حضور | — | — | — | ✓ |

\* `session_manager` فقط اگر هم‌زمان نقش `teacher` یا `session_supporter` داشته باشد می‌تواند ارزیابی ثبت کند.

## همگام‌سازی نقش از high

1. ادمین نقش را در high عوض می‌کند (در صورت نیاز step-up).
2. High از طریق **outbox/inbox** و در صورت نیاز internal REST به low/mid اطلاع می‌دهد (EventEmitter فقط in-process داخل high).
3. صدور توکن بعدی / refresh در low claim به‌روز می‌دهد.
4. Mid/High برای مسیرهای حساس می‌توانند نسخهٔ `perm_ver` را چک کنند و در صورت قدیمی بودن 401 با کد مشخص بدهند تا کلاینت refresh کند.

## امنیت API

| قاعده | |
|-------|--|
| HTTPS فقط در محیط واقعی | |
| Rate limit روی OTP و login | |
| کلید Map.ir فقط سرور | |
| بدون لو رفتن private key / secret در کلاینت | |
| خطای auth یکنواخت طبق `07-api-conventions.md` | |
| مصحف روی سرور ذخیره نشود | |
| رسانه در `media/` روی host؛ نه MinIO | |

## ساخته نمی‌شود

| مورد | |
|------|--|
| ایمیل برای OTP | ساخته نمی‌شود |
| GraphQL auth | ساخته نمی‌شود |
| session store روی Redis | ساخته نمی‌شود (مگر unlock) |
| تأیید هویت mid با فراخوانی low در هر request غیر-auth | ساخته نمی‌شود |
| نقش DB برای guest | ساخته نمی‌شود |
| ارزیابی توسط session_manager به‌تنهایی | ساخته نمی‌شود |
