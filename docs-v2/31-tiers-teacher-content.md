# ۳۱ — سطوح کاربری، استاد، پشتیبان، ارزیابی پویا، گالری و کامنت (قفل مالک ۱۴۰۵/۰۷/۱۷؛ api-types ۱.۷.۰)

> اولویت: `00-locks.md` > این سند > `30` > بقیه. این سند جایگزین «نقش‌های جلسه»ی قبلی (مدیر/پشتیبان/معلم/قرآن‌آموز) است.

## ۰. تصمیم‌های مالک (۱۴۰۵/۰۷/۱۷)
| # | تصمیم |
|---|---|
| T1 | سه سطح: **بالا** (برنامه‌نویس، مدیر ارشد، …)، **میانی** (استاد، پشتیبان، …)، **پایین** (مهمان، قرآن‌آموز، کاربر عادی). |
| T2 | نقش‌های ثابت: بالا = `developer` (همهٔ مجوزها، غیرقابل تغییر) و `super_admin` (فقط نقش ثابت؛ مجوزهایش را developer کم/زیاد می‌کند)؛ میانی = `teacher` (استاد)؛ پایین = `guest` و `quran_student`. بقیهٔ نقش‌ها در هر سطح پویا. **همهٔ دسترسی‌ها پویا** (developer ثابتِ کامل). |
| T3 | سطح بالا همهٔ امکانات سطح خود و سطوح پایین‌تر را (با مجوز) دارد؛ developer پیش‌فرض همه را دارد. |
| T4 | **استاد** صاحب جلسه‌های خودش است: ساخت/ویرایش/حذف، عضو (افزودن/تأیید/رد/حذف)، صف، حضور، ارزیابی، تعیین پشتیبان. «مدیر جلسه» و «معلم درون جلسه» در «استاد صاحب جلسه» **ادغام** می‌شوند. |
| T5 | **پشتیبان** اختیاری: **ثابت** (برای همهٔ جلسه‌های حال و آیندهٔ آن استاد) یا **per جلسه**؛ مجوزهایش را استاد (یا ادمین) از فهرست مجوزهای قابل‌واگذاری تعیین می‌کند. |
| T6 | **معیارهای ارزیابی پویا** (نام، وزن، سقف نمره، فعال/غیرفعال، ترتیب) را سطح بالا مدیریت می‌کند. |
| T7 | **گالری** per نوبت برگزاری؛ هر نوبت **چند گالری** (عنوان، نوع تصویر/صوت، سطح نمایش `public`/`members`/`staff`). فایل‌ها روی **دیسک هاست بیرون از پوشهٔ اپ** (`MEDIA_DIR`). |
| T8 | **کامنت**: حین تلاوت (وصل به نوبت صف خواننده + ثانیهٔ تلاوت) یا عمومی نوبت؛ تنظیم استاد per جلسه: `public` (همه) یا `reciter_only` (فقط خواننده + نویسنده + کادر). |
| T9 | مجوزهای مهمان و قرآن‌آموز را سطح بالا (یا دارندهٔ مجوز مدیریت نقش‌های سطح پایین) تعیین می‌کند. |

## ۱. نقش، سطح و مجوز (high = منبع حقیقت)
- `system_roles.tier ENUM('high','mid','low')` (موجودها ⇒ high). نقش‌های ثابت seed: `teacher` (mid)، `guest` و `quran_student` (low) با `undeletable=1`.
- `system_modules.tier` هم اضافه می‌شود (ماژول‌های فعلی ⇒ high). ماژول‌های تازه:
  | ماژول | tier | مجوزها (پیش‌فرض step-up) |
  |---|---|---|
  | `teaching` | mid | `session.create` (none)، `session.manage_own` (none)، `supporter.manage_own` (none)، `evaluation.submit_own` (none)، `gallery.manage_own` (none) |
  | `learning` | low | `session.browse` (none)، `session.join` (none)، `comment.post` (none)، `gallery.view` (none)، `points.view` (none) |
  | `evaluation` | high | `system.evaluation.manage` (required) |
  | `content_admin` | high | `system.content.moderate` (none) — گالری/کامنت همهٔ جلسه‌ها |
  | `access` (موجود) | high | + `system.roles.mid.manage` (required)، `system.roles.low.manage` (required) |
