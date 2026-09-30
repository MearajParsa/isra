# ۰۶ — دامنه سرویس High (`services/api-high`)

## مأموریت

مالک **ادمین سیستم**: نقش‌ها و مجوزهای سراسری، کاربران سطح سیستم، تنظیمات سراسری (از جمله وزن ارزیابی)، audit. کلاینت‌های `android-high` و `web-admin` برای کارهای عادی به این سرویس وصل می‌شوند؛ برای auth فقط به `api-low` (`/c/v1/auth/*`).

پیشوند تولید: **`/s/v1`** روی `api.israapp.ir`. دامنه وب ادمین: `admin.israapp.ir`.

## مالکیت داده (`schema_high`)

| حوزه | مفهوم نمونه | توضیح |
|------|-------------|-------|
| System roles | `system_roles`, `user_system_roles` | شامل `developer`, `super_admin` |
| Permissions | `permissions`, `role_permissions` | کلید انگلیسی |
| System settings | `system_settings` | وزن ارزیابی، آستانه نشان، پرچم‌ها |
| Audit | `audit_logs` | اقدامات حساس |
| Admin notes | در صورت نیاز | نه چت کاربر |

## نقش‌های سیستم undeletable

| کلید | حذف | توضیح |
|------|-----|-------|
| `developer` | ممنوع | دسترسی فنی کامل |
| `super_admin` | ممنوع | مدیریت سیستم و نقش‌ها |

ساختن نقش سفارشی سیستم فقط اگر محصول بعداً unlock کند؛ تا آن زمان همین دو نقش پایه کافی است مگر docs به‌روز شود.

## مسئولیت‌ها

1. تخصیص/برداشتن نقش سیستم (با step-up؛ challenge از طریق low)
2. تعریف ماتریس permission
3. تنظیمات سراسری: وزن پیش‌فرض ارزیابی **۴۰/۳۰/۳۰** (قابل تغییر)، آستانه‌های نشان ۵۰/۱۵۰/۳۰۰/۵۰۰
4. انتشار تغییر نقش / تنظیمات به low و mid با **internal REST + outbox/inbox** (EventEmitter فقط in-process داخل high)
5. audit اقدامات ادمین
6. Verify JWT محلی با **JWKS از low** (RS256)
7. جلوگیری از حذف نقش‌های undeletable و قفل‌کردن آخرین super_admin/developer طبق قاعدهٔ ایمن

## انتشار رویداد (نمونه نام)

| Event | مصرف‌کننده | حمل‌ونقل |
|-------|-------------|----------|
| `system.role.changed` | low (claim)، mid (مجوز) | outbox/inbox + internal REST |
| `system.settings.changed` | mid (وزن/آستانه) | outbox/inbox + internal REST |
| `system.permission.changed` | low/mid | outbox/inbox + internal REST |

**ممنوع:** Nest EventEmitter برای ارتباط بین‌سرویسی؛ broker جدا نساز.

## API سطح کلاینت (قرارداد)

| گروه | مثال |
|------|------|
| Roles | `/s/v1/system/roles` |
| User roles | `/s/v1/system/users/:id/roles` |
| Permissions | `/s/v1/system/permissions` |
| Settings | `/s/v1/system/settings` |
| Audit | `/s/v1/system/audit` |

همه مسیرهای write حساس: step-up.

## کلاینت‌ها

| کلاینت | نکته |
|--------|------|
| `apps/web-admin` | `admin.israapp.ir`؛ SvelteKit 2 + Svelte 5؛ auth به low |
| `apps/android-high` | `ir.isra.high`؛ Compose؛ `/s/v1` + auth-only به low |

UI: ابتدا موجودی طبق `10-ui-discovery-rules.md`؛ سپس فقط از `design/`. فونت YekanBakh.

## رسانه

پوشهٔ `media/` روی همان host — نه MinIO.

## غیرمسئولیت‌ها / ساخته نمی‌شود در high

| مورد | |
|------|--|
| OTP و صدور توکن | low |
| صف و حضور جلسه | mid |
| ایمیل اعلان ادمین | ساخته نمی‌شود |
| GraphQL / Redis / MinIO / Gateway | ساخته نمی‌شود |
| درگاه پرداخت / مصحف سرور | ساخته نمی‌شود |
| حذف `developer` / `super_admin` | ساخته نمی‌شود |
| EventEmitter بین‌سرویسی | ساخته نمی‌شود |
