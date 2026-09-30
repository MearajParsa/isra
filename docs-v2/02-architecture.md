# ۰۲ — معماری

## نمای کلی

سه لایهٔ کلاینت هم‌تراز با سه میکروسرویس NestJS. بدون API Gateway. کلاینت هر سطح برای کارهای عادی فقط به سرویس همان سطح درخواست می‌زند. **استثنا Auth:** همه کلاینت‌ها فقط برای `/c/v1/auth/*` (یا auth مشترک زیر low) به `api-low` می‌روند. Auth در `api-low` صادر می‌شود؛ mid/high JWT را محلی با **JWKS از low (RS256)** verify می‌کنند.

```
[android-low]  ──┐
[web-main low] ──┼── /c/v1 ──────────> api-low   (accounts, OTP, tokens, public+user, points UI aggregate)
                 │
[android-mid]  ──┼── /o/v1 ──────────> api-mid   (sessions, attendance, queue, eval, Socket.IO)
[web-main mid] ──┘         + auth-only /c/v1/auth/* → api-low
                 │
[android-high] ──┼── /s/v1 ──────────> api-high  (roles, system admin, config)
[web-admin]    ──┘         + auth-only /c/v1/auth/* → api-low

Production API host: api.israapp.ir
Web: israapp.ir | Admin: admin.israapp.ir

api-low  <── internal REST + outbox/inbox ──>  api-mid  <──>  api-high
EventEmitter: فقط in-process داخل هر سرویس
MySQL: schema_low | schema_mid | schema_high  (یک instance)
رسانه: media/ روی همان host (نه MinIO)
```

## چیدمان مونوریپو

ابزار: **pnpm** + **Turborepo**. توسعه محلی فعلی: **بدون Docker**.

```
Isra/
├── apps/
│   ├── android-low/          # Kotlin + Compose — applicationId ir.isra.low
│   ├── android-mid/          # ir.isra.mid
│   ├── android-high/         # ir.isra.high
│   ├── web-main/             # SvelteKit 2 + Svelte 5 — low + mid — israapp.ir
│   └── web-admin/            # SvelteKit 2 + Svelte 5 — high — admin.israapp.ir
├── services/
│   ├── api-low/              # NestJS + TypeORM — /c/v1
│   ├── api-mid/              # NestJS + TypeORM — /o/v1 + Socket.IO
│   └── api-high/             # NestJS + TypeORM — /s/v1
├── packages/                 # اختیاری؛ سرویس‌ها مستقل بمانند
│   ├── jwt-verify/           # اعتبارسنجی JWT مشترک (JWKS RS256)
│   └── api-types/            # DTO/types مشترک در صورت نیاز
├── design/                   # اسکرین/کامپوننت از مالک — فونت YekanBakh در design/fonts
├── media/                    # فایل‌های media روی host (نه MinIO)
├── docs-v2/                  # این بسته
└── README.md
```

### قواعد پوشه

| قاعده | توضیح |
|-------|-------|
| اپ‌ها جدا | سه Android جدا؛ دو Web جدا؛ کد UI بین سطوح share اجباری نیست |
| سرویس‌ها مستقل | هر سرویس schema خودش؛ بدون DB مشترک جدولی |
| packages اختیاری | فقط وقتی تکرار واقعاً مضر است (مثلاً verify JWT) |
| design/ | فقط دارایی مالک؛ مسیر نسبی ریشه؛ فونت YekanBakh |
| media/ | روی همان host سرویس؛ نه object-storage جدا |

## بک‌اند

| سرویس | پشته | داده | پیشوند تولید | مسئولیت کلان |
|-------|------|------|--------------|--------------|
| `services/api-low` | NestJS, TypeORM, MySQL | `schema_low` | `/c/v1` | حساب، OTP، توکن، پروفایل، اینباکس، نمایش امتیاز (aggregate از mid)، proxy نقشه کاربر |
| `services/api-mid` | NestJS, TypeORM, MySQL | `schema_mid` | `/o/v1` | جلسه، عضویت، حضور، صف، ارزیابی، امتیاز/`badge_awards`، Socket.IO، proxy مکان جلسه |
| `services/api-high` | NestJS, TypeORM, MySQL | `schema_high` | `/s/v1` | نقش/مجوز سیستم، ادمین، تنظیمات سراسری (وزن ارزیابی)، audit |

