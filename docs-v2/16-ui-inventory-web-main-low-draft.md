# ۱۶ — موجودی UI: `web-main` ← بخش low (پیش‌نویس)

**وضعیت: خروجی کشف طبق `10-ui-discovery-rules.md`. مالک طراحی و ساخت وب را به AI واگذار کرد؛ ردیف‌های «هسته» + `low_sessions_browse`/`low_session_detail` در `apps/web-main` پیاده شد (ببین `STATUS.md`). `low_map` و `low_quran` (و تب مصحف) هنوز ساخته نشده‌اند.** این سند کاتالوگ دائمی docs نیست؛ تحویلِ مرحلهٔ ۱ برای طراحی است (`08`). بعد از تحویل design می‌توان آن را به `design/low/` منتقل یا حذف کرد.

- **scope:** فقط `web-main`، بخش low (فضای کاربر). خارج: بخش mid در `web-main`، `web-admin`، `android-*`.
- **منابع پیموده‌شده:** `03` (۱،۶،۷،۸،۱۰)، `06-domains/low.md`، `04` (قواعد وب و PWA)، `05`، قفل Guest (#20)، قرارداد API پیش‌نویس (`15`، شناسه‌های L-xx).
- **وضعیت design:** `design/fonts/` پر شده (YekanBakhFaNum: Light/Regular/Bold/ExtraBlack + woff2/woff/ttf/otf، و دو فونت قرآنی `ArabQuranIslamic.ttf`, `hejaz.ttf`). `design/low/` و `design/components/` هنوز **خالی‌اند** ⇒ هیچ ردیفی هنوز قابل کد نیست.
- **تصمیم‌های مالک (نوبت دوم):** Q1 = بله (با mock)، Q2 و Q10 = به تصمیم AI سپرده شد؛ جزئیات در §ح.
- ستون «وضعیت»: **هسته** = مستقیم از docs/قرارداد؛ **مشروط** = وجودش به پاسخ سؤال باز (§و) بستگی دارد، تا آن موقع design نخواهد.

## الف) اسکرین‌ها

نقش‌ها در low فقط `guest` و `member` است (نقش‌های جلسه/سیستم اسکرین low را عوض نمی‌کنند). حالت‌های سراسری (loading/error/offline) در هر ردیف نیامده مگر اختصاصی باشد؛ برای هر اسکرین دارای دادهٔ سرور فرض‌شان `default, loading, error, offline` است.

### الف-۱) پوسته و ورودی

| screen_id | عنوان فارسی | نقش‌ها | حالت‌ها | کامپوننت‌های کلیدی | وضعیت | یادداشت |
|-----------|-------------|--------|---------|---------------------|:-----:|---------|
| `low_shell` | چارچوب برنامه (هدر + ناوبری) | guest, member | guest، member، badge نخوانده‌ها، موبایل/دسکتاپ، دارای/بدون ورودی «مدیریت جلسه» | `comp_top_bar`, `comp_nav`, `comp_unread_badge`, `comp_avatar` | هسته | ساختار ناوبری و مرز با mid: §ح-۲ (Q10 تصمیم‌گرفته‌شده) |
| `low_home` | صفحهٔ اول (معرفی برای guest / داشبورد برای عضو) | guest, member | guest، member، loading، empty، error، offline | `comp_hero`, `comp_feature_card`, `comp_steps`, `comp_session_card`, `comp_points_summary_card`, `comp_guest_cta_banner`, `comp_empty_state`, `comp_skeleton`, `comp_footer` | هسته | بخش‌بندی و محتوا: §ح-۱ (Q2 تصمیم‌گرفته‌شده). یک مسیر `/` با دو نسخه؛ نسخهٔ guest باید SSR باشد (SEO) |
| `low_pwa_install` | نصب برنامه (PWA) | guest, member | نصب مستقیم (Chromium)، راهنمای Add to Home Screen (iOS)، رد شد | `comp_pwa_install_banner`, `comp_bottom_sheet` | هسته | قفل PWA در `04`؛ iOS فقط راهنمای دستی |

### الف-۲) ورود و ثبت‌نام (L-01…L-07)

| screen_id | عنوان فارسی | نقش‌ها | حالت‌ها | کامپوننت‌های کلیدی | وضعیت | یادداشت |
|-----------|-------------|--------|---------|---------------------|:-----:|---------|
| `low_auth_phone` | ورود / ثبت‌نام با شماره | guest | default، خطای فرمت شماره، در حال ارسال، `RATE_LIMITED` با شمارندهٔ انتظار، `AUTH_OTP_SEND_FAILED`، اعلان «نشست منقضی شد» (پس از `AUTH_REFRESH_INVALID`) | `comp_phone_field`, `comp_primary_button`, `comp_text_button`, `comp_form_error`, `comp_notice_banner` | هسته | ورود و ثبت‌نام یکپارچه (L-01). لینک «ورود با رمز» و «رمز را فراموش کرده‌ام» |
| `low_auth_otp` | وارد کردن کد تأیید | guest | default، شمارندهٔ ۲:۰۰ و غیرفعال بودن ارسال مجدد (۶۰ث)، ارسال مجدد فعال، کد نادرست (+ تلاش‌های باقی‌مانده)، `AUTH_OTP_EXPIRED`، قفل پس از ۳ تلاش (`AUTH_OTP_EXHAUSTED`)، در حال تأیید، `RATE_LIMITED` | `comp_otp_input`, `comp_resend_countdown`, `comp_form_error`, `comp_primary_button` | هسته | ۵ رقم؛ ورودی ارقام LTR داخل صفحهٔ RTL؛ تغییر شماره. L-02 |
| `low_auth_password` | ورود با رمز | guest | default، `AUTH_INVALID_CREDENTIALS`، `RATE_LIMITED`، در حال ورود | `comp_phone_field`, `comp_password_field`, `comp_primary_button`, `comp_form_error` | هسته | پیام خطا یکسان؛ پیشنهاد ورود با کد. L-03 |
| `low_auth_forgot` | فراموشی رمز | guest | default، خطا، ارسال شد | `comp_phone_field`, `comp_primary_button` | هسته | بازنشانی = OTP ← ورود ← `low_password_set` (قرارداد `15` §۴)؛ از `low_auth_otp` استفاده می‌کند |
| `low_onboarding_profile` | تکمیل پروفایل پس از اولین ورود | member (جدید) | default، خطای فیلد، در حال ذخیره، خطا | `comp_text_field`, `comp_primary_button`, `comp_form_error` | هسته | `profileComplete=false` ⇒ اجباری قبل از ادامه؛ فیلدها `firstName`/`lastName` (Q3 در `15`). L-12 |
| `low_stepup_sheet` | تأیید مجدد هویت (step-up) | member | درخواست کد، وارد کردن کد، کد نادرست/منقضی/قفل، موفق | `comp_bottom_sheet`, `comp_otp_input`, `comp_resend_countdown` | هسته | فقط پیش از `low_password_set` (و موارد حساس بعدی). L-06/L-07 |
| `low_auth_gate` | دعوت به ورود (اقدام gated) | guest | مودال/sheet با دکمهٔ ورود و بستن | `comp_bottom_sheet`, `comp_primary_button`, `comp_guest_cta_banner` | هسته | قفل Guest #20؛ بعد از ورود به همان مقصد بازمی‌گردد |

### الف-۳) حساب

| screen_id | عنوان فارسی | نقش‌ها | حالت‌ها | کامپوننت‌های کلیدی | وضعیت | یادداشت |
|-----------|-------------|--------|---------|---------------------|:-----:|---------|
| `low_account` | حساب من | member | default، loading، error | `comp_list_item`, `comp_avatar`, `comp_confirm_dialog` | هسته | هاب: پروفایل، رمز، دستگاه‌ها، خروج. L-10 |
| `low_profile` | پروفایل | member | نمایش، ویرایش، خطای فیلد، در حال ذخیره، ذخیره شد | `comp_text_field`, `comp_avatar`, `comp_primary_button`, `comp_toast` | هسته | L-11/L-12. آپلود آواتار خارج تا Q5 |
| `low_password_set` | تعیین / تغییر رمز | member | بدون رمز (تعیین)، دارای رمز (تغییر)، نیازمند step-up، خطای اعتبار (حداقل ۸ نویسه)، موفق | `comp_password_field`, `comp_primary_button`, `comp_form_error`, `comp_toast` | هسته | L-13؛ پس از موفقیت سایر نشست‌ها بسته می‌شوند — باید در UI گفته شود |
| `low_sessions` | دستگاه‌ها و نشست‌ها | member | default، loading، empty (فقط نشست جاری)، error، در حال revoke | `comp_session_item`, `comp_confirm_dialog`, `comp_toast` | هسته | L-14…L-16؛ نشست جاری مشخص؛ «خروج از بقیه» |
| `low_logout_confirm` | تأیید خروج | member | dialog | `comp_confirm_dialog` | هسته | L-05؛ تأیید مخرب |

### الف-۴) اینباکس، امتیاز و محتوا

| screen_id | عنوان فارسی | نقش‌ها | حالت‌ها | کامپوننت‌های کلیدی | وضعیت | یادداشت |
|-----------|-------------|--------|---------|---------------------|:-----:|---------|
| `low_inbox` | اینباکس | member (guest ← `low_auth_gate`) | default، loading، empty، error، offline، فقط نخوانده‌ها، «خواندن همه» | `comp_inbox_item`, `comp_unread_badge`, `comp_empty_state`, `comp_pagination` | هسته | L-17…L-20؛ poll؛ انواع `kind` (عضویت/نوبت/ارزیابی/سیستم) در mid/high تعیین می‌شود؛ جزئیات پیام/deep-link Q9 |
| `low_points` | امتیاز و نشان‌ها | member (guest ← gate) | default، loading، empty (بدون امتیاز)، error، نشان کسب‌شده/قفل‌شده | `comp_points_summary_card`, `comp_badge_tile`, `comp_empty_state` | هسته (API رزرو) | آستانه‌ها ۵۰/۱۵۰/۳۰۰/۵۰۰؛ نشان با افت امتیاز باطل نمی‌شود؛ داده از `/me/points` — قرارداد پس از mid |
| `low_sessions_browse` | مرور جلسات | guest, member | default، loading، empty (بدون جلسه)، error، offline، فیلتر وضعیت (پیش‌رو/در حال برگزاری/پایان‌یافته)، بارگذاری بیشتر | `comp_session_card`, `comp_filter_chips`, `comp_pagination`, `comp_empty_state`, `comp_skeleton` | هسته (دادهٔ mock) | Q1 = بله. دادهٔ mock بر پایهٔ L-30 (`15` §۴-ب)؛ فقط جلسات `scheduled/started/ended` — `draft` عمومی نیست |
| `low_session_detail` | جزئیات جلسه | guest, member | default، loading، error، not-found؛ وضعیت `scheduled/started/ended`؛ guest (CTA ورود)، member (CTA ورود به بخش جلسه) | `comp_session_status_chip`, `comp_schedule_info`, `comp_guest_cta_banner`, `comp_primary_button` | هسته (دادهٔ mock) | Q1 = بله. L-31. اقدام‌های عضویت/حضور/صف **خارج از این scope** (mid)؛ دکمهٔ member فقط به مسیر بخش mid لینک می‌دهد (مقصد در موجودی mid) |
| `low_map` | نقشهٔ کاربر | guest, member | default، error، offline | — | مشروط (Q4) | proxy سرور `/c/v1/maps/*`؛ کاربرد نقشه در low در docs روشن نیست |
| `low_quran` | مصحف (PDF محلی) | guest, member | default، loading، error، offline | — | مشروط (Q6) | `03` §۸: متن PDF محلی در کلاینت، بدون صوت و بدون متن از سرور؛ وب/PWA و حجم PDF نیازمند brief |

### الف-۵) حالت‌های سراسری

| screen_id | عنوان فارسی | نقش‌ها | حالت‌ها | کامپوننت‌های کلیدی | وضعیت | یادداشت |
|-----------|-------------|--------|---------|---------------------|:-----:|---------|
| `low_state_offline` | بدون اتصال | guest, member | صفحهٔ کامل + نوار | `comp_offline_banner`, `comp_primary_button` | هسته | PWA offline پایه (`04`)؛ فقط پوسته؛ دادهٔ ذخیره‌نشده نشان داده نمی‌شود |
| `low_state_error` | خطای عمومی (`INTERNAL_ERROR`/شبکه) | guest, member | با «تلاش دوباره» | `comp_empty_state`, `comp_primary_button` | هسته | stack trace نشان داده نمی‌شود (`07`) |
| `low_state_not_found` | صفحه یافت نشد (404) | guest, member | default | `comp_empty_state` | هسته | |
| `low_state_forbidden` | دسترسی ندارید | member | default | `comp_empty_state` | هسته | `AUTH_FORBIDDEN`؛ در low نادر؛ رفتار guest همیشه gate/ورود است نه این صفحه |
| `low_state_maintenance` | در حال نگهداری | guest, member | default | `comp_empty_state` | هسته | از بند ۷ حالت‌های سراسری `10`؛ نشانه: 503 |

## ب) کامپوننت‌های design-system / shared

| component_id | عنوان فارسی | variants / states | استفاده در | design |
|--------------|-------------|-------------------|-----------|--------|
| `comp_top_bar` | نوار بالا | با/بدون بازگشت، با عنوان، با اقدام | `low_shell` و همهٔ صفحات | `design/components/comp_top_bar*` |
| `comp_nav` | ناوبری اصلی | موبایل (پایین) / دسکتاپ (کنار)، آیتم فعال، guest/member | `low_shell` | `design/components/comp_nav*` |
| `comp_primary_button` | دکمهٔ اصلی | default, hover, focus, disabled, loading | تقریباً همه | `design/components/comp_primary_button*` |
| `comp_secondary_button` | دکمهٔ ثانویه | default, disabled, loading | `low_account`, `low_sessions` | … |
| `comp_text_button` | دکمهٔ متنی/لینک | default, disabled | `low_auth_*` | … |
| `comp_text_field` | فیلد متن | default, focus, filled, error, disabled | `low_onboarding_profile`, `low_profile` | … |
| `comp_phone_field` | فیلد شماره موبایل | ارقام LTR درون RTL، خطا | `low_auth_phone`, `low_auth_password`, `low_auth_forgot` | … |
| `comp_otp_input` | ورودی کد ۵ رقمی | خالی، در حال تایپ، خطا، غیرفعال (قفل)، paste/auto-fill | `low_auth_otp`, `low_stepup_sheet` | … |
| `comp_password_field` | فیلد رمز | نمایش/پنهان، خطا | `low_auth_password`, `low_password_set` | … |
| `comp_resend_countdown` | شمارندهٔ ارسال مجدد | در حال شمارش، فعال | `low_auth_otp`, `low_stepup_sheet` | … |
| `comp_form_error` | خطای فیلد/فرم | inline، banner | فرم‌ها | … |
| `comp_notice_banner` | نوار اعلان (info/warning) | info, warning | `low_auth_phone` (نشست منقضی) | … |
| `comp_toast` | پیام موقت | success, error | حساب، اینباکس | … |
| `comp_bottom_sheet` | sheet / مودال | موبایل: sheet، دسکتاپ: مودال | `low_auth_gate`, `low_stepup_sheet`, `low_pwa_install` | … |
| `comp_confirm_dialog` | تأیید مخرب | عادی / مخرب، loading | خروج، revoke نشست، revoke همه | … |
| `comp_list_item` | ردیف لیست عمومی | default, pressed, با chevron | `low_account`, … | … |
| `comp_session_item` | ردیف نشست | جاری، سایر، در حال revoke | `low_sessions` | … |
| `comp_inbox_item` | ردیف پیام | خوانده، نخوانده، با `kind` | `low_inbox` | … |
| `comp_unread_badge` | نشانگر نخوانده | نقطه، عدد، +۹۹ | `low_shell`, `low_inbox` | … |
| `comp_avatar` | آواتار | placeholder (حروف نام)، تصویر | `low_shell`, `low_account`, `low_profile` | … |
| `comp_points_summary_card` | کارت امتیاز | با مقدار، صفر، loading | `low_home`, `low_points` | … |
| `comp_badge_tile` | کاشی نشان | کسب‌شده، قفل‌شده (۵۰/۱۵۰/۳۰۰/۵۰۰) | `low_points` | … |
| `comp_guest_cta_banner` | دعوت guest به ثبت‌نام | inline، چسبان | `low_home`, `low_auth_gate`, … | … |
| `comp_empty_state` | حالت خالی/خطا | آیکون + متن + اقدام | همهٔ لیست‌ها و حالت‌های سراسری | … |
| `comp_skeleton` | اسکلت بارگذاری | کارت، ردیف، متن | همهٔ صفحات دادهٔ سرور | … |
| `comp_offline_banner` | نوار آفلاین | نمایش/پنهان | `low_shell` | … |
| `comp_pwa_install_banner` | نوار نصب PWA | Chromium، iOS (راهنما) | `low_pwa_install` | … |
| `comp_pagination` | صفحه‌بندی/بارگذاری بیشتر | دکمه یا infinite، پایان لیست | `low_inbox`, `low_sessions_browse` | … |
| `comp_hero` | بخش معرفی (hero) | guest (با CTA)، member (سلام) | `low_home` | … |
| `comp_feature_card` | کارت امکانات | default | `low_home` | … |
| `comp_steps` | مراحل «چطور کار می‌کند» | ۳ گام | `low_home` | … |
| `comp_session_card` | کارت جلسه | `scheduled`, `started`, `ended`؛ loading | `low_home`, `low_sessions_browse` | … |
| `comp_session_status_chip` | چیپ وضعیت جلسه | `scheduled`, `started`, `ended` | `low_session_detail`, `comp_session_card` | … |
| `comp_schedule_info` | نمایش زمان‌بندی | یک‌باره، تکرارشونده، بازه‌ای | `low_session_detail`, `comp_session_card` | … |
| `comp_filter_chips` | چیپ‌های فیلتر | انتخاب‌شده/نشده | `low_sessions_browse` | … |
| `comp_footer` | پاورقی سایت | guest/member | `low_home` | … |
| `comp_update_toast` | «نسخهٔ جدید آماده است» | default | `low_shell` | … (از service worker؛ در `04` صریح نیست — Q12) |

مسیر design هر کامپوننت: `design/components/{component_id}*.png`؛ هر اسکرین: `design/low/{screen_id}*.png` (و `_state` برای حالت‌ها طبق `08`).

## ج) تفاوت Guest در برابر عضو

| screen_id / اقدام | Guest | Member | رفتار gated |
|-------------------|:-----:|:------:|-------------|
| `low_home` | ✓ (نسخهٔ guest) | ✓ | بخش‌های شخصی ← CTA |
| `low_sessions_browse`, `low_session_detail` (مشاهده) | ✓ | ✓ | — (اقدام‌های عضویت/حضور/صف: gate برای guest) |
| عضویت/حضور/صف از جلسه | ✗ | ✓ | `low_auth_gate` ← ورود ← بازگشت |
| `low_inbox` | ✗ | ✓ | `low_auth_gate` |
| `low_points` | ✗ | ✓ | `low_auth_gate` |
| `low_account`, `low_profile`, `low_password_set`, `low_sessions` | ✗ | ✓ | هدایت به `low_auth_phone` |
| `low_map`, `low_quran` | ✓ | ✓ | — |
| `low_auth_*` | ✓ | → هدایت به خانه | عضو واردشده این صفحات را نمی‌بیند |
| `low_pwa_install`, `low_state_*` | ✓ | ✓ | — |

## د) ماتریس نقش × اسکرین
برای low لازم نیست: نقش‌های جلسه/سیستم (`session_manager`, `session_supporter`, `teacher`, `system_admin`) هیچ اسکرین low را متفاوت نمی‌کنند؛ صفحات آن‌ها در بخش mid/`web-admin` است. ماتریس کامل در موجودی mid.

## ه) خودممیزی

| منبع چک‌لیست | پوشش | شکاف / سؤال |
|--------------|:----:|-------------|
| `03` §۱ هویت (ورود، رمز، بازنشانی، پروفایل، نشست، guest) | ✓ | آواتار و «تنظیمات پایه» نامشخص (Q5، Q7) |
| `03` §۶ امتیاز/نشان | ✓ | API رزرو |
| `03` §۷ اینباکس | ✓ | جزئیات پیام (Q9) |
| `03` §۸ قرآن | ✓ مشروط | Q6 |
| `03` §۱۰ نقشه (low) | ✓ مشروط | Q4 |
| `03` §۲–۵ جلسه/حضور/صف/ارزیابی | جزئی | فقط مرور و جزئیات جلسه (Q1)؛ بقیه mid |
| auth + OTP + devices + step-up | ✓ | بازنشانی رمز: Q8 |
| OTP: درخواست/تأیید/تلاش مجدد/قفل ۳ تلاش | ✓ | — |
| guest gates | ✓ | — |
| empty / error / loading / offline / denied / نگهداری | ✓ | — |
| تأییدهای مخرب (خروج، revoke، revoke بقیه) | ✓ | — |
| onboarding پروفایل | ✓ | فیلدها Q3 در `15` |
| PWA (`04`) | ✓ | به‌روزرسانی (Q12) |
| صف/ارزیابی/امتیاز مطابق قفل نقش | N/A | mid؛ مطابق قفل نقش‌ها در موجودی mid |
| shared components | ✓ | — |
| همهٔ اپ‌های scope | ✓ | فقط `web-main` (طبق دستور مالک) |

## و) سؤالات باز

| # | سؤال | اثر |
|---|------|-----|
| ~~Q1~~ | **پاسخ مالک: بله** — مرور/جزئیات جلسات در low، دادهٔ mock؛ عضویت/حضور/صف در بخش mid. | `low_sessions_browse`, `low_session_detail` ⇒ هسته |
| ~~Q2~~ | **تصمیم AI (مالک واگذار کرد):** §ح-۱ | `low_home` ⇒ هسته |
| Q4 | «نقشهٔ کاربر» در low برای چیست و کجا نمایش داده می‌شود؟ | `low_map` |
| Q5 | آپلود آواتار در فاز ۱ هست؟ | `low_profile`, `comp_avatar` |
| Q6 | مصحف روی وب: کدام PDF، بارگیری و offline، ناوبری سوره/صفحه؟ | `low_quran` (+ ممکن است اسکرین‌های ثانویه) |
| Q7 | «تنظیمات پایه» پروفایل چیست؟ (در `03` مبهم) | `low_profile` یا `low_settings` |
| Q8 | پس از ورود تازه با OTP برای بازنشانی رمز، step-up دوباره لازم است؟ (پیشنهاد: نه، اگر OTP کمتر از ۵ دقیقه پیش بوده) | `low_stepup_sheet`، قرارداد L-13 |
| Q9 | اینباکس: آیا جزئیات/deep-link پیام لازم است یا فقط لیست؟ | افزودن `low_inbox_detail` |
| ~~Q10~~ | **تصمیم AI (مالک واگذار کرد):** §ح-۲ | `low_shell`, `comp_nav` ⇒ هسته |
| ~~Q11~~ | بسته شد با Q2: خانهٔ guest همان صفحهٔ فرود است (SSR برای SEO). | — |
| Q12 | اعلان «نسخهٔ جدید آماده است» (service worker) و صفحات حقوقی (قوانین/حریم خصوصی) در ثبت‌نام لازم‌اند؟ | `comp_update_toast`، اسکرین حقوقی |

## ح) تصمیم‌ها (واگذارشده به AI — در انتظار تأیید نهایی)

### ح-۱) `low_home` (Q2)
یک مسیر `/`؛ نسخه بر اساس وضعیت ورود. هیچ آمار/نظر/لوگوی ساختگی نیست؛ فقط محتوای مبتنی بر docs.

**نسخهٔ guest (صفحهٔ معرفی، SSR):**
1. `comp_hero`: عنوان و توضیح کوتاه اسراء («پلتفرم جلسات قرآن»)، CTA اصلی «ورود / ثبت‌نام» (→ `low_auth_phone`)، CTA ثانویه «مشاهدهٔ جلسات» (→ `low_sessions_browse`).
2. امکانات (`comp_feature_card`× ۵): جلسات قرآن (زمان‌بندی انعطاف‌پذیر) · حضور و صف نوبت قرائت · ارزیابی صوت، لحن، تجوید · امتیاز و نشان (۵۰/۱۵۰/۳۰۰/۵۰۰) · مصحف (متن محلی؛ **بدون صوت در فاز ۱ — ذکر نشود**).
3. چطور کار می‌کند (`comp_steps`، ۳ گام): با شماره موبایل وارد شو ← جلسه را انتخاب کن و عضو شو ← در جلسه حاضر شو، نوبت بگیر و ارزیابی ببین.
4. جلسات پیش‌رو: ۳ تا ۴ `comp_session_card` + «مشاهدهٔ همه».
5. CTA نهایی (`comp_guest_cta_banner`) + `comp_pwa_install_banner` (نصب روی موبایل) + `comp_footer`.

**نسخهٔ member (داشبورد):** سلام با نام ← `comp_points_summary_card` (→ `low_points`) ← اینباکس: تعداد نخوانده + ۳ پیام آخر (→ `low_inbox`) ← جلسات پیش‌رو ← میان‌بُر «مصحف».
حالت‌ها: skeleton هر بخش جدا؛ خطای یک بخش بقیه را نمی‌شکند؛ بدون جلسه/پیام ⇒ `comp_empty_state`.

### ح-۲) ناوبری و مرز low/mid (Q10)
| مورد | تصمیم |
|------|-------|
| ساختار مسیر | low: `/` ، `/sessions`، `/sessions/:id`، `/quran`، `/inbox`، `/account/*`، `/auth/*`. mid: همه زیر `/manage/*` در یک route group جدا (layout و کد جدا؛ `web-admin` اصلاً داخل این اپ نیست) |
| ناوبری موبایل (پایین) | member: خانه · جلسات · مصحف · اینباکس (با badge) · حساب. guest: خانه · جلسات · مصحف + دکمهٔ «ورود» در هدر |
| دسکتاپ | همان آیتم‌ها در نوار بالا/کناری؛ «ورود» یا آواتار در گوشه |
| ورودی mid | فقط برای کاربری که نقش جلسه/مجوز مرتبط دارد، آیتم «مدیریت جلسه» در منوی حساب (و در دسکتاپ نوار کناری) → `/manage`. نقش‌ها از claim/`GET /me` (قرارداد mid آن را کامل می‌کند). قرآن‌آموز عادی آن را نمی‌بیند |
| tokenهای مشترک | همان نشست/توکن؛ فقط base URL درخواست‌ها فرق می‌کند (`/c/v1` در برابر `/o/v1`) |
| guest روی مسیر محافظت‌شده | `low_auth_gate` یا هدایت به `low_auth_phone?next=…` و بازگشت پس از ورود |

### ح-۳) دادهٔ mock (Q1)
- mock فقط داخل `apps/web-main` (لایهٔ داده با یک interface که بعداً با fetch واقعی عوض شود)؛ **قبل از قفل مالک در `packages/api-types` نیاید**.
- شکل دادهٔ جلسه از L-30/L-31 (`15` §۴-ب) برداشته شد. ۸ تا ۱۰ جلسه با ترکیب وضعیت‌ها و سه نوع زمان‌بندی (یک‌باره، تکرارشونده شنبه–جمعه، بازهٔ محدود)، `Asia/Tehran`، متن فارسی بی‌ادعا و بدون نام افراد واقعی.
- mock باید خطا/خالی/کندی را هم شبیه‌سازی کند (برای حالت‌های design).

### ح-۴) نکتهٔ فونت (برای مالک)
- فایل‌ها `YekanBakhFaNum` هستند: **ارقام همیشه فارسی** رندر می‌شوند. این یعنی ارقام OTP/شماره/امتیاز در UI فارسی دیده می‌شوند؛ ورودی را باید هنگام ارسال به لاتین نرمال کرد (`15` §۸). در صورت نیاز به ارقام لاتین باید نسخهٔ بدون FaNum بیاید. تأیید کنید که ارقام فارسی همه‌جا مطلوب است.
- وزن‌های موجود: Light(فقط ttf)، Regular، Bold، ExtraBlack؛ **Medium (۵۰۰) نیست** ⇒ توکن `font.weight.medium` در `THEME_TOKENS.md` باید با Regular/Bold جایگزین شود.
- `THEME_TOKENS.md` هنوز «Vazirmatn» را مثال می‌زند؛ قفل #19 YekanBakh است (مالک تأیید کند اصلاح شود).
- `ArabQuranIslamic.ttf` و `hejaz.ttf` برای `font.family.quran` (فقط آیات/مصحف) کاندیدا هستند؛ انتخاب با مالک (Q6).

### پاسخ نهایی سؤال‌های باقی‌مانده (واگذارشده به AI، ۱۴۰۵/۰۷/۰۹ — مالک می‌تواند اصلاح کند)

| # | تصمیم |
|---|-------|
| Q4 نقشهٔ کاربر | **فاز ۱ ساخته نمی‌شود.** هیچ ویژگی low به نقشه نیاز ندارد (مکان جلسه = mid)؛ endpoint هم تعریف نشده. `low_map` رزرو می‌ماند |
| Q5 آواتار | **فاز ۱ نه** (نیازمند آپلود روی `media/` و design). placeholder حروف نام |
| Q6 مصحف | **منتظر دارایی:** PDF مصحف در ریپو نیست و انتخاب فونت قرآنی (`ArabQuranIslamic` / `hejaz`) با design است. تب و صفحهٔ مصحف ساخته نمی‌شود؛ وقتی PDF آمد: `/quran` با pdf.js بارگذاری lazy |
| Q7 تنظیمات پروفایل | فقط نام و نام خانوادگی؛ بدون صفحهٔ تنظیمات جدا |
| Q8 step-up پس از OTP تازه | نیاز نیست (OTP کمتر از ۵ دقیقه)؛ در کد پیاده شد |
| Q9 جزئیات اینباکس | صفحهٔ جدا نه؛ باز/بسته‌شدن درون ردیف. `ref`/deep-link بعد از mid |
| Q12 | اعلان «نسخهٔ جدید» **پیاده شد**. صفحات حقوقی (قوانین/حریم خصوصی) **ساخته نمی‌شود** چون متن حقوقی را نمی‌توان اختراع کرد؛ مالک متن بدهد |

## ز) گام بعد
1. سؤالات باز باقی‌مانده در §و (Q4–Q9، Q12): هیچ‌کدام مانع طراحی ردیف‌های «هسته» نیست؛ ردیف‌های «مشروط» (`low_map`، `low_quran`) تا پاسخ طراحی نشوند. تصمیم‌های §ح را تأیید یا اصلاح کنید.
2. ردیف‌های «هسته» همین حالا قابل طراحی‌اند؛ «مشروط» پس از جواب.
3. مالک دارایی را با نام `screen_id`/`component_id` در `design/low/` و `design/components/` بگذارد (و فونت YekanBakh در `design/fonts/`).
4. سپس قرارداد `15` قفل و UI فقط برای ردیف‌هایی با design کد می‌شود.
