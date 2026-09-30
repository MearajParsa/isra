# ۰۶ — دامنه سرویس Low (`services/api-low`)

## مأموریت

مالک **هویت، حساب، صدور توکن، پروفایل، اینباکس، نمایش امتیاز/نشان (UI)، و سطح عمومی کاربر**. تنها صادرکنندهٔ access/refresh. کلاینت‌های `android-low` و بخش user در `web-main` برای کارهای عادی به این سرویس وصل می‌شوند. **همهٔ کلاینت‌های mid/high/admin** فقط برای `/c/v1/auth/*` (یا auth مشترک) به low می‌آیند.

پیشوند تولید: **`/c/v1`** روی `api.israapp.ir`.

## مالکیت داده (`schema_low`)

| حوزه | جداول/مفهوم نمونه | توضیح |
|------|-------------------|-------|
| Users | `users` | هویت پایه؛ موبایل یکتا `09xxxxxxxxxx` |
| Credentials | `user_credentials` | hash رمز (اختیاری) |
| OTP | `otp_challenges` | ۵ رقم، انقضای ۲ دقیقه، ۳ تلاش؛ Faraz SMS |
| Sessions | `auth_sessions`, `refresh_tokens` | family، rotation؛ Access ۱۵م / Refresh ۱۴روز |
| Profile | `profiles` | نام، آواتار، تنظیمات |
| Inbox | `inbox_messages`, `inbox_reads` | اعلان درون‌برنامه‌ای |
| Device | `devices` | شناسه دستگاه، آخرین فعالیت |
| Public content cache | در صورت نیاز متادیتای عمومی | نه متن مصحف |

## مسئولیت‌ها

1. ثبت‌نام/ورود OTP (Faraz) و رمز
2. صدور JWT **RS256** + JWKS؛ چرخش refresh؛ revoke
3. step-up challenge برای مسیرهای حساس
4. CRUD پروفایل کاربر
5. اینباکس (دریافت از mid/high via outbox/inbox)
6. پروکسی امن Map.ir برای **نقشهٔ کاربر** (کلید سرور)
7. ارائه **JWKS** برای mid/high
8. اعمال `perm_ver` / نقش همگام‌شده از high روی توکن‌های جدید
9. **نمایش امتیاز/نشان به کلاینت low**؛ خواندن داده از mid با **internal REST** (کلاینت low به api-mid مستقیم نزند)
10. Guest: محتوای قابل‌مرور؛ اقدام gated → ثبت‌نام

## مصرف از سرویس‌های دیگر

| از | چگونه | برای چه |
|----|-------|---------|
| high | outbox/inbox + internal REST | به‌روزرسانی نقش سیستم کاربر |
| mid | outbox/inbox | پیام اینباکس |
| mid | internal REST | خلاصه امتیاز / `badge_awards` برای UI low |

Low **منطق جلسه** (صف، حضور، ارزیابی) را پیاده نمی‌کند. EventEmitter فقط in-process داخل low.

## API سطح کلاینت (قرارداد؛ نه dump کامل)

| گروه | مثال مسیر | توضیح |
|------|-----------|-------|
| Auth | `/c/v1/auth/otp/*`, `/c/v1/auth/login/password`, `/c/v1/auth/refresh`, `/c/v1/auth/logout` | همه کلاینت‌ها |
| JWKS | endpoint JWKS استاندارد | برای mid/high |
| Sessions | `/c/v1/me/sessions` | لیست/revoke |
| Profile | `/c/v1/me/profile` | |
| Inbox | `/c/v1/me/inbox` | poll |
| Points (UI) | `/c/v1/me/points` یا مشابه | aggregate از mid |
| Public | `/c/v1/public/...` | بدون توکن؛ Guest |
| Maps proxy | `/c/v1/maps/...` | نقشه کاربر؛ کلید مخفی |

جزئیات status/error: `07-api-conventions.md`.

## Realtime

- Socket اجباری برای low نیست.
- اینباکس: poll.
- اگر UI low وضعیت جلسه نشان می‌دهد، از endpointهای low که mid را aggregate کرده‌اند استفاده کند — نه اتصال مستقیم کلاینت low به api-mid.

## امتیاز و نشان (نمایش)

- منبع حقیقت امتیاز و `badge_awards` در mid است؛ با افت امتیاز نشان باطل نمی‌شود.
- Low خلاصه را با internal REST از mid می‌گیرد و به کلاینت low می‌دهد.

## رسانه

فایل‌های مرتبط low در پوشهٔ `media/` روی همان host — نه MinIO.

## غیرمسئولیت‌ها / ساخته نمی‌شود در low

| مورد | |
|------|--|
| ایجاد جلسه / صف / ارزیابی | mid |
| مدیریت نقش سیستم | high |
| ذخیره متن مصحف / صوت فاز ۱ روی سرور | ساخته نمی‌شود |
| GraphQL / Redis / MinIO / Gateway | ساخته نمی‌شود |
| ایمیل | ساخته نمی‌شود |
| EventEmitter به سرویس دیگر | ساخته نمی‌شود |
