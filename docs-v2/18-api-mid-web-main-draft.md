# ۱۸ — پیش‌نویس قرارداد API: Mid (`/o/v1`) برای `web-main`

**وضعیت: قفل مشروط (۱۴۰۵/۰۷/۰۹) — مالک تصمیم‌های باز را به AI واگذار کرد؛ هر زمان می‌تواند اصلاح کند.** تا آماده‌شدن `api-mid` فقط mock (`apps/web-main/src/lib/api/mock/mid*`).
مرجع: قفل‌های `00` (#11 #12 #14 #15 #17 #22)، `05` (ماتریس نقش)، `06-domains/mid.md`، `07`. چیزی که در قفل‌ها نیست **[پیشنهاد]** است.

## ۱. دامنه
| داخل | خارج |
|------|------|
| جلسه (ساخت/ویرایش/چرخهٔ حیات)، عضویت، نقش داخل جلسه، حضور، صف، ارزیابی، رویدادهای زنده | `web-admin`/high، وزن ارزیابی (فقط خواندنی؛ پیش‌فرض ۴۰/۳۰/۳۰)، نقشهٔ مکان جلسه (Map.ir)، اینباکس (outbox به low)، schema DB/env |

کلاینت `web-main` برای auth فقط به low (`/c/v1/auth/*`) و برای عملیات به `/o/v1`. قالب پاسخ/خطا/صفحه‌بندی مثل `07`.

## ۲. مدل مجوز (سمت سرور؛ UI فقط از `permissions` می‌خواند)
نقش‌های جلسه: `session_manager`, `session_supporter`, `teacher`, `quran_student` (یک کاربر می‌تواند چند نقش در یک جلسه داشته باشد). مجوزها = اجتماع نقش‌ها:

| مجوز | manager | supporter | teacher | student |
|------|:-:|:-:|:-:|:-:|
| `session.edit` / `session.transition` / `membership.roles` | ✓ | | | |
| `membership.approve` | ✓ | ✓ | | |
| `queue.manage` | ✓ | ✓ | ✓ | |
| `eval.submit` | ✗ | ✓ | ✓ | |
| `attendance.view` | ✓ | ✓ | ✓ | |

- **manager به‌تنهایی `eval.submit` ندارد**؛ فقط اگر هم‌زمان teacher/supporter باشد (اجتماع).
- `session.create` مجوز سطح کاربر است (از high؛ در mock: شماره‌های `0912…`). سازندهٔ جلسه خودکار `session_manager` همان جلسه می‌شود.
- حضور/صف/نتیجهٔ خود: هر عضو تأییدشده.

## ۳. endpointها
`چرخهٔ حیات`: `draft → scheduled → started → ended` فقط رو به جلو.

### کاربر و فهرست‌ها
| شناسه | مسیر | توضیح |
|-------|------|-------|
| M-00 | `GET /me` | `{ canCreateSession, hasStaffRole }` (برای نمایش ورودی «مدیریت») |
| M-01 | `GET /me/sessions?scope=all\|staff` | `[{ session, roles[], membership: pending\|approved\|rejected, pendingCount? }]`؛ `staff` = جلساتی که نقش غیر-student دارم (شامل draft) |
| M-02 | `GET /sessions/:id/me` | `{ session, membership: {status,roles}\|null, permissions[], myAttendance: {enteredAt}\|null }`؛ draft فقط برای اعضا/مدیر، وگرنه `NOT_FOUND` |

### جلسه
| شناسه | مسیر | توضیح |
|-------|------|-------|
| M-03 | `POST /sessions` | `{ title, description, schedule, location:{label} }` ⇒ جلسهٔ `draft`؛ نیاز `session.create`؛ `schedule` مثل `15` §۴-ب |
| M-04 | `PATCH /sessions/:id` | ویرایش؛ `session.edit`؛ فقط `draft`/`scheduled` (وگرنه `CONFLICT`) |
| M-05 | `POST /sessions/:id/transition` | `{ to: scheduled\|started\|ended }`؛ `session.transition`؛ پرش/برگشت ⇒ `SESSION_INVALID_TRANSITION` 409 |

اعتبارسنجی: `title` ۳..۸۰ نویسه، `description` ۱۰..۵۰۰، `location.label` ۲..۱۲۰؛ `once`: پایان بعد از شروع؛ `recurring/range`: ≥۱ روز هفته (۰=شنبه..۶=جمعه)، `timeOfDay` `HH:mm`، `durationMin` ۱۵..۳۶۰؛ `range`: `rangeTo ≥ rangeFrom`. انتشار (`→scheduled`) فقط اگر زمان‌بندی معتبر.

### عضویت
| شناسه | مسیر | توضیح |
|-------|------|-------|
| M-10 | `POST /sessions/:id/members` | درخواست عضویت خودم ⇒ `pending`؛ تکراری ⇒ `CONFLICT`؛ جلسهٔ `ended`/`draft` ⇒ `CONFLICT` |
| M-11 | `GET /sessions/:id/members?status=` | `membership.approve`؛ `[{ id, userId, name, roles[], status, requestedAt }]` |
| M-12 | `PATCH /sessions/:id/members/:memberId` | `{ action: approve\|reject }`؛ `membership.approve`؛ عضو تأییدشده نقش `quran_student` می‌گیرد |
| M-13 | `PUT /sessions/:id/members/:memberId/roles` | `{ roles[] }` از `supporter\|teacher\|quran_student`؛ `membership.roles`؛ نقش manager از اینجا عوض نمی‌شود |

### حضور
| شناسه | مسیر | توضیح |
|-------|------|-------|
| M-20 | `POST /sessions/:id/attendance` | فقط عضو تأییدشده و جلسهٔ `started`. **اولین بار** `{ entry, pointsAwarded: 5, alreadyPresent:false }`؛ تکرار ⇒ **همان entry، `pointsAwarded: 0`، `alreadyPresent:true`** (200، بدون خطا) |
| M-21 | `GET /sessions/:id/attendance` | `attendance.view`؛ `{ items:[{userId,name,enteredAt}], total }` |

### صف
| شناسه | مسیر | توضیح |
|-------|------|-------|
| M-30 | `POST /sessions/:id/queue` | قرآن‌آموز حاضر، جلسهٔ `started`؛ تکراری (waiting/current) ⇒ `CONFLICT`؛ نیاز حضور ثبت‌شده، وگرنه `CONFLICT` با `details.reason="NOT_PRESENT"` |
| M-31 | `DELETE /sessions/:id/queue/me` | انصراف از صف (فقط `waiting`) |
| M-32 | `GET /sessions/:id/queue` | `{ current, waiting[], done[], myItem, myPosition, waitingCount }`؛ برای `queue.manage` نام‌ها کامل؛ برای دیگران فقط نام نفر جاری، جایگاه خودم و تعداد |
| M-33 | `POST /sessions/:id/queue/next` | `queue.manage`؛ نفر جاری ⇒ `done`، اولین `waiting` ⇒ `current`؛ صف خالی ⇒ `current:null`؛ رویداد `queue.turned` |
| M-34 | `PATCH /sessions/:id/queue/:itemId` | `queue.manage`؛ `{ action: up\|down\|skip\|remove }` (skip = رفتن به انتها) روی `waiting` |

### ارزیابی
| شناسه | مسیر | توضیح |
|-------|------|-------|
| M-40 | `POST /sessions/:id/evaluations` | `{ queueItemId, voice, tone, tajweed (۰..۱۰ صحیح), note? (≤۳۰۰) }`؛ **`eval.submit`** وگرنه `AUTH_FORBIDDEN`؛ فقط برای آیتم `current`/`done`؛ یک ارزیابی برای هر آیتم (ثبت دوباره ⇒ `CONFLICT`). پاسخ: `{ id, …, weights, score (۰..۱۰۰), points }` |
| M-41 | `GET /sessions/:id/evaluations` | `eval.submit`/`queue.manage`: همه؛ سایرین: فقط ارزیابی‌های خودم |
| M-42 | `GET /me/points` | خلاصهٔ امتیاز برای UI (پاسخ low `/me/points` همین دادهٔ ledger است؛ قفل #12) |

- `score = 4·voice + 3·tone + 3·tajweed` برای وزن پیش‌فرض ۴۰/۳۰/۳۰ (کلی: میانگین وزنی ×۱۰)؛ وزن‌ها از high و در پاسخ برگردانده می‌شود. **[پیشنهاد]** امتیاز ارزیابی = `round(score/10)` (۰..۱۰) در `point_ledger`؛ فرمول نهایی با mid/high قفل می‌شود.

## ۴. Realtime (Socket.IO روی api-mid)
- اتصال: `https://api.israapp.ir` با `path: "/o/v1/socket.io"`، `auth: { token: <access> }`؛ توکن نامعتبر ⇒ قطع. پس از اتصال: `emit("session.join", { sessionId })` (فقط عضو تأییدشده). با انقضای access کلاینت تمدید و دوباره وصل می‌شود.
- رویدادها (JSON `{ type, sessionId, payload? }`): `attendance.updated`، `queue.updated`، `queue.turned` (`payload.userId`)، `eval.updated`، `session.state` (`payload.status`). **[پیشنهاد]** رویداد فقط «سیگنال» است؛ کلاینت داده را با REST (M-21/M-32/M-41/M-02) دوباره می‌گیرد تا منبع حقیقت یکی بماند.
- فقط وقتی اپ باز است؛ ماندگاری اعلان از مسیر inbox (low).

## ۵. خطاهای جدید
| code | HTTP | معنی |
|------|-----:|------|
| `SESSION_INVALID_TRANSITION` | 409 | پرش یا برگشت در چرخهٔ حیات |
| `AUTH_FORBIDDEN` | 403 | مجوز نیست (مثلاً ارزیابی توسط manager تنها) |
| `CONFLICT` + `details.reason` | 409 | `ALREADY_MEMBER`, `NOT_PRESENT`, `ALREADY_IN_QUEUE`, `ALREADY_EVALUATED`, `SESSION_LOCKED` |

## ۶. تصمیم‌های ثبت‌شده (واگذارشده)
| # | تصمیم |
|---|-------|
| D1 | عضویت درخواستی است و تأیید دارد (`pending`)؛ سازندهٔ جلسه manager است |
| D2 | حضور برای همهٔ اعضای تأییدشدهٔ جلسهٔ `started` (از جمله کادر) ⇒ +۵ فقط یک‌بار |
| D3 | رویدادهای realtime فقط سیگنال‌اند؛ داده با REST |
| D4 | صف: فقط قرآن‌آموزِ حاضر؛ دانش صف برای غیرکادر محدود (حریم خصوصی) |
| D5 | ارزیابی ۰..۱۰ per معیار؛ `score` ۰..۱۰۰؛ ویرایش ارزیابی در فاز ۱ نیست |
| D6 | تاریخ در فرم: ورودی native مرورگر + پیش‌نمایش فارسی (انتخابگر جلالی بعداً) |
