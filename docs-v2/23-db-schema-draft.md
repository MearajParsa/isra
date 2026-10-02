# ۲۳ — پیش‌نویس schema پایگاه‌داده (MySQL ۸، سه schema جدا)

**وضعیت: قفل مشروط (۱۴۰۵/۰۷/۰۹).** هدف: ایندکس‌ها و قیدهایی که SLOهای `22` و قواعد قفل‌شده (یکتایی حضور، قفل آخرین دارنده، …) را در **سطح DB** تضمین کنند. TypeORM + migration نسخه‌دار؛ `synchronize:false`.

## قواعد عمومی
| قاعده | توضیح |
|-------|-------|
| schema جدا | `schema_low`, `schema_mid`, `schema_high`؛ **بدون FK بین schemaها** (مرز سرویس)؛ ارجاع کاربر فقط `user_id` (بدون JOIN بین‌سرویسی) |
| PK | `id BINARY(16)` = UUIDv7 (زمان‌مرتب ⇒ locality ایندکس)؛ API رشتهٔ UUID برمی‌گرداند |
| زمان | `DATETIME(3)` در UTC؛ `created_at`, `updated_at` همه‌جا؛ تبدیل به Asia/Tehran فقط در لایهٔ نمایش/منطق هفته |
| charset | `utf8mb4` / `utf8mb4_0900_ai_ci`؛ موتور InnoDB |
| حذف | حذف نرم فقط جایی که لازم است (`deleted_at`)؛ audit/ledger هرگز حذف نمی‌شوند |
| ایندکس | هر ایندکس با هدف query مشخص؛ composite با ترتیب «برابری → بازه → مرتب‌سازی»؛ لیست‌های بزرگ با keyset (`created_at,id`) |
| داده‌های حساس | OTP و refresh فقط hash؛ رمز argon2id؛ شماره موبایل متن (لازم برای ورود) — دسترسی فقط low/high |

## schema_low
| جدول | ستون‌های کلیدی | قیدها / ایندکس |
|------|-----------------|-----------------|
| `users` | `id`, `phone CHAR(11)`, `status`, `created_at` | **UNIQUE(`phone`)** |
| `user_credentials` | `user_id`, `password_hash`, `updated_at` | PK=`user_id` |
| `otp_challenges` | `id`, `phone`, `purpose(login|step_up)`, `code_hmac`, `attempts TINYINT`, `expires_at`, `consumed_at`, `ip`, `created_at` | IDX(`phone`,`created_at`) برای rate-limit؛ IDX(`expires_at`) برای پاکسازی (job هر ساعت)؛ تک‌مصرف با `consumed_at` در UPDATE شرطی |
| `rate_limit_counters` | `key VARCHAR(80)`, `window_start`, `count` | PK(`key`,`window_start`)؛ فقط برای OTP/login (دقیق بین instanceها)؛ پاکسازی پنجره‌های قدیمی |
| `auth_sessions` | `id`, `user_id`, `family_id`, `device_id`, `device_label`, `platform`, `ip`, `created_at`, `last_active_at`, `revoked_at`, `perm_ver` | IDX(`user_id`,`revoked_at`)، IDX(`family_id`) |
| `refresh_tokens` | `id`, `session_id`, `token_hash BINARY(32)`, `rotated_at`, `used_at`, `expires_at` | **UNIQUE(`token_hash`)**، IDX(`session_id`)؛ reuse = `used_at IS NOT NULL` |
| `step_up_tokens` | `id`, `session_id`, `token_hash`, `expires_at` | UNIQUE(`token_hash`)، TTL ۵ دقیقه |
| `profiles` | `user_id`, `first_name`, `last_name`, `avatar_path` | PK=`user_id` |
| `devices` | `id`, `user_id`, `device_id`, `last_seen_at` | UNIQUE(`user_id`,`device_id`) |
| `inbox_messages` | `id`, `user_id`, `kind`, `title`, `body`, `ref`, `created_at`, `read_at`, `source_event_id` | IDX(`user_id`,`created_at` DESC,`id`)؛ IDX(`user_id`,`read_at`) برای شمارنده؛ **UNIQUE(`source_event_id`)** (idempotency inbox) |
| `outbox_events` | `id`, `type`, `payload JSON`, `created_at`, `published_at`, `attempts` | IDX(`published_at`,`created_at`) برای worker |
| `inbox_events` | `event_id`, `type`, `received_at` | PK(`event_id`) — dedupe رویداد ورودی |
| `idempotency_keys` | `key`, `user_id`, `request_hash`, `response JSON`, `created_at` | PK(`user_id`,`key`)؛ TTL ۲۴h |
| `points_cache` (اختیاری) | `user_id`, `total`, `badges JSON`, `fetched_at` | PK=`user_id` — cache aggregate از mid |

