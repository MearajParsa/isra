# STATUS — اسراء (Isra)

آخرین به‌روزرسانی: ۱۴۰۵/۰۷/۰۸ — توسط: Claude

## انجام‌شده (Done)
- بستهٔ docs-v2 برقرار است (قفل‌ها، محصول، معماری، قواعد AI، bootstrap، handoff، برنامهٔ cloud در `14`)
- `CLAUDE.md` و `.gitignore` در ریشه؛ ریپو GitHub private: `github.com/MearajParsa/isra` (شاخه `master`)
- **بوت‌استرپ مونوریپو:** ریشه (pnpm+turbo)، `apps/` ×۵، `services/` ×۳ (NestJS خالی)، `packages/` placeholder، `design/`، `media/`. `pnpm turbo lint typecheck test build` سبز (۲۰/۲۰). Android فقط فایل‌های دستی (Gradle wrapper/SDK نصب نشده؛ build نشده).
- تصمیم مالک ثبت شد در `04-platforms.md`: هر دو وب (`web-main`, `web-admin`) باید PWA باشند + اهداف عملکرد/انیمیشن

## در حال انجام (In progress)
- کارstream فعال: API — auth + low برای web-main (فقط پیش‌نویس؛ mid/high/admin خارج از scope). پیش‌نویس: `docs-v2/15-api-low-web-main-draft.md` — منتظر قفل مالک (Q1–Q8 در §۹)
- موجودی UI (فقط `web-main` بخش low): پیش‌نویس `docs-v2/16-ui-inventory-web-main-low-draft.md` — Q1=بله(mock)، Q2/Q10 تصمیم AI در §ح؛ منتظر تأیید §ح، سؤالات Q4–Q9/Q12 و design مالک؛ کد UI زده نشده. فونت‌ها در `design/fonts` آمدند (YekanBakhFaNum؛ نکات در §ح-۴)
- **UI `web-main` (بخش low) ساخته شد** — تصمیم مالک: طراحی و ساخت صفحات وب توسط AI (brief صریح؛ بدون دارایی `design/low`). روی mock قرارداد پیش‌نویس `15` (قفل‌نشده؛ لایهٔ `apps/web-main/src/lib/api` با نقطهٔ تعویض `api/index.ts`). پوشش: خانه (guest=landing SSR / member=داشبورد)، جلسات + جزئیات، ورود (OTP/رمز/فراموشی/onboarding)، step-up، gate، حساب/پروفایل/رمز/نشست‌ها، اینباکس، امتیاز، حالت‌های خطا/آفلاین/۴۰۴، PWA (manifest + service worker + offline.html + نوار نصب). **ساخته نشد:** `low_map` (Q4)، `low_quran` + تب مصحف (Q6)، آواتار (Q5)، بخش mid. `pnpm turbo lint typecheck test build --filter=@isra/web-main` سبز؛ ۳۶ تست واحد.
  - mock: OTP همیشه `12345`؛ کاربر موجود `09121234567`/رمز `isra1234`؛ `...0000`=RATE_LIMITED؛ `...1111`=ارسال ناموفق؛ سناریو با `?mock=error|empty|slow|offline|maintenance|off`.
  - فرض‌های ثبت‌شده: step-up برای تعیین رمز مگر OTP کمتر از ۵ دقیقه پیش (Q8)؛ ارقام فارسی توسط فونت FaNum؛ دکمهٔ «عضویت» در جزئیات جلسهٔ member فقط اعلان «به‌زودی» است (mid).
  - تأیید‌نشده: service worker/نصب PWA در مرورگر واقعی (فقط build تست شد)؛ Lighthouse اندازه‌گیری نشد.

