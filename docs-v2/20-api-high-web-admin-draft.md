# ۲۰ — پیش‌نویس قرارداد API: High (`/s/v1`) برای `web-admin`

**وضعیت: قفل مشروط (۱۴۰۵/۰۷/۰۹) — تصمیم‌ها به AI واگذار شد؛ مالک هر زمان می‌تواند اصلاح کند.** تا آماده‌شدن `api-high` فقط mock (`apps/web-admin/src/lib/api/mock`).
مرجع: قفل‌ها `00` (#8 #9 #15 #28)، `05`، `06-domains/high.md`، `07`، `15` (auth/step-up). قالب پاسخ/خطا/صفحه‌بندی مثل `07`. چیزی که در قفل‌ها نیست **[پیشنهاد]**.

## ۱. دامنه
| داخل | خارج |
|------|------|
| ورود ادمین (فقط auth به low)، نقش‌های سیستم، ماتریس مجوز، کاربران، تنظیمات سراسری، audit، نمای کلی | android-high، انتشار outbox (سمت سرور)، schema DB/env، ساخت نقش سفارشی (قفل: فقط `developer` و `super_admin`) |

- **auth:** همهٔ مسیرهای auth به `/c/v1/auth/*` (OTP، رمز، refresh، logout، step-up) مثل `15`. cookie refresh برای ادمین نام جدا دارد (`isra_rt_admin`، `15` §۵). `web-admin` به هیچ مسیر غیر-auth در low نمی‌زند (ماتریس `04`).
- **ورود فقط برای دارندگان نقش سیستم:** `GET /system/me` برای کاربر بدون نقش ⇒ `AUTH_FORBIDDEN`؛ UI «دسترسی ندارید» نشان می‌دهد.

## ۲. مجوزها (کلید انگلیسی)
| کلید | توضیح | developer | super_admin (پیش‌فرض) |
|------|-------|:-:|:-:|
| `system.users.view` | دیدن کاربران | ✓ قفل | ✓ قفل |
| `system.role.assign` | تخصیص/برداشتن نقش سیستم و grantها | ✓ قفل | ✓ قفل |
| `system.permission.edit` | ویرایش ماتریس مجوز | ✓ قفل | ✓ قفل |
| `system.settings.view` | دیدن تنظیمات | ✓ قفل | ✓ |
| `system.settings.edit` | ویرایش تنظیمات | ✓ قفل | ✓ |
| `system.audit.view` | دیدن audit | ✓ قفل | ✓ قفل |
| `session.create` | ساخت جلسه (سطح کاربر؛ mid) | ✓ | ✓ |

- نقش `developer` همهٔ مجوزها را دارد و **ماتریسش ویرایش نمی‌شود**. `super_admin` فقط مجوزهای «قفل‌نشده» (`settings.*`، `session.create`) را می‌تواند کم/زیاد کند.
- **[پیشنهاد D1]** `session.create` علاوه بر نقش، **grant مستقیم per user** هم دارد (وگرنه هیچ کاربر عادی نمی‌توانست اولین جلسه را بسازد؛ مدیر جلسه با ساخت جلسه ایجاد می‌شود). grantها فقط از این مجموعه: `session.create`.
- مجوزهای درون‌جلسه (`queue.manage`، `eval.submit`، …) از نقش جلسه می‌آید و در این ماتریس ویرایش نمی‌شود (قفل `05`)؛ UI فقط نمایش می‌دهد.

## ۳. endpointها (`/s/v1`، همه Bearer)
| شناسه | مسیر | توضیح |
|-------|------|-------|
| H-00 | `GET /system/me` | `{ user:{id,name,phone}, roles[], permissions[] }` |
| H-01 | `GET /system/overview` | `{ users:{total,admins}, sessions:{draft,scheduled,started,ended}, lastAudit[5] }` |
| H-10 | `GET /system/roles` | `[{ key, title, description, undeletable:true, permissions[], lockedPermissions[], holders }]` |
| H-11 | `GET /system/permissions` | `[{ key, title, group }]` |
| H-12 | `PUT /system/roles/:key/permissions` | `{ permissions[] }` — **step-up**؛ `system.permission.edit`؛ نقش `developer` ⇒ `AUTH_FORBIDDEN`؛ حذف مجوز قفل‌شده ⇒ `CONFLICT` `reason: LOCKED_PERMISSION` |
| H-20 | `GET /system/users?q=&role=&page=&pageSize=` | `Page<{ id, name, phone, roles[], grants[], createdAt }>`؛ `q` روی نام/شماره |
| H-21 | `GET /system/users/:id` | همان آیتم |
| H-22 | `PUT /system/users/:id/roles` | `{ roles[] }` — **step-up**؛ `system.role.assign`؛ برداشتن آخرین دارندهٔ `developer`/`super_admin` ⇒ `CONFLICT` `reason: LAST_HOLDER`؛ تغییر نقش `developer` فقط توسط developer (وگرنه `AUTH_FORBIDDEN`) |
| H-23 | `PUT /system/users/:id/grants` | `{ grants[] }` — **step-up**؛ `system.role.assign` |
| H-30 | `GET /system/settings` | `{ version, evalWeights:{voice,tone,tajweed}, badgeThresholds:[n,n,n,n], flags:{}, updatedAt, updatedBy }` |
| H-31 | `PUT /system/settings` | `{ version, evalWeights, badgeThresholds, flags }` — **step-up**؛ `system.settings.edit`؛ `version` قدیمی ⇒ `CONFLICT` `reason: VERSION_MISMATCH` |
| H-40 | `GET /system/audit?action=&q=&page=&pageSize=` | `Page<{ id, at, actor:{id,name}, action, target?:{type,id,label}, summary, meta }>`؛ `system.audit.view` |

- **step-up:** هدر `X-Step-Up-Token` (از `15` L-06/L-07؛ ۵ دقیقه). نبودن ⇒ `AUTH_STEP_UP_REQUIRED` 403. کلاینت توکن را تا انقضا نگه می‌دارد و فقط وقتی لازم است دوباره می‌گیرد.
- هر write موفق یک `audit` می‌نویسد و رویداد outbox می‌سازد: `system.role.changed`، `system.permission.changed`، `system.settings.changed` (مصرف low/mid؛ قفل `06/high`).

## ۴. قواعد اعتبارسنجی تنظیمات
- `evalWeights`: سه عدد صحیح ۰..۱۰۰ با **مجموع دقیقاً ۱۰۰** (پیش‌فرض ۴۰/۳۰/۳۰). **[D2]** وزن جدید فقط روی ارزیابی‌های **بعدی** اثر دارد؛ ارزیابی‌های قبلی با وزن زمان ثبت می‌مانند.
- `badgeThresholds`: ۴ عدد صحیح مثبت **اکیداً صعودی** (پیش‌فرض ۵۰/۱۵۰/۳۰۰/۵۰۰). **افت امتیاز نشان کسب‌شده را باطل نمی‌کند** (قفل #12)؛ تغییر آستانه روی نشان‌های قبلاً اعطاشده اثر عقب‌رو ندارد.
- `flags` **[D3]**: `maintenance_mode` (برنامه‌ها ۵۰۳)، `registration_open` (ثبت‌نام کاربر جدید). کلید ناشناخته ⇒ `VALIDATION_FAILED`.

## ۵. تصمیم‌های ثبت‌شده
| # | تصمیم |
|---|-------|
| D1 | grant مستقیم `session.create` per user (بالا) |
| D2 | وزن جدید فقط برای ارزیابی‌های بعدی |
| D3 | دو پرچم داخلی: `maintenance_mode`، `registration_open` |
| D4 | نقش‌ها نه ساخته می‌شوند و نه حذف؛ `DELETE` وجود ندارد |
| D5 | قفل آخرین دارنده: هر یک از `developer` و `super_admin` همیشه ≥۱ دارنده |
| D6 | تغییر نقش `developer` فقط با نقش `developer` |
| D7 | audit فقط‌خواندنی؛ حذف/ویرایش ندارد |
