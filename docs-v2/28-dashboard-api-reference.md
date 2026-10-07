# مرجع API پنل مدیریت (تولید خودکار — دستی ویرایش نکنید)

> نسخهٔ قرارداد از `@isra/api-types`. بازتولید: `pnpm --filter @isra/api-types dashboard-ref`.
> قالب پاسخ همهٔ endpointها: `{ success: true, data, meta: { requestId, ... } }`؛ خطا: `{ success: false, error: { code, message, details? }, meta }`.
> `?` یعنی اختیاری؛ فیلدهای دارای مقدار پیش‌فرض در body اختیاری‌اند. بدنه‌ها strict هستند (فیلد اضافه ⇒ 400).

## فهرست endpointها
| شناسه | متد | مسیر | مجوز | step-up | شرح |
|---|---|---|---|---|---|
| L-01 | POST | `/c/v1/auth/otp/request` | — | — | ارسال کد تأیید (OTP) به موبایل |
| L-02 | POST | `/c/v1/auth/otp/verify` | — | — | تأیید OTP و صدور توکن |
| L-03 | POST | `/c/v1/auth/login/password` | — | — | ورود با رمز عبور |
| L-04 | POST | `/c/v1/auth/refresh` | — | — | تمدید نشست (rotation) |
| L-05 | POST | `/c/v1/auth/logout` | — | — | خروج (revoke نشست جاری) |
| L-06 | POST | `/c/v1/auth/step-up/otp/request` | — | — | درخواست OTP برای تأیید مجدد هویت (step-up) |
| L-07 | POST | `/c/v1/auth/step-up/otp/verify` | — | — | تأیید OTP و صدور توکن step-up (۵ دقیقه) |
| H-00 | GET | `/s/v1/system/me` | — | — | هویت سیستمی من (نقش‌ها و مجوزها) |
| H-01 | GET | `/s/v1/system/overview` | — | — | نمای کلی سیستم |
| H-10 | GET | `/s/v1/system/roles` | — | — | فهرست نقش‌ها (سیستمی و پویا) با مجوز، ماژول و قواعد step-up |
| H-11 | GET | `/s/v1/system/permissions` | — | — | فهرست مجوزها (رجیستری پویا؛ هر مجوز در یک ماژول) |
| H-12 | PUT | `/s/v1/system/roles/{key}/permissions` | system.permission.edit | قابل | ویرایش مجوزهای صریح یک نقش |
| H-20 | GET | `/s/v1/system/users` | system.users.view | — | جست‌وجوی کاربران |
| H-21 | GET | `/s/v1/system/users/{id}` | system.users.view | — | جزئیات یک کاربر |
| H-22 | PUT | `/s/v1/system/users/{id}/roles` | system.role.assign | قابل | تخصیص/برداشتن نقش سیستم |
| H-23 | PUT | `/s/v1/system/users/{id}/grants` | system.role.assign | قابل | تعیین مجوزهای مستقیم کاربر (ساخت جلسه) |
| H-30 | GET | `/s/v1/system/settings` | system.settings.view | — | تنظیمات سراسری |
| H-31 | PUT | `/s/v1/system/settings` | system.settings.edit | قابل | به‌روزرسانی تنظیمات سراسری (optimistic concurrency) |
| H-40 | GET | `/s/v1/system/audit` | system.audit.view | — | گزارش اقدام‌ها (audit؛ فقط‌خواندنی) |
| H-02 | GET | `/s/v1/system/me/account` | — | — | حساب من (نام، شماره، وضعیت رمز) |
| H-03 | PATCH | `/s/v1/system/me/profile` | — | — | ویرایش نام و نام‌خانوادگی خودم |
| H-04 | PUT | `/s/v1/system/me/password` | — | قابل | تعیین/تغییر رمز عبور خودم |
| H-05 | GET | `/s/v1/system/me/sessions` | — | — | نشست‌ها و دستگاه‌های من |
| H-06 | DELETE | `/s/v1/system/me/sessions/{id}` | — | — | revoke یک نشست خودم |
| H-07 | POST | `/s/v1/system/me/sessions/revoke-others` | — | — | خروج از همهٔ نشست‌های دیگرِ خودم |
| H-24 | POST | `/s/v1/system/users` | system.users.manage | قابل | ساخت کاربر |
| H-25 | PATCH | `/s/v1/system/users/{id}` | system.users.manage | قابل | ویرایش نام/شمارهٔ کاربر |
| H-26 | POST | `/s/v1/system/users/{id}/status` | system.users.manage | قابل | فعال/غیرفعال‌کردن کاربر |
| H-27 | DELETE | `/s/v1/system/users/{id}` | system.users.manage | قابل | حذف کاربر (حذف نرم + ناشناس‌سازی) |
| H-28 | PUT | `/s/v1/system/users/{id}/password` | system.users.manage | قابل | تعیین رمز موقت / حذف رمز کاربر |
| H-29 | POST | `/s/v1/system/users/{id}/logout-all` | system.users.manage | قابل | خروج اجباری کاربر از همهٔ نشست‌ها |
| H-50 | GET | `/s/v1/system/users/{id}/sessions` | system.users.view | — | نشست‌ها و دستگاه‌های یک کاربر (به تفکیک پنل/کلاینت) |
| H-51 | DELETE | `/s/v1/system/users/{id}/sessions/{sessionId}` | system.users.manage | قابل | revoke یک نشست کاربر |
| H-60 | GET | `/s/v1/system/sessions` | system.sessions.view | — | فهرست همهٔ جلسه‌ها با فیلتر |
| H-61 | GET | `/s/v1/system/sessions/{id}` | system.sessions.view | — | جزئیات یک جلسه (شامل draft و حذف‌شده) |
| H-62 | POST | `/s/v1/system/sessions` | system.sessions.manage | قابل | ساخت جلسه از طرف یک کاربر |
| H-63 | PATCH | `/s/v1/system/sessions/{id}` | system.sessions.manage | قابل | ویرایش جلسه (فقط draft/scheduled؛ مثل M-04 ولی بدون نیاز به عضویت) |
| H-64 | POST | `/s/v1/system/sessions/{id}/transition` | system.sessions.manage | قابل | چرخهٔ حیات جلسه: یک قدم رو به جلو |
| H-65 | DELETE | `/s/v1/system/sessions/{id}` | system.sessions.manage | قابل | حذف جلسه (حذف نرم؛ از همهٔ فهرست‌های کاربران پنهان می‌شود) |
| H-66 | GET | `/s/v1/system/sessions/{id}/members` | system.sessions.view | — | اعضا و درخواست‌های عضویت جلسه |
| H-67 | PATCH | `/s/v1/system/sessions/{id}/members/{memberId}` | system.sessions.manage | قابل | تأیید/رد عضویت |
| H-68 | PUT | `/s/v1/system/sessions/{id}/members/{memberId}/roles` | system.sessions.manage | قابل | تعیین نقش‌های درون‌جلسهٔ عضو (شامل هم‌مدیر) |
| H-69 | DELETE | `/s/v1/system/sessions/{id}/members/{memberId}` | system.sessions.manage | قابل | حذف عضو از جلسه (مدیر ⇒ ابتدا با H-74 منتقل کنید) |
| H-70 | GET | `/s/v1/system/sessions/{id}/attendance` | system.sessions.view | — | حاضرین یک نوبت (پیش‌فرض: نوبت باز یا آخرین) |
| H-71 | GET | `/s/v1/system/sessions/{id}/queue` | system.sessions.view | — | صف نوبت جلسه (نمای کامل؛ پیش‌فرض نوبت باز یا آخرین) |
| H-72 | GET | `/s/v1/system/sessions/{id}/evaluations` | system.sessions.view | — | ارزیابی‌های جلسه (همهٔ نوبت‌ها یا یک نوبت) |
| H-80 | GET | `/s/v1/system/reports/overview` | system.reports.view | — | گزارش جامع (کاربران، جلسه‌ها، مشارکت، پیامک، پنل‌ها) در بازه |
| H-81 | GET | `/s/v1/system/reports/registrations` | system.reports.view | — | سری زمانی ثبت‌نام |
| H-82 | GET | `/s/v1/system/reports/sessions` | system.reports.view | — | سری زمانی جلسه‌ها (ساخته‌شده، برگزارشده، حضور) |
| H-83 | GET | `/s/v1/system/reports/otp` | system.reports.view | — | سری زمانی پیامک OTP (درخواست/تأییدشده) |
| H-84 | GET | `/s/v1/system/reports/leaderboard` | system.reports.view | — | برترین کاربران بر اساس امتیاز |
| H-13 | POST | `/s/v1/system/roles` | system.role.manage | قابل | ساخت نقش پویا |
| H-14 | GET | `/s/v1/system/roles/{key}` | system.users.view | — | جزئیات یک نقش |
| H-15 | PATCH | `/s/v1/system/roles/{key}` | system.role.manage | قابل | ویرایش عنوان/توضیح نقش |
| H-16 | DELETE | `/s/v1/system/roles/{key}` | system.role.manage | قابل | حذف نقش پویا |
| H-17 | PUT | `/s/v1/system/roles/{key}/modules` | system.role.manage | قابل | تعیین ماژول‌های کامل نقش |
| H-18 | PUT | `/s/v1/system/roles/{key}/step-up` | system.stepup.manage | قابل | قواعد step-up هر نقش per مجوز |
| H-85 | POST | `/s/v1/system/permissions` | system.permission.manage | قابل | ساخت مجوز پویا |
| H-86 | PATCH | `/s/v1/system/permissions/{key}` | system.permission.manage | قابل | ویرایش مجوز |
| H-87 | DELETE | `/s/v1/system/permissions/{key}` | system.permission.manage | قابل | حذف مجوز پویا |
| H-88 | GET | `/s/v1/system/modules` | — | — | فهرست ماژول‌ها |
| H-89 | POST | `/s/v1/system/modules` | system.permission.manage | قابل | ساخت ماژول |
| H-90 | PATCH | `/s/v1/system/modules/{key}` | system.permission.manage | قابل | ویرایش ماژول |
| H-91 | DELETE | `/s/v1/system/modules/{key}` | system.permission.manage | قابل | حذف ماژول |
| H-92 | GET | `/s/v1/system/rbac/matrix` | system.users.view | — | ماتریس کامل نقش × مجوز × ماژول (یک درخواست برای UI) |
| H-93 | GET | `/s/v1/system/rbac/effective/{id}` | system.users.view | — | دسترسی مؤثر یک کاربر (با منبع هر مجوز و وضعیت step-up) |
| H-94 | GET | `/s/v1/system/me/access` | — | — | دسترسی مؤثر من (مجوز، منبع و نیاز به step-up) |
| H-73 | POST | `/s/v1/system/sessions/{id}/members` | system.sessions.manage | قابل | افزودن مستقیم اعضا (با شناسه یا شماره) با نقش — تا ۲۰۰ نفر |
| H-74 | PUT | `/s/v1/system/sessions/{id}/manager` | system.sessions.manage | قابل | تعیین/انتقال مدیر جلسه |
| H-53 | POST | `/s/v1/system/sessions/{id}/members/decide` | system.sessions.manage | قابل | تأیید/رد گروهی درخواست‌های عضویت |
| H-75 | GET | `/s/v1/system/sessions/{id}/occurrences` | system.sessions.view | — | نوبت‌های برگزاری جلسه |
| H-76 | POST | `/s/v1/system/sessions/{id}/attendance` | system.sessions.moderate | قابل | ثبت حضور توسط ادمین (اصلاح؛ نوبت باز یا بسته) |
| H-77 | POST | `/s/v1/system/sessions/{id}/attendance/{userId}/revoke` | system.sessions.manage | قابل | لغو حضور اشتباه (−۵ در دفتر) |
| H-78 | POST | `/s/v1/system/sessions/{id}/queue/next` | system.sessions.moderate | قابل | صف: نفر بعدی (ادمین) |
| H-79 | PATCH | `/s/v1/system/sessions/{id}/queue/{itemId}` | system.sessions.moderate | قابل | صف: بالا/پایین/انتها/حذف (ادمین) |
| H-95 | POST | `/s/v1/system/sessions/{id}/evaluations/{evalId}/void` | system.sessions.manage | قابل | باطل‌کردن ارزیابی (کسر امتیاز) |
| H-96 | PATCH | `/s/v1/system/sessions/{id}/evaluations/{evalId}` | system.sessions.manage | قابل | اصلاح نمره‌های ارزیابی |
| H-52 | GET | `/s/v1/system/users/{id}/memberships` | system.sessions.view | — | جلسه‌ها و نقش‌های یک کاربر |
| H-97 | GET | `/s/v1/system/users/{id}/points` | system.users.view | — | امتیاز، نشان‌ها و دفتر امتیاز یک کاربر |
| H-98 | POST | `/s/v1/system/users/{id}/points/adjust` | system.points.manage | قابل | اصلاح دستی امتیاز (مثبت/منفی) |
| H-32 | GET | `/s/v1/system/badges` | — | — | فهرست نشان‌ها (همه، شامل غیرفعال) |
| H-33 | POST | `/s/v1/system/badges` | system.badges.manage | قابل | ساخت نشان |
| H-34 | PATCH | `/s/v1/system/badges/{id}` | system.badges.manage | قابل | ویرایش نشان (عنوان، آستانه، فعال/غیرفعال، ترتیب) |
| H-35 | DELETE | `/s/v1/system/badges/{id}` | system.badges.manage | قابل | حذف نشان (از همهٔ دارندگان پس گرفته می‌شود) |
| H-36 | PUT | `/s/v1/system/badges/{id}/image` | system.badges.manage | قابل | بارگذاری تصویر نشان (png/webp/jpeg ≤ ۲۰۰KB) |
| H-37 | DELETE | `/s/v1/system/badges/{id}/image` | system.badges.manage | قابل | حذف تصویر نشان |
| H-41 | POST | `/s/v1/system/announcements` | system.inbox.send | قابل | ارسال پیام همگانی درون‌برنامه‌ای (اینباکس) |
| H-42 | GET | `/s/v1/system/announcements` | system.inbox.send | — | تاریخچهٔ پیام‌های همگانی |
| H-46 | GET | `/s/v1/system/announcements/{id}` | system.inbox.send | — | جزئیات و آمار تحویل/خواندن یک پیام همگانی |
| H-43 | GET | `/s/v1/system/users/export` | system.data.export | قابل | خروجی CSV کاربران (با فیلترهای H-20) |
| H-44 | GET | `/s/v1/system/sessions/{id}/export` | system.data.export | قابل | خروجی CSV اعضا/حضور/ارزیابی یک جلسه |
| H-45 | GET | `/s/v1/system/audit/export` | system.data.export | قابل | خروجی CSV گزارش اقدام‌ها (با فیلترهای H-40) |
| H-48 | GET | `/s/v1/system/session-roles` | — | — | ماتریس نقش‌های جلسه ← مجوزهای درون‌جلسه (فقط‌خواندنی) |

