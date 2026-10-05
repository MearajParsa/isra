# Changelog — @isra/api-types

فرمت: [Keep a Changelog](https://keepachangelog.com/fa/1.1.0/)؛ نسخه‌گذاری: [SemVer](https://semver.org/lang/fa/) روی قرارداد (جزئیات: `docs-v2/22-api-engineering-standards.md` §۵).

## [1.5.0] — ۱۴۰۵/۰۷/۱۴
### افزوده شد
- **RBAC پویا:** نقش، مجوز و ماژول قابل ساخت/ویرایش/حذف (H-13..H-18، H-85..H-91)؛ ماتریس یک‌جا H-92؛ دسترسی مؤثر H-93/H-94؛ step-up per نقش×مجوز؛ developer از step-up معاف.
- مجوزهای سیستمی تازه: `system.role.manage`، `system.permission.manage`، `system.stepup.manage`.
- تغییر شکل (سازگار با کلاینت‌های فعلی): `SystemRoleKey`/`PermissionKey`/`Grant` از enum به string با الگو؛ `SystemRole` فیلدهای `modules`/`effectivePermissions`/`stepUpRules` گرفت؛ `PermissionInfo` فیلد `group` را به `moduleKey` و … تغییر داد؛ `SystemMe.stepUpExempt`/`stepUp`.
- دلایل CONFLICT: `KEY_TAKEN`، `SYSTEM_PROTECTED`، `ROLE_IN_USE`، `MODULE_NOT_EMPTY`.

## [1.4.0] — ۱۴۰۵/۰۷/۱۴
### افزوده شد (سازگار)
- **مدیریت کاربر در پنل (high):** H-24 ساخت، H-25 ویرایش، H-26 فعال/غیرفعال، H-27 حذف نرم+ناشناس، H-28 رمز موقت/حذف رمز، H-29 خروج اجباری، H-50/H-51 نشست‌های کاربر. `SystemUser.status`؛ `H-21` ⇒ `SystemUserDetail`؛ فیلترهای تازهٔ `H-20` (grant/status/createdFrom/createdTo/sort).
- **حساب من (high):** H-02..H-07 (نام، رمز، نشست‌ها) — مطابق قفل #8 همهٔ اقدام‌های ادمین از `/s/v1`.
- **مدیریت جلسه (high ⇒ mid):** H-60..H-72 (فهرست/جزئیات/ساخت/ویرایش/وضعیت/حذف نرم/اعضا/حضور/صف/ارزیابی).
- **گزارش‌های تحلیلی:** H-80..H-84؛ فیلترهای تازهٔ audit (actorId/targetType/targetId/from/to).
- مجوزهای تازه: `system.users.manage`، `system.sessions.view`، `system.sessions.manage`، `system.reports.view`.
- low: `Me.mustChangePassword`، `SetPasswordBody.currentPassword`؛ خطاهای `AUTH_PASSWORD_CHANGE_REQUIRED`، `AUTH_ACCOUNT_DISABLED`؛ دلایل CONFLICT: `PHONE_TAKEN`، `SELF_PROTECTED`، `USER_NOT_ACTIVE`.
- قرارداد internal بین‌سرویسی (`internal.*` در بستهٔ api-types؛ خارج از OpenAPI): مسیرهای `LOW_ADMIN`/`MID_ADMIN` و رویدادهای `user.phone.changed`، `user.status.changed`.

## [1.3.2] — ۱۴۰۵/۰۷/۱۳
### اصلاح (سازگار)
- متن `SERVICE_UNAVAILABLE`: «در حال نگهداری» برای هر ۵۰۳ گمراه‌کننده بود (قطعی گذرای وابستگی هم ۵۰۳ است)؛ متن خنثی شد. حالت نگهداری واقعی پیام و `details.reason='maintenance'` جدا دارد.

## [1.3.1] — ۱۴۰۵/۰۷/۱۳
### اصلاح (سازگار)
- OpenAPI `servers`: آدرس تولید هر سرویس ساب‌دامنهٔ خودش است (`capi|oapi|sapi.israapp.ir`)، نه `api.israapp.ir`؛ توضیح TTL توکن‌ها از پیکربندی سرور.

## [1.3.0] — ۱۴۰۵/۰۷/۱۲
### افزوده شد (سازگار)
- `SessionLocation.routeUrl` (اختیاری، فقط https، حداکثر ۵۰۰): لینک مسیریابی که سازندهٔ جلسه کنار آدرس متنی می‌گذارد.

## [1.2.0] — ۱۴۰۵/۰۷/۱۲
### افزوده شد (سازگار)
- `SessionMe.evalWeights` (M-02): وزن‌های فعلی ارزیابی برای پیش‌نمایش امتیاز در فرم.

## [1.1.0] — ۱۴۰۵/۰۷/۱۱
### تغییر (سازگار)
- `StepUpResult.stepUpToken`: حداکثر طول ۵۱۲ → ۱۰۲۴ (توکن step-up اکنون JWT امضاشده است تا api-high بدون hop به low آن را محلی تأیید کند). کلاینت‌ها توکن را opaque می‌دانند ⇒ بدون اثر.

## [1.0.0] — ۱۴۰۵/۰۷/۰۹
### افزوده شد
- schemaهای zod و OpenAPI 3.1 برای `api-low` (`/c/v1`)، `api-mid` (`/o/v1`)، `api-high` (`/s/v1`).
- ثبت پایدار کدهای خطا، قالب پاسخ/خطا، هدرها، rate-limit، cache، idempotency و SLO per endpoint.
- Socket.IO (mid): رویدادهای `attendance.updated`، `queue.updated`، `queue.turned`، `eval.updated`، `session.state`.
- ابزار تشخیص تغییر ناسازگار (`diffOpenApi`) و تست‌های سیاست امنیت/پرفورمنس.
