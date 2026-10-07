# ۳۰ — تکمیل عملیات جلسه، امتیاز/نشان پویا، پیام همگانی و سخت‌سازی (api-types ۱.۶.۰)

> وضعیت: **قفل مالک ۱۴۰۵/۰۷/۱۵**. منبع حقیقت قرارداد: `packages/api-types` (۱.۶.۰؛ CHANGELOG). این سند قواعد رفتاری، مدل داده و تقسیم کار را قفل می‌کند.
> ترتیب اولویت: `00-locks.md` > این سند > بقیه.

## ۰. تصمیم‌های مالک (۱۴۰۵/۰۷/۱۵)
| # | تصمیم |
|---|---|
| D1 | **android-low مستقیم به mid**: برای کشف/عضویت/ترک/دعوت/حضور/صف/دیدن ارزیابی و امتیاز (`/o/v1` و Socket.IO). قفل #8 به‌روز شد. |
| D2 | **افزودن با شماره**: ادمین بدون محدودیت (از دایرکتوری high)؛ مدیر جلسه برای جلسهٔ خودش با سقف durable per actor: **۲۰/دقیقه و ۱۰۰/روز**؛ پشتیبان فقط قرآن‌آموز. |
| D3 | **جلسهٔ تکرارشونده = نوبت‌های برگزاری (occurrence)**؛ حضور، صف و ارزیابی per نوبت؛ +۵ یک‌بار per نوبت. |
| D4 | **امتیاز می‌تواند کم شود** (لغو حضور، باطل/ویرایش ارزیابی، اصلاح دستی ادمین) با ثبت در دفتر؛ کف ۰. **نشان‌ها پس گرفته می‌شوند** وقتی امتیاز زیر آستانه برود. |
| D5 | **نشان‌ها پویا**: عنوان، توضیح، تصویر، امتیاز لازم، فعال/غیرفعال، ترتیب؛ مدیریت توسط developer/دارندهٔ `system.badges.manage`. |
| D6 | نمای ادمین صف/حضور/ارزیابی دیگر فقط‌خواندنی نیست (26 به‌روز شد). |

## ۱. mid — مدل دادهٔ تازه

### ۱.۱ نوبت برگزاری (occurrence) — D3
```
session_occurrences(
  id BINARY(16) PK, session_id BINARY(16), seq INT, status ENUM('live','closed'),
  opened_at DATETIME(3), closed_at DATETIME(3) NULL, opened_by BINARY(16) NULL, closed_by BINARY(16) NULL,
  UNIQUE(session_id, seq), KEY(session_id, status), KEY(opened_at)
)
```
- حداکثر **یک نوبت live** per جلسه (قفل ردیف جلسه + بررسی).
- جلسهٔ `once`: `scheduled→started` نوبت #۱ را خودکار باز؛ `started→ended` آن را می‌بندد (سازگار با رفتار قبلی).
- جلسهٔ `recurring/range`: `started` = «دوره در جریان»؛ کادر با `occurrence.manage` نوبت را باز (M-09) و می‌بندد (M-19). `ended` جلسه هر نوبت باز را می‌بندد.
- بستن نوبت: صف آن نوبت ⇒ `current→done`، `waiting` حذف (یا cancelled)؛ رویداد `occurrence.updated` + `queue.updated`.
- `attendance_entries`، `queue_items`، `evaluations` ستون `occurrence_id BINARY(16) NOT NULL` می‌گیرند. یکتایی حضور: `UNIQUE(occurrence_id, user_id)` (جایگزین (session_id,user_id)). کلید فعال صف per (occurrence,user).
- **مهاجرت داده**: برای هر جلسه‌ای که حضور/صف/ارزیابی دارد نوبت seq=1 بساز (live اگر جلسه started، وگرنه closed) و occurrence_id را backfill کن؛ سپس NOT NULL و یکتایی‌ها. `down()` معکوس‌پذیر (برگشت به یکتایی قدیم فقط اگر داده اجازه دهد؛ وگرنه خطای صریح).
- حضور/صف/ارزیابی **نوشتن** فقط روی نوبت live (وگرنه `CONFLICT/OCCURRENCE_CLOSED`)؛ **استثنا**: ادمین (MID_ADMIN) حضور را روی نوبت بسته هم ثبت/لغو می‌کند (اصلاح).
- خواندن‌ها (`M-21`، `M-32`، `M-41`، roster) پارامتر `occurrenceId` اختیاری؛ پیش‌فرض: نوبت live وگرنه آخرین نوبت؛ نبود نوبت ⇒ لیست خالی با `occurrenceId:null`.
- `SessionMe.occurrence` و `AdminSession.counts.occurrences`.

