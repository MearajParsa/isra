# ۲۶ — توسعهٔ پنل مدیریت: کاربر، جلسه، گزارش، حساب من (قرارداد 1.4.0)

> منبع قرارداد: `packages/api-types` (public: `high.*` ⇒ `/s/v1/system/*`؛ internal: `internal.*` ⇒ `LOW_ADMIN`/`MID_ADMIN`/رویدادها). این سند قواعد پیاده‌سازی مشترک است؛ قفل #8: web-admin فقط به `/s/v1` (و auth در low) درخواست می‌زند.

## تصمیم‌های مالک
- **حذف کاربر = حذف نرم + ناشناس‌سازی** (برگشت‌ناپذیر). **ساخت کاربر با رمز موقت** (`mustChangePassword`). همه‌چیز یک‌جا. ادمین (developer) به همه‌چیز دسترسی دارد.

## مجوزهای تازه (high)
`system.users.manage`، `system.sessions.view`، `system.sessions.manage`، `system.reports.view`.
- developer: **همهٔ مجوزها قفل‌شده** (مثل قبل؛ migration تازه برای seed).
- super_admin (پیش‌فرض، قابل‌ویرایش): مجوزهای قبلی + `system.sessions.view` + `system.reports.view`؛ **بدون** `users.manage`/`sessions.manage`.
- مجوزها فقط در high (DB) هستند و در JWT نمی‌روند (مثل قبل).

## مالکیت داده و مسیر فراخوانی
| عملیات | مالک | مسیر |
|---|---|---|
| کاربر/رمز/نشست‌ها/OTP | low | high ⇒ `POST|GET|PATCH|PUT|DELETE /c/internal/v1/admin/...` (`LOW_ADMIN`) |
| جلسه/عضو/حضور/صف/ارزیابی/امتیاز | mid | high ⇒ `/o/internal/v1/admin/...` (`MID_ADMIN`) |
| نقش/مجوز/audit/تنظیمات/دایرکتوری کاربران | high | محلی |
هر مسیر internal جدید: `@InternalCallers('high')` + فقط‌ ACL (`internal-auth.ts`)؛ high با `internalHeaders(env, 'low'|'mid')` صدا می‌زند؛ timeout = `INTERNAL_TIMEOUT_MS`؛ خطای شبکه/۵xx سرویس مبدأ ⇒ `503 SERVICE_UNAVAILABLE` (پیام خنثی)؛ ۴xx مبدأ (CONFLICT/NOT_FOUND/VALIDATION) **با همان code/reason** به کلاینت می‌رسد.
ACL رویداد (فقط افزودن): low⇒mid: `user.phone.changed`(نادیده در mid)، `user.status.changed`؛ low⇒high: `user.phone.changed`، `user.status.changed`.

## رویدادها (outbox در low؛ at-least-once + dedupe eventId)
- `user.registered` (موجود): ساخت کاربر از ادمین هم همین را می‌فرستد (high دایرکتوری را upsert می‌کند؛ **status=active**).
- `user.profile.updated` (موجود): تغییر نام.
- `user.phone.changed {userId, phone, changedAt}`: high `user_directory.phone` را به‌روز می‌کند.
- `user.status.changed {userId, status, changedAt, anonymizedPhone?}`: high `user_directory.status` (و با deleted: phone=anonymizedPhone، نام خالی)؛ mid با deleted نام در `user_directory` را خالی و `deleted` علامت می‌زند (UI «کاربر حذف‌شده»؛ `displayName()` موجود).
- `session.revoked` (موجود): هر revoke (غیرفعال‌سازی، حذف، خروج اجباری، رمز موقت) باید `publishRevoked` بزند.

## رمز موقت (`mustChangePassword`)
- low: ستون `users.must_change_password` (+ `status` موجود: active|disabled|deleted).
- ساخت با `password`، یا `PUT .../password {action:'set'}` ⇒ `must_change_password=1` + revoke همهٔ نشست‌ها. `clear` ⇒ حذف ردیف `user_credentials`، پرچم=0.
- توکن access: claim `mcp: true` وقتی پرچم فعال است. low: `GET /me` و `PUT /me/password` و logout/refresh مجازند؛ بقیه ⇒ `403 AUTH_PASSWORD_CHANGE_REQUIRED` (از وضعیت DB/cache، نه فقط claim). mid: **همهٔ** مسیرها با `mcp` رد (`AUTH_PASSWORD_CHANGE_REQUIRED`)؛ high: فقط H-00، H-02، H-04 مجازند.
- تغییر رمز با `currentPassword` (به‌جای step-up) فقط وقتی پرچم فعال است؛ موفقیت ⇒ پرچم=0، سایر نشست‌ها revoke، **نشست جاری می‌ماند** و کلاینت باید refresh کند (access جدید بدون `mcp`).
- login (OTP/رمز) برای کاربر `disabled|deleted` ⇒ `403 AUTH_ACCOUNT_DISABLED`؛ refresh هم. کاربر `deleted` با شمارهٔ قبلی دوباره ثبت‌نام می‌کند ⇒ **کاربر جدید** (شمارهٔ ناشناس ردیف قدیمی آزاد کرده).
- رمزها هرگز در لاگ/audit/پاسخ/outbox نمی‌آیند (`meta` audit بدون رمز).