جزئیات دامنه: `06-domains/`.

### داده

- یک MySQL instance
- سه schema / logical DB جدا
- بدون Redis مگر unlock بعدی
- بدون GraphQL
- رسانه در `media/` روی host

### ارتباط بین‌سرویسی

| الگو | استفاده |
|------|---------|
| Internal REST | خواندن/نوشتن لازم بین سرویس‌ها (مثلاً خلاصه امتیاز mid→low) |
| Outbox / Inbox | تحویل قابل‌اعتماد رویداد بین سرویس‌ها (نقش، تنظیمات، اعلان) |
| Nest EventEmitter | **فقط in-process** همان سرویس — برای بین سرویس‌ها ممنوع |
| Message broker جدا | قفل نشده — نساز |

### Realtime

| کانال | کِی |
|-------|-----|
| **Socket.IO روی api-mid** | حضور زنده، صف، ارزیابی وقتی اپ باز است |
| Poll | اینباکس وقتی نیاز است |

## احراز هویت در معماری

1. هر کلاینت (low/mid/high/web) OTP/رمز را به `api-low` روی `/c/v1/auth/*` می‌فرستد.
2. `api-low` access (**۱۵ دقیقه**) + refresh (**۱۴ روز**، rotation + session family) با **RS256** صادر می‌کند.
3. کلاینت mid/high همان JWT را به سرویس خود (`/o/v1` یا `/s/v1`) می‌فرستد؛ برای refresh/logout دوباره به low.
4. mid/high با **JWKS از low** محلی verify می‌کنند — بدون فراخوانی low در هر request غیر-auth.
5. نقش/مجوز سیستم از high؛ به‌روزرسانی با outbox/inbox (+ internal REST در صورت نیاز).
6. اقدام حساس: step-up (جزئیات `05-auth-security.md`).

## فرانت‌اند

| اپ | پشته | applicationId / دامنه | اتصال API |
|----|------|----------------------|-----------|
| `apps/android-low` | Kotlin + Jetpack Compose | `ir.isra.low` | `api-low` `/c/v1` |
| `apps/android-mid` | Kotlin + Jetpack Compose | `ir.isra.mid` | `api-mid` `/o/v1` + auth-only به low |
| `apps/android-high` | Kotlin + Jetpack Compose | `ir.isra.high` | `api-high` `/s/v1` + auth-only به low |
| `apps/web-main` | SvelteKit 2 + Svelte 5 | `israapp.ir` | low `/c/v1` و mid `/o/v1` |
| `apps/web-admin` | SvelteKit 2 + Svelte 5 | `admin.israapp.ir` | high `/s/v1` + auth-only به low |

iOS: همان وب به‌صورت PWA؛ بدون باینری native. فونت: **YekanBakh** از `design/fonts`.

## نقشه

- **low**: proxy نقشهٔ کاربر (Map.ir؛ کلید فقط سرور).
- **mid**: proxy مکان جلسه.
- کلید Map.ir به کلاینت نده.

## مصحف

- متن قرآن: **PDF محلی** در کلاینت.
- صوت: فاز بعد با دانلود؛ **فاز ۱ بدون صوت**.
- سرور **متن مصحف ذخیره نمی‌کند**؛ حداکثر متادیتای ارجاع سوره/آیه.

## ساخته نمی‌شود

| مورد | |
|------|--|
| API Gateway | ساخته نمی‌شود |
| یک سرویس Nest واحد | ساخته نمی‌شود |
| اشتراک schema بین سرویس‌ها | ساخته نمی‌شود |
| Redis / broker اجباری | ساخته نمی‌شود |
| EventEmitter بین‌سرویسی | ساخته نمی‌شود |
| MinIO | ساخته نمی‌شود |
| Docker اجباری توسعه فعلی | ساخته نمی‌شود |
| کلاینت چندسطح در یک باینری Android | ساخته نمی‌شود |