### ۱.۲ امتیاز و دفتر — D4
- `point_ledger.points` **امضادار** (INT)؛ دلایل: `attendance | evaluation | attendance_reversal | evaluation_adjust | evaluation_void | admin_adjust`؛ ستون‌های `session_id NULL`، `note VARCHAR(200) NULL`، `actor_id NULL`.
- `user_points.total` = max(0, مجموع)؛ هر تغییر در **همان تراکنش** نوشتن دفتر (قفل ردیف user_points `FOR UPDATE`). اگر کسر از total بیشتر باشد، فقط تا ۰ کسر می‌شود و مقدار واقعی کسرشده در دفتر ثبت می‌شود.
- **ref قطعی** برای جلوگیری از دوباره‌گرفتن +۵: ref حضور = UUIDv5(`attendance:{occurrenceId}:{userId}`)؛ یکتایی دفتر `(user_id, reason, ref_id)` برای مثبت‌ها؛ لغو حضور ⇒ ردیف `attendance_reversal` با همان ref؛ ثبت دوباره پس از لغو ⇒ ref جدید `attendance:{occ}:{user}:{n}` (n = شمارهٔ دفعه) تا +۵ فقط وقتی حضور واقعاً «فعال» است اعطا شود (خالص هرگز بیش از +۵ per نوبت).
- ارزیابی: ویرایش ⇒ `evaluation_adjust` با تفاضل؛ باطل ⇒ `evaluation_void` با منفیِ امتیاز فعلی؛ ارزیابی باطل در فهرست‌ها پیش‌فرض نمی‌آید (`includeVoid=true` برای کادر/ادمین).
- پس از هر تغییر total: **بازمحاسبهٔ نشان‌های همان کاربر** (۱.۳) و رویداد `points.changed {userId,total}` به low (باطل‌کردن کش L-21/L-23).
- ویرایش ارزیابی (M-43) فقط ارزیاب اصلی و تا ۲۴ ساعت پس از ثبت؛ باطل (M-44) ارزیاب اصلی یا مدیر جلسه؛ هر دو هر زمان برای ادمین.

### ۱.۳ نشان پویا (مصرف‌کننده) — D4/D5
- mid جدول `badges_catalog(id, key, title, description, threshold, active, sort_order, image_hash, version)` را از رویداد `badge.catalog.changed` (high ⇒ mid) **کامل جایگزین** می‌کند (فقط اگر version بزرگ‌تر).
- `badge_awards(user_id, badge_id, awarded_at, PRIMARY(user_id,badge_id))`.
- قاعده: نشان فعال با `threshold ≤ total` ⇒ باید اعطا شده باشد؛ نشانی که فعال نیست یا `threshold > total` ⇒ حذف (پس‌گیری). اعطای تازه ⇒ inbox `system` «نشان X را گرفتی»؛ پس‌گیری ⇒ inbox `system` «نشان X از دست رفت» (هر دو در رویداد دسته‌ای `inbox.messages.created`).
- تغییر کاتالوگ ⇒ job پس‌زمینه بازمحاسبهٔ همه (keyset روی user_points.user_id، دسته‌های ۵۰۰، idempotent با version). در بازمحاسبهٔ ناشی از تغییر کاتالوگ **هیچ inbox ارسال نمی‌شود** (جلوگیری از هزاران پیام)؛ inbox فقط برای اعطا/پس‌گیری ناشی از تغییر امتیاز خودِ کاربر.
- مهاجرت: ۴ نشان قدیمی (`badge_50/150/300/500` با آستانه‌های فعلی تنظیمات) در high seed می‌شوند و high بلافاصله رویداد کاتالوگ را منتشر می‌کند؛ mid تا رسیدن کاتالوگ از آستانه‌های قدیمی fallback می‌کند.
- `PointsSummary.badges` = همهٔ نشان‌های فعال (مرتب بر اساس sortOrder سپس threshold) با `awardedAt|null` و `image:{hash}|null`.