## schema_mid
| جدول | ستون‌های کلیدی | قیدها / ایندکس |
|------|-----------------|-----------------|
| `sessions` | `id`, `title`, `description`, `status ENUM(draft,scheduled,started,ended)`, `schedule_type`, `schedule JSON`, `next_starts_at`, `location_label`, `created_by`, `version` | IDX(`status`,`next_starts_at`) (لیست عمومی)؛ IDX(`created_by`)؛ **CHECK** گذار وضعیت در لایهٔ سرویس + `version` برای optimistic lock |
| `session_members` | `id`, `session_id`, `user_id`, `user_name_snapshot`, `status`, `requested_at`, `decided_by` | **UNIQUE(`session_id`,`user_id`)**؛ IDX(`user_id`,`status`)؛ IDX(`session_id`,`status`) |
| `session_member_roles` | `member_id`, `role` | PK(`member_id`,`role`) |
| `attendance_entries` | `id`, `session_id`, `user_id`, `entered_at` | **UNIQUE(`session_id`,`user_id`)** ⇒ «+۵ فقط یک‌بار» در سطح DB؛ IDX(`session_id`,`entered_at`) |
| `queue_items` | `id`, `session_id`, `user_id`, `status`, `position INT`, `joined_at` | IDX(`session_id`,`status`,`position`)؛ **UNIQUE** جزئی منطقی: یک آیتم waiting/current per (`session_id`,`user_id`) (با ستون تولیدشده `active_key` + UNIQUE) |
| `evaluations` | `id`, `session_id`, `queue_item_id`, `user_id`, `evaluator_id`, `voice`, `tone`, `tajweed`, `weights JSON`, `score`, `points`, `note`, `created_at` | **UNIQUE(`queue_item_id`)**؛ IDX(`session_id`,`created_at`)؛ IDX(`user_id`,`created_at`) |
| `point_ledger` | `id`, `user_id`, `points`, `reason`, `ref_id`, `created_at` | IDX(`user_id`,`created_at`)؛ **UNIQUE(`reason`,`ref_id`)** (هر رویداد یک‌بار امتیاز)؛ **append-only** |
| `badge_awards` | `id`, `user_id`, `badge_key`, `threshold`, `awarded_at` | **UNIQUE(`user_id`,`badge_key`)**؛ هرگز DELETE (قفل #12) |
| `user_points` (materialized) | `user_id`, `total` | PK=`user_id`؛ به‌روزرسانی در همان تراکنش ledger |
| `session_locations` | `session_id`, `lat`, `lng`, `address` | PK=`session_id` (Map.ir proxy) |
| `settings_cache` | `key`, `value JSON`, `version`, `updated_at` | PK=`key` — نسخهٔ محلی تنظیمات high |
| `user_directory` | `user_id`, `name`, `phone_masked`, `can_create_session`, `perm_ver` | PK=`user_id` — برای نمایش نام بدون hop به low (به‌روز با outbox) |
| `outbox_events`, `inbox_events`, `idempotency_keys` | مثل low | |

## schema_high
| جدول | ستون‌های کلیدی | قیدها / ایندکس |
|------|-----------------|-----------------|
| `system_roles` | `key`, `title`, `undeletable` | PK=`key`؛ **CHECK** `undeletable=1`؛ trigger/سرویس: DELETE ممنوع |
| `permissions` | `key`, `title`, `group` | PK=`key` |
| `role_permissions` | `role_key`, `permission_key`, `locked` | PK(`role_key`,`permission_key`)؛ `locked=1` حذف‌ناپذیر |
| `user_system_roles` | `user_id`, `role_key`, `granted_by`, `granted_at` | PK(`user_id`,`role_key`)؛ IDX(`role_key`) برای شمارش دارندگان (قفل آخرین دارنده در تراکنش با `SELECT … FOR UPDATE`) |
| `user_grants` | `user_id`, `grant`, `granted_by`, `granted_at` | PK(`user_id`,`grant`) |
| `user_directory` | `user_id`, `name`, `phone`, `created_at` | IDX(`name`)، IDX(`phone`) برای جست‌وجو (پیشوندی)؛ پر می‌شود با inbox از low |
| `system_settings` | `key='global'`, `version`, `eval_weights JSON`, `badge_thresholds JSON`, `flags JSON`, `updated_by`, `updated_at` | `UPDATE … WHERE version=?` (optimistic)؛ **CHECK** مجموع وزن = ۱۰۰ در سرویس |
| `audit_logs` | `id`, `at`, `actor_id`, `action`, `target_type`, `target_id`, `summary`, `meta JSON` | IDX(`at` DESC,`id`)؛ IDX(`action`,`at`)؛ **append-only** (کاربر DB بدون UPDATE/DELETE) |
| `outbox_events`, `idempotency_keys` | مثل low | |

## یکپارچگی بین سرویس‌ها
- رویدادها: `system.role.changed`، `system.permission.changed`، `system.settings.changed` (highمنتشر‌کننده)، `inbox.message.created` (mid/high ⇒ low)، `points.changed` (mid ⇒ low cache). همه با `event_id` یکتا و `inbox_events` برای dedupe (at-least-once + idempotent).
- worker outbox: poll هر ۱–۲ث با `SELECT … FOR UPDATE SKIP LOCKED LIMIT 50`؛ backoff نمایی؛ پس از ۱۰ خطا ⇒ هشدار.
- **بدون Redis/broker** (قفل): outbox+REST داخلی کافی است؛ اگر حجم رشد کرد، unlock جدا لازم است.

## نگهداشت داده
| داده | سیاست |
|------|-------|
| `otp_challenges`, `step_up_tokens`, `idempotency_keys` | پاکسازی خودکار (TTL) |
| `auth_sessions` منقضی/revoked | حذف پس از ۳۰ روز |
| `inbox_messages` | نگهداری ۱ سال (قابل تنظیم) |
| `audit_logs`, `point_ledger`, `badge_awards` | دائمی (append-only)، آرشیو سالانه |

## پیاده‌سازی `schema_low` — انحراف‌ها از پیش‌نویس بالا (۱۴۰۵/۰۷/۱۰)
migration `1727700000000-InitSchema` (MySQL ۸ و MariaDB سازگار؛ collation `utf8mb4_unicode_ci`). تفاوت‌ها:
| پیش‌نویس | پیاده‌سازی | دلیل |
|----------|-----------|------|
| `rate_limit_counters(key,count)` | `counter_key`, `hits` | `key`/`count` کلمهٔ رزرو |
| `auth_sessions.family_id` | حذف؛ family = خود نشست | هر نشست یک زنجیرهٔ refresh دارد؛ reuse ⇒ revoke همان نشست |
| `refresh_tokens.used_at` | فقط `rotated_at` | همان معنا (reuse = `rotated_at IS NOT NULL`) |
| — | `auth_sessions.otp_at`, `client_id` | معافیت step-up تا ۵ دقیقه پس از OTP؛ تفکیک وب/اندروید |
| `devices` | ساخته نشد | `device_id` روی `auth_sessions`؛ یک نشست فعال per دستگاه |
| `idempotency_keys` | ساخته نشد | endpointهای low همه idempotent طبیعی‌اند (`idempotency: 'natural'`) |
| `points_cache` | cache حافظه‌ای ۱۵s + stale-if-error | بدون نیاز به persist |
| `user_claims` | **جدید** | claim نقش/grant همگام‌شده از high برای JWT (`perm_ver` فقط رو‌به‌جلو) |
ارسال OTP همگام با timeout (`SMS_TIMEOUT_MS`) است، نه از طریق outbox: کاربر باید خطای ارسال را فوراً ببیند (`AUTH_OTP_SEND_FAILED`).

## پیاده‌سازی `schema_mid` — انحراف‌ها (۱۴۰۵/۰۷/۱۱)
migration `1727800000000-InitSchema` (۱۵ جدول). تفاوت‌ها: `user_directory(first_name,last_name)` به‌جای `name/phone_masked/can_create_session/perm_ver` (نام از رویداد low؛ `session.create` از JWT)؛ `session_locations` ساخته نشد (مکان فعلاً `location_label`؛ نشان بعداً)؛ `queue_items.finished_at` برای ترتیب done؛ `queue_items.active_key` (ستون تولیدشدهٔ UNIQUE) برای «یک آیتم فعال per کاربر»؛ `idempotency_keys(user_id, idem_key, request_hash, status, response)` فعال؛ `settings_cache.setting_key` (کلمهٔ رزرو `key`).

## پیاده‌سازی `schema_high` و تغییر low (۱۴۰۵/۰۷/۱۱)
`schema_high` (migration `1728000000000`، ۱۱ جدول + seed): `system_roles` (CHECK undeletable)، `permissions`، `role_permissions(locked)`، `user_directory(phone UNIQUE, perm_ver)`، `user_system_roles`، `user_grants`، `system_settings`، `audit_logs`، `outbox_events`، `inbox_events`، `rate_limit_counters`. تفاوت با پیش‌نویس: `user_directory` شامل `phone` کامل و `perm_ver` است؛ ستون‌های `key`/`group`/`grant` به `role_key`/`permission_key`/`perm_group`/`grant_key` (کلمهٔ رزرو). **low:** migration 2 جدول `step_up_tokens` را حذف و `settings_cache` (پرچم‌ها) را اضافه کرد.