## جزئیات
#### L-01 — POST `/c/v1/auth/otp/request`
ارسال کد تأیید (OTP) به موبایل — ورود و ثبت‌نام یکپارچه. پاسخ برای شمارهٔ ثبت‌شده/ثبت‌نشده یکسان است (جلوگیری از user enumeration). ارسال پیامک غیرهمزمان صف می‌شود.
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: —؛ rate-limit: 5/3600s,20/3600s؛ خطاها: VALIDATION_FAILED, RATE_LIMITED, AUTH_OTP_SEND_FAILED
- body: `OtpRequestBody`
- data: `OtpChallenge`

#### L-02 — POST `/c/v1/auth/otp/verify`
تأیید OTP و صدور توکن — challenge تک‌مصرف است (idempotency با یکتایی DB). وب: refresh در cookie HttpOnly؛ سایرین: در بدنه.
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: natural؛ rate-limit: 30/600s؛ خطاها: VALIDATION_FAILED, AUTH_OTP_INVALID, AUTH_OTP_EXPIRED, AUTH_OTP_EXHAUSTED, RATE_LIMITED, AUTH_ACCOUNT_DISABLED
- body: `OtpVerifyBody`
- data: `AuthResult`

#### L-03 — POST `/c/v1/auth/login/password`
ورود با رمز عبور — خطای یکسان برای «شماره نیست» و «رمز غلط». مقایسهٔ رمز با زمان ثابت (argon2id).
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: —؛ rate-limit: 5/900s,50/900s؛ خطاها: VALIDATION_FAILED, AUTH_INVALID_CREDENTIALS, RATE_LIMITED, AUTH_ACCOUNT_DISABLED
- body: `PasswordLoginBody`
- data: `AuthResult`