- پیش‌فرض‌ها: `teacher` = همهٔ `teaching` + همهٔ `learning`؛ `quran_student` = همهٔ `learning`؛ `guest` = `session.browse` + `gallery.view`؛ `developer` = همه (قفل)؛ `super_admin` = مثل قبل.
- **عضویت ضمنی**: هر کاربر ثبت‌نام‌کرده بی‌نیاز از ردیف، نقش `quran_student` دارد؛ درخواست بی‌توکن ⇒ مجوزهای `guest`. مجوز مؤثر = اجتماع (quran_student یا guest) ∪ نقش‌های اختصاص‌یافته ∪ grantها.
- **ویرایش نقش/مجوز per سطح**: نقش‌های high ⇒ `system.permission.edit`/`system.role.manage` (مثل قبل)؛ نقش‌های mid ⇒ `system.roles.mid.manage`؛ نقش‌های low (شامل guest و quran_student) ⇒ `system.roles.low.manage`. ضد ارتقا (E2) بدون تغییر. developer ثابت.
- **پنل مدیریت**: دسترسی به `/s/v1` نیازمند دست‌کم یک نقش tier=high **یا** یک مجوز `system.*` است (استادی که developer به او مجوز سیستمی داده هم وارد می‌شود).
- **انتشار**: `system.role.changed` مثل قبل (perms مؤثر کاربر در JWT). رویداد تازهٔ `tier.baseline.changed {version, guest: string[], quran_student: string[]}` به low و mid تا برای بی‌توکن/کاربر عادی محلی اعمال شود (کش با version).
- اپ‌ها: android-mid/بخش استاد web-main نیازمند نقش tier=mid (یا perm `session.create`).

## ۲. جلسه، صاحب و پشتیبان (mid)
- `sessions.owner_id` (= سازنده؛ مهاجرت: مدیر فعلی). صاحب **همهٔ** مجوزهای جلسه را دارد.
- نقش‌های درون جلسه: `owner` | `supporter` | `member`. `session_members` فقط اعضا (قرآن‌آموز) را نگه می‌دارد (status pending/approved/rejected)؛ ستون/جدول نقش‌های قبلی حذف (مهاجرت: معلم/پشتیبان قبلی ⇒ پشتیبان per جلسه با مجوزهای معادل؛ مدیر ⇒ owner؛ هم‌مدیرهای اضافه ⇒ پشتیبان با همهٔ مجوزها).
- **مجوزهای قابل‌واگذاری به پشتیبان** (`SessionPermission`): `membership.approve`، `membership.manage` (افزودن/حذف عضو)، `attendance.manage` (کنترل ورود/خروج)، `queue.manage`، `eval.submit`، `gallery.manage`، `comment.moderate`، `occurrence.manage`، `session.edit`.
- پشتیبان ثابت: `teacher_supporters(teacher_id, user_id, permissions JSON, created_at)` ⇒ در همهٔ جلسه‌های آن استاد. پشتیبان per جلسه: `session_supporters(session_id, user_id, permissions JSON, created_at)`. مجوز مؤثر پشتیبان در جلسه = اجتماع هر دو.
- پشتیبان باید کاربر فعال باشد؛ افزودن با userId یا شماره (resolve از low؛ سقف durable مثل M-14).
- ادمین با `system.sessions.manage` همهٔ کارهای صاحب را روی همهٔ جلسه‌ها دارد؛ `system.content.moderate` برای گالری/کامنت.
- **قفل #15 (ارزیابی)** به‌روز: ارزیاب = صاحب جلسه، پشتیبانِ دارای `eval.submit`، یا ادمین.
- حذف: نقش‌های `session_manager`/`teacher`/`session_supporter` درون جلسه، M-13، M-16، H-68، و «هم‌مدیر». H-74 ⇒ **تغییر استاد صاحب** (`PUT /system/sessions/{id}/owner`).

