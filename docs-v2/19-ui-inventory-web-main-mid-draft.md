# ۱۹ — موجودی UI: `web-main` ← بخش mid (پیش‌نویس)

**وضعیت: پیاده شد در `apps/web-main`.** کشف طبق `10`؛ مالک طراحی/ساخت را به AI واگذار کرد (مثل `16`). فقط `web-main` (بخش mid + ورودی‌های لازم از low)؛ خارج: `web-admin`، android. API: `18`. design متناظر در `design/` نیست ⇒ طراحی AI با توکن‌های `THEME_TOKENS`.

منابع: `03` §۲–۵، `06/mid.md`، `05` (ماتریس نقش)، `04` (وب)، قفل‌های #14 #15 #17، `18`.

## الف) اسکرین‌ها
| screen_id | عنوان | نقش‌ها | حالت‌ها | کامپوننت‌های کلیدی |
|-----------|-------|--------|---------|---------------------|
| `mid_my_sessions` | جلسه‌های من (`/my-sessions`) | member (guest ← gate) | loading, empty, error, offline؛ فیلتر همه/مدیریت/عضو | `comp_my_session_card`, `comp_role_chip`, `comp_membership_chip`, `comp_filter_chips` |
| `mid_membership_cta` | درخواست عضویت (روی `/sessions/:id`) | guest, member | بدون عضویت، pending، approved، rejected، ended | `comp_membership_panel` |
| `mid_live_room` | اتاق جلسه (`/sessions/:id/live`) | عضو تأییدشده (نمای student یا کادر بر اساس `permissions`) | not-started، started، ended، قطع اتصال، denied (غیرعضو)، loading/error | `comp_live_indicator`, `comp_tabs` |
| `mid_live_student` | نمای قرآن‌آموز در اتاق | student (+ همهٔ اعضا برای حضور) | حضور ثبت‌نشده/ثبت‌شده (+۵ فقط یک‌بار)، صف: خارج/منتظر/نوبت شماست، نتیجهٔ ارزیابی‌ها | `comp_attendance_card`, `comp_queue_status_card`, `comp_evaluation_result` |
| `mid_live_queue` | مدیریت صف (تب) | `queue.manage` | خالی، نفر جاری، بالا/پایین/رد/حذف، «نفر بعدی»، غیرفعال تا جلسه شروع شود | `comp_current_reader_card`, `comp_queue_row` |
| `mid_live_attendance` | حاضرین (تب) | `attendance.view` | خالی، لیست + شمارش | `comp_attendance_row` |
| `mid_live_evaluation` | ارزیابی (تب) | `eval.submit` (manager تنها: پیام «مجاز نیستید») | فرم ۳ معیار + پیش‌نمایش امتیاز وزنی، خطا، ثبت‌شده | `comp_evaluation_form`, `comp_score_slider` |
| `mid_manage` | مدیریت جلسه (`/manage`) | staff / دارندهٔ `session.create` | loading, empty, error؛ شمارندهٔ درخواست‌های pending | `comp_manage_card` |
| `mid_session_form` | ساخت/ویرایش (`/manage/new`, `/manage/:id/edit`) | `session.create` / `session.edit` | once/recurring/range، خطای فیلد، قفل (جلسهٔ started/ended)، پیش‌نمایش فارسی زمان | `comp_session_form`, `comp_schedule_fields` |
| `mid_manage_session` | پنل جلسه (`/manage/:id`) | کادر | تب‌ها: نمای کلی، اعضا؛ چرخهٔ حیات | `comp_lifecycle`, `comp_member_row`, `comp_role_editor`, `comp_confirm_dialog` |
| `mid_state_forbidden` | بدون دسترسی | member | — | `comp_empty_state` |

## ب) تفاوت نقش (جدول د)
| اقدام | guest | student | supporter | teacher | manager | manager+teacher |
|-------|:-:|:-:|:-:|:-:|:-:|:-:|
| درخواست عضویت | gate | ✓ | ✓ | ✓ | ✓ | ✓ |
| ثبت حضور (+۵ یک‌بار) | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| پیوستن به صف | ✗ | ✓ | — | — | — | — |
| مدیریت صف | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| تأیید عضویت | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ |
| ثبت ارزیابی | ✗ | ✗ | ✓ | ✓ | **✗** | ✓ |
| ویرایش/چرخهٔ حیات/نقش‌ها | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |

## ج) خودممیزی
| منبع | پوشش | شکاف/تصمیم |
|------|:----:|-------------|
| `03` §۲ جلسات (ساخت، زمان‌بندی، چرخه، عضویت، نقش) | ✓ | مکان = متن (`label`)؛ نقشهٔ Map.ir خارج |
| §۳ حضور | ✓ | لیست زنده با Socket (mock: BroadcastChannel) |
| §۴ صف | ✓ | |
| §۵ ارزیابی | ✓ | ویرایش ارزیابی فاز ۱ نیست |
| قفل ارزیابی (manager تنها نه) | ✓ | تست واحد |
| guest gate | ✓ | |
| empty/error/loading/offline/denied/قطع اتصال | ✓ | |
| تأیید مخرب (پایان جلسه، رد/حذف) | ✓ | |
| ناوبری: 5 تب پایین (خانه، جلسات، جلسه‌های من، اینباکس، حساب)؛ «امتیاز» از خانه/حساب؛ «مدیریت» فقط کادر | ✓ | |