#### L-04 — POST `/c/v1/auth/refresh`
تمدید نشست (rotation) — هر استفاده refresh قبلی را باطل می‌کند؛ استفادهٔ مجدد (reuse) کل family را revoke می‌کند. grace ۱۰ ثانیه برای مسابقهٔ چند-tab. وب: cookie `isra_rt` (CSRF: Origin allowlist + هدر X-Isra-Client).
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: —؛ rate-limit: 60/60s؛ خطاها: AUTH_REFRESH_INVALID, RATE_LIMITED, AUTH_ACCOUNT_DISABLED
- body: `RefreshBody`
- data: `RefreshResult`

#### L-05 — POST `/c/v1/auth/logout`
خروج (revoke نشست جاری) — idempotent؛ همیشه 200. cookie را پاک می‌کند.
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: natural؛ rate-limit: —؛ خطاها: —
- data: `{  }`

#### L-06 — POST `/c/v1/auth/step-up/otp/request`
درخواست OTP برای تأیید مجدد هویت (step-up)
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: —؛ rate-limit: 5/3600s؛ خطاها: RATE_LIMITED, AUTH_OTP_SEND_FAILED
- data: `OtpChallenge`

#### L-07 — POST `/c/v1/auth/step-up/otp/verify`
تأیید OTP و صدور توکن step-up (۵ دقیقه)
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: natural؛ rate-limit: 15/600s؛ خطاها: VALIDATION_FAILED, AUTH_OTP_INVALID, AUTH_OTP_EXPIRED, AUTH_OTP_EXHAUSTED
- body: `StepUpVerifyBody`
- data: `StepUpResult`

#### H-00 — GET `/s/v1/system/me`
هویت سیستمی من (نقش‌ها و مجوزها) — کاربر بدون نقش سیستم ⇒ AUTH_FORBIDDEN؛ UI «دسترسی ندارید» نشان می‌دهد.
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN
- data: `SystemMe`

#### H-01 — GET `/s/v1/system/overview`
نمای کلی سیستم
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN
- data: `Overview`

#### H-10 — GET `/s/v1/system/roles`
فهرست نقش‌ها (سیستمی و پویا) با مجوز، ماژول و قواعد step-up
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN
- query: `{ page?: number; pageSize?: number }`
- data: `SystemRole[]`

#### H-11 — GET `/s/v1/system/permissions`
فهرست مجوزها (رجیستری پویا؛ هر مجوز در یک ماژول)
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN
- query: `{ page?: number; pageSize?: number }`
- data: `PermissionInfo[]`

#### H-12 — PUT `/s/v1/system/roles/{key}/permissions`
ویرایش مجوزهای صریح یک نقش — نقش `developer` ثابت است ⇒ AUTH_FORBIDDEN؛ حذف مجوز قفل‌شده ⇒ CONFLICT(LOCKED_PERMISSION)؛ افزودن مجوزی که خودِ کاربر ندارد ⇒ AUTH_FORBIDDEN (ضد ارتقای دسترسی؛ developer معاف). مجوز ناموجود ⇒ NOT_FOUND. رویداد outbox: `system.permission.changed`.
- مجوز: system.permission.edit؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT
- body: `SetRolePermissionsBody`
- data: `SystemRole`

#### H-20 — GET `/s/v1/system/users`
جست‌وجوی کاربران
- مجوز: system.users.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: 60/60s؛ خطاها: AUTH_FORBIDDEN
- query: `{ page?: number; pageSize?: number; q?: string; role?: SystemRoleKey | "none"; grant?: Grant | "none"; status?: UserStatus; createdFrom?: string; createdTo?: string; sort?: "newest" | "oldest" | "name" }`
- data: `SystemUser[]`

#### H-21 — GET `/s/v1/system/users/{id}`
جزئیات یک کاربر
- مجوز: system.users.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN, NOT_FOUND
- data: `SystemUserDetail`

#### H-22 — PUT `/s/v1/system/users/{id}/roles`
تخصیص/برداشتن نقش سیستم — قفل آخرین دارنده ⇒ CONFLICT(LAST_HOLDER)؛ تغییر نقش developer فقط توسط developer. رویداد outbox: `system.role.changed`.
- مجوز: system.role.assign؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT
- body: `SetUserRolesBody`
- data: `SystemUser`

#### H-23 — PUT `/s/v1/system/users/{id}/grants`
تعیین مجوزهای مستقیم کاربر (ساخت جلسه)
- مجوز: system.role.assign؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND
- body: `SetUserGrantsBody`
- data: `SystemUser`

#### H-30 — GET `/s/v1/system/settings`
تنظیمات سراسری
- مجوز: system.settings.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN
- data: `SystemSettings`

#### H-31 — PUT `/s/v1/system/settings`
به‌روزرسانی تنظیمات سراسری (optimistic concurrency) — `version` قدیمی ⇒ CONFLICT(VERSION_MISMATCH). وزن جدید فقط روی ارزیابی‌های بعدی اثر دارد (D2). رویداد outbox: `system.settings.changed`.
- مجوز: system.settings.edit؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, CONFLICT
- body: `UpdateSettingsBody`
- data: `SystemSettings`

#### H-40 — GET `/s/v1/system/audit`
گزارش اقدام‌ها (audit؛ فقط‌خواندنی)
- مجوز: system.audit.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: 60/60s؛ خطاها: AUTH_FORBIDDEN
- query: `{ page?: number; pageSize?: number; action?: string; q?: string; actorId?: string; targetType?: AuditTargetType; targetId?: string; from?: string; to?: string }`
- data: `AuditEntry[]`

#### H-02 — GET `/s/v1/system/me/account`
حساب من (نام، شماره، وضعیت رمز)
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN
- data: `MyAccount`

#### H-03 — PATCH `/s/v1/system/me/profile`
ویرایش نام و نام‌خانوادگی خودم — ویرایش در low انجام می‌شود (مالک حساب) و رویداد `user.profile.updated` به mid/high می‌رسد. تغییر شمارهٔ موبایل خودخدمتی نیست؛ مدیر با H-25 انجام می‌دهد.
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN
- body: `UpdateMyProfileBody`
- data: `MyAccount`

#### H-04 — PUT `/s/v1/system/me/password`
تعیین/تغییر رمز عبور خودم — نیازمند step-up؛ استثنا: وقتی `MyAccount.mustChangePassword` است `currentPassword` (رمز موقت) به‌جای step-up پذیرفته می‌شود. این تنها مسیر high است که با پرچم رمز موقت (claim `mcp`) مجاز است. پس از موفقیت سایر نشست‌ها revoke می‌شوند.
- مجوز: فقط ورود؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 5/900s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, AUTH_INVALID_CREDENTIALS
- body: `SetMyPasswordBody`
- data: `{  }`

#### H-05 — GET `/s/v1/system/me/sessions`
نشست‌ها و دستگاه‌های من
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN
- query: `{ page?: number; pageSize?: number }`
- data: `UserDeviceSession[]`

#### H-06 — DELETE `/s/v1/system/me/sessions/{id}`
revoke یک نشست خودم
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: AUTH_FORBIDDEN, NOT_FOUND
- data: `{  }`

#### H-07 — POST `/s/v1/system/me/sessions/revoke-others`
خروج از همهٔ نشست‌های دیگرِ خودم
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: AUTH_FORBIDDEN
- data: `{  }`

#### H-24 — POST `/s/v1/system/users`
ساخت کاربر — حساب در low ساخته می‌شود و رویداد `user.registered` به high/mid می‌رسد. با `password` رمز موقت است و کاربر در اولین ورود باید عوضش کند. شمارهٔ تکراری ⇒ CONFLICT(PHONE_TAKEN).
- مجوز: system.users.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: key؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, CONFLICT, SERVICE_UNAVAILABLE
- body: `CreateUserBody`
- data: `SystemUserDetail`

