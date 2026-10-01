# توکن‌های تم اسراء (THEME_TOKENS)

منبع رنگ و فاصله برای همه کلاینت‌ها. مقادیر زیر قفل اولیه هستند؛ بدون تأیید مالک عوض نکن.

## رنگ‌ها (Core)

| توکن | مقدار | کاربرد |
|------|-------|--------|
| `color.primary` | `#1C0E44` | برند، اپ‌بار، دکمهٔ اصلی، لینک تاکید |
| `color.secondary` | `#F6E8DC` | پس‌زمینهٔ ملایم، چیپ، سطوح ثانویه |
| `color.accent` | `#0D4A46` | تاکید مکمل، موفقیت تیره، آیکون مهم |
| `color.surface` | `#FFF8F2` | پس‌زمینهٔ صفحه |
| `color.accentWarm` | `#FDBF8A` | هایلایت گرم، نشان، CTA ثانویه |
| `color.neutral` | `#F2ECE7` | زمینهٔ خنثی (بخش‌های ثانویه، کارت پایان‌یافته، فیلد غیرفعال، skeleton) — پالت مالک ۱۴۰۵/۰۷/۰۹ |
| `color.turquoise` | `#2DD2C7` | تأکید روشن روی زمینهٔ تیره (نقطهٔ «در حال برگزاری»، نوار پیشرفت، تزئین) — **متن روی زمینهٔ روشن نه** (کنتراست کم) |
| `color.gray` | `#ACA8A5` | placeholder، حاشیهٔ آیتم قفل‌شده، نمادهای غیرفعال — **متن اصلی نه** |

## رنگ‌های مشتق (پیشنهادی پایدار)

| توکن | مقدار | توضیح |
|------|-------|-------|
| `color.onPrimary` | `#FFFFFF` | متن/آیکون روی primary |
| `color.onAccent` | `#FFFFFF` | روی accent |
| `color.onSurface` | `#1C0E44` | متن اصلی روی surface |
| `color.onSurfaceMuted` | `#5C5470` | متن ثانویه |
| `color.outline` | `#E6D5C5` | بوردر ملایم |
| `color.error` | `#B3261E` | خطا |
| `color.onError` | `#FFFFFF` | |
| `color.success` | `#0D4A46` | هم‌تراز accent مگر design خلاف بگوید |
| `color.warning` | `#FDBF8A` | هشدار ملایم؛ متن تیره روی آن |
| `color.scrim` | `#1C0E4480` | overlay 50% |

اگر اسکرین design رنگ دقیق‌تری دارد، همان را در کامپوننت همان اسکرین استفاده کن و توکن سراسری را بی‌اجازه عوض نکن.

## تایپوگرافی

| توکن | مقدار پیشنهادی | کاربرد |
|------|----------------|--------|
| `font.family.ui` | YekanBakh FaNum (قفل #19؛ ارقام همیشه فارسی) | همه UI |
| `font.family.quran` | فونت مصحف کلاینت | فقط نمایش آیات |
| `font.size.xs` | 12sp / 0.75rem | راهنما |
| `font.size.sm` | 14sp / 0.875rem | فرعی |
| `font.size.md` | 16sp / 1rem | بدنه |
| `font.size.lg` | 18sp / 1.125rem | عنوان کوچک |
| `font.size.xl` | 22sp / 1.375rem | عنوان |
| `font.size.xxl` | 28sp / 1.75rem | عنوان بزرگ |
| `font.weight.regular` | 400 | |
| `font.weight.bold` | 700 | عنوان‌ها (ExtraBlack استفاده نمی‌شود — تصمیم مالک ۱۴۰۵/۰۷/۰۹؛ وزن Medium هم در فونت نیست) |

متن UI همیشه RTL فارسی.

## فاصله و شعاع

| توکن | مقدار |
|------|-------|
| `space.xs` | 4 |
| `space.sm` | 8 |
| `space.md` | 16 |
| `space.lg` | 24 |
| `space.xl` | 32 |
| `radius.sm` | 8 |
| `radius.md` | 12 |
| `radius.lg` | 16 |
| `radius.pill` | 999 |

واحد: dp در Android؛ px/rem در وب طبق سیستم طراحی.

## ارتفاع لمسی

| توکن | مقدار |
|------|-------|
| `size.touchMin` | 48 |
| `size.buttonHeight` | 48 |
| `size.inputHeight` | 48 |

## سایه (اختیاری)

| توکن | راهنما |
|------|--------|
| `elevation.1` | کارت ملایم روی surface |
| `elevation.2` | مودال/اپ‌بار |

رنگ سایه از `color.primary` با آلفا پایین — نه مشکی خالص تند، مگر design بگوید.

## نگاشت پلتفرم

### Android (Compose)

```kotlin
// مثال نام‌گذاری — مقادیر از همین جدول
val Primary = Color(0xFF1C0E44)
val Secondary = Color(0xFFF6E8DC)
val Accent = Color(0xFF0D4A46)
val Surface = Color(0xFFFFF8F2)
val AccentWarm = Color(0xFFFDBF8A)
```

### Web (CSS variables در SvelteKit)

```css
:root {
  --color-primary: #1C0E44;
  --color-secondary: #F6E8DC;
  --color-accent: #0D4A46;
  --color-surface: #FFF8F2;
  --color-accent-warm: #FDBF8A;
}
```

## قواعد مصرف

1. رنگ خارج پالت برای UI عمومی نساز.
2. کنتراست متن روی primary/accent را با `onPrimary` / `onAccent` حفظ کن.
3. مصحف ظاهر جدا دارد؛ توکن UI را رویglyphs آیه تحمیل نکن اگر فونت مصحف خلاف می‌گوید.
4. dark mode فعلاً قفل نشده — نساز مگر unlock و design.

## ساخته نمی‌شود

| مورد | |
|------|--|
| تم تیره پیش‌فرض بدون unlock | ساخته نمی‌شود |
| پالت جدا per سطح محصول بدون design | ساخته نمی‌شود |
| i18n روی فونت/کپی | ساخته نمی‌شود |
