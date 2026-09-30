# ۰۰ — تصمیم‌های قفل‌شده (Locks)

این جدول **منبع حقیقت** است. در تعارض با هر سند قدیمی یا فرض AI، این قفل‌ها برنده می‌شوند. برای موارد قفل‌شده سؤال نپرس؛ اجرا کن.

## جدول قفل‌ها

| # | موضوع | تصمیم قفل‌شده |
|--:|-------|----------------|
| 1 | محصول | **اسراء (Isra)** — پلتفرم جلسات قرآن. ورود موبایل ایرانی (OTP/رمز)، جلسات، حضور، صف نوبت، ارزیابی، امتیاز/نشان، اینباکس. قرآن: متن PDF محلی در کلاینت؛ صوت فاز بعد با دانلود — **فاز ۱ بدون صوت**. سرور مصحف ذخیره نمی‌کند. |
| 2 | کلاینت‌ها | **۳ اپ Android جدا** (`ir.isra.low` / `ir.isra.mid` / `ir.isra.high`) + **۲ وب‌اپ**: `israapp.ir` (`web-main` = low+mid)، `admin.israapp.ir` (`web-admin` = high). iOS = همان وب به‌صورت PWA Add to Home Screen؛ **بدون** native iOS / App Store. |
| 3 | استک Android | Kotlin + Jetpack Compose برای هر ۳ اپ. |
| 4 | استک Web | SvelteKit 2 + Svelte 5 برای هر دو وب‌اپ. |
| 5 | بک‌اند | دقیقاً **۳ میکروسرویس NestJS**: `api-low`, `api-mid`, `api-high`. TypeORM + MySQL. یک instance MySQL با schema/DB منطقی جدا per service. |
| 6 | ارتباط بین‌سرویسی | فقط **internal REST** + الگوی **outbox/inbox**. Nest `EventEmitter` **فقط درون‌فرآیندی** (in-process) همان سرویس — برای ارتباط بین سرویس‌ها استفاده نشود. message broker جدا قفل نشده (نساز مگر باز شود). |
| 7 | Gateway و دامنه API | **بدون API Gateway جدا**. دامنه تولید: `api.israapp.ir` با پیشوند سطح: `/c/v1` (low/client)، `/o/v1` (mid/ops)، `/s/v1` (high/system). دامنه وب: `israapp.ir`، ادمین: `admin.israapp.ir`. |
| 8 | Auth — استثنا | **همه کلاینت‌ها** (از جمله android-mid/high و web-admin) مجازند **فقط** برای مسیرهای auth به `api-low` درخواست بزنند: `/c/v1/auth/*` یا auth مشترک زیر low. **بقیهٔ فراخوانی‌ها** فقط به سطح خودشان (`/c/v1`، `/o/v1`، `/s/v1`). Low مالک حساب، OTP، صدور توکن. Mid/High JWT را محلی با **JWKS از low** اعتبارسنجی می‌کنند (بدون hop احراز در هر درخواست غیر-auth). High مالک نقش/مجوز/ادمین سیستم. |
| 9 | JWT | الگوریتم **RS256**. Mid/High کلید عمومی را از **JWKS** سرویس low می‌خوانند. Access = **۱۵ دقیقه**؛ Refresh = **۱۴ روز** با **rotation**. Revoke خانوادهٔ session؛ step-up برای اقدام حساس. |
| 10 | SMS / OTP | ارائه‌دهنده: **Faraz SMS**. OTP: **۵ رقم**، TTL **۲ دقیقه**، حداکثر **۳ تلاش**. شماره موبایل ذخیره‌شده به شکل `09xxxxxxxxxx`. |
| 11 | Realtime | **Socket.IO** روی `api-mid` برای جلسه زنده (حضور/صف/ارزیابی وقتی اپ باز است). اینباکس در صورت نیاز poll. |
| 12 | امتیاز و نشان | امتیاز در UI سطح **low** نمایش داده می‌شود؛ داده از mid با **internal REST** به low می‌آید (کلاینت low به api-mid مستقیم نزند). نشان‌ها در جدول `badge_awards`؛ با افت امتیاز **باطل نمی‌شوند**. آستانه‌ها: ۵۰ / ۱۵۰ / ۳۰۰ / ۵۰۰. امتیاز حضور: `+5` یک‌بار per session entry. |
| 13 | نقشه | **Map.ir**؛ کلید فقط سرور. **low**: نقشهٔ کاربر (proxy). **mid**: مکان جلسه (proxy). مرز واضح؛ هر دو proxy. |
| 14 | صف نوبت | مدیریت صف: `session_manager`، `session_supporter`، و **`teacher`**. |
| 15 | ارزیابی | **فقط** `teacher` و `session_supporter`. `session_manager` **نمی‌تواند** ارزیابی ثبت کند مگر خودش هم‌زمان نقش teacher یا session_supporter داشته باشد. فرمول وزن از **high** قابل پیکربندی؛ پیش‌فرض صوت ۴۰ / لحن ۳۰ / تجوید ۳۰. |
| 16 | رسانه | فایل‌های media در پوشهٔ `media/` روی **همان host** سرویس — **نه MinIO** و نه object-storage جدا مگر unlock. |
| 17 | جلسات | زمان‌بندی انعطاف‌پذیر: یک‌باره، تکرارشونده، بازهٔ محدود. چرخهٔ حیات: `draft` → `scheduled` → `started` → `ended` — **بدون برگشت به عقب**. |
| 18 | توسعه محلی | فعلاً **بدون Docker**؛ سرویس‌ها روی ماشین توسعه اجرا می‌شوند. |
| 19 | فونت | **YekanBakh** از `design/fonts`. |
| 20 | مهمان (Guest) | همان محتوای قابل‌مرور عضو را می‌بیند؛ برای اقدام‌های نیازمند حساب → راهنما به ثبت‌نام/ورود. مهندسی رشد/رفتار: فعلاً **فقط اصل** در docs؛ جزئیات فاز بعد. |
| 21 | مونوریپو | **pnpm** + **Turborepo**. یک ریپو: ۳ android + ۲ web + ۳ Nest + `docs-v2/` + `design/`. |
| 22 | هفته | شنبه تا جمعه، timezone = `Asia/Tehran`. |
| 23 | زبان UI | فقط فارسی RTL. بدون i18n. |
| 24 | مسیر docs | `docs-v2/` در مونوریپو (= `D:\project\mobile\cursor\Isra\docs-v2`). |
| 25 | docs قدیمی | پوشهٔ `new docs/` را **تغییر نده**؛ docs-v2 منبع حقیقت است. |
| 26 | design | پوشهٔ نسبی `design/` در ریشهٔ مونوریپو؛ مالک اسکرین‌شات/کامپوننت می‌گذارد؛ AI بدون دارایی یا brief مالک UI اختراع نکند. **فهرست پر از اسکرین در docs پیش‌نوشته نمی‌شود** — قوانین کشف موجودی: `10-ui-discovery-rules.md`. |
| 27 | تم | توکن‌ها از `THEME_TOKENS.md`. Primary `#1C0E44`, secondary `#F6E8DC`, accent `#0D4A46`, surface `#FFF8F2`, accentWarm `#FDBF8A`, … |
| 28 | نقش‌ها | Guest = بدون توکن، نقش ذخیره‌شده نیست. نقش‌های سیستم `developer` و `super_admin` حذف‌نشدنی. نقش‌های جلسه: `session_manager`, `session_supporter`, `teacher`, `quran_student`. |
| 29 | ممنوع‌ها | بدون ایمیل، بدون third-party push، بدون GraphQL، بدون Redis (مگر بعداً باز شود)، بدون پرداخت، بدون چت، بدون مصحف روی سرور، بدون native iOS، بدون MinIO، بدون Docker اجباری در فاز فعلی توسعه. |
| 30 | سبک docs | tool-agnostic؛ هر AI بتواند پیاده‌سازی کند. مالک مدیریت می‌کند؛ AI کد می‌نویسد؛ مالک UI می‌دهد. |
| 31 | کشف موجودی UI | وقتی مالک شروع کلاینت را می‌خواهد، **AI پیاده‌ساز** باید طبق `10-ui-discovery-rules.md` موجودی کامل اسکرین/کامپوننت آن scope را **خودش** تولید کند (قبل از درخواست design یا کدنویسی UI). docs-v2 کاتالوگ پر از پیش پر نمی‌کند. بدون ID متناظر در موجودی + دارایی design، اسکرین کد نشود. |
| 32 | خواندن docs | AI **هرگز** کل docs-v2 را یک‌جا نمی‌خواند. پاس اول اجباری: README → `00-locks` → `01-product` → `STATUS.md` (تداوم؛ `13`). ادامه فقط پس از تأیید کارstream و طبق `11-context-and-reading.md`. |
| 33 | کاتالوگ API/DB/env | **نبودن** dump endpoint / schema کامل / فهرست env در docs **عمدی** است. تولید آن‌ها بخشی از کارstream API (یا دامنه مربوط) **با قفل مالک** است — پیش‌نویس سند، تأیید، بعد پیاده‌سازی. اختراع خاموش در کد ممنوع. |
| 34 | بوت‌استرپ مونوریپو | وقتی مالک می‌گوید شروع پروژه / bootstrap / اسکلت، **AI پیاده‌ساز** (نه مالک) اسکلت را **تعاملی** می‌سازد: طرح → تأیید مالک → scaffold خالی. جزئیات: `12-bootstrap.md`. بدون feature code؛ بدون Docker. |
| 35 | تداوم چند-AI / handoff | مالک هر زمان می‌تواند AI را عوض کند. منبع تداوم: docs-v2 + ریپو + `STATUS.md` (`docs-v2/STATUS.md` یا ریشه). پاس اول AI جدید: README → `00` → `01` → `STATUS.md` → فقط فایل‌های لازم per `11`. قبل از پایان جلسه یا وقتی مالک بگوید، AI **باید** STATUS را به‌روز کند (done / in progress / next / قفل‌های تازه / سؤالات باز / مسیرهای کلیدی). **هرگز** به حافظهٔ chat بین ابزارها تکیه نکن. جزئیات: `13-handoff.md`. |