#### H-25 — PATCH `/s/v1/system/users/{id}`
ویرایش نام/شمارهٔ کاربر — شمارهٔ تکراری ⇒ CONFLICT(PHONE_TAKEN). کاربر حذف‌شده قابل‌ویرایش نیست (CONFLICT USER_NOT_ACTIVE).
- مجوز: system.users.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- body: `UpdateUserBody`
- data: `SystemUserDetail`

#### H-26 — POST `/s/v1/system/users/{id}/status`
فعال/غیرفعال‌کردن کاربر — غیرفعال ⇒ همهٔ نشست‌ها revoke و ورود مسدود (AUTH_ACCOUNT_DISABLED). غیرفعال‌کردن خود یا آخرین developer ⇒ CONFLICT(SELF_PROTECTED/LAST_HOLDER).
- مجوز: system.users.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- body: `SetUserStatusBody`
- data: `SystemUserDetail`

#### H-27 — DELETE `/s/v1/system/users/{id}`
حذف کاربر (حذف نرم + ناشناس‌سازی) — نام/شماره/رمز پاک و نشست‌ها revoke می‌شوند؛ تاریخچهٔ جلسه/حضور/امتیاز با نام «کاربر حذف‌شده» می‌ماند. برگشت‌پذیر نیست. حذف خود یا آخرین developer ⇒ CONFLICT.
- مجوز: system.users.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- data: `{  }`

#### H-28 — PUT `/s/v1/system/users/{id}/password`
تعیین رمز موقت / حذف رمز کاربر — `set`: رمز موقت (کاربر در اولین ورود باید عوض کند و نشست‌های او revoke می‌شود). `clear`: حذف رمز؛ ورود فقط با OTP. رمز هرگز لاگ/audit نمی‌شود.
- مجوز: system.users.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- body: `UserPasswordBody`
- data: `{  }`

#### H-29 — POST `/s/v1/system/users/{id}/logout-all`
خروج اجباری کاربر از همهٔ نشست‌ها
- مجوز: system.users.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, SERVICE_UNAVAILABLE
- data: `{  }`

#### H-50 — GET `/s/v1/system/users/{id}/sessions`
نشست‌ها و دستگاه‌های یک کاربر (به تفکیک پنل/کلاینت)
- مجوز: system.users.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN, NOT_FOUND, SERVICE_UNAVAILABLE
- query: `{ page?: number; pageSize?: number }`
- data: `UserDeviceSession[]`

#### H-51 — DELETE `/s/v1/system/users/{id}/sessions/{sessionId}`
revoke یک نشست کاربر
- مجوز: system.users.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, SERVICE_UNAVAILABLE
- data: `{  }`

#### H-60 — GET `/s/v1/system/sessions`
فهرست همهٔ جلسه‌ها با فیلتر
- مجوز: system.sessions.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: 60/60s؛ خطاها: AUTH_FORBIDDEN, SERVICE_UNAVAILABLE
- query: `{ page?: number; pageSize?: number; q?: string; status?: SessionState; creatorId?: string; from?: string; to?: string; includeDeleted?: "true" | "false"; sort?: "newest" | "oldest" | "title" | "nextStart" }`
- data: `AdminSession[]`

#### H-61 — GET `/s/v1/system/sessions/{id}`
جزئیات یک جلسه (شامل draft و حذف‌شده)
- مجوز: system.sessions.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN, NOT_FOUND, SERVICE_UNAVAILABLE
- data: `AdminSession`

#### H-62 — POST `/s/v1/system/sessions`
ساخت جلسه از طرف یک کاربر — سازنده (پیش‌فرض خود ادمین) session_manager می‌شود؛ جلسه draft است.
- مجوز: system.sessions.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: key؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, SERVICE_UNAVAILABLE
- body: `AdminCreateSessionBody`
- data: `AdminSession`

#### H-63 — PATCH `/s/v1/system/sessions/{id}`
ویرایش جلسه (فقط draft/scheduled؛ مثل M-04 ولی بدون نیاز به عضویت)
- مجوز: system.sessions.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- body: `SessionInput`
- data: `AdminSession`

#### H-64 — POST `/s/v1/system/sessions/{id}/transition`
چرخهٔ حیات جلسه: یک قدم رو به جلو
- مجوز: system.sessions.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, SESSION_INVALID_TRANSITION, SERVICE_UNAVAILABLE
- body: `TransitionBody`
- data: `AdminSession`

#### H-65 — DELETE `/s/v1/system/sessions/{id}`
حذف جلسه (حذف نرم؛ از همهٔ فهرست‌های کاربران پنهان می‌شود) — تاریخچهٔ حضور/ارزیابی/امتیاز حفظ می‌شود و فقط در پنل مدیریت (`includeDeleted=true`) دیده می‌شود.
- مجوز: system.sessions.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, SERVICE_UNAVAILABLE
- data: `{  }`

#### H-66 — GET `/s/v1/system/sessions/{id}/members`
اعضا و درخواست‌های عضویت جلسه
- مجوز: system.sessions.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN, NOT_FOUND, SERVICE_UNAVAILABLE
- query: `{ page?: number; pageSize?: number; status?: "pending" | "approved" | "rejected"; role?: SessionRole; q?: string; userId?: string }`
- data: `AdminMember[]`

#### H-67 — PATCH `/s/v1/system/sessions/{id}/members/{memberId}`
تأیید/رد عضویت
- مجوز: system.sessions.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- body: `AdminDecideBody`
- data: `AdminMember`

#### H-68 — PUT `/s/v1/system/sessions/{id}/members/{memberId}/roles`
تعیین نقش‌های درون‌جلسهٔ عضو (شامل هم‌مدیر) — ۱.۶.۰: session_manager هم مجاز (هم‌مدیر)؛ برداشتن نقش آخرین مدیر ⇒ CONFLICT(LAST_HOLDER). عضو باید approved باشد (NOT_APPROVED).
- مجوز: system.sessions.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- body: `AdminSetMemberRolesBody`
- data: `AdminMember`

#### H-69 — DELETE `/s/v1/system/sessions/{id}/members/{memberId}`
حذف عضو از جلسه (مدیر ⇒ ابتدا با H-74 منتقل کنید) — مدیر ⇒ CONFLICT(SESSION_MANAGER_PROTECTED). صف فعال حذف؛ حضور/ارزیابی/امتیاز می‌ماند.
- مجوز: system.sessions.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- data: `{  }`

#### H-70 — GET `/s/v1/system/sessions/{id}/attendance`
حاضرین یک نوبت (پیش‌فرض: نوبت باز یا آخرین)
- مجوز: system.sessions.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN, NOT_FOUND, SERVICE_UNAVAILABLE
- query: `{ page?: number; pageSize?: number; occurrenceId?: string }`
- data: `AdminAttendanceList`

#### H-71 — GET `/s/v1/system/sessions/{id}/queue`
صف نوبت جلسه (نمای کامل؛ پیش‌فرض نوبت باز یا آخرین)
- مجوز: system.sessions.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN, NOT_FOUND, SERVICE_UNAVAILABLE
- query: `{ occurrenceId?: string }`
- data: `AdminQueue`

#### H-72 — GET `/s/v1/system/sessions/{id}/evaluations`
ارزیابی‌های جلسه (همهٔ نوبت‌ها یا یک نوبت)
- مجوز: system.sessions.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN, NOT_FOUND, SERVICE_UNAVAILABLE
- query: `{ page?: number; pageSize?: number; occurrenceId?: string; includeVoid?: "true" | "false" }`
- data: `AdminEvaluations`

#### H-80 — GET `/s/v1/system/reports/overview`
گزارش جامع (کاربران، جلسه‌ها، مشارکت، پیامک، پنل‌ها) در بازه — بخش‌هایی که سرویس مبدأ در دسترس ندارد `null`/خالی می‌شوند (degraded)، نه خطا.
- مجوز: system.reports.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN
- query: `{ from?: string; to?: string }`
- data: `ReportOverview`

#### H-81 — GET `/s/v1/system/reports/registrations`
سری زمانی ثبت‌نام
- مجوز: system.reports.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN
- query: `{ from?: string; to?: string; interval?: "day" | "week" | "month" }`
- data: `RegistrationsSeries`

#### H-82 — GET `/s/v1/system/reports/sessions`
سری زمانی جلسه‌ها (ساخته‌شده، برگزارشده، حضور)
- مجوز: system.reports.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, SERVICE_UNAVAILABLE
- query: `{ from?: string; to?: string; interval?: "day" | "week" | "month" }`
- data: `SessionsSeries`

