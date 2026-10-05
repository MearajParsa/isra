# اسراء (Isra) — پنل مدیریت و راهبری سامانه یادگیری قرآن

پنل مدیریت سامانه یادگیری قرآن کریم «اسراء»، یک برنامه وب تک‌صفحه‌ای (SPA) کامل، واکنش‌گرا و قابل‌نصب (PWA) با طراحی راست‌به‌چپ (RTL)، تقویم رسمی جلالی، اعداد فارسی و هماهنگ با دو بک‌اند REST مجزای LOW و HIGH می‌باشد.

---

## 🎨 طراحی ظاهری و زبان بصری (بر اساس رفرنس)

- **رنگ‌های سازمانی**: سورمه‌ای/نیلی عمیق اسراء (`#251D59`)، بنفش سلطنتی (`#6E56CF`)، گرادینت‌های ارغوانی (`#7928CA -> #9B51E0`) و زمردی (`#10B981`)
- **شعاع گوشه‌ها**: کانتینر بیرونی شناور با انحنای `rounded-[2rem]` (۳۲ پیکسل)، کارت‌های بخش‌ها با `rounded-3xl` (۲۴ پیکسل)
- **سایه‌ها**: سایه‌های محیطی نرم بدون خطوط تیز (`shadow-[0_20px_45px_-12px_rgba(15,23,42,0.06)]`)
- **تایپوگرافی و فونت یکان‌بخ**: فراخوانی `@font-face` برای فونت `YekanBakhFaNum-Regular.woff2` و `YekanBakhFaNum-Bold.woff2` با پشتیبانی کامل از اعداد فارسی

---

## 🔤 راهنمای راه‌اندازی فونت یکان‌بخ (Yekan Bakh)

پیکربندی فونت دقیقاً طبق درخواست شما در پروژه آماده است:
1. پس از دانلود پروژه، فایل‌های فونت خود را با نام‌های دقیق زیر در پوشه `public/fonts/` قرار دهید:
   - `public/fonts/YekanBakhFaNum-Regular.woff2` (وزن معمولی - ۴۰۰)
   - `public/fonts/YekanBakhFaNum-Bold.woff2` (وزن ضخیم - ۷۰۰)
2. در فایل `src/index.css` کدهای `@font-face` و در `index.html` تگ `<link rel="preload">` تعبیه شده است و پروژه فوراً از آن‌ها استفاده خواهد نمود.

---

## 🏗 معماری فنی (Tech Stack)

- **فریم‌ورک**: React 19 + TypeScript 5 (حالت Strict) + Vite 6
- **مسیریابی**: React Router 7 در حالت Data Router (`createBrowserRouter`) همراه با `basename` منطبق با `VITE_BASE_PATH`
- **مدیریت وضعیت و کش سرور**: TanStack Query v5 با استراتژی ETag / 304 و مدیریت لغو درخواست‌های همزمان
- **استایل‌دهی**: Tailwind CSS v4 مبتنی بر ویژگی‌های منطقی جهت (Logical Properties: `ps-`, `pe-`, `ms-`, `me-`)
- **المان‌های دسترس‌پذیر**: Radix UI (Dialog, DropdownMenu, Tabs, Select, Switch, Checkbox)
- **نمودارها**: کامپوننت‌های دست‌نویس وکتور Inline SVG بدون نیاز به کتابخانه‌های سنگین خارجی
- **PWA**: پشتیبانی آفلاین، Service Worker اختصاصی و بنر نصب درون‌برنامه‌ای برای موبایل و دسکتاپ

---

## 🔐 امنیت و پروتکل تایید هویت مجدد (Step-Up)

1. **توکن‌های امنیتی**:
   - Access Token فقط در حافظه رم (Memory-Only) نگهداری شده و هرگز در localStorage/sessionStorage ذخیره نمی‌شود.
   - توکن تمدید نشست (Refresh Token) در کوکی امن HttpOnly (`isra_rt`) نگهداری شده و چرخش منظم دارد.
2. **پروتکل Step-Up**:
   - برای عملیات حساس، سیستم به صورت خودکار دیالوگ ۵ رقمی OTP را فعال کرده و توکن ۵ دقیقه‌ای دریافت می‌کند.
   - توسعه‌دهندگان (`developer`) از کلیه مراحل Step-Up به جز تغییر رمز شخصی معاف هستند.
   - درخواست‌های همزمان نیازمند Step-Up از صف یکپارچه (Single-Flight Promise) بهره می‌برند.

