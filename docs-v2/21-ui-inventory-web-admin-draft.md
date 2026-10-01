# ۲۱ — موجودی UI: `web-admin` (پیش‌نویس)

**وضعیت: پیاده شد در `apps/web-admin`.** کشف طبق `10`؛ مالک طراحی/ساخت را به AI واگذار کرد؛ پیاده می‌شود در `apps/web-admin`. API: `20`. فقط `web-admin` (خارج: android-high، `web-main`). ظاهر با توکن‌های `THEME_TOKENS` و لوگوی رسمی. PWA (`04`).

منابع: `03` §۹، `06/high.md`، `05`، `04`، قفل‌ها #8 #15 #28.

## الف) اسکرین‌ها
| screen_id | عنوان (مسیر) | حالت‌ها | کامپوننت‌های کلیدی |
|-----------|--------------|---------|---------------------|
| `high_login` | ورود (`/login`) | شماره، OTP (شمارنده/تلاش/قفل)، رمز، `RATE_LIMITED`، نشست منقضی | `comp_phone_field`, `comp_otp_input`, `comp_password_field` |
| `high_forbidden` | بدون دسترسی (کاربر بدون نقش سیستم) | با دکمهٔ خروج | `comp_empty_state` |
| `high_shell` | چارچوب (سایدبار دسکتاپ/نوار پایین موبایل، هدر، خروج) | — | `comp_sidebar`, `comp_bottom_nav`, `comp_top_bar` |
| `high_dashboard` | نمای کلی (`/`) | loading, error, offline | `comp_stat_card`, `comp_audit_row` |
| `high_users` | کاربران (`/users`) | جست‌وجو، فیلتر نقش، صفحه‌بندی، خالی، خطا | `comp_user_row`, `comp_role_badge` |
| `high_user_detail` | جزئیات کاربر (`/users/:id`) | نقش‌ها (ویرایش با step-up)، grant، `LAST_HOLDER`، عدم‌مجوز تغییر developer | `comp_role_editor`, `comp_confirm_dialog` |
| `high_roles` | نقش‌ها و مجوزها (`/roles`) | ماتریس، قفل‌ها، نقش undeletable، نمایش ماتریس نقش‌های جلسه (فقط‌خواندنی) | `comp_permission_matrix` |
| `high_settings` | تنظیمات (`/settings`) | وزن ارزیابی (جمع ۱۰۰)، آستانه نشان، پرچم‌ها، تغییرنکرده/ویرایش‌شده، `VERSION_MISMATCH`، step-up | `comp_weights_editor`, `comp_thresholds_editor`, `comp_flag_toggle` |
| `high_audit` | گزارش‌ها (`/audit`) | فیلتر عمل/جست‌وجو، صفحه‌بندی، باز/بسته‌شدن جزئیات، خالی | `comp_audit_row` |
| `high_stepup_sheet` | تأیید هویت (sheet) | درخواست/تأیید/قفل | `comp_otp_input` |
| `high_state_*` | آفلاین، خطا، ۴۰۴، نگهداری | — | `comp_empty_state` |

## ب) نقش × اسکرین
| اسکرین | developer | super_admin | بدون نقش |
|--------|:-:|:-:|:-:|
| dashboard/users/audit | ✓ | ✓ (با مجوز view) | forbidden |
| roles: ویرایش ماتریس | ✗ (ثابت، همه‌چیز) | ✓ فقط مجوزهای قفل‌نشده | — |
| user detail: تغییر نقش `developer` | ✓ | ✗ | — |
| settings: ویرایش | ✓ | ✓ (با `settings.edit`) | — |

## ج) خودممیزی
| منبع | پوشش |
|------|:----:|
| `03` §۹: نقش‌ها، مجوزها، تنظیمات سراسری، audit، انتشار | ✓ (انتشار = اعلان در UI؛ outbox سمت سرور) |
| auth/OTP/step-up | ✓ |
| قفل نقش undeletable و آخرین دارنده | ✓ |
| empty/error/loading/offline/denied/maintenance | ✓ |
| `android-high` | خارج از scope |