#### H-83 — GET `/s/v1/system/reports/otp`
سری زمانی پیامک OTP (درخواست/تأییدشده)
- مجوز: system.reports.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, SERVICE_UNAVAILABLE
- query: `{ from?: string; to?: string; interval?: "day" | "week" | "month" }`
- data: `OtpSeries`

#### H-84 — GET `/s/v1/system/reports/leaderboard`
برترین کاربران بر اساس امتیاز
- مجوز: system.reports.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, SERVICE_UNAVAILABLE
- query: `{ limit?: number }`
- data: `LeaderboardResponse`

#### H-13 — POST `/s/v1/system/roles`
ساخت نقش پویا — کلید یکتا ⇒ CONFLICT(KEY_TAKEN)؛ مجوز/ماژول ناموجود ⇒ NOT_FOUND؛ مجوزی که سازنده ندارد ⇒ AUTH_FORBIDDEN (developer معاف). Idempotency-Key پشتیبانی می‌شود.
- مجوز: system.role.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: key؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT
- body: `CreateRoleBody`
- data: `SystemRole`

#### H-14 — GET `/s/v1/system/roles/{key}`
جزئیات یک نقش
- مجوز: system.users.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN, NOT_FOUND
- data: `SystemRole`

#### H-15 — PATCH `/s/v1/system/roles/{key}`
ویرایش عنوان/توضیح نقش
- مجوز: system.role.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND
- body: `UpdateRoleBody`
- data: `SystemRole`

#### H-16 — DELETE `/s/v1/system/roles/{key}`
حذف نقش پویا — نقش سیستمی ⇒ CONFLICT(SYSTEM_PROTECTED)؛ دارای دارنده ⇒ CONFLICT(ROLE_IN_USE) (ابتدا نقش را از کاربران بردارید). پاسخ = آخرین وضعیت نقش پیش از حذف.
- مجوز: system.role.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT
- data: `SystemRole`

#### H-17 — PUT `/s/v1/system/roles/{key}/modules`
تعیین ماژول‌های کامل نقش — نقش به همهٔ مجوزهای حال و آیندهٔ هر ماژول دسترسی می‌یابد. developer ثابت است. ضد ارتقا: مجوز ماژول که کاربر ندارد ⇒ AUTH_FORBIDDEN. claim دارندگان نقش تازه می‌شود.
- مجوز: system.role.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT
- body: `SetRoleModulesBody`
- data: `SystemRole`

#### H-18 — PUT `/s/v1/system/roles/{key}/step-up`
قواعد step-up هر نقش per مجوز — override نقش روی پیش‌فرض مجوز. موثر برای کاربر: اگر هر منبع (نقش/grant) «required» بگوید ⇒ لازم؛ developer همیشه معاف.
- مجوز: system.stepup.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT
- body: `SetRoleStepUpBody`
- data: `SystemRole`

#### H-85 — POST `/s/v1/system/permissions`
ساخت مجوز پویا — کلید یکتا ⇒ CONFLICT(KEY_TAKEN)؛ ماژول ناموجود ⇒ NOT_FOUND. مجوز پویا فقط داده است و در JWT/claim برای سرویس‌های مصرف‌کننده می‌آید؛ endpointهای سیستمی فقط مجوزهای سیستمی را اعمال می‌کنند.
- مجوز: system.permission.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: key؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT
- body: `CreatePermissionBody`
- data: `PermissionInfo`

#### H-86 — PATCH `/s/v1/system/permissions/{key}`
ویرایش مجوز — مجوز سیستمی: فقط عنوان/توضیح/step-up پیش‌فرض/grantable؛ جابه‌جایی ماژول فقط برای مجوز پویا.
- مجوز: system.permission.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT
- body: `UpdatePermissionBody`
- data: `PermissionInfo`

#### H-87 — DELETE `/s/v1/system/permissions/{key}`
حذف مجوز پویا — مجوز سیستمی ⇒ CONFLICT(SYSTEM_PROTECTED). حذف از همهٔ نقش‌ها، grantها و قواعد step-up؛ claim دارندگان تازه می‌شود.
- مجوز: system.permission.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT
- data: `PermissionInfo`

#### H-88 — GET `/s/v1/system/modules`
فهرست ماژول‌ها
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN
- query: `{ page?: number; pageSize?: number }`
- data: `ModuleInfo[]`

#### H-89 — POST `/s/v1/system/modules`
ساخت ماژول — کلید یکتا ⇒ CONFLICT(KEY_TAKEN).
- مجوز: system.permission.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: key؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, CONFLICT
- body: `CreateModuleBody`
- data: `ModuleInfo`

#### H-90 — PATCH `/s/v1/system/modules/{key}`
ویرایش ماژول
- مجوز: system.permission.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND
- body: `UpdateModuleBody`
- data: `ModuleInfo`

#### H-91 — DELETE `/s/v1/system/modules/{key}`
حذف ماژول — ماژول سیستمی ⇒ CONFLICT(SYSTEM_PROTECTED)؛ دارای مجوز ⇒ CONFLICT(MODULE_NOT_EMPTY).
- مجوز: system.permission.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT
- data: `ModuleInfo`

#### H-92 — GET `/s/v1/system/rbac/matrix`
ماتریس کامل نقش × مجوز × ماژول (یک درخواست برای UI) — همهٔ ماژول‌ها، مجوزها و نقش‌ها همراه قواعد step-up و `version` ماتریس. با If-None-Match ⇒ 304.
- مجوز: system.users.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN
- data: `RbacMatrix`

#### H-93 — GET `/s/v1/system/rbac/effective/{id}`
دسترسی مؤثر یک کاربر (با منبع هر مجوز و وضعیت step-up)
- مجوز: system.users.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN, NOT_FOUND
- data: `EffectiveAccess`

#### H-94 — GET `/s/v1/system/me/access`
دسترسی مؤثر من (مجوز، منبع و نیاز به step-up)
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN
- data: `EffectiveAccess`

#### H-73 — POST `/s/v1/system/sessions/{id}/members`
افزودن مستقیم اعضا (با شناسه یا شماره) با نقش — تا ۲۰۰ نفر — عضو بلافاصله approved؛ pending/rejected ⇒ approved. شماره در high به کاربر نگاشت می‌شود؛ ثبت‌نام‌نکرده ⇒ not_found یا با createMissing ساخت کاربر (نیازمند system.users.manage هم). کاربر غیرفعال/حذف‌شده ⇒ not_active. ظرفیت ⇒ full. نتیجهٔ per آیتم (موفقیت جزئی مجاز). audit `session.members_add` بدون شماره.
- مجوز: system.sessions.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: key؛ rate-limit: 10/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- body: `AdminAddMembersBody`
- data: `AdminAddMembersResult`

#### H-74 — PUT `/s/v1/system/sessions/{id}/manager`
تعیین/انتقال مدیر جلسه — کاربر هدف عضو approved می‌شود (اگر نیست) و session_manager می‌گیرد؛ مدیر(ان) قبلی طبق previous. همیشه دست‌کم یک مدیر. کاربر غیرفعال ⇒ CONFLICT(USER_NOT_ACTIVE). audit `session.manager_transfer`.
- مجوز: system.sessions.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- body: `TransferManagerBody`
- data: `AdminSession`

#### H-53 — POST `/s/v1/system/sessions/{id}/members/decide`
تأیید/رد گروهی درخواست‌های عضویت
- مجوز: system.sessions.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- body: `AdminDecideBulkBody`
- data: `AdminDecideBulkResult`

#### H-75 — GET `/s/v1/system/sessions/{id}/occurrences`
نوبت‌های برگزاری جلسه
- مجوز: system.sessions.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, NOT_FOUND, SERVICE_UNAVAILABLE
- query: `{ page?: number; pageSize?: number }`
- data: `AdminOccurrence[]`

#### H-76 — POST `/s/v1/system/sessions/{id}/attendance`
ثبت حضور توسط ادمین (اصلاح؛ نوبت باز یا بسته) — +۵ یک‌بار per نوبت. audit `session.attendance_add` با reason.
- مجوز: system.sessions.moderate؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- body: `AdminMarkAttendanceBody`
- data: `MarkAttendanceResult`

