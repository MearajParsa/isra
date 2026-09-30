# ۰۶ — دامنه سرویس Mid (`services/api-mid`)

## مأموریت

مالک **عملیات جلسه قرآن**: ایجاد جلسه، عضویت، حضور، صف نوبت، ارزیابی، امتیاز جلسه / `badge_awards`، Socket.IO جلسه. کلاینت‌های `android-mid` و بخش mid در `web-main` برای کارهای عادی به این سرویس وصل می‌شوند؛ برای auth فقط به `api-low` (`/c/v1/auth/*`).

پیشوند تولید: **`/o/v1`** روی `api.israapp.ir`. Realtime: **Socket.IO روی api-mid**.

## مالکیت داده (`schema_mid`)

| حوزه | مفهوم نمونه | توضیح |
|------|-------------|-------|
| Sessions | `sessions`, `session_schedules` | زمان‌بندی انعطاف‌پذیر؛ `Asia/Tehran`؛ هفته شنبه–جمعه |
| Lifecycle | وضعیت | `draft` → `scheduled` → `started` → `ended` (بدون برگشت) |
| Membership | `session_members` | نقش: manager/supporter/teacher/quran_student |
| Attendance | `attendance_entries` | یک ورود امتیازدار per user per session |
| Queue | `queue_items` | ترتیب نوبت |
| Evaluation | `evaluations` | صوت/لحن/تجوید؛ وزن از high (پیش‌فرض ۴۰/۳۰/۳۰) |
| Points | `point_ledger` | حضور +۵، امتیاز ارزیابی |
| Badges | `badge_awards` | آستانه ۵۰/۱۵۰/۳۰۰/۵۰۰؛ **با افت امتیاز revoke نمی‌شود** |
| Places | `session_locations` | مختصات؛ Map.ir proxy مکان جلسه |

## مسئولیت‌ها

1. CRUD جلسه و تنظیمات؛ چرخه حیات قفل‌شده
2. درخواست/تأیید/رد عضویت
3. مدیریت صف توسط **`session_manager` + `session_supporter` + `teacher`**
4. ثبت حضور و اعطای `+5` فقط یک‌بار per session entry
5. صف زنده + **Socket.IO**
6. ثبت ارزیابی **فقط** توسط `teacher` و `session_supporter` (manager alone خیر)
7. ledger امتیاز و `badge_awards` (بدون revoke با افت)
8. ارائه خلاصه امتیاز به low via **internal REST**
9. انتشار رویداد برای اینباکس low با **outbox/inbox** (نه EventEmitter بین‌سرویسی)
10. پروکسی Map.ir برای **مکان جلسه** (کلید فقط سرور)
11. Verify JWT محلی با **JWKS از low** (RS256؛ بدون hop غیر-auth)

## نقش‌های داخل جلسه

| نقش | کلید | اجازهٔ کلیدی |
|-----|------|--------------|
| مدیر | `session_manager` | تنظیمات جلسه، عضویت، صف؛ ارزیابی فقط اگر هم‌زمان teacher/supporter باشد |
| پشتیبان | `session_supporter` | `membership.approve`, `queue.manage`, **`eval.submit`** |
| معلم | `teacher` | `queue.manage`, **`eval.submit`**, هدایت |
| قرآن‌آموز | `quran_student` | حضور، صف، مشاهده نتیجه خود |

## امتیاز و نشان

| رویداد | امتیاز |
|--------|--------|
| اولین ثبت حضور در جلسه | `+5` (دوبار نده) |
| ارزیابی | طبق فرمول وزن‌دار؛ وزن از high (پیش‌فرض ۴۰/۳۰/۳۰) |

آستانه‌ها: `50`, `150`, `300`, `500` در `badge_awards` — باطل‌نشدن با افت امتیاز.

## Realtime (Socket.IO روی api-mid)

| Event | چه زمانی |
|-------|----------|
| `attendance.updated` | تغییر حاضرین |
| `queue.updated` | تغییر صف |
| `queue.turned` | نوبت کاربر |
| `eval.updated` | ارزیابی جدید/ویرایش |
| `session.state` | شروع/پایان جلسه |

فقط وقتی اپ باز است؛ persistence اعلان از طریق inbox در low.

## مصرف از سرویس‌های دیگر

| از | چگونه | برای چه |
|----|-------|---------|
| low | JWT verify محلی (JWKS)؛ در صورت نیاز internal پروفایل | نمایش نام در جلسه |
| high | outbox/inbox + internal REST | وزن ارزیابی، آستانه نشان، perm |

EventEmitter فقط in-process داخل mid.

## API سطح کلاینت (قرارداد)

| گروه | مثال |
|------|------|
| Sessions | `/o/v1/sessions` |
| Membership | `/o/v1/sessions/:id/members` |
| Attendance | `/o/v1/sessions/:id/attendance` |
| Queue | `/o/v1/sessions/:id/queue` |
| Evaluations | `/o/v1/sessions/:id/evaluations` |
| Points (داده؛ UI در low) | internal به low؛ در صورت نیاز `/o/v1/me/points` برای mid UI |
| Maps | `/o/v1/maps/...` مکان جلسه |

## رسانه

پوشهٔ `media/` روی همان host — نه MinIO.

## غیرمسئولیت‌ها / ساخته نمی‌شود در mid

| مورد | |
|------|--|
| صدور OTP/توکن | low (کلاینت mid فقط auth به low) |
| نقش سیستم developer/super_admin | high |
| چت داخل جلسه / پرداخت / مصحف سرور | ساخته نمی‌شود |
| ارزیابی توسط session_manager به‌تنهایی | ساخته نمی‌شود |
| EventEmitter بین‌سرویسی / Redis / MinIO | ساخته نمی‌شود |