## ۳. ارزیابی پویا
- high: `evaluation_criteria(id, key UNIQUE, title, description, weight 1..100, max_score 1..100, active, sort_order, created_at, updated_at)` + نسخه؛ seed: صوت (۴۰، ۱۰)، لحن (۳۰، ۱۰)، تجوید (۳۰، ۱۰). حداقل یک معیار فعال؛ حداکثر ۱۵. تغییر ⇒ رویداد `evaluation.criteria.changed` به mid.
- ثبت ارزیابی: `scores: [{criterionId, score}]` برای همهٔ معیارهای فعال (نمره ≤ max_score)؛ ذخیرهٔ snapshot (key, title, weight, maxScore, score). امتیاز ۰..۱۰۰ = Σ(score/max×weight)/Σweight×۱۰۰؛ points = round(score/10).
- `evalWeights` از تنظیمات حذف می‌شود؛ ارزیابی‌های قدیمی با snapshot سه معیار مهاجرت می‌کنند.

## ۴. گالری
- `galleries(id, session_id, occurrence_id, title, kind ENUM('image','audio'), visibility ENUM('public','members','staff'), sort_order, created_by, created_at, deleted_at)`.
- `gallery_items(id, gallery_id, mime, bytes, sha256, width NULL, height NULL, duration_sec NULL, title, storage_key, uploaded_by, created_at, deleted_at)`.
- مدیریت: صاحب، پشتیبانِ `gallery.manage`، ادمین (`system.content.moderate` یا `system.sessions.manage`).
- دیدن: public ⇒ هر کس با `gallery.view` (شامل مهمان)؛ members ⇒ اعضای تأییدشده + کادر؛ staff ⇒ صاحب/پشتیبان/ادمین. جلسهٔ unlisted: گالری public فقط با شناسهٔ مستقیم.
- بارگذاری: بدنهٔ **خام** (نه JSON) با Content-Type: تصویر `image/jpeg|png|webp` ≤ ۵MB؛ صوت `audio/mpeg|mp4|ogg|webm|aac` ≤ ۵۰MB؛ بررسی magic bytes؛ JPEG: حذف بخش‌های APP1/EXIF (حریم موقعیت)؛ stream به فایل موقت ⇒ rename اتمیک؛ هرگز کل فایل در حافظه نه. سهمیهٔ per جلسه `MEDIA_SESSION_QUOTA_MB` (پیش‌فرض ۲۰۴۸).
- **دسترسی مرورگر به محتوا (URL امضاشده):** مرورگر برای `<img>`/`<audio>` هدر Authorization نمی‌فرستد؛ پس هر `GalleryItem` فیلد `url` دارد: مسیر نسبی M-77 (در mid) یا H-117 (در high) با query `exp` (epoch ثانیه، now+600)، `u` (userId) و `sig` = base64url(HMAC-SHA256(`MEDIA_URL_SECRET`, `METHOD|path|exp|u`)). auth این دو endpoint = `bearerOrSignedUrl`: Bearer معتبر، **یا** امضای معتبرِ منقضی‌نشده (مقایسهٔ timing-safe)؛ سپس دسترسی کاربر `u` (عضویت/سطح نمایش/permission) **دوباره** بررسی می‌شود — امضا فقط جایگزین احراز است، نه مجوز. امضای نامعتبر/منقضی ⇒ 401 `AUTH_REQUIRED`. `Cache-Control: private` و `Referrer-Policy: no-referrer` روی پاسخ. env: `MEDIA_URL_SECRET` (mid و high جدا؛ ≥ ۳۲ بایت تصادفی؛ نبود در production ⇒ fail-fast).
- ذخیره: `MEDIA_DIR/{sessionId}/{galleryId}/{itemId}` (بیرون از پوشهٔ اپ؛ در production الزامی؛ نبود ⇒ endpointهای بارگذاری 503 و لاگ هشدار). حذف نرم + پاک‌سازی فایل با job.
- سرو: endpoint محتوا با بررسی دسترسی، `Range` (۲۰۶) برای صوت، ETag=sha256، `Cache-Control: private, max-age=3600` (public گالری عمومی: `public, max-age=86400`)، `X-Content-Type-Options: nosniff`، `Content-Disposition: inline`.

