# ۲۷ — RBAC پویا: نقش، مجوز، ماژول و step-up قابل مدیریت (api-types ۱.۵.۰)

> وضعیت: **قفل مالک** (درخواست مالک ۱۴۰۵/۰۷/۱۴). منبع حقیقت قرارداد: `packages/api-types/src/high/*` (H-13..H-18، H-85..H-94 + تغییر H-10..H-12، H-22، H-23، H-00).
> مالک سرویس: **api-high** (نقش/مجوز/ادمین سیستم). low/mid تغییری در منطق ندارند: claim `perms` همان مجوزهای مؤثرِ کاربر است.

## ۱. مدل داده (api-high، migration `1728500000000-DynamicRbac`)

| جدول | ستون‌ها / نکته |
|---|---|
| `system_modules` | `module_key` PK(32)، `title`، `description`، `is_system`، `sort_order`، `created_at`، `updated_at` |
| `permissions` (موجود، گسترش) | + `module_key` FK منطقی، `description`، `is_system`، `grantable`، `step_up` ENUM('required','none'). ستون `perm_group` حذف یا deprecated |
| `system_roles` (موجود، گسترش) | `role_key` به VARCHAR(32)؛ `undeletable` → همان معنا اما **CHECK =1 حذف شود** (فقط سیستمی‌ها ۱)؛ + `created_at`, `updated_at`, `created_by` |
| `role_permissions` (موجود) | `role_key`+`permission_key`+`locked` — مجوزهای **صریح** |
| `role_modules` (جدید) | `role_key`+`module_key` — مجوز کامل ماژول (حال و آینده) |
| `role_step_up` (جدید) | `role_key`+`permission_key`+`mode` ENUM('required','none') — override؛ نبودن ردیف = inherit |
| `user_grants` (موجود) | `grant_key` اکنون = هر مجوز با `grantable=1` |
| `rbac_meta` (جدید) | ردیف واحد `version` BIGINT — با هر تغییر ماتریس +۱ (برای ETag/کش) |

Seed (در همان migration؛ idempotent، کلیدهای موجود **بدون تغییر** تا JWT/mid سازگار بماند):

ماژول‌های سیستمی: `users` (کاربران)، `access` (نقش‌ها و دسترسی)، `settings` (تنظیمات)، `audit` (گزارش اقدام‌ها)، `sessions_admin` (مدیریت جلسه‌ها)، `reports` (گزارش‌های تحلیلی)، `sessions` (جلسه‌ها).

| مجوز | ماژول | grantable | step-up پیش‌فرض |
|---|---|---|---|
| `system.users.view` | users | ✗ | none |
| `system.users.manage` | users | ✗ | required |
| `system.role.assign` | access | ✗ | required |
| `system.permission.edit` | access | ✗ | required |
| `system.role.manage` (جدید) | access | ✗ | required |
| `system.permission.manage` (جدید) | access | ✗ | required |
| `system.stepup.manage` (جدید) | access | ✗ | required |
| `system.settings.view` | settings | ✗ | none |
| `system.settings.edit` | settings | ✗ | required |
| `system.audit.view` | audit | ✗ | none |
| `system.sessions.view` | sessions_admin | ✗ | none |
| `system.sessions.manage` | sessions_admin | ✗ | required |
| `system.reports.view` | reports | ✗ | none |
| `session.create` | sessions | ✓ | none |

Seed نقش‌ها: `developer` = همهٔ مجوزها (قفل، ثابت، شامل مجوزهای تازه)؛ `super_admin` = همان مجموعهٔ قبلی (بدون سه مجوز تازه)؛ قفل‌های super_admin بدون تغییر. فقط developer سه مجوز تازه را دارد.

مهاجرت داده‌ای موجود: `perm_group` → `module_key` طبق جدول بالا؛ migration نباید دادهٔ نقش/grant فعلی را از دست بدهد. `down()` معکوس‌پذیر.

## ۲. قواعد دسترسی مؤثر