#### H-77 — POST `/s/v1/system/sessions/{id}/attendance/{userId}/revoke`
لغو حضور اشتباه (−۵ در دفتر) — امتیاز کل زیر ۰ نمی‌رود؛ نشان زیر آستانه پس گرفته می‌شود. audit `session.attendance_revoke`.
- مجوز: system.sessions.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- body: `AdminRevokeAttendanceBody`
- data: `RevokeAttendanceResult`

#### H-78 — POST `/s/v1/system/sessions/{id}/queue/next`
صف: نفر بعدی (ادمین) — نوبت باز لازم (OCCURRENCE_CLOSED)؛ شرط expectCurrentItemId ناهمخوان ⇒ QUEUE_STATE_CHANGED. step-up پیش‌فرض این مجوز none است.
- مجوز: system.sessions.moderate؛ step-up: قابل (طبق سیاست)؛ idempotency: —؛ rate-limit: 120/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- body: `AdminQueueNextBody`
- data: `AdminQueue`

#### H-79 — PATCH `/s/v1/system/sessions/{id}/queue/{itemId}`
صف: بالا/پایین/انتها/حذف (ادمین)
- مجوز: system.sessions.moderate؛ step-up: قابل (طبق سیاست)؛ idempotency: key؛ rate-limit: 120/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- body: `AdminQueueActBody`
- data: `AdminQueue`

#### H-95 — POST `/s/v1/system/sessions/{id}/evaluations/{evalId}/void`
باطل‌کردن ارزیابی (کسر امتیاز) — دفتر: evaluation_void؛ نشان زیر آستانه پس گرفته می‌شود. idempotent. audit `session.evaluation_void`.
- مجوز: system.sessions.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- body: `AdminVoidEvaluationBody`
- data: `Evaluation`

#### H-96 — PATCH `/s/v1/system/sessions/{id}/evaluations/{evalId}`
اصلاح نمره‌های ارزیابی — امتیاز با وزن‌های ذخیره‌شده دوباره محاسبه؛ اختلاف در دفتر (evaluation_adjust). باطل‌شده ⇒ EVALUATION_VOIDED. audit `session.evaluation_patch`.
- مجوز: system.sessions.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- body: `AdminEvaluationPatchBody`
- data: `Evaluation`

#### H-52 — GET `/s/v1/system/users/{id}/memberships`
جلسه‌ها و نقش‌های یک کاربر
- مجوز: system.sessions.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: 60/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, NOT_FOUND, SERVICE_UNAVAILABLE
- query: `{ page?: number; pageSize?: number; status?: MembershipStatus; role?: SessionRole; includeDeleted?: "true" | "false" }`
- data: `UserMembership[]`

#### H-97 — GET `/s/v1/system/users/{id}/points`
امتیاز، نشان‌ها و دفتر امتیاز یک کاربر
- مجوز: system.users.view؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, NOT_FOUND, SERVICE_UNAVAILABLE
- query: `{ page?: number; pageSize?: number }`
- data: `AdminUserPoints`

#### H-98 — POST `/s/v1/system/users/{id}/points/adjust`
اصلاح دستی امتیاز (مثبت/منفی) — دفتر: admin_adjust؛ کل زیر ۰ نمی‌رود؛ نشان‌ها بر اساس امتیاز جدید اعطا/پس گرفته می‌شوند. audit `points.adjust`.
- مجوز: system.points.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: key؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT, SERVICE_UNAVAILABLE
- body: `PointsAdjustBody`
- data: `PointsAdjustResult`

#### H-32 — GET `/s/v1/system/badges`
فهرست نشان‌ها (همه، شامل غیرفعال)
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN
- query: `{ page?: number; pageSize?: number }`
- data: `AdminBadge[]`

#### H-33 — POST `/s/v1/system/badges`
ساخت نشان — کلید تکراری ⇒ KEY_TAKEN؛ حداکثر ۵۰ نشان (LIMIT_REACHED). پس از تغییر، اعطا/پس‌گیری نشان برای همه بازمحاسبه می‌شود (پس‌زمینه). audit `badge.create`.
- مجوز: system.badges.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: key؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, CONFLICT
- body: `CreateBadgeBody`
- data: `AdminBadge`

#### H-34 — PATCH `/s/v1/system/badges/{id}`
ویرایش نشان (عنوان، آستانه، فعال/غیرفعال، ترتیب) — تغییر آستانه/فعال‌بودن ⇒ بازمحاسبهٔ دارندگان (اعطا یا پس‌گیری). audit `badge.update`.
- مجوز: system.badges.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND
- body: `UpdateBadgeBody`
- data: `AdminBadge`

#### H-35 — DELETE `/s/v1/system/badges/{id}`
حذف نشان (از همهٔ دارندگان پس گرفته می‌شود)
- مجوز: system.badges.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND
- data: `AdminBadge`

#### H-36 — PUT `/s/v1/system/badges/{id}/image`
بارگذاری تصویر نشان (png/webp/jpeg ≤ ۲۰۰KB) — نوع واقعی با magic bytes بررسی؛ SVG ممنوع؛ ابعاد ≤ ۱۰۲۴px. hash تازه ⇒ آدرس جدید در L-34.
- مجوز: system.badges.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE
- body: `BadgeImageBody`
- data: `AdminBadge`

#### H-37 — DELETE `/s/v1/system/badges/{id}/image`
حذف تصویر نشان
- مجوز: system.badges.manage؛ step-up: قابل (طبق سیاست)؛ idempotency: natural؛ rate-limit: 30/60s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND
- data: `AdminBadge`

#### H-41 — POST `/s/v1/system/announcements`
ارسال پیام همگانی درون‌برنامه‌ای (اینباکس) — مخاطب: همه/کاربران مشخص/نقش سیستمی/اعضای یک جلسه. تحویل غیرهم‌زمان (outbox ⇒ low؛ دسته‌ای). فقط اینباکس (بدون پیامک/پوش — قفل). audit `announcement.send`.
- مجوز: system.inbox.send؛ step-up: قابل (طبق سیاست)؛ idempotency: key؛ rate-limit: 10/3600s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, CONFLICT
- body: `CreateAnnouncementBody`
- data: `Announcement`

#### H-42 — GET `/s/v1/system/announcements`
تاریخچهٔ پیام‌های همگانی
- مجوز: system.inbox.send؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN
- query: `{ page?: number; pageSize?: number }`
- data: `Announcement[]`

#### H-46 — GET `/s/v1/system/announcements/{id}`
جزئیات و آمار تحویل/خواندن یک پیام همگانی
- مجوز: system.inbox.send؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, NOT_FOUND, SERVICE_UNAVAILABLE
- data: `Announcement`

#### H-43 — GET `/s/v1/system/users/export`
خروجی CSV کاربران (با فیلترهای H-20) — نیازمند system.users.view هم. حداکثر ۵۰٬۰۰۰ ردیف؛ UTF-8 BOM؛ خنثی‌سازی فرمول. audit `export.users`.
- مجوز: system.data.export؛ step-up: قابل (طبق سیاست)؛ idempotency: —؛ rate-limit: 5/600s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED
- query: `{ q?: string; role?: SystemRoleKey | "none"; grant?: Grant | "none"; status?: UserStatus; createdFrom?: string; createdTo?: string; sort?: "newest" | "oldest" | "name" }`
- data: `void`

#### H-44 — GET `/s/v1/system/sessions/{id}/export`
خروجی CSV اعضا/حضور/ارزیابی یک جلسه — نیازمند system.sessions.view هم. audit `export.session`.
- مجوز: system.data.export؛ step-up: قابل (طبق سیاست)؛ idempotency: —؛ rate-limit: 5/600s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED, NOT_FOUND, SERVICE_UNAVAILABLE
- query: `{ kind?: "members" | "attendance" | "evaluations"; occurrenceId?: string }`
- data: `void`

#### H-45 — GET `/s/v1/system/audit/export`
خروجی CSV گزارش اقدام‌ها (با فیلترهای H-40) — نیازمند system.audit.view هم. حداکثر ۱۰۰٬۰۰۰ ردیف. audit `export.audit`.
- مجوز: system.data.export؛ step-up: قابل (طبق سیاست)؛ idempotency: —؛ rate-limit: 5/600s؛ خطاها: VALIDATION_FAILED, AUTH_FORBIDDEN, AUTH_STEP_UP_REQUIRED
- query: `{ action?: string; q?: string; actorId?: string; targetType?: AuditTargetType; targetId?: string; from?: string; to?: string }`
- data: `void`

