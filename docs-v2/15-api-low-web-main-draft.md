# ۱۵ — پیش‌نویس قرارداد API: Auth + Low برای `web-main`

**وضعیت: قفل مشروط (۱۴۰۵/۰۷/۰۹).** مالک همهٔ سؤال‌های §۹ را به AI واگذار کرد؛ توصیه‌های ستون «توصیه» به‌عنوان تصمیم ثبت شد (اعداد §۷ و کدهای §۶ هم تأیید). مالک هر زمان می‌تواند اصلاح کند. کدهای خطای جدید به `07` اضافه شد. L-30/L-31 هنوز فقط mock است تا کارstream mid.

مرجع: قفل‌های `00` (#7 #8 #9 #10 #12 #13 #28 #33)، `05`، `06-domains/low.md`، `07`. هر چیزی که در قفل‌ها نیست با **[پیشنهاد]** علامت خورده و در §۹ برای تصمیم آمده است.

## ۱. دامنه

| داخل | خارج (کارstream‌های بعد) |
|------|--------------------------|
| `/c/v1/auth/*`، step-up، `/c/v1/me/*` (profile، password، sessions، inbox) | mid (`/o/v1`) و high (`/s/v1`)، `web-admin` |
| قرارداد قابل‌مصرف برای `web-main` (بخش user) | `/me/points`، `/public/*` غیر از جلسات (L-30/31 در §۴-ب)، `/maps/*` — رزرو شده، شکل در کارstream مربوط |
| خطاها، cookie/CORS، رفتار کلاینت | JWKS و claimهای JWT (مصرف‌کنندهٔ آن‌ها mid/high است؛ کلاینت JWT را parse نمی‌کند)، schema DB، env |

کلاینت وب، access token را **opaque** می‌داند؛ فقط `accessExpiresIn` را از پاسخ می‌خواند.

## ۲. قراردادهای مشترک (از `07`، بدون تغییر)

- Base: `https://api.israapp.ir/c/v1`؛ پاسخ موفق `{success,data,meta.requestId}`؛ خطا `{success:false,error:{code,message(فارسی),details},meta}`.
- Auth: `Authorization: Bearer <access>` روی مسیرهای `me/*`.
- شماره همیشه `09xxxxxxxxxx`؛ زمان ISO-8601 با offset؛ کلیدهای JSON به‌صورت camelCase.
- **[پیشنهاد]** هدر سفارشی کلاینت: `X-Isra-Client: web-main` (برای تفکیک cookie/body و لاگ؛ بدون آن، مسیر body مثل Android).

## ۳. Auth

| شناسه | مسیر | Auth | توضیح |
|-------|------|:----:|-------|
| L-01 | `POST /auth/otp/request` | ✗ | ارسال OTP (Faraz) |
| L-02 | `POST /auth/otp/verify` | ✗ | تأیید OTP؛ ثبت‌نام خودکار کاربر جدید؛ صدور توکن |
| L-03 | `POST /auth/login/password` | ✗ | ورود با رمز |
| L-04 | `POST /auth/refresh` | cookie | rotation |
| L-05 | `POST /auth/logout` | cookie/Bearer | revoke نشست جاری |
| L-06 | `POST /auth/step-up/otp/request` | ✓ | OTP برای اقدام حساس (به شمارهٔ همان کاربر) |
| L-07 | `POST /auth/step-up/otp/verify` | ✓ | صدور توکن step-up کوتاه‌عمر |

### L-01 `POST /auth/otp/request`
```json
// body
{ "phone": "09121234567" }
// 200
{ "challengeId": "uuid", "expiresInSec": 120, "resendAfterSec": 60 }
```
- حتی اگر شماره ثبت‌نشده باشد همین پاسخ؛ تفاوتی لو نمی‌رود (ثبت‌نام/ورود یکپارچه).
- خطا: `VALIDATION_FAILED` 400، `RATE_LIMITED` 429 (`details.retryAfterSec` + هدر `Retry-After`)، `AUTH_OTP_SEND_FAILED` 503 (خطای Faraz).

### L-02 `POST /auth/otp/verify`
```json
// body
{ "challengeId": "uuid", "code": "12345", "deviceId": "uuid", "deviceLabel": "Chrome / Windows" }
// 200
{
  "accessToken": "…", "tokenType": "Bearer", "accessExpiresIn": 900,
  "refreshToken": "…",            // فقط وقتی X-Isra-Client غیر وب باشد
  "sessionId": "uuid",
  "user": { "id": "uuid", "phone": "09121234567", "isNewUser": true,
            "profileComplete": false, "hasPassword": false }
}
```
- وب: refresh در cookie `Set-Cookie` می‌آید و در body **نیست** (§۵).
- challenge تک‌مصرف است؛ تکرار پس از موفقیت → `AUTH_OTP_INVALID` (یکتایی DB، مطابق Idempotency در `07`).
- خطا: `AUTH_OTP_INVALID` 400 (`details.attemptsLeft`)، `AUTH_OTP_EXPIRED` 400، `AUTH_OTP_EXHAUSTED` 429 (پس از ۳ تلاش؛ باید OTP جدید خواست)، `VALIDATION_FAILED`.

### L-03 `POST /auth/login/password`
body: `{ phone, password, deviceId, deviceLabel }`؛ پاسخ مثل L-02 (`isNewUser=false`).
خطا: `AUTH_INVALID_CREDENTIALS` 401 (یکسان برای «شماره نیست» و «رمز غلط»)، `RATE_LIMITED`.
کاربر بدون رمز هم همین خطا را می‌گیرد؛ UI راه «ورود با کد» را پیشنهاد می‌دهد.

### L-04 `POST /auth/refresh`
- وب: body خالی `{}`؛ refresh از cookie. Android: `{ "refreshToken": "…" }`.
- 200: `{ accessToken, tokenType, accessExpiresIn }` (+ `refreshToken` برای غیر وب)؛ cookie جدید ست می‌شود.
- refresh باطل/منقضی/استفادهٔ مجدد (reuse → کل family revoke) → `AUTH_REFRESH_INVALID` 401 + پاک‌شدن cookie ⇒ کلاینت به صفحهٔ ورود می‌رود.
- **[پیشنهاد]** grace ۱۰ ثانیه: ارائهٔ refreshِ تازه‌چرخیده‌شده در ۱۰ ثانیه فقط access جدید می‌دهد و family را revoke نمی‌کند (مسابقهٔ چند-tab).

### L-05 `POST /auth/logout`
بدنه خالی؛ نشست/family جاری revoke و cookie پاک می‌شود. idempotent؛ همیشه 200 `{}`.

### L-06/L-07 Step-up
```json
// L-06 → 200
{ "challengeId": "uuid", "expiresInSec": 120, "resendAfterSec": 60 }
// L-07 body { "challengeId": "uuid", "code": "12345" } → 200
{ "stepUpToken": "…", "expiresInSec": 300 }
```
- مصرف: هدر `X-Step-Up-Token` روی اقدام حساس؛ نبودن/منقضی → `AUTH_STEP_UP_REQUIRED` 403.
- **[پیشنهاد]** در low فقط برای L-13 (تعیین/تغییر رمز) لازم است. فهرست کامل با high قفل می‌شود (`05`).

## ۴. Me (همه Bearer)

| شناسه | مسیر | توضیح |
|-------|------|-------|
| L-10 | `GET /me` | `{ id, phone, hasPassword, profile }` |
| L-11 | `GET /me/profile` | `{ firstName, lastName, avatarUrl }` |
| L-12 | `PATCH /me/profile` | به‌روزرسانی جزئی؛ `VALIDATION_FAILED` با `details.fields` |
| L-13 | `PUT /me/password` | `{ newPassword }`؛ **نیازمند step-up**؛ کاربر رمزدار هم همین مسیر (بدون currentPassword؛ OTP جایگزین است)؛ پس از موفقیت سایر نشست‌ها revoke می‌شوند [پیشنهاد] |
| L-14 | `GET /me/sessions` | `[{ id, deviceLabel, platform, createdAt, lastActiveAt, current }]` |
| L-15 | `DELETE /me/sessions/:id` | revoke یک نشست؛ اگر نشست جاری باشد = logout |
| L-16 | `POST /me/sessions/revoke-others` | revoke همهٔ نشست‌ها جز جاری |
| L-17 | `GET /me/inbox` | `page,pageSize,unreadOnly`؛ آیتم: `{ id, kind, title, body, createdAt, readAt, ref }` |
| L-18 | `GET /me/inbox/unread-count` | `{ count }` |
| L-19 | `POST /me/inbox/:id/read` | idempotent |
| L-20 | `POST /me/inbox/read-all` | idempotent |

نکات: `platform` ∈ `web|android`. `kind`/`ref` مبهم (opaque) برای deep-link؛ مقادیر `kind` در کارstream mid/high تعیین می‌شود. آپلود آواتار (multipart روی `media/`) تا روشن‌شدن design **مورد این پیش‌نویس نیست**. رمز فراموش‌شده = ورود با OTP سپس L-13؛ endpoint جدا نداریم.

### ۴-ب) محتوای عمومی جلسات (guest + member) — **[پیشنهاد]**، تا قفل: فقط mock

| شناسه | مسیر | Auth | توضیح |
|-------|------|:----:|-------|
| L-30 | `GET /public/sessions` | اختیاری | `page,pageSize,status` (`scheduled|started|ended`)، `sort` پیش‌فرض `nextStartsAt:asc`؛ جلسهٔ `draft` هرگز نمی‌آید |
| L-31 | `GET /public/sessions/:id` | اختیاری | جزئیات؛ `NOT_FOUND` برای draft/ناموجود |

```json
{ "id": "uuid", "title": "…", "description": "…", "status": "scheduled",
  "schedule": { "type": "once|recurring|range", "startsAt": "ISO", "endsAt": "ISO",
                "weekdays": [0,2], "timeOfDay": "18:00", "rangeFrom": "ISO", "rangeTo": "ISO" },
  "nextStartsAt": "ISO|null", "location": { "label": "…" } }
```
- `weekdays`: ۰=شنبه … ۶=جمعه (`Asia/Tehran`)؛ فقط برای `recurring`. فیلدهای هر نوع جدا می‌آید (`once`: `startsAt/endsAt`؛ `range`: `rangeFrom/rangeTo` + قواعد روزانه).
- داده از mid با internal REST به low می‌رسد (قفل #12)؛ کلاینت low به mid نمی‌زند. عضویت/حضور/صف خارج این پیش‌نویس‌اند (mid).
- نقشه/مکان دقیق (Map.ir) این‌جا نیست؛ فقط `location.label`.

## ۵. وب: ذخیرهٔ توکن، cookie، CORS **[پیشنهاد]**

| موضوع | تصمیم پیشنهادی |
|-------|----------------|
| access | در حافظهٔ JS (نه localStorage)؛ با `accessExpiresIn` پیش از انقضا (~۶۰ث زودتر) یا روی 401 `AUTH_TOKEN_EXPIRED` تمدید |
| refresh | cookie `isra_rt`: `HttpOnly; Secure; SameSite=Lax; Path=/c/v1/auth; Max-Age=14d`؛ در دسترس JS نیست (ضد XSS) |
| دامنه | `israapp.ir` و `api.israapp.ir` هم‌سایت (same-site) ⇒ Lax کافی؛ fetch با `credentials: 'include'` |
| CSRF | cookie فقط روی `/auth/refresh` و `/auth/logout` ارسال می‌شود؛ سرور `Origin` را با allowlist چک و `X-Isra-Client` را الزامی می‌کند |
| CORS | `Access-Control-Allow-Origin` = origin دقیق allowlist (`https://israapp.ir`؛ dev از env)؛ `Allow-Credentials: true`؛ headers: `Authorization, Content-Type, X-Isra-Client, X-Step-Up-Token, Idempotency-Key` |
| چند tab | تمدید با `navigator.locks` تک‌پرواز (single-flight) + grace سرور (L-04) |
| تفکیک ادمین | `web-admin` cookie نام جدا می‌گیرد (`isra_rt_admin`) تا نشست‌ها قاطی نشوند — در کارstream admin قفل می‌شود |
| deviceId | UUID تصادفی در localStorage، در L-02/L-03 ارسال می‌شود (`did`) |

## ۶. جدول خطا (افزوده بر لیست حداقلی `07`)

| code | HTTP | رفتار `web-main` |
|------|-----:|------------------|
| `AUTH_OTP_EXPIRED` **جدید** | 400 | پیام + دکمهٔ «ارسال مجدد» |
| `AUTH_OTP_SEND_FAILED` **جدید** | 503 | پیام + تلاش مجدد |
| `AUTH_INVALID_CREDENTIALS` **جدید** | 401 | پیام کلی + پیشنهاد ورود با کد |
| `AUTH_REFRESH_INVALID` **جدید** | 401 | پاک‌سازی state، رفتن به ورود |
| `AUTH_TOKEN_EXPIRED` | 401 | تمدید یک‌بار + تکرار درخواست؛ شکست ⇒ ورود |
| `AUTH_STEP_UP_REQUIRED` | 403 | نمایش جریان step-up سپس تکرار |
| `RATE_LIMITED` | 429 | شمارندهٔ `retryAfterSec` در UI |
| `AUTH_REQUIRED` / `AUTH_TOKEN_INVALID` | 401 | رفتن به ورود |

پیام فارسی هر کد (متن نهایی) در پیاده‌سازی سرور؛ UI از `error.message` استفاده می‌کند، نه متن ثابت.

## ۷. محدودیت‌ها **[پیشنهاد]** (غیر از قفل: OTP ۵رقم/۲دقیقه/۳تلاش)

| مورد | مقدار |
|------|-------|
| فاصلهٔ ارسال مجدد OTP | ۶۰ ثانیه per شماره |
| سقف OTP request | ۵ در ساعت per شماره؛ ۲۰ در ساعت per IP |
| login/password | ۵ شکست در ۱۵ دقیقه per شماره+IP ⇒ `RATE_LIMITED` |
| سیاست رمز | حداقل ۸ نویسه؛ بدون الزام ترکیب |
| step-up TTL | ۵ دقیقه |
| ثابت‌ها | access ۹۰۰ث، refresh ۱۴روز (قفل) |

## ۸. نرمال‌سازی شماره **[پیشنهاد]**
سرور در مرز API ارقام فارسی/عربی و پیشوند `+98`/`0098`/`98`/`9…` را به `09xxxxxxxxxx` تبدیل می‌کند و فقط `^09\d{9}$` را می‌پذیرد؛ کلاینت هم همان را پیش از ارسال نرمال می‌کند. ذخیره و پاسخ همیشه `09…`.

## ۹. تصمیم‌ها (واگذارشده؛ ستون «توصیه» = تصمیم نهایی)

| # | سؤال | توصیه |
|---|------|-------|
| Q1 | refresh وب در cookie httpOnly (§۵) یا body+localStorage؟ | cookie |
| Q2 | grace ۱۰ ثانیه‌ای + Web Locks برای چند-tab | بله |
| Q3 | ثبت‌نام خودکار با OTP verify و `profileComplete`؛ فیلدهای حداقلی پروفایل = `firstName`+`lastName` الزامی؟ | بله |
| Q4 | step-up برای تعیین/تغییر رمز (L-13) و revoke سایر نشست‌ها پس از آن | بله |
| Q5 | اعداد §۷ (cooldown، سقف‌ها، حداقل رمز) | تأیید یا اصلاح |
| Q6 | کدهای خطای جدید §۶ | تأیید |
| Q7 | نرمال‌سازی سمت‌سرور شماره (§۸) | بله |
| Q8 | آواتار/تنظیمات پروفایل تا آمدن design در مرز نیست | تأیید |

## ۱۰. بعد از قفل
1. به‌روزرسانی `05`/`07` با تغییرات قفل‌شده؛ در صورت تأیید ثبت قفل‌های جدید در `00`.
2. `packages/api-types`: type + zod برای L-01…L-20 (cloud مجاز).
3. mock server/handlers در `apps/web-main` بر پایهٔ همین قرارداد (فقط با design متناظر؛ طبق `10`).
4. پیش‌نویس‌های جدا و بعدی: schema DB low (`schema_low`)، env سرویس low، قرارداد `/me/points` `/public` `/maps` پس از mid.