- **تصمیم مالک (۱۴۰۵/۰۷/۰۹):** همهٔ سؤال‌های باز (`15` §۹ و `16` §و) به AI واگذار شد؛ پاسخ‌ها در همان اسناد ثبت شد. `15` اکنون «قفل مشروط» است.
- **بازبینی مالک (۱۴۰۵/۰۷/۰۹):** لوگوی رسمی `design/logo.svg` جایگزین نشان قبلی شد (هدر/فوتر/آیکون‌های PWA/favicon؛ `scripts/gen-icons.mjs`)؛ ExtraBlack حذف و فقط Regular/Bold؛ پالت تکمیلی `#F2ECE7` `#2DD2C7` `#ACA8A5` در `THEME_TOKENS.md` و `tokens.css`.
- **بخش mid در `web-main` ساخته شد (۱۴۰۵/۰۷/۰۹):** قرارداد `docs-v2/18-api-mid-web-main-draft.md` + موجودی `19-ui-inventory-web-main-mid-draft.md` (قفل مشروط به واگذاری مالک). UI روی mock (`apps/web-main/src/lib/api/mock/midMock.ts` + `midRules.ts`): جلسه‌های من، درخواست عضویت روی جزئیات جلسه، اتاق جلسه (حضور +۵ یک‌بار، صف، نمای قرآن‌آموز/کادر، ارزیابی وزنی)، مدیریت (ساخت/ویرایش/چرخهٔ حیات رو‌به‌جلو، تأیید عضویت، نقش‌ها). realtime در mock = BroadcastChannel بین tabها + ربات نمونه در جلسهٔ s5. ۷۰ تست واحد (ماتریس نقش، manager تنها ارزیابی ندارد، +۵ یک‌بار، lifecycle).
  - کاربر نمونه `09121234567`/`isra1234`: s1 manager · s2 manager+teacher (جاری) · s3 supporter · s4/s5 student · s6 pending · s10 teacher. کاربران جدید فقط student‌اند (`0912…` اجازهٔ ساخت جلسه دارد).
  - فرض‌ها: تاریخ فرم = ورودی native + پیش‌نمایش فارسی (انتخابگر جلالی بعداً)؛ ویرایش ارزیابی نیست؛ امتیاز ارزیابی = round(score/10) (باید با mid/high قفل شود)؛ تب پایین: خانه/جلسات/جلسه‌های من/اینباکس/حساب («امتیاز» و «مدیریت» در نوار دسکتاپ و حساب).
  - **بعدی پیشنهادی:** `web-admin` (high) یا اتصال به بک‌اند واقعی؛ تأیید نشده: Socket.IO واقعی، مقیاس پایگاه‌داده.
- **اجرای محلی web-main:** `git checkout claude/exciting-pasteur-ksk14u` ← `pnpm install` ← `pnpm --filter @isra/web-main dev` ← http://localhost:5173 (PWA: `build` سپس `preview`).

## بعدی (Next)
1. کارstream API: پیش‌نویس قرارداد auth + اسکرین‌های وب (`07`,`05`,`06`) → قفل مالک
2. مالک: ظاهر ساخته‌شدهٔ `web-main` را بازبینی کند (طراحی توسط AI)؛ در صورت نیاز طراحی‌های خودش را در `design/low/` بگذارد. فونت YekanBakhFaNum گذاشته شد
3. موجودی UI برای `web-main` و `web-admin` طبق `10`
4. فرانت وب در cloud با اعتبار هدیه — **قبل از ۱۴ آبان ۱۴۰۵** (`14-cloud-credits-plan.md`)؛ بک‌اند و Android محلی

## قفل‌های تازه / پیش‌نویس در انتظار تأیید
- قفل #35 (تداوم چند-AI) در `00-locks.md` ثبت شد
- PWA برای هر دو وب: در `04` ثبت شد (قفل رسمی در `00-locks` نیاز به تأیید مالک دارد)
- نکات فنی: Nest CLI 12 روی Node 22.13 crash می‌کند → build با `tsc`، dev با `tsx watch`؛ سرویس‌ها `typescript ^7`، وب‌ها `typescript ~6` (الزام svelte-check)؛ `esbuild` در `allowBuilds` است؛ `AGENTS.md` را turbo ساخت.

## سؤالات باز
- Android: نصب SDK/Gradle wrapper و اولین build توسط مالک/جلسهٔ محلی بعدی
- نسخهٔ قطعی TypeScript در ریشه/سرویس‌ها یکدست شود

## مسیرهای کلیدی
| مورد | مسیر |
|------|------|
| ریپو | `D:\project\ai\claude\isra` — origin: `github.com/MearajParsa/isra` |
| docs-v2 | `docs-v2/` |
| STATUS | `docs-v2/STATUS.md` |
| handoff | `docs-v2/13-handoff.md` |
| برنامهٔ cloud | `docs-v2/14-cloud-credits-plan.md` |
| ماژول/فایل فعال | — |
| پیش‌نویس API/schema | `docs-v2/15-api-low-web-main-draft.md` (auth + low/web-main + L-30/31 جلسات عمومی؛ schema DB و env هنوز نه) |