- **مجوز مؤثر نقش R** = `role_permissions(R)` ∪ همهٔ مجوزهای ماژول‌های `role_modules(R)` (در لحظه؛ مجوز تازهٔ ماژول خودکار می‌رسد).
- **مجوز مؤثر کاربر** = اجتماع مجوز مؤثر همهٔ نقش‌هایش ∪ `user_grants`.
- پنل ادمین حداقل یک نقش سیستمی می‌خواهد (مثل قبل)؛ grant بدون نقش فقط برای مصرف‌کننده‌های دیگر (مثلاً `session.create` در mid).
- انتشار claim: پس از **هر** تغییری که مجوز مؤثر کسی را عوض می‌کند (نقش، ماتریس، ماژول نقش، حذف مجوز، grant، تغییر مجوزهای ماژول) برای همهٔ کاربرانِ اثرپذیر `ClaimsService.publish` (permVer+۱ و `system.role.changed`) در **همان تراکنش** (outbox). برای نقش‌های پرجمعیت دسته‌ای (chunk) و idempotent.
- JWT/claim: `grants` = مجوزهای مؤثر (سقف ۲۵۶ در low). سقف‌های validation (۲۰۰ مجوز صریح per نقش، ۱۰ نقش per کاربر، ۵۰ grant) جلوی عبور از سقف را می‌گیرند؛ اگر مجموع مؤثر از ۲۵۶ گذشت، ذخیره‌سازی با `VALIDATION_FAILED` رد شود (هرگز truncate بی‌صدا نشود).

## ۳. قواعد امنیتی (ضد ارتقای دسترسی)

- **E1:** هر endpoint مجوز خودش را لازم دارد (guard fail-closed مثل قبل).
- **E2 (حیاتی):** کاربر فقط می‌تواند مجوزی را به نقش اضافه کند / به کاربر grant بدهد / نقشی را به کسی بدهد که **خودش همهٔ مجوزهای مؤثر آن را دارد** (developer معاف). نقض ⇒ `AUTH_FORBIDDEN`.
- **E3:** نقش `developer`: محتوا/ماژول/step-up/حذف آن ثابت (`AUTH_FORBIDDEN`)؛ دادن/برداشتن آن فقط توسط developer؛ قفل آخرین دارنده (`LAST_HOLDER`) مثل قبل.
- **E4:** `isSystem` ⇒ حذف ممنوع (`CONFLICT/SYSTEM_PROTECTED`)؛ کلید مجوز سیستمی و ماژولش تغییر نمی‌کند. `locked` در `role_permissions` برای super_admin حفظ می‌شود (LOCKED_PERMISSION).
- **E5:** تغییر قواعد step-up (H-18) و `step_up`/`grantable` مجوز فقط با `system.stepup.manage` (برای `step_up`) و `system.permission.manage` (برای بقیه).
- **E6:** حذف نقش فقط بدون دارنده (`ROLE_IN_USE`)؛ حذف ماژول فقط خالی (`MODULE_NOT_EMPTY`)؛ حذف مجوز پویا ⇒ cascade (نقش‌ها، grant، قواعد step-up) + claim دارندگان.
- **E7:** مجوز **پویا** فقط «داده» است: هیچ endpoint سیستمی با آن اعمال نمی‌شود؛ برای مصرف‌کنندهٔ آینده/سرویس‌های دیگر از طریق claim. ساخت مجوز با پیشوند `system.` برای کلید پویا ممنوع (`VALIDATION_FAILED`، فیلد `key`).
- هر نوشتن: `audit` (اقدام‌ها: `role.create|update|delete`، `role.modules.updated`، `role.stepup.updated`، `role.permissions.updated`، `permission.create|update|delete`، `module.create|update|delete`) + هیچ PII/secret.
- Idempotency-Key برای POSTها (H-13، H-85، H-89) طبق الگوی H-24.

## ۴. step-up (قفل مالک)

> «کسی که نقش برنامه‌نویس دارد برای هیچ چیز step-up ندارد؛ و برنامه‌نویس مدیریت می‌کند برای چه نقشی چه چیزی step-up داشته باشد.»