## حذف نرم کاربر (low)
- `status='deleted'`، `phone = 'd' + hex(id)[0:10]` (یکتا؛ `AnonPhone`)، پاک: نام پروفایل، `user_credentials`، `inbox_messages`، OTPهای باز؛ revoke همهٔ نشست‌ها + refresh tokenها؛ `user_claims` (نقش/grants) پاک و `perm_ver++`؛ سپس رویداد `user.status.changed`. high نقش‌ها و grantهای او را هم پاک می‌کند (در رویداد). idempotent.
- حفاظت‌ها (high قبل از فراخوانی low): خودِ ادمین ⇒ `409 SELF_PROTECTED`؛ آخرین developer ⇒ `409 LAST_HOLDER`.

## جلسه (mid)
- ستون `sessions.deleted_at` (حذف نرم). **همهٔ** پرسمان‌های موجود (فهرست عمومی، «جلسه‌های من»، stats، snapshots/scheduler، join/attendance/queue/eval) جلسهٔ حذف‌شده را مثل «وجود ندارد» می‌بینند؛ فقط `MID_ADMIN` با `includeDeleted=true` می‌بیند.
- ساخت از ادمین: سازنده `creatorId` = `session_manager` (همان منطق `SessionsService.create`).
- ویرایش/transition: قوانین موجود (فقط‌رو‌به‌جلو؛ edit فقط draft/scheduled)؛ بدون نیاز به عضویت. حذف: هر وضعیتی.
- اعضا: تأیید/رد/نقش/حذف با همان قواعد دامنه (مدیر قابل‌حذف نیست؛ `manager` به‌تنهایی ارزیابی ندارد). رویدادهای live/inbox موجود (مثلاً پیام عضویت) حفظ شود.
- نمای ادمین صف/ارزیابی/حضور فقط‌خواندنی و بدون استثنای حریم خصوصی.

## audit (high؛ بدون PII/رمز در meta)
`user.create`، `user.update`، `user.status_change`، `user.delete`، `user.password_set`، `user.password_clear`، `user.logout_all`، `user.session_revoke`، `account.profile_update`، `account.password_change`، `account.session_revoke`، `session.create`، `session.update`، `session.transition`، `session.delete`، `session.member_decide`، `session.member_roles`، `session.member_remove`. هدف: `target {type:'user'|'session', id, label}`. نوشتن audit **در همان تراکنش/پس از موفقیت اقدام** (شکست مبدأ ⇒ audit نیست).

## گزارش‌ها (high تجمیع می‌کند)
- بازهٔ پیش‌فرض ۳۰ روز، حداکثر ۳۶۶ روز، تاریخ‌ها `YYYY-MM-DD` به‌وقت `Asia/Tehran`؛ bucket هفته از **شنبه**.
- منبع: کاربران (high: دایرکتوری/نقش‌ها؛ low: status/رمز/OTP/کلاینت)، جلسه‌ها (mid). خطای یک مبدأ ⇒ همان بخش `null`/خالی (degraded) نه خطای کل.
- `ReportOverview.clients`: نشست‌های فعال low به تفکیک `client_id` (web-main/web-admin/android-*).

## فیلترهای کاربران (high، SQL پارامتری)
`q` (نام/شماره)، `role`، `grant`، `status`، `createdFrom/To` (به‌وقت تهران)، `sort`. `status` در `user_directory` (migration: ستون `status VARCHAR(10) NOT NULL DEFAULT 'active'` + ایندکس).

## تست و کیفیت
- هر سرویس: تست یکپارچهٔ واقعی روی DB (الگوی موجود) برای همهٔ مسیرهای تازه، ACL (فرستندهٔ غلط ⇒ 403)، حفاظت‌ها، idempotency، audit و رویدادها؛ `pnpm turbo lint typecheck test` سبز.
- high: سرورهای جعلی low/mid (الگوی `fake` در tests/helpers) برای تست orchestration، شامل خطای ۵xx/timeout ⇒ 503 و عبور ۴xx.
- web-admin: بدون mock دادهٔ جعلی در محصول؛ فقط تست واحد logic.