## قفل‌های عملیاتی تکمیلی

| موضوع | مقدار |
|-------|-------|
| نقشه | Map.ir؛ API key فقط روی سرور؛ low = نقشه کاربر، mid = مکان جلسه |
| Realtime | Socket.IO روی api-mid |
| امتیاز حضور | `+5` یک‌بار به ازای ورود به هر جلسه |
| وزن ارزیابی پیش‌فرض | صوت ۴۰ / لحن ۳۰ / تجوید ۳۰ (قابل تنظیم از high) |
| آستانه نشان‌ها | ۵۰ / ۱۵۰ / ۳۰۰ / ۵۰۰؛ جدول `badge_awards`؛ بدون revoke با افت امتیاز |
| OTP | ۵ رقم، ۲ دقیقه، ۳ تلاش؛ Faraz SMS؛ تلفن `09xxxxxxxxxx` |
| Access / Refresh | ۱۵ دقیقه / ۱۴ روز rotating؛ JWT RS256 + JWKS از low |
| API version و پیشوند تولید | `/c/v1`, `/o/v1`, `/s/v1` روی `api.israapp.ir` |
| Auth استثنا برای همه کلاینت‌ها | فقط `/c/v1/auth/*` (یا auth مشترک low) به api-low؛ بقیه به سطح خود |
| Android applicationId | `ir.isra.low`, `ir.isra.mid`, `ir.isra.high` |
| دامنه وب | `israapp.ir`, `admin.israapp.ir` |
| رسانه | پوشه `media/` روی همان host |
| فونت | YekanBakh (`design/fonts`) |
| ابزار مونوریپو | pnpm + Turborepo |
| ارتباط بین‌سرویسی | internal REST + outbox/inbox؛ EventEmitter فقط in-process |
| Shared libs اختیاری | مثلاً `packages/jwt-verify`, `packages/api-types` — سرویس‌ها مستقل بمانند |
| کشف UI | `10-ui-discovery-rules.md` — موجودی را AI پیاده‌ساز on-demand می‌سازد |
| خواندن تدریجی | `11-context-and-reading.md` — بدون dump-read کل بسته |
| مشخصات API/DB/env | نبودن dump عمدی؛ تولید با مالک در کارstream مربوط |
| بوت‌استرپ | `12-bootstrap.md` — اسکلت توسط AI پس از تأیید مالک؛ اولین کارstream شروع از صفر |
| تداوم چند-AI | `13-handoff.md` + `STATUS.md` — تعویض AI آزاد؛ بدون تکیه به chat |

