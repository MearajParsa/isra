# api-mid — سرویس جلسه قرآن (`/o/v1` + Socket.IO)

NestJS 12 + TypeORM + MySQL (`schema_mid`). مسئول: جلسه و چرخهٔ حیات، عضویت و نقش درون‌جلسه، حضور (+۵ یک‌بار)، صف نوبت، ارزیابی وزنی، امتیاز و نشان، realtime.
قرارداد (منبع حقیقت): `packages/api-types` (`ENDPOINTS.mid`: M-00..M-42 + health). مستندات: `docs-v2/18`، `22`، `23`.

## اجرای محلی
پیش‌نیاز: api-low بالا باشد (JWKS برای اعتبارسنجی توکن).
```bash
mysql -uroot -p < services/api-mid/scripts/local-db.sql        # یک‌بار (یا دیتابیس را دستی بسازید)
cp services/api-mid/.env.example services/api-mid/.env.local   # ویندوز: copy
pnpm --filter @isra/api-mid migration:run
pnpm --filter @isra/api-mid dev        # http://localhost:3002 — Swagger: /o/docs
```
**اتصال low ⇄ mid (لوکال):** در `services/api-low/.env.local` خط `INTERNAL_URL_MID=http://127.0.0.1:3002` را اضافه کنید و secret جفت (`INTERNAL_SECRET_*`) در هر دو سرویس **یکی** باشد. ورود فقط با OTP واقعی (api-low) انجام می‌شود؛ توکن همان‌جا گرفته و به mid داده می‌شود.
اجازهٔ ساخت جلسه (`session.create`) از high می‌آید؛ تا ساخته‌شدن api-high در توسعه با رویداد داخلی به low داده می‌شود:
```bash
curl -XPOST http://localhost:3001/c/internal/v1/events -H "content-type: application/json" -H "X-Internal-Caller: low" -H "X-Internal-Token: <INTERNAL_SECRET_LOW>" \
  -d '{"eventId":"grant-1","type":"system.role.changed","occurredAt":"2026-10-02T10:00:00+03:30","payload":{"userId":"<USER_ID>","systemRoles":[],"grants":["session.create"],"permVer":2}}'
```
(بعد کاربر یک‌بار refresh کند یا دوباره وارد شود تا توکن جدید `session.create` را بگیرد.)

## تست
```bash
pnpm --filter @isra/api-mid test       # ۱۴۱ تست؛ نیاز به MySQL (TEST_DB_* ؛ پیش‌فرض schema_mid_test / isra_mid)
```
پوشش: مجوزها و قفل #15 (manager تنها ارزیابی ندارد)، چرخهٔ حیات رو‌به‌جلو، حضور «+۵ فقط یک‌بار» زیر ۴۰ درخواست موازی، صف و حریم خصوصی، ارزیابی وزنی با ذخیرهٔ وزن لحظهٔ ثبت، Idempotency-Key، جعل JWT، rate-limit، انطباق پاسخ‌ها با zod، رویدادهای ورودی/outbox، Socket.IO، migration.

## معماری و تصمیم‌ها
- **auth:** JWT با JWKS سرویس low (RS256 pin، iss/aud/exp) به‌صورت محلی؛ بدون hop به low. نشست revoke‌شده تا انقضای access (≤۱۵ دقیقه) معتبر می‌ماند (قفل).
- **مجوز (۱.۷.۰، docs-v2/31):** مجوزهای سیستمی (`session.create`، `supporter.manage_own`، `comment.post`، `gallery.view`) = claim JWT ∪ baseline `quran_student` (بی‌توکن: baseline `guest`) از رویداد `tier.baseline.changed`. درون‌جلسه فقط از DB: **owner** (`sessions.owner_id`) همهٔ ۹ مجوز `SESSION_DELEGABLE_PERMISSIONS`؛ **supporter** = اجتماع `teacher_supporters` (ثابتِ استاد صاحب) و `session_supporters`؛ **member** هیچ. فقط کلیدهای کاتالوگ ذخیره/پذیرفته می‌شوند (ضد ارتقا)؛ `perms` جعلی در JWT اثری ندارد.
- **ارزیابی:** معیارهای پویا از high (`evaluation.criteria.changed`، کش با version در `settings_cache`)؛ هر ارزیابی snapshot معیارها (`evaluations.criteria`) را نگه می‌دارد.
- **گالری/رسانه:** فایل‌ها در `MEDIA_DIR/{sessionId}/{galleryId}/{itemId}` (stream ⇒ `.tmp` ⇒ rename اتمیک؛ magic bytes؛ حذف APP1/APP13 از JPEG؛ سهمیه per جلسه)؛ محتوا با Range/ETag؛ URL امضاشده (HMAC `MEDIA_URL_SECRET`، ۶۰۰ ثانیه، مقید به کاربر) و بررسی دوبارهٔ دسترسی. حذف نرم + پاک‌سازی فایل با job نگهداری.
- **کامنت:** حین تلاوت (`queue_items.started_at` ⇒ `at_sec` سرور) یا عمومی نوبت؛ `commentVisibility` public/reciter_only (سیگنال realtime reciter_only فقط به اتاق شخصی `u:{id}`).
- **یکتایی در DB:** `attendance(session,user)`، `ledger(reason,ref)`، `evaluations(queue_item)`، `badge(user,key)`، `queue active_key` ⇒ امتیاز/ارزیابی/صف حتی با درخواست موازی دوباره ثبت نمی‌شود. تراکنش‌های رقابتی با retry روی deadlock.
- **صف:** سریال‌سازی با `SELECT … FOR UPDATE` روی ردیف جلسه؛ حریم خصوصی (غیرکادر: فقط جاری/جایگاه خود/تعداد).
- **پرچم‌ها:** `system.settings.changed` (نسخه‌دار)؛ ۱.۷.۰: evalWeights نادیده (⇒ معیار پویا).
- **realtime:** Socket.IO (`/o/v1/socket.io`، `auth:{token}`، `session.join` فقط عضو تأییدشده)؛ رویداد فقط سیگنال است. **محدودیت:** بدون Redis، فقط socketهای همین instance اطلاع می‌گیرند ⇒ برای realtime یک instance (یا sticky)؛ کلاینت بعد از reconnect REST را دوباره می‌خواند.
- **اینباکس:** رویدادهای عضویت/نوبت/ارزیابی/نشان با outbox (`SKIP LOCKED`، backoff) به low می‌روند.
- **نام کاربران:** از `user_directory` که با رویدادهای `user.registered`/`user.profile.updated` از low پر می‌شود (بدون hop).