### ۱.۴ عضویت — D2
- ستون‌های تازهٔ `session_members`: `source VARCHAR(10) NOT NULL DEFAULT 'request'` (`request|staff|admin|invite|open`)، `added_by BINARY(16) NULL`.
- ستون‌های تازهٔ `sessions`: `join_policy`، `visibility`، `capacity SMALLINT UNSIGNED NULL`؛ ایندکس `(visibility, status, next_starts_at)`.
- `user_directory` mid: + `status VARCHAR(10) NOT NULL DEFAULT 'active'`؛ `user.registered` نام را هم ذخیره کند؛ `user.status.changed` همهٔ وضعیت‌ها؛ کاربر deleted ⇒ آیتم‌های صف فعالش حذف.
- **افزودن (M-14 کادر / MID_ADMIN.membersAdd ادمین)**: نبود عضویت ⇒ insert approved؛ pending/rejected ⇒ approved + نقش‌ها؛ approved ⇒ طبق onExisting (`skip`=unchanged، `merge`=اجتماع، `replace`=جایگزین با حفظ مدیر — فقط ادمین)؛ کاربر غیرفعال/حذف‌شده یا نبودن در دایرکتوری ⇒ `not_active`/`not_found`؛ ظرفیت ⇒ `full`؛ جلسهٔ ended ⇒ `CONFLICT/SESSION_LOCKED` (کادر) — ادمین مجاز. همه در **یک تراکنش با insert چندردیفی** (نه حلقهٔ per آیتم). ادمین برای userId ناموجود در دایرکتوری mid با نام ارسالی ردیف موقت می‌سازد.
- resolve شماره در mid: `POST {low}/c/internal/v1/users/resolve` **قبل از** تراکنش (هرگز HTTP داخل تراکنش)؛ شماره هرگز لاگ/ذخیره نشود؛ سقف durable per actor (D2) با RateLimitService durable؛ تجاوز ⇒ `RATE_LIMITED`.
- **حذف (M-15)**، **ترک (M-17)**: صف فعال (waiting/current) حذف؛ حضور/ارزیابی/دفتر می‌ماند؛ آخرین مدیر ⇒ `LAST_HOLDER`؛ socketهای آن کاربر از اتاق جلسه خارج شوند.
- **مدیر (M-16 / H-74 / H-68)**: همیشه ≥ ۱ مدیر approved؛ سلب آخرین ⇒ `LAST_HOLDER`. M-13 روی عضو مدیر: مدیر حفظ + نقش‌های داده‌شده (مدیر+معلم مجاز؛ قفل #15). مدیر می‌تواند به خودش نقش معلم/پشتیبان بدهد (قفل #15 اجتماع را مجاز می‌داند).
- **ردشده (M-10/M-12)**: M-12 approve روی rejected مجاز؛ M-10 روی rejected پس از ۷ روز ⇒ pending؛ پیش از آن `REQUEST_COOLDOWN` با `retryAfterSec`.
- **joinPolicy**: open ⇒ M-10 فوراً approved (source=open)؛ invite_only ⇒ `JOIN_CLOSED`؛ ظرفیت در M-10(open)/M-12/M-14/M-53 زیر قفل ردیف جلسه.
- **visibility=unlisted**: در L-30/M-06/جست‌وجو نمی‌آید؛ با شناسهٔ مستقیم (L-31/M-02) دیده می‌شود.
- **دعوت (M-50..M-53)**: `session_invites(id, session_id, code_hash BINARY(32) UNIQUE, roles VARCHAR(80), max_uses INT NULL, uses INT DEFAULT 0, expires_at, created_by, created_at, revoked_at NULL, KEY(session_id, created_at))`؛ کد = ۱۶ بایت تصادفی base64url (۲۲ نویسه)؛ فقط SHA-256 ذخیره؛ مصرف اتمیک `UPDATE … SET uses=uses+1 WHERE … AND (max_uses IS NULL OR uses<max_uses) AND revoked_at IS NULL AND expires_at>now`؛ حداکثر ۲۰ دعوت فعال per جلسه (`LIMIT_REACHED`).
- **اعلان inbox** (رویداد دسته‌ای `inbox.messages.created` به low): افزوده‌شدن/تأیید (`membership`)، تغییر نقش (`session`: «نقش شما در جلسه X: معلم»)، حذف از جلسه (`session`)، مدیر شدن (`session`)، درخواست تازه برای کادر دارای membership.approve (`membership`)، تغییر زمان/مکان یا حذف جلسه برای اعضا (`session`). ref = `session:{id}`.

### ۱.۵ realtime
- رویدادهای تازه (سیگنال؛ داده از REST): `members.updated`، `session.updated`، `occurrence.updated`.
- اخراج: پس از حذف/رد/ترک/حذف جلسه، `socketsLeave` برای سوکت‌های آن کاربر در اتاق جلسه.
- `queue.turned` به غیرکادر userId نفرستد (حریم D4).

### ۱.۶ android-low — D1
- mid کلاینت `android-low` را برای این endpointها می‌پذیرد: M-00، M-01، M-02، M-06، M-10، M-17، M-20، M-30، M-31، M-32، M-41، M-42، M-46، M-53 و Socket.IO. بقیه برای android-low ⇒ `AUTH_FORBIDDEN` (ساخت/مدیریت جلسه فقط android-mid/web-main/high).

### ۱.۷ اصلاحات کارایی/امنیت mid (از ممیزی)
- ایندکس‌ها: `attendance_entries(user_id, entered_at)`، `attendance_entries(entered_at)`، `evaluations(created_at)`، `point_ledger(created_at)`، `sessions(updated_at)`، `user_points(total, updated_at)`.
- فهرست عمومی: کلید مرتب‌سازی ذخیره‌شده (`sort_rank`, `sort_at`) + ایندکس + keyset/OFFSET محدود؛ حذف `ORDER BY FIELD(...)`.
- `refreshSnapshots` دسته‌ای؛ نقش‌ها insert چندردیفی؛ نشان‌ها فقط وقتی آستانه عبور شد.
- لیست‌های ادمین حضور/ارزیابی صفحه‌بندی واقعی (بدون LIMIT 1000 و total درست).
- M-34/M-31 فقط در نوبت live؛ ارزیابی: ارزیابی‌شونده هنوز approved باشد.
- `creatorId` در MID_ADMIN.sessions: کاربر باید در دایرکتوری و active باشد (`NOT_FOUND`/`CONFLICT USER_NOT_ACTIVE`).
- outbox: ارسال رویداد per مقصد (فقط به سرویس‌هایی که آن نوع را می‌پذیرند)، بیرون از تراکنش قفل.

## ۲. low
- **LOW_INTERNAL.resolveUsers** (`@InternalCallers('mid','high')`): بدنه `{phones≤50}`؛ فقط کاربران موجود؛ لاگ فقط تعداد؛ سقف per caller ۶۰۰/دقیقه.
- **LOW_ADMIN.usersBulk** (high): ساخت گروهی در یک تراکنش (موجود ⇒ exists)؛ user.registered per کاربر جدید.
- **LOW_ADMIN.logoutAll** بدنهٔ اختیاری `exceptSessionId`.
- **رویدادهای ورودی تازه**: `inbox.messages.created` (از mid و high): insert چندردیفی `INSERT IGNORE … SELECT … WHERE status='active'` با `source_event_id = eventId:index`؛ `inbox.broadcast.created` (فقط high): ذخیره در `inbox_broadcasts` و تحویل با job (۲۰۰۰تایی، cursor پایدار، `UNIQUE(broadcast_id,user_id)` روی inbox_messages)؛ `badge.catalog.changed` (از high): ذخیرهٔ کاتالوگ برای L-33 و badgesVersion در L-32؛ `points.changed` (از mid): باطل‌کردن کش؛ `system.permission.changed` (از high): **پذیرش no-op** (رفع retry بی‌پایان).
- **رویداد ناسالم**: خطای zod در payload ⇒ ذخیره در dead-letter و پاسخ 202 (نه 4xx که تولیدکننده را تا ابد retry کند).
- **L-22 حذف حساب**: هستهٔ مشترک با حذف ادمین (soft-delete + ناشناس‌سازی + revoke + `user.status.changed` با `source:'self'`)؛ دارندهٔ نقش سیستمی (user_claims.system_roles غیرخالی) ⇒ `CONFLICT/SYSTEM_PROTECTED`.
- **L-23** proxy به `MID_FOR_LOW.pointsLedger`؛ **L-28** حذف پیام خودم (۴۰۴ اگر مال کاربر نیست)؛ **L-32** از settings_cache و کاتالوگ؛ **L-33** فهرست فعال‌ها مرتب؛ **L-34** تصویر: از `HIGH_INTERNAL.badgeImage` با کش حافظه (LRU per hash)، magic-byte دوباره، `Content-Type` دقیق، `nosniff`، `v`=hash ⇒ immutable.
- **InboxKind** تازه؛ اعتبارسنجی `ref` با الگوی قرارداد در مرز ورودی.
- **گزارش OTP**: `otp_challenges.send_failed_at`؛ verified = consumed و نه send_failed؛ فیلد `failed` (افزودنی در LowAdminOtpSeries).
- **امنیت**: ثبت‌نام بسته ⇒ L-01 برای شمارهٔ ناشناس پیامک نفرستد ولی پاسخ یکسان بدهد؛ cooldown OTP اتمیک (شمارندهٔ durable)؛ کنسول SMS فقط development؛ TTL پیش‌فرض access ۲۰ دقیقه / refresh ۳۰ روز (قفل #9)؛ L-15 روی نشست revoke‌شدهٔ خودم idempotent؛ outbox per مقصد (شمارهٔ کامل فقط به high)؛ عدم ارسال phone به mid.
- **کارایی**: outbox: claim کوتاه + ارسال بیرون تراکنش + UPDATE دسته‌ای + وضعیت per مقصد؛ ایندکس‌ها/LIMIT در maintenance (`refresh_tokens.expires_at`، `rotated_at`، `inbox_events.received_at`، rate_limit `window_start`)؛ هرس refresh_tokens چرخیده >۷ روز؛ ایندکس inbox `(user_id, read_at, created_at, id)`؛ MidClient کش LRU per namespace + pageSize مجاز محدود + negative-cache برای L-31 404 + breaker per مسیر؛ session-status cache LRU؛ ادغام کوئری‌های claims/mcp در refresh.
- **web-main** (حداقلی، همین کارstream): نوع‌های `PointsSummary` پویا (نمایش عنوان/تصویر از L-34) و InboxKind تازه را بپذیرد؛ build سبز.

## ۳. high
- **H-73** (افزودن): resolve شماره از دایرکتوری high (یک `WHERE phone IN (…)`)؛ createMissing ⇒ نیازمند `system.users.manage` + `LOW_ADMIN.usersBulk` سپس یک فراخوانی `MID_ADMIN.membersAdd` (Idempotency-Key به mid هم فرستاده شود تا retry دوباره نسازد). audit `session.members_add` (userIds و نقش‌ها؛ **بدون شماره**).
- **H-74/H-68/H-53/H-75..H-79/H-95/H-96/H-52/H-97/H-98** ⇒ مسیرهای MID_ADMIN متناظر؛ خطای 4xx mid همان کد/reason؛ 5xx/شبکه ⇒ 503. audit با نام‌های: `session.manager_transfer`، `session.member_roles`، `session.members_decide`، `session.attendance_add`، `session.attendance_revoke`، `session.queue_next`، `session.queue_act`، `session.evaluation_void`، `session.evaluation_patch`، `points.adjust`.
- **نشان‌ها (H-32..H-37)**: جدول `badges(id, key UNIQUE, title, description, threshold, active, sort_order, image MEDIUMBLOB NULL, image_type, image_hash CHAR(64), image_w, image_h, created_at, updated_at)` + `badge_catalog_meta(version)`. تصویر: base64 ⇒ بایت؛ ≤ ۲۰۰KB؛ **magic bytes** PNG/WebP/JPEG (نوع اعلامی باید با واقعی بخواند وگرنه `UNSUPPORTED_MEDIA_TYPE`)؛ ابعاد از هدر (PNG IHDR / JPEG SOF / WebP VP8/VP8L/VP8X) ≤ ۱۰۲۴؛ hash = sha256 hex. body limit فقط برای H-36: ۳۰۰KB. هر تغییر ⇒ version+1 و رویداد `badge.catalog.changed` (outbox ⇒ mid, low). `HIGH_INTERNAL.badgeImage` (ACL low) بایت خام + Content-Type. حداکثر ۵۰ نشان. `holders` از `MID_ADMIN.badgeHolders` (شمارش per badge_id در mid؛ timeout کوتاه؛ خطا ⇒ ۰ و لاگ).
- **پیام همگانی (H-41/H-42/H-46)**: جدول `announcements(id, audience JSON, title, body, ref, status, recipients, created_by, created_at)`؛ all/users/role ⇒ رویداد `inbox.broadcast.created` به low؛ session ⇒ `MID_ADMIN.notify` (mid رویداد دسته‌ای می‌سازد). آمار (H-46) از `LOW_ADMIN.broadcast`. سقف: ۱۰/ساعت per کاربر؛ audience=all حداکثر ۲/ساعت.
- **خروجی CSV (H-43..H-45)**: stream با keyset؛ BOM؛ خنثی‌سازی فرمول (`=+-@\t\r` ⇒ پیشوند `'`)؛ Content-Disposition attachment با نام لاتین؛ مجوز دوم (view منبع) در سرویس بررسی شود؛ شماره در خروجی کاربران **کامل** (ادمین مجاز) ولی audit `export.*` با تعداد ردیف و فیلترها.
- **H-48**: از `SESSION_ROLE_PERMISSIONS` در api-types + عنوان‌های فارسی.
- **مجوزهای سیستمی تازه (seed، قفل برای developer، پیش‌فرض بدون super_admin)**:
  | مجوز | ماژول | step-up پیش‌فرض |
  |---|---|---|
  | `system.sessions.moderate` | sessions_admin | none |
  | `system.points.manage` | gamification (تازه) | required |
  | `system.badges.manage` | gamification | required |
  | `system.inbox.send` | messaging (تازه) | required |
  | `system.data.export` | exports (تازه) | required |
- **اصلاحات امنیتی (از ممیزی)**:
  1. **ضد تصاحب حساب**: H-25/H-26/H-27/H-28/H-29/H-51 روی کاربری که نقش سیستمی دارد فقط اگر actor همهٔ مجوزهای مؤثر هدف را داشته باشد؛ حساب developer را فقط developer.
  2. E2 روی **برداشتن** نقش‌ها هم (نمی‌توان نقشی را برداشت که مجوزهایش را نداری).
  3. H-62: creatorId باید در دایرکتوری و active باشد.
  4. Idempotency-Key به mid (MID_ADMIN.sessions، membersAdd) و low (usersBulk) پاس داده شود؛ interceptor کلید را روی 5xx/timeout **پاک نکند** اگر ممکن است origin commit کرده باشد (وضعیت `unknown` ⇒ retry همان کلید به origin).
  5. audit: target برای permission/module؛ member_remove با userId؛ session.update با diff فیلدها؛ transition با from.
  6. guard: وضعیت دایرکتوری actor (disabled/deleted ⇒ AUTH_ACCOUNT_DISABLED) در همان کوئری access.
  7. bootstrap developer فقط وقتی هیچ developer فعالی نیست.
  8. seed مجوزها روی ویرایش مالک overwrite نکند (`INSERT IGNORE` به‌جای `ON DUPLICATE KEY UPDATE` برای grantable/step_up).
- **کارایی**: حذف GET اضافهٔ جلسه قبل از نوشتن عضو (برچسب audit از پاسخ mid)؛ H-07 یک فراخوانی (exceptSessionId)؛ memo درون‌پروسه‌ای ۳۰ ثانیه برای H-80؛ ایندکس audit `(actor_id, at)`, `(target_type, target_id, at)`؛ جست‌وجوی شماره پیشوندی وقتی q عددی؛ overview از MidAdminClient مشترک؛ outbox per مقصد.

## ۴. ترتیب استقرار
low ← mid ← high (هر سه مهاجرت خودکار). low باید رویدادهای تازه را بپذیرد پیش از آنکه mid/high بفرستند (outbox retry می‌کند؛ ترتیب فقط تأخیر را کم می‌کند).

## ۵. تست‌های الزامی (e2e روی MariaDB)
- mid: افزودن با نقش (مدیر/پشتیبان/معلم مجاز/ممنوع)؛ شمارهٔ ناشناس/غیرفعال؛ ظرفیت؛ انتقال مدیر و LAST_HOLDER؛ ترک و حذف (صف پاک، امتیاز می‌ماند)؛ cooldown ردشده؛ دعوت (منقضی/تمام/هم‌زمان)؛ نوبت‌ها (once خودکار، recurring باز/بسته، +۵ per نوبت، مسابقهٔ ثبت کادر و خود کاربر ⇒ یک +۵)؛ لغو حضور ⇒ −۵ و ثبت دوباره ⇒ دوباره +۵ ولی خالص ≤ ۵؛ ویرایش/باطل ارزیابی با دفتر؛ کف ۰؛ پس‌گیری نشان؛ تغییر کاتالوگ ⇒ بازمحاسبه؛ android-low مجاز/ممنوع؛ اخراج socket.
- low: resolve (ACL، سقف)، رویدادهای دسته‌ای/همگانی (یکتایی، فقط active، chunk)، dead-letter، L-22 (step-up، SYSTEM_PROTECTED)، L-28، L-32/L-33/L-34 (magic bytes، immutable)، گزارش OTP، permission.changed no-op.
- high: هر endpoint تازه (مجوز، step-up طبق سیاست، 403، audit بدون PII)، ضد تصاحب حساب، E2 روی برداشتن، تصویر نشان (نوع جعلی، بزرگ، SVG)، CSV injection، idempotency پاس‌داده‌شده.