## ۵. کامنت
- تنظیم جلسه (SessionInput): `commentsEnabled` (پیش‌فرض true)، `commentVisibility` `public`|`reciter_only` (پیش‌فرض public).
- `comments(id, session_id, occurrence_id, queue_item_id NULL, reciter_id NULL, author_id, body ≤500, at_sec NULL, hidden, created_at, deleted_at)`.
- ثبت: عضو تأییدشده یا کادر با `comment.post`؛ با `queueItemId` فقط وقتی آن آیتم `current` است (حین تلاوت) — سرور `at_sec` = ثانیه از شروع تلاوت (queue_items.started_at) را خودش حساب می‌کند. بدون queueItemId = کامنت عمومی نوبت. نوبت بسته ⇒ فقط کادر.
- دیدن: `public` ⇒ همهٔ کسانی که جلسه را می‌بینند؛ `reciter_only` ⇒ کامنت تلاوت فقط برای نویسنده، خواننده و کادر؛ کامنت عمومی نوبت برای اعضا و کادر.
- مدیریت: نویسنده حذف می‌کند؛ کادر با `comment.moderate` پنهان/حذف. سقف ۳۰ کامنت/دقیقه per کاربر.
- realtime `comment.created` فقط به سوکت‌هایی که اجازهٔ دیدن دارند (اتاق شخصی `u:{id}` برای reciter_only).

## ۶. فهرست endpointهای ۱.۷.۰
### mid (`/o/v1`)
| id | متد | مسیر | کار | مجوز |
|---|---|---|---|---|
| M-45 | GET | `/evaluation-criteria` | معیارهای فعال فعلی | ورود |
| M-60 | GET | `/me/supporters` | پشتیبان‌های ثابت من (استاد) | `supporter.manage_own` |
| M-61 | POST | `/me/supporters` | افزودن پشتیبان ثابت (userId/phone + permissions) | `supporter.manage_own` |
| M-62 | PATCH | `/me/supporters/{userId}` | تغییر مجوزهای پشتیبان ثابت | `supporter.manage_own` |
| M-63 | DELETE | `/me/supporters/{userId}` | حذف پشتیبان ثابت | `supporter.manage_own` |
| M-64 | GET | `/sessions/{id}/supporters` | پشتیبان‌های مؤثر جلسه (منبع: session/teacher) | صاحب یا پشتیبان |
| M-65 | POST | `/sessions/{id}/supporters` | افزودن پشتیبان per جلسه | صاحب |
| M-66 | PATCH | `/sessions/{id}/supporters/{userId}` | تغییر مجوزها | صاحب |
| M-67 | DELETE | `/sessions/{id}/supporters/{userId}` | حذف | صاحب |
| M-68 | GET | `/session-permissions` | فهرست مجوزهای قابل‌واگذاری (عنوان فارسی) | ورود |
| M-70 | GET | `/sessions/{id}/occurrences/{occurrenceId}/galleries` | گالری‌های یک نوبت (فیلترشده با دسترسی) | دیدن جلسه |
| M-71 | POST | `/sessions/{id}/occurrences/{occurrenceId}/galleries` | ساخت گالری | `gallery.manage` |
| M-72 | PATCH | `/sessions/{id}/galleries/{galleryId}` | ویرایش عنوان/نمایش/ترتیب | `gallery.manage` |
| M-73 | DELETE | `/sessions/{id}/galleries/{galleryId}` | حذف گالری | `gallery.manage` |
| M-74 | GET | `/sessions/{id}/galleries/{galleryId}/items` | آیتم‌ها | دیدن گالری |
| M-75 | POST | `/sessions/{id}/galleries/{galleryId}/items` | بارگذاری (بدنهٔ خام؛ `?title=`) | `gallery.manage` |
| M-76 | DELETE | `/sessions/{id}/galleries/{galleryId}/items/{itemId}` | حذف آیتم | `gallery.manage` |
| M-77 | GET | `/sessions/{id}/galleries/{galleryId}/items/{itemId}/content` | محتوای فایل (Range) | دیدن گالری |
| M-78 | GET | `/public/sessions/{id}/galleries` | گالری‌های public (مهمان؛ با `occurrenceId` اختیاری) | `gallery.view` (guest) |
| M-79 | GET | `/public/galleries/{galleryId}/items/{itemId}/content` | محتوای گالری public | `gallery.view` |
| M-80 | GET | `/sessions/{id}/occurrences/{occurrenceId}/comments` | کامنت‌ها (`queueItemId?`، صفحه‌بندی) | دیدن جلسه |
| M-81 | POST | `/sessions/{id}/occurrences/{occurrenceId}/comments` | ثبت کامنت | `comment.post` |
| M-82 | DELETE | `/sessions/{id}/comments/{commentId}` | حذف (نویسنده/کادر) | — |
| M-83 | PATCH | `/sessions/{id}/comments/{commentId}` | پنهان/آشکار | `comment.moderate` |
تغییر: M-14 فقط عضو (بدون roles)؛ M-11/M-15 با `membership.manage`؛ حذف M-13 و M-16؛ M-40 بدنهٔ `scores[]`؛ `SessionInput` + `commentsEnabled`، `commentVisibility`؛ `SessionMe.permissions` با مجوزهای تازه؛ `SessionRole` = `owner|supporter|member`.