#### H-48 — GET `/s/v1/system/session-roles`
ماتریس نقش‌های جلسه ← مجوزهای درون‌جلسه (فقط‌خواندنی)
- مجوز: فقط ورود؛ step-up: ندارد؛ idempotency: —؛ rate-limit: —؛ خطاها: AUTH_FORBIDDEN
- data: `SessionRolesMatrix`

## نوع‌ها (TypeScript)
```ts
type AddMemberOutcome = "added" | "approved" | "merged" | "replaced" | "unchanged" | "created_and_added" | "not_found" | "not_active" | "full" | "failed";
type AdminAddMembersBody = { items: ({ user: { userId?: string; phone?: string }; roles?: ("session_supporter" | "teacher" | "quran_student")[]; firstName?: string; lastName?: string })[]; defaultRoles?: ("session_supporter" | "teacher" | "quran_student")[]; onExisting?: "skip" | "merge" | "replace"; createMissing?: boolean; notify?: boolean };
type AdminAddMembersResult = { items: ({ index: number; userId: string | unknown | null; outcome: AddMemberOutcome; code: string | unknown | null; member: AdminMember | unknown | null })[]; counts: { [key: string]: number } };
type AdminAttendanceList = { items: AttendanceEntry[]; total: number; occurrenceId?: string | unknown | null };
type AdminBadge = { id: string; key: string; title: string; description: string; threshold: number; active: boolean; sortOrder: number; image: { hash: string; contentType: "image/png" | "image/webp" | "image/jpeg"; bytes: number; width: number; height: number } | unknown | null; holders: number; createdAt: string /*ISO datetime*/; updatedAt: string /*ISO datetime*/ };
type AdminCreateSessionBody = { creatorId?: string; session: SessionInput };
type AdminDecideBody = { action: "approve" | "reject" };
type AdminDecideBulkBody = { memberIds: string[]; action: "approve" | "reject" };
type AdminDecideBulkResult = { items: ({ memberId: string; outcome: "approved" | "rejected" | "skipped" | "full" | "not_found" })[] };
type AdminEvaluationPatchBody = { voice?: number; tone?: number; tajweed?: number; note?: string; reason: string };
type AdminEvaluations = { items: Evaluation[]; total: number };
type AdminMarkAttendanceBody = { userIds: string[]; occurrenceId?: string; reason: string };
type AdminMember = { id: string; userId: string; name: string; roles: SessionRole[]; status: MembershipStatus; requestedAt: string /*ISO datetime*/; phone: string | unknown | null; decidedAt: string /*ISO datetime*/ | unknown | null };
type AdminOccurrence = Occurrence;
type AdminQueue = QueueState;
type AdminQueueActBody = { action: "up" | "down" | "skip" | "remove"; expectPosition?: number };
type AdminQueueNextBody = { expectCurrentItemId?: string | unknown | null };
type AdminRevokeAttendanceBody = { occurrenceId?: string; reason: string };
type AdminSession = { id: string; title: string; description: string; schedule: SessionSchedule; nextStartsAt: string /*ISO datetime*/ | unknown | null; location: { label: string; routeUrl?: string | unknown | null }; status: SessionState; joinPolicy?: JoinPolicy; capacity?: number | unknown | null; memberCount?: number; visibility?: SessionVisibility; createdBy: { id: string; name: string }; counts: { members: number; pending: number; attendance: number; evaluations: number; managers?: number; occurrences?: number }; createdAt: string /*ISO datetime*/; updatedAt: string /*ISO datetime*/; deletedAt: string /*ISO datetime*/ | unknown | null };
type AdminSetMemberRolesBody = { roles: SessionRole[] };
type AdminUserPoints = { summary: PointsSummary; ledger: { items: PointsLedgerItem[]; page: number; pageSize: number; total: number } };
type AdminVoidEvaluationBody = { reason: string };
type Announcement = { id: string; audience: AnnouncementAudience; title: string; body: string; ref: string | unknown | null; status: "queued" | "sending" | "done" | "failed"; recipients: number | unknown | null; delivered: number | unknown | null; read: number | unknown | null; createdBy: { id: string; name: string }; createdAt: string /*ISO datetime*/ };
type AnnouncementAudience = { type: "all" } | { type: "users"; userIds: string[] } | { type: "role"; role: SystemRoleKey } | { type: "session"; sessionId: string; roles?: SessionRole[] };
type AttendanceEntry = { userId: string; name: string; enteredAt: string /*ISO datetime*/; source?: "self" | "staff" | "admin"; occurrenceId?: string | unknown | null };
type AuditEntry = { id: string; at: string /*ISO datetime*/; actor: { id: string; name: string }; action: string; target?: { type: AuditTargetType; id: string; label: string }; summary: string; meta: { [key: string]: unknown } };
type AuditTargetType = "user" | "role" | "settings" | "session" | "permission" | "module" | "badge" | "announcement";
type AuthResult = { accessToken: string; tokenType: "Bearer"; accessExpiresIn: number; refreshToken?: string; sessionId: string; user: AuthUser };
type AuthUser = { id: string; phone: string; isNewUser: boolean; profileComplete: boolean; hasPassword: boolean };
type BadgeImageBody = { contentType: "image/png" | "image/webp" | "image/jpeg"; dataBase64: string };
type BadgeView = { id: string; key: string; title: string; description: string; threshold: number; image: { hash: string } | unknown | null; awardedAt: string /*ISO datetime*/ | unknown | null };
type CreateAnnouncementBody = { audience: AnnouncementAudience; title: string; body: string; ref?: string };
type CreateBadgeBody = { key: string; title: string; description?: string; threshold: number; active?: boolean; sortOrder?: number };
type CreateModuleBody = { key: ModuleKey; title: string; description?: string; sortOrder?: number };
type CreatePermissionBody = { key: PermissionKey; title: string; description?: string; moduleKey: ModuleKey; grantable?: boolean; stepUp?: StepUpMode };
type CreateRoleBody = { key: SystemRoleKey; title: string; description?: string; permissions?: PermissionKey[]; modules?: ModuleKey[] };
type CreateUserBody = { phone: string; firstName: string; lastName: string; password?: string; roles?: SystemRoleKey[]; grants?: Grant[] };
type EffectiveAccess = { userId: string; roles: SystemRoleKey[]; grants: Grant[]; stepUpExempt: boolean; permissions: ({ key: PermissionKey; stepUp: StepUpMode; sources: ({ type: "role" | "module" | "grant"; ref: string; stepUp: StepUpMode })[] })[] };
type Evaluation = { id: string; sessionId: string; queueItemId: string; userId: string; userName: string; evaluatorName: string; voice: number; tone: number; tajweed: number; weights: EvaluationWeights; score: number; points: number; note: string; createdAt: string /*ISO datetime*/; occurrenceId?: string | unknown | null; status?: "active" | "void"; updatedAt?: string /*ISO datetime*/ | unknown | null };
type EvaluationWeights = { voice: number; tone: number; tajweed: number };
type Grant = PermissionKey;
type JoinPolicy = "request" | "open" | "invite_only";
type LeaderboardItem = { userId: string; name: string; points: number; badges: number };
type LeaderboardResponse = { items: LeaderboardItem[] };
type MarkAttendanceResult = { occurrenceId: string; items: ({ userId: string; outcome: "marked" | "already" | "not_member"; pointsAwarded: 0 | 5 })[] };
type MembershipStatus = "pending" | "approved" | "rejected";
type ModuleInfo = { key: ModuleKey; title: string; description: string; isSystem: boolean; sortOrder: number; permissionCount: number };
type ModuleKey = string;
type MyAccount = { id: string; phone: string; firstName: string; lastName: string; hasPassword: boolean; mustChangePassword: boolean };
type Occurrence = { id: string; seq: number; status: "live" | "closed"; openedAt: string /*ISO datetime*/; closedAt: string /*ISO datetime*/ | unknown | null; counts: { attendance: number; evaluations: number } };
type OtpChallenge = { challengeId: string; expiresInSec: number; resendAfterSec: number };
type OtpRequestBody = { phone: string };
type OtpSeries = { interval: "day" | "week" | "month"; items: { bucket: string; requested: number; verified: number }[] };
type OtpVerifyBody = { challengeId: string; code: string; deviceId: string; deviceLabel: string };
type Overview = { users: { total: number; admins: number }; sessions: { draft: number; scheduled: number; started: number; ended: number }; lastAudit: AuditEntry[] };
type PasswordLoginBody = { phone: string; password: string; deviceId: string; deviceLabel: string };
type PermissionInfo = { key: PermissionKey; title: string; description: string; moduleKey: ModuleKey; isSystem: boolean; grantable: boolean; stepUp: StepUpMode };
type PermissionKey = string;
type PointsAdjustBody = { delta: number; reason: string };
type PointsAdjustResult = { summary: PointsSummary; entry: PointsLedgerItem };
type PointsLedgerItem = { id: string; points: number; reason: PointsReason; session: { id: string; title: string } | unknown | null; note: string | unknown | null; createdAt: string /*ISO datetime*/ };
type PointsReason = "attendance" | "evaluation" | "attendance_reversal" | "evaluation_adjust" | "evaluation_void" | "admin_adjust";
type PointsSummary = { total: number; badges: BadgeView[] };
type QueueItem = { id: string; userId: string; name: string | unknown | null; status: "waiting" | "current" | "done"; position: number | unknown | null; joinedAt: string /*ISO datetime*/; evaluated: boolean; isMe: boolean };
type QueueState = { occurrenceId?: string | unknown | null; current: QueueItem | unknown | null; waiting: QueueItem[]; done: QueueItem[]; myItem: QueueItem | unknown | null; myPosition: number | unknown | null; waitingCount: number };
type RbacMatrix = { version: number; modules: ModuleInfo[]; permissions: PermissionInfo[]; roles: SystemRole[] };
type RefreshBody = { refreshToken?: string };
type RefreshResult = { accessToken: string; tokenType: "Bearer"; accessExpiresIn: number; refreshToken?: string };
type RegistrationsSeries = { interval: "day" | "week" | "month"; items: { bucket: string; count: number }[] };
type ReportOverview = { range: { from: string; to: string }; users: { total: number; registered: number; byStatus: { active: number; disabled: number; deleted: number }; byRole: { developer: number; super_admin: number; none: number }; withPassword: number | unknown | null }; sessions: { total: number; created: number; byStatus: { draft: number; scheduled: number; started: number; ended: number } }; participation: { attendance: number; evaluations: number; avgScore: number | unknown | null; pointsAwarded: number }; messaging: { otpRequested: number; otpVerified: number } | unknown | null; clients: { client: string; activeSessions: number }[] };
type RevokeAttendanceResult = { occurrenceId: string; revoked: boolean; pointsReversed: number };
type SessionInput = { title: string; description: string; schedule: SessionSchedule; location: { label: string; routeUrl?: string | unknown | null }; joinPolicy?: JoinPolicy; visibility?: SessionVisibility; capacity?: number | unknown | null };
type SessionPermission = "session.edit" | "session.transition" | "membership.approve" | "membership.roles" | "queue.manage" | "eval.submit" | "attendance.view" | "attendance.manage" | "occurrence.manage";
type SessionRole = "session_manager" | "session_supporter" | "teacher" | "quran_student";
type SessionRolesMatrix = { roles: { key: SessionRole; title: string; permissions: SessionPermission[] }[]; permissions: { key: SessionPermission; title: string }[] };
type SessionSchedule = { type: "once"; startsAt: string /*ISO datetime*/; endsAt: string /*ISO datetime*/ } | { type: "recurring"; weekdays: number[]; timeOfDay: string; durationMin: number } | { type: "range"; rangeFrom: string /*ISO datetime*/; rangeTo: string /*ISO datetime*/; weekdays: number[]; timeOfDay: string; durationMin: number };
type SessionState = "draft" | "scheduled" | "started" | "ended";
type SessionVisibility = "public" | "unlisted";
type SessionsSeries = { interval: "day" | "week" | "month"; items: { bucket: string; created: number; held: number; attendance: number }[] };
type SetMyPasswordBody = { newPassword: string; currentPassword?: string };
type SetRoleModulesBody = { modules: ModuleKey[] };
type SetRolePermissionsBody = { permissions: PermissionKey[] };
type SetRoleStepUpBody = { rules: ({ permission: PermissionKey; mode: "required" | "none" | "inherit" })[] };
type SetUserGrantsBody = { grants: Grant[] };
type SetUserRolesBody = { roles: SystemRoleKey[] };
type SetUserStatusBody = { status: "active" | "disabled" };
type StepUpMode = "required" | "none";
type StepUpResult = { stepUpToken: string; expiresInSec: number };
type StepUpVerifyBody = { challengeId: string; code: string };
type SystemEvalWeights = { voice: number; tone: number; tajweed: number };
type SystemMe = { user: { id: string; name: string; phone: string }; roles: SystemRoleKey[]; permissions: PermissionKey[]; stepUpExempt: boolean; stepUp: { [key: string]: StepUpMode } };
type SystemRole = { key: SystemRoleKey; title: string; description: string; undeletable: boolean; permissions: PermissionKey[]; modules: ModuleKey[]; effectivePermissions: PermissionKey[]; lockedPermissions: PermissionKey[]; stepUpRules: { [key: string]: StepUpMode }; holders: number };
type SystemRoleKey = string;
type SystemSettings = { version: number; evalWeights: SystemEvalWeights; badgeThresholds: unknown[]; flags: { maintenance_mode: boolean; registration_open: boolean }; updatedAt: string /*ISO datetime*/; updatedBy: string };
type SystemUser = { id: string; name: string; phone: string | string; status: UserStatus; roles: SystemRoleKey[]; grants: Grant[]; createdAt: string /*ISO datetime*/ };
type SystemUserDetail = { id: string; name: string; phone: string | string; status: UserStatus; roles: SystemRoleKey[]; grants: Grant[]; createdAt: string /*ISO datetime*/; firstName: string; lastName: string; hasPassword: boolean; mustChangePassword: boolean; lastActiveAt: string /*ISO datetime*/ | unknown | null; activeSessions: number; sessionsByClient: { [key: string]: number }; points: { total: number; badges: number }; sessions: { created: number; memberships: number; attended: number } };
type TransferManagerBody = { userId: string; previous?: "demote" | "remove" | "keep"; previousRoles?: ("session_supporter" | "teacher" | "quran_student")[]; transferCreator?: boolean; notify?: boolean };
type TransitionBody = { to: "scheduled" | "started" | "ended" };
type UpdateBadgeBody = { title?: string; description?: string; threshold?: number; active?: boolean; sortOrder?: number };
type UpdateModuleBody = { title?: string; description?: string; sortOrder?: number };
type UpdateMyProfileBody = { firstName?: string; lastName?: string };
type UpdatePermissionBody = { title?: string; description?: string; moduleKey?: ModuleKey; grantable?: boolean; stepUp?: StepUpMode };
type UpdateRoleBody = { title?: string; description?: string };
type UpdateSettingsBody = { version: number; evalWeights: SystemEvalWeights; badgeThresholds?: unknown[]; flags: { maintenance_mode: boolean; registration_open: boolean } };
type UpdateUserBody = { firstName?: string; lastName?: string; phone?: string };
type UserDeviceSession = { id: string; deviceLabel: string; platform: "web" | "android"; client: string | unknown | null; ipMasked: string; createdAt: string /*ISO datetime*/; lastActiveAt: string /*ISO datetime*/; revokedAt: string /*ISO datetime*/ | unknown | null; current: boolean };
type UserMembership = { session: { id: string; title: string; status: SessionState; nextStartsAt: string /*ISO datetime*/ | unknown | null; deletedAt: string /*ISO datetime*/ | unknown | null }; memberId: string; roles: SessionRole[]; status: MembershipStatus; requestedAt: string /*ISO datetime*/; decidedAt: string /*ISO datetime*/ | unknown | null; attendanceCount: number; evaluations: { count: number; avgScore: number | unknown | null }; points: number };
type UserPasswordBody = { action: "set"; password: string } | { action: "clear" };
type UserStatus = "active" | "disabled" | "deleted";
```
