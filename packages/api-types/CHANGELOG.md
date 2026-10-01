# Changelog — @isra/api-types

فرمت: [Keep a Changelog](https://keepachangelog.com/fa/1.1.0/)؛ نسخه‌گذاری: [SemVer](https://semver.org/lang/fa/) روی قرارداد (جزئیات: `docs-v2/22-api-engineering-standards.md` §۵).

## [1.0.0] — ۱۴۰۵/۰۷/۰۹
### افزوده شد
- schemaهای zod و OpenAPI 3.1 برای `api-low` (`/c/v1`)، `api-mid` (`/o/v1`)، `api-high` (`/s/v1`).
- ثبت پایدار کدهای خطا، قالب پاسخ/خطا، هدرها، rate-limit، cache، idempotency و SLO per endpoint.
- Socket.IO (mid): رویدادهای `attendance.updated`، `queue.updated`، `queue.turned`، `eval.updated`، `session.state`.
- ابزار تشخیص تغییر ناسازگار (`diffOpenApi`) و تست‌های سیاست امنیت/پرفورمنس.