### high (`/s/v1`)
| id | متد | مسیر | کار | مجوز |
|---|---|---|---|---|
| H-100 | GET | `/system/evaluation-criteria` | همهٔ معیارها | `system.evaluation.manage` یا `system.sessions.view` |
| H-101 | POST | `/system/evaluation-criteria` | ساخت | `system.evaluation.manage` |
| H-102 | PATCH | `/system/evaluation-criteria/{id}` | ویرایش | `system.evaluation.manage` |
| H-103 | DELETE | `/system/evaluation-criteria/{id}` | حذف (استفاده‌شده ⇒ فقط غیرفعال) | `system.evaluation.manage` |
| H-104 | GET | `/system/users/{id}/supporters` | پشتیبان‌های ثابت یک استاد | `system.sessions.view` |
| H-105 | PUT | `/system/users/{id}/supporters/{supporterId}` | افزودن/تغییر پشتیبان ثابت | `system.sessions.manage` |
| H-106 | DELETE | `/system/users/{id}/supporters/{supporterId}` | حذف | `system.sessions.manage` |
| H-107 | GET | `/system/sessions/{id}/supporters` | پشتیبان‌های مؤثر جلسه | `system.sessions.view` |
| H-108 | PUT | `/system/sessions/{id}/supporters/{userId}` | افزودن/تغییر پشتیبان per جلسه | `system.sessions.manage` |
| H-109 | DELETE | `/system/sessions/{id}/supporters/{userId}` | حذف | `system.sessions.manage` |
| H-110 | GET | `/system/sessions/{id}/galleries` | گالری‌ها (`occurrenceId?`) | `system.sessions.view` |
| H-111 | POST | `/system/sessions/{id}/galleries` | ساخت (با occurrenceId) | `system.content.moderate` |
| H-112 | PATCH | `/system/sessions/{id}/galleries/{galleryId}` | ویرایش | `system.content.moderate` |
| H-113 | DELETE | `/system/sessions/{id}/galleries/{galleryId}` | حذف | `system.content.moderate` |
| H-114 | GET | `/system/sessions/{id}/galleries/{galleryId}/items` | آیتم‌ها | `system.sessions.view` |
| H-115 | POST | `/system/sessions/{id}/galleries/{galleryId}/items` | بارگذاری (stream به mid) | `system.content.moderate` |
| H-116 | DELETE | `/system/sessions/{id}/galleries/{galleryId}/items/{itemId}` | حذف آیتم | `system.content.moderate` |
| H-117 | GET | `/system/sessions/{id}/galleries/{galleryId}/items/{itemId}/content` | محتوا (stream از mid) | `system.sessions.view` |
| H-118 | GET | `/system/sessions/{id}/comments` | کامنت‌ها (`occurrenceId?`, `queueItemId?`, `authorId?`) | `system.sessions.view` |
| H-119 | PATCH | `/system/sessions/{id}/comments/{commentId}` | پنهان/آشکار | `system.content.moderate` |
| H-120 | DELETE | `/system/sessions/{id}/comments/{commentId}` | حذف | `system.content.moderate` |
تغییر: H-10/H-13/H-14/H-92 نقش با `tier` و فیلتر `tier`؛ H-11/H-88 ماژول با `tier`؛ H-74 ⇒ `PUT /system/sessions/{id}/owner`؛ حذف H-68؛ H-73 فقط عضو؛ H-48 ⇒ کاتالوگ مجوزهای قابل‌واگذاری؛ H-96 بدنهٔ `scores[]`؛ تنظیمات بدون `evalWeights`/`badgeThresholds`؛ H-00/H-94 شامل tier‌ها.