## قرارداد internal
| جهت | مسیر |
|-----|------|
| low → mid | `GET /o/internal/v1/public/sessions`، `GET /o/internal/v1/public/sessions/{id}`، `GET /o/internal/v1/users/{id}/points`، `GET /o/internal/v1/stats/sessions` (برای high) |
| low/high → mid | `POST /o/internal/v1/events` (low: `user.registered`، `user.profile.updated`، `session.revoked`، `user.phone.changed` (نادیده)، `user.status.changed` (deleted ⇒ نام پاک + «کاربر حذف‌شده»)؛ high: `system.*`، `badge.catalog.changed`، `evaluation.criteria.changed`، `tier.baseline.changed`) |
| high → mid (ادمین) | `MID_ADMIN` زیر `/o/internal/v1/admin/*` (فقط `@InternalCallers('high')`): جلسه (فهرست/جزئیات/ساخت برای creatorId/ویرایش/transition/حذف نرم)، اعضا (فهرست/تصمیم/حذف)، صاحب (`owner`) و `session-owners`، پشتیبان‌ها (ثابت/per جلسه)، گالری (بارگذاری خام stream و محتوا با Range) و کامنت، حضور/صف/ارزیابی (فقط‌خواندنی، نمای کامل)، خلاصهٔ کاربر، گزارش‌ها (overview، سری جلسه‌ها، leaderboard). قواعد: `docs-v2/26-admin-expansion.md` |
| mid → low | `POST {INTERNAL_URL_LOW}/internal/v1/events` (`INTERNAL_URL_LOW` = `…/c`) (`inbox.message.created`) |
هدرهای `X-Internal-Caller` + `X-Internal-Token` (secret per جفت‌سرویس؛ ACL نوع رویداد/مسیر per فرستنده)؛ فقط شبکهٔ خصوصی.

## ادمین (docs-v2/26)
- **حذف نرم جلسه:** `sessions.deleted_at`؛ همهٔ پرسمان‌های عادی (فهرست عمومی، «من»، stats، snapshot، join/حضور/صف/ارزیابی، Socket join) جلسهٔ حذف‌شده را «ناموجود» می‌بینند؛ فقط `MID_ADMIN` با `includeDeleted=true` (و خواندن‌های ادمین).
- **کاربر حذف‌شده:** رویداد `user.status.changed(deleted)` ⇒ `user_directory.deleted=1` و نام خالی ⇒ همه‌جا «کاربر حذف‌شده».
- **JWT با `mcp: true`** (رمز موقت) ⇒ `403 AUTH_PASSWORD_CHANGE_REQUIRED` روی همهٔ مسیرهای mid.
- **گزارش:** روز/هفته(از شنبه)/ماه (میلادی) به‌وقت تهران، صفرپرشده؛ `held` = جلسهٔ started/ended با `updated_at` (آخرین transition) در bucket.

## محدودیت‌ها / بدهی
- مکان جلسه فعلاً فقط برچسب متنی است؛ نقشه/جست‌وجوی **نشان (Neshan)** در قرارداد نیست و منتظر مستندات است.
- ویرایش ارزیابی در فاز ۱ نیست (D5). تغییر وضعیت خودکار جلسه بر اساس زمان نیست (دستی).
- کد زیرساختی مشترک (guard/filter/envelope/rate-limit) بین low و mid **کپی** است (قاعدهٔ «بدون import بین سرویس‌ها»)؛ استخراج `packages/service-kit` نیازمند تأیید مالک.
- بار واقعی (k6) اندازه‌گیری نشده.
