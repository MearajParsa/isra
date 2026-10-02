# ۰۷ — قراردادهای API (REST)

این فایل **فقط conventions** است؛ dump کامل endpoint هنوز نه. بدون Gateway؛ کلاینت به پیشوند سطح خودش (به‌علاوه استثنای auth به low).

## اصول

| قاعده | مقدار |
|-------|-------|
| سبک | REST JSON |
| Host تولید | `api.israapp.ir` |
| پیشوند سطح | `/c/v1` (low)، `/o/v1` (mid)، `/s/v1` (high) |
| Gateway | ساخته نمی‌شود |
| GraphQL | ساخته نمی‌شود |
| Auth header | `Authorization: Bearer <access_token>` |
| Auth استثنا | همه کلاینت‌ها فقط `/c/v1/auth/*` به low |
| زبان پیام خطا برای UI | فارسی در `message`؛ کد ماشین انگلیسی در `code` |
| زمان | ISO-8601 با offset؛ منطق کسب‌وکار `Asia/Tehran` |
| هفته | شنبه–جمعه |
| JWT | RS256؛ mid/high با JWKS از low |

## Base URL (تولید)

| سرویس | پیشوند |
|-------|--------|
| low | `https://api.israapp.ir/c/v1` |
| mid | `https://api.israapp.ir/o/v1` |
| high | `https://api.israapp.ir/s/v1` |

محیط محلی از env؛ پیشوند سطح حفظ شود. دامنه وب: `israapp.ir`؛ ادمین: `admin.israapp.ir`.

## قالب پاسخ موفق

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "uuid",
    "page": 1,
    "pageSize": 20,
    "total": 0
  }
}
```

- برای تک‌منبع: `data` آبجکت.
- برای لیست: `data` آرایه + `meta` صفحه‌بندی.
- فیلدهای اضافی بی‌دلیل اضافه نکن.

## قالب خطا

```json
{
  "success": false,
  "error": {
    "code": "AUTH_TOKEN_EXPIRED",
    "message": "نشست منقضی شده است.",
    "details": {}
  },
  "meta": {
    "requestId": "uuid"
  }
}
```

| جزء | قاعده |
|-----|-------|
| `code` | SCREAMING_SNAKE انگلیسی، پایدار |
| `message` | فارسی، مناسب UI |
| `details` | اختیاری؛ خطای اعتبارسنجی فیلدی |
| HTTP status | معنای استاندارد؛ بدنه همیشه JSON خطا |

### کدهای رایج (حداقلی)

| code | HTTP | معنی |
|------|-----:|------|
| `AUTH_REQUIRED` | 401 | بدون توکن |
| `AUTH_TOKEN_EXPIRED` | 401 | access منقضی |
| `AUTH_TOKEN_INVALID` | 401 | امضا/قالب نامعتبر |
| `AUTH_STEP_UP_REQUIRED` | 403 | نیاز تأیید مجدد |
| `AUTH_FORBIDDEN` | 403 | مجوز نیست |
| `AUTH_PERM_STALE` | 401 | `perm_ver` قدیمی؛ refresh کن |
| `AUTH_OTP_INVALID` | 400 | OTP نادرست |
| `AUTH_OTP_EXHAUSTED` | 429 | بیش از ۳ تلاش |
| `AUTH_OTP_EXPIRED` | 400 | OTP منقضی/ناموجود (ببین `15`) |
| `AUTH_OTP_SEND_FAILED` | 503 | خطای ارسال پیامک |
| `AUTH_INVALID_CREDENTIALS` | 401 | شماره/رمز نادرست (پیام یکسان) |
| `AUTH_REFRESH_INVALID` | 401 | refresh باطل/منقضی/استفادهٔ مجدد |
| `SERVICE_UNAVAILABLE` | 503 | نگهداری |
| `VALIDATION_FAILED` | 400 | ورودی نامعتبر |
| `RATE_LIMITED` | 429 | OTP/login |
| `NOT_FOUND` | 404 | |
| `CONFLICT` | 409 | مثلاً حضور تکراری امتیازدار |
| `INTERNAL_ERROR` | 500 | |

## صفحه‌بندی و فیلتر

| پارامتر | پیش‌فرض | توضیح |
|---------|---------|-------|
| `page` | 1 | از ۱ |
| `pageSize` | 20 | سقف مشخص در هر سرویس (مثلاً ۱۰۰) |
| `sort` | وابسته به منبع | `field:asc` / `field:desc` |

فیلترها query string؛ نام فیلد انگلیسی.

## نسخه‌گذاری

1. تغییرات ناسازگار → نسخهٔ جدید سطح (مثلاً `/c/v2`) بعداً.
2. فعلاً فقط `v1` زیر `/c` `/o` `/s`.
3. فیلد جدید اختیاری در پاسخ: سازگار؛ حذف/تغییر معنای فیلد: ناسازگار.

## شناسه‌ها و نام‌ها

- Path و query و JSON keys: **انگلیسی camelCase** (مگر DB column که snake_case در TypeORM map شود).
- UUID برای idهای عمومی ترجیح داده می‌شود.
- Permission keys: `domain.action` انگلیسی.

## Internal REST و outbox/inbox بین سرویس‌ها

| قاعده | |
|-------|--|
| شبکه خصوصی / mTLS یا shared secret سرویس | |
| مسیر پیشنهاد: `/internal/v1/...` | روی همان سرویس؛ از اینترنت expos نکن |
| هرگز internal را به کلاینت عمومی نده | |
| رویداد بین‌سرویسی | **outbox/inbox** (+ internal REST) |
| Nest EventEmitter | **فقط in-process** همان سرویس — برای بین سرویس‌ها ممنوع |

## Idempotency

- برای POSTهای حساس (حضور امتیازدار، OTP verify): کلید `Idempotency-Key` یا محدودیت یکتایی DB.
- حضور: دومین ثبت امتیاز → `CONFLICT` یا پاسخ قبلی بدون `+5` دوباره.

## فایل و آپلود

- آپلود تصویر پروفایل: multipart؛ محدودیت حجم/نوع در سرویس.
- ذخیره روی پوشهٔ **`media/`** همان host — **نه MinIO**.
- مصحف: آپلود متن آیه به سرور **ساخته نمی‌شود**.

## Socket.IO (api-mid)

- روی **api-mid**؛ همان سیاست auth (Bearer / اتصال معتبر).
- پیام‌ها JSON با `type` انگلیسی و `payload`.
- اتصال بدون توکن معتبر قطع شود.
- برای حضور/صف/ارزیابی زنده وقتی اپ باز است.

## ساخته نمی‌شود

| مورد | |
|------|--|
| GraphQL | ساخته نمی‌شود |
| API Gateway یکپارچه | ساخته نمی‌شود |
| EventEmitter بین‌سرویسی | ساخته نمی‌شود |
| MinIO | ساخته نمی‌شود |
| پیام خطای فقط انگلیسی برای UI | نکن |
| افشای stack trace به کلاینت | نکن |