---

## 🚀 متغیرهای محیطی (.env)

```env
# مبدأ سرویس احراز هویت (LOW API)
VITE_API_LOW_URL="https://capi.israapp.ir"

# مبدأ سرویس اصلی سیستم (HIGH API)
VITE_API_HIGH_URL="https://sapi.israapp.ir"

# زیرمسیر استقرار SPA (پیش‌فرض / یا /s)
VITE_BASE_PATH="/"
```

---

## 🛡 تنظیمات امنیتی وب‌سرور (CSP)

```http
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://capi.israapp.ir https://sapi.israapp.ir; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'
```

---

## 📋 چک‌لیست انطباق بخش‌های درخواست

| بخش درخواست | وضعیت | فایل‌های پیاده‌سازی |
|---|---|---|
| فراخوانی فونت‌های یکان‌بخ با `@font-face` | ✅ پیاده‌سازی کامل | `src/index.css`, `index.html`, `public/fonts/` |
| لوگوی اصیل اسراء و آیکون‌ها | ✅ پیاده‌سازی کامل | `public/logo.svg`, `public/icons/` |
| پیاده‌سازی کلاینت HTTP و مدیریت تک‌پرواز رفرش | ✅ پیاده‌سازی کامل | `src/api/http.ts`, `src/api/auth.ts` |
| پروتکل و پنجره تایید مجدد Step-Up | ✅ پیاده‌سازی کامل | `src/api/stepUp.ts`, `src/app/StepUpModal.tsx` |
| ورود با پیامک / رمز عبور / اعتبارسنجی موبایل | ✅ پیاده‌سازی کامل | `src/features/auth/LoginRoute.tsx` |
| تغییر اجباری رمز موقت (Forced Password Change) | ✅ پیاده‌سازی کامل | `src/app/PasswordChangeForced.tsx` |
| نمای کلی و تایم‌لاین مطابق رفرنس | ✅ پیاده‌سازی کامل | `src/features/overview/OverviewRoute.tsx` |
| ماژول مدیریت کاربران و خروجی امن CSV | ✅ پیاده‌سازی کامل | `src/features/users/UsersListRoute.tsx`, `UserDetailRoute.tsx` |
| ماتریس کامل نقش × ماژول × دسترسی (RBAC) | ✅ پیاده‌سازی کامل | `src/features/access/AccessMatrixRoute.tsx` |
| رجیستری نقش‌ها، مجوزها و ماژول‌های پویا | ✅ پیاده‌سازی کامل | `RolesRoute.tsx`, `PermissionsRoute.tsx`, `ModulesRoute.tsx` |
| مدیریت جلسات قرآنی و صف نوبت تلاوت | ✅ پیاده‌سازی کامل | `src/features/sessions/SessionsListRoute.tsx`, `SessionDetailRoute.tsx` |
| گزارش‌های تحلیلی و نمودارهای SVG | ✅ پیاده‌سازی کامل | `src/features/reports/ReportsRoute.tsx`, `src/components/ui/Charts/` |
| گزارش وقایع (Audit Log) با متادیتا | ✅ پیاده‌سازی کامل | `src/features/audit/AuditRoute.tsx` |
| تنظیمات اوزان داوری و پرچم‌های عملیاتی | ✅ پیاده‌سازی کامل | `src/features/settings/SettingsRoute.tsx` |
| نصب پذیری PWA و پشتیبانی آفلاین | ✅ پیاده‌سازی کامل | `src/pwa/`, `vite.config.ts`, `public/offline.html` |
| آزمون‌های واحد (Unit Tests) | ✅ ۱۶ تست موفق | `src/tests/unit.test.ts` |

---

## 🔍 شکاف‌های قرارداد (Contract gaps)

۱. **فیلتر نقش در جست‌وجوی جلسات (H-60)**: در قرارداد `H-60` فیلترهای `status` و `creatorId` مستند شده اما فیلتر براساس نقش‌های درون‌جلسه عضو وجود ندارد که کلاینت جست‌وجوی سمت کاربر در تب Members جزئیات جلسه را جایگزین نمود.
۲. **صف نوبت دهی زنده (H-71)**: متد `H-71` به صورت تک‌درخواستی (REST Polling) مستند شده است؛ در این پیاده‌سازی از قابلیت کش هوشمند TanStack Query با فاصله‌های زمانی تنظیم‌شده استفاده شده است تا سربار سرور به حداقل برسد.