قاعدهٔ guard برای endpoint با `stepUp: true` در قرارداد (= «step-up‌پذیر»):
1. کاربر دارای نقش `developer` ⇒ **هرگز step-up** (حتی H-04 و self-service؛ استثنای `mcp` بدون تغییر).
2. endpoint بدون `permission` (self-service مثل H-04) ⇒ step-up لازم (غیر developer).
3. وگرنه منابع مجوز `P` برای کاربر: هر نقشِ دارندهٔ P (صریح یا از ماژول) ⇒ `role_step_up(role,P).mode ?? permissions.step_up`؛ هر grant مستقیم ⇒ `permissions.step_up`. **لازم است اگر هر منبعی required بگوید**؛ در غیر این صورت لازم نیست. (محافظه‌کارانه؛ اگر منبعی پیدا نشد ⇒ لازم.)
4. مفهوم قرارداد: `stepUp:true` یعنی «اینجا می‌شود step-up خواست»؛ تصمیم نهایی از سیاست بالا می‌آید. endpoint خواندنیِ بدون `stepUp:true` هیچ‌وقت step-up نمی‌خواهد.
5. `GET /system/me` (`stepUp`, `stepUpExempt`) و `GET /system/me/access` همین نتیجه را برای UI می‌دهند تا قبل از اقدام OTP بخواهد.
6. اعتبار توکن step-up مثل قبل (JWT از low، هم‌سشن)؛ تغییری نمی‌کند.

## ۵. کارایی

- `RbacService.access(userId)`: کش حافظهٔ پروسه (LRU ≤ ۲۰۰۰ کاربر، TTL ۵ ثانیه) + invalidation محلی بلافاصله پس از هر نوشتن (نسخهٔ `rbac_meta`). یک query تجمیعی به‌جای ۳ query.
- سیاست step-up و رجیستری مجوز/ماژول: کش پروسه با همان نسخه (بارگذاری یک‌جا؛ مقدار ثابت بین تغییرها).
- `GET /system/rbac/matrix` فقط ۴–۵ query؛ ETag بر پایهٔ `version`؛ `If-None-Match` ⇒ 304.
- هیچ N+1 در فهرست نقش‌ها (شمارش دارندگان با یک GROUP BY).
- p95: خواندن ≤ ۱۲۰ms، نوشتن ≤ ۲۵۰ms روی دادهٔ نمونه.

## ۶. تست حداقل (الزامی؛ e2e روی MariaDB مثل بقیه)

۱. ساخت نقش پویا + مجوز صریح + ماژول ⇒ `effectivePermissions` درست؛ مجوز تازه در ماژول بعداً ساخته شود ⇒ خودکار به نقش می‌رسد و claim دارندگان تازه می‌شود.
۲. ضد ارتقا E2: super_admin نمی‌تواند به نقشی مجوزی بدهد که ندارد؛ نمی‌تواند نقشی با مجوز بیشتر از خودش را به کسی بدهد؛ developer می‌تواند.
۳. نقش سیستمی حذف نمی‌شود؛ نقش دارای دارنده حذف نمی‌شود؛ ماژول غیرخالی حذف نمی‌شود؛ حذف مجوز پویا cascade می‌کند و claim را تازه می‌کند.
۴. step-up: developer هیچ‌جا نمی‌خواهد؛ super_admin با پیش‌فرض می‌خواهد؛ با `none` برای نقشش نمی‌خواهد؛ چند نقش ⇒ اگر یکی required باشد می‌خواهد؛ تغییر قاعده فقط با `system.stepup.manage`.
۵. `H-92` ETag/304؛ `H-93/H-94` منابع (`sources`) درست؛ `H-00` شامل `stepUp`/`stepUpExempt`.
۶. کلیدهای نامعتبر ⇒ `VALIDATION_FAILED`؛ `system.` برای مجوز پویا رد؛ کلید تکراری ⇒ `KEY_TAKEN`.
۷. تست مهاجرت: ماژول/مجوز سیستمی seed شده و نقش‌های قبلی سالم.
۸. تست امنیت guard: نبود مجوز ⇒ 403؛ بدون step-up (غیر developer) ⇒ `AUTH_STEP_UP_REQUIRED`.