## ساخته نمی‌شود (قفل منفی)

| مورد | وضعیت |
|------|--------|
| یک اپ Android واحد برای همه سطوح | ساخته نمی‌شود |
| یک Nest monolith | ساخته نمی‌شود |
| API Gateway جدا | ساخته نمی‌شود |
| message broker اجباری | ساخته نمی‌شود |
| Nest EventEmitter برای ارتباط بین‌سرویسی | ساخته نمی‌شود (فقط in-process) |
| Redis | ساخته نمی‌شود (مگر unlock) |
| GraphQL | ساخته نمی‌شود |
| ایمیل / پرداخت / چت | ساخته نمی‌شود |
| ذخیره متن مصحف روی سرور | ساخته نمی‌شود |
| صوت قرآن در فاز ۱ | ساخته نمی‌شود (فاز بعد با دانلود) |
| MinIO / object-storage جدا | ساخته نمی‌شود (مگر unlock) |
| Docker اجباری در توسعه فعلی | ساخته نمی‌شود |
| native iOS / App Store | ساخته نمی‌شود |
| i18n / UI انگلیسی | ساخته نمی‌شود |
| نقش ذخیره‌شدهٔ `guest` | ساخته نمی‌شود |
| ارزیابی توسط session_manager به‌تنهایی | ساخته نمی‌شود |
| برگشت وضعیت جلسه به عقب | ساخته نمی‌شود |
| کاتالوگ پر اسکرین از پیش در docs | ساخته نمی‌شود — کشف طبق `10-ui-discovery-rules.md` |
| dump کامل endpoint / OpenAPI از پیش در docs | ساخته نمی‌شود — عمدی؛ تولید در کارstream API با قفل مالک (`11`, `07`) |
| schema/env کامل از پیش بدون کارstream | ساخته نمی‌شود — پیش‌نویس + قفل مالک قبل از کد |
| dump-read کل docs-v2 توسط AI در یک نوبت | ساخته نمی‌شود — `11-context-and-reading.md` |
| انتظار ساخت دستی اسکلت توسط مالک وقتی trigger بوت‌استرپ گفته | ساخته نمی‌شود — AI می‌سازد (`12`, قفل #34) |
| feature code یا Docker داخل بوت‌استرپ | ساخته نمی‌شود — فقط scaffold خالی |
| تکیه به حافظهٔ chat بین AIها / بستن جلسه بدون STATUS | ساخته نمی‌شود — `13-handoff.md`، قفل #35 |

## قانون تعارض

```
قفل این فایل > docs-v2 دیگر > فرض AI > اسناد قدیمی (new docs/)
```
