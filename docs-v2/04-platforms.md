# ۰۴ — پلتفرم‌ها

## خلاصه

| پلتفرم | تعداد | تکنولوژی | نکته |
|--------|------:|----------|------|
| Android | ۳ اپ جدا | Kotlin + Jetpack Compose | `ir.isra.low` / `ir.isra.mid` / `ir.isra.high` |
| Web | ۲ اپ | SvelteKit 2 + Svelte 5 | `israapp.ir` (`web-main`)، `admin.israapp.ir` (`web-admin`) |
| iOS | ۰ native | PWA از وب | Add to Home Screen |

مونوریپو: **pnpm** + **Turborepo**. فونت: **YekanBakh** از `design/fonts`.

## Android

### اپ‌ها

| پوشه | سطح | applicationId | API هدف | کاربر نوعی |
|------|-----|---------------|---------|------------|
| `apps/android-low` | low | `ir.isra.low` | `api-low` `/c/v1` | قرآن‌آموز، مهمان |
| `apps/android-mid` | mid | `ir.isra.mid` | `api-mid` `/o/v1` + auth-only به low | مدیر/پشتیبان/معلم جلسه |
| `apps/android-high` | high | `ir.isra.high` | `api-high` `/s/v1` + auth-only به low | ادمین سیستم |

### قواعد Android

1. سه applicationId جدا — یک APK برای همه سطوح **ساخته نمی‌شود**.
2. UI فقط فارسی RTL؛ بدون i18n؛ فونت YekanBakh.
3. تم از `THEME_TOKENS.md`؛ بدون رنگ invent‌شده خارج توکن.
4. قبل از UI: موجودی طبق `10-ui-discovery-rules.md`؛ سپس فقط از `design/` یا brief مالک.
5. فراخوانی غیر-auth فقط به سرویس سطح خود؛ auth فقط به `api-low` (`/c/v1/auth/*`).
6. Socket.IO برای جلسه زنده روی اتصال به **api-mid** (عمدتاً `android-mid`).
7. مصحف: PDF محلی؛ فاز ۱ بدون صوت؛ از سرور متن آیه نگیر.

### استک پیشنهادی ماژول Android (داخل هر اپ)

| لایه | مثال |
|------|------|
| UI | Compose screens/components |
| Navigation | یک گراف per app |
| Data | Retrofit/Ktor client → baseUrl سطح + baseUrl auth low در صورت نیاز |
| Auth storage | ذخیره امن access/refresh؛ device binding طبق `05-auth-security.md` |

## Web

### اپ‌ها

| پوشه | سطح | استقرار | API |
|------|-----|---------|-----|
| `apps/web-main` | low + mid | `israapp.ir` | `/c/v1` (low) و `/o/v1` (mid)؛ auth روی low |
| `apps/web-admin` | high | `admin.israapp.ir` | `/s/v1` (high) + auth-only به low |

### قواعد Web

1. SvelteKit 2 + Svelte 5.
2. RTL فارسی؛ `dir="rtl"` ریشه؛ بدون i18n؛ فونت YekanBakh.
3. در `web-main` مرز واضح بین فضای کاربر (low) و عملیات جلسه (mid)؛ توکن یکسان، پیشوند/base متفاوت.
4. `web-admin` جدا منتشر می‌شود؛ کد ادمین را داخل `web-main` قاطی نکن.
5. PWA: **هر دو اپ وب** (`web-main` و `web-admin`) باید PWA قابل نصب باشند (manifest، service worker، آیکون‌ها، حالت offline پایه) تا روی موبایل اجرا شوند؛ برای iOS از Add to Home Screen استفاده می‌شود. (تصمیم مالک — ۱۴۰۵/۰۷/۰۸)
   - عملکرد و انیمیشن: سرعت بارگذاری اولویت است (هدف: Lighthouse ≥ ۹۰، LCP < ۲٫۵s). انیمیشن ساده با CSS/ترنزیشن Svelte؛ انیمیشن پیچیده با GSAP به‌صورت lazy؛ سه‌بعدی فقط محدود و lazy؛ احترام به `prefers-reduced-motion`. طراحی UI/UX وب طبق طرح کلی مالک در `design/` (صفحات بدون design با brief مالک و `THEME_TOKENS` — بعد از موجودی UI طبق `10`).
6. کلید Map.ir در فرانت نگذار.
7. موجودی UI طبق `10-ui-discovery-rules.md` قبل از design/کد.

## iOS (PWA فقط)

| مورد | وضعیت |
|------|--------|
| اپ native Swift/SwiftUI | ساخته نمی‌شود |
| انتشار App Store | ساخته نمی‌شود |
| استفاده | Safari / Add to Home Screen روی همان وب‌اپ‌ها |
| قابلیت | زیرمجموعهٔ وب؛ محدودیت‌های iOS PWA را بپذیر |

## ماتریس کلاینت → سرویس

| کلاینت | api-low غیر-auth | api-low auth فقط | api-mid | api-high |
|--------|:----------------:|:-----------------:|:-------:|:--------:|
| android-low | ✓ `/c/v1` | ✓ | ✗ | ✗ |
| android-mid | ✗ | ✓ | ✓ `/o/v1` | ✗ |
| android-high | ✗ | ✓ | ✗ | ✓ `/s/v1` |
| web-main | ✓ | ✓ | ✓ | ✗ |
| web-admin | ✗ | ✓ | ✗ | ✓ |

✗ غیر-auth = درخواست مستقیم نزن. دادهٔ لازم از طریق internal REST / outbox-inbox بین سرویس‌ها یا aggregate همان سطح تأمین می‌شود.

Production API: `api.israapp.ir` با پیشوندهای `/c/v1`، `/o/v1`، `/s/v1`.

## ساخته نمی‌شود

- Flutter / React Native به‌عنوان استک اصلی Android
- Next.js / React برای وب‌اپ‌های قفل‌شده
- یک WebView-wrapper به‌جای Compose برای Android اصلی
- native iOS
- Docker اجباری برای اجرای محلی فعلی