### low (`/c/v1`)
- L-30/L-31: نیازمند `session.browse` مؤثر (guest/student baseline از `tier.baseline.changed`).
- L-32: + `tiers` خلاصه؟ — نه؛ بدون تغییر.

## ۷. مهاجرت داده و ترتیب استقرار
- high: tier روی نقش/ماژول، نقش‌های ثابت mid/low، ماژول/مجوزهای تازه، معیارها (seed سه معیار)، رویدادهای baseline و criteria؛ به سازندگان فعلی جلسه نقش `teacher` اعطا شود (فهرست از MID_ADMIN).
- mid: owner_id، پشتیبان‌ها از نقش‌های قبلی، حذف جدول نقش‌های جلسه، snapshot معیار برای ارزیابی‌های قدیمی، جدول‌های گالری/کامنت، `queue_items.started_at`.
- low: کش baseline، اعمال `session.browse`.
- ترتیب: low ← mid ← high. env تازه: **`MEDIA_DIR`** (mid؛ مسیر مطلق بیرون از پوشهٔ اپ، مثل `/home/<user>/isra-media`)، اختیاری `MEDIA_SESSION_QUOTA_MB`؛ **`MEDIA_URL_SECRET`** (mid و high، هر کدام مقدار تصادفی جدا ≥ ۳۲ بایت). سقف حجم بدنهٔ وب‌سرور (LiteSpeed) برای مسیر بارگذاری ≥ ۵۰MB.

## ۸. تست‌های الزامی
- صاحب همه‌کاره؛ پشتیبان فقط با مجوز داده‌شده (ثابت و per جلسه، اجتماع)؛ غیرعضو/عضو عادی ممنوع؛ ادمین همه‌کاره.
- مهاجرت نقش‌های قدیمی (مدیر ⇒ owner، معلم ⇒ پشتیبان با eval.submit).
- ارزیابی با معیارهای پویا (کم/زیاد نمره، معیار غیرفعال، snapshot)، تغییر معیار روی ارزیابی‌های قبلی اثر ندارد.
- گالری: سطح‌های نمایش، مهمان فقط public، نوع جعلی، حجم زیاد، EXIF حذف، Range ۲۰۶، سهمیه.
- کامنت: حین تلاوت فقط روی آیتم current، at_sec سرور، reciter_only (خواننده/نویسنده/کادر می‌بینند، دیگران نه)، پنهان‌کردن، سقف.
- tier: مدیریت نقش‌های low/mid با مجوزهای تازه، ضد ارتقا، baseline مهمان روی L-30.
