# STATUS — اسراء (Isra)

آخرین به‌روزرسانی: ۱۴۰۵/۰۷/۱۰ — توسط: Claude

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
- **`web-admin` (high) ساخته شد (۱۴۰۵/۰۷/۰۹):** قرارداد `20-api-high-web-admin-draft.md` + موجودی `21-ui-inventory-web-admin-draft.md` (قفل مشروط به واگذاری مالک). صفحات: ورود (OTP/رمز، فقط دارندگان نقش سیستم)، نمای کلی، کاربران (جست‌وجو/فیلتر/صفحه‌بندی) + جزئیات (نقش‌ها و grant با step-up)، نقش‌ها و مجوزها (ماتریس با قفل‌ها)، تنظیمات (وزن ارزیابی جمع ۱۰۰، آستانهٔ نشان، پرچم‌ها، نسخه‌بندی)، گزارش‌ها (audit)، PWA. mock در `apps/web-admin/src/lib/api/mock` (کاربران نمونه رمز `isra1234`: `09121234567` مدیر کل · `09123333333` توسعه‌دهنده · `09125555555` بدون نقش؛ OTP `12345`). ۴۸ تست واحد. اجرا: `pnpm --filter @isra/web-admin dev` (پورت ۵۱۷۴).
  - تصمیم‌ها (واگذارشده): grant مستقیم `session.create` per user؛ وزن جدید فقط برای ارزیابی‌های بعدی؛ پرچم‌ها `maintenance_mode`/`registration_open`؛ قفل آخرین دارندهٔ هر نقش؛ تغییر نقش developer فقط با developer؛ cookie refresh ادمین جدا.
  - **بدهی فنی:** primitives UI، tokens، stores و auth بین `web-main` و `web-admin` کپی‌اند (قاعدهٔ «بدون god-library»)؛ پس از تثبیت، استخراج `packages/ui` را بررسی کنید (نیاز به تأیید مالک).
- **قرارداد API سازمانی (`packages/api-types` v1.0.0):** schemaهای zod برای ۷۰+ endpoint (low/mid/high) با auth، مجوز، rate-limit، cache، idempotency، SLO؛ OpenAPI 3.1 تولیدی در `packages/api-types/openapi/` (Swagger UI: `index.html`)؛ مولد + `diffOpenApi` (تشخیص تغییر ناسازگار)؛ ۶۲ تست قرارداد (سیاست امنیت/پرفورمنس، اعتبار OpenAPI، drift، ردیابی docs⇄کد)؛ تست مطابقت mock وب‌ها با قرارداد. docs: `22` (استانداردهای امنیت/پرفورمنس/نسخه‌گذاری/تست)، `23` (schema DB + ایندکس)، `24` (env). CI: `.github/workflows/ci.yml` (lint/typecheck/test/build + `openapi:check` + `openapi:breaking` + audit).
  - **بعدی:** پیاده‌سازی `services/api-low` (محلی، بدون Docker) روی همین قرارداد: Nest + zod pipe + TypeORM migration طبق `23`؛ سپس `api-mid` و `api-high`؛ تعویض `api/index.ts` وب‌ها از mock به fetch. تأیید نشده: بار واقعی (k6)، مقادیر argon2 روی سخت‌افزار تولید.
- **`services/api-low` پیاده‌سازی شد (۱۴۰۵/۰۷/۱۰)** روی قرارداد `@isra/api-types`: همهٔ ۲۷ endpoint (L-01..L-07، L-10..L-21، L-30/31، JWKS، health) با `@Route('L-xx')`؛ guard مرکزی (CSRF، JWT RS256 + نشست فعال، step-up، rate-limit durable/memory، اعتبارسنجی zod)، OTP اتمی، refresh rotation + reuse-detection، argon2id، envelope/ETag، MidClient (cache/breaker/stale-if-error)، رویدادهای داخلی + outbox (`SKIP LOCKED`) + maintenance، Swagger فقط غیر production. **۱۳۲ تست** (auth/security/contract/integration/migration/unit) روی MySQL/MariaDB واقعی سبز؛ `typecheck` و `build` سبز؛ smoke با `node dist/main.js` انجام شد. جزئیات و قرارداد internal: `services/api-low/README.md`؛ انحراف‌ها از `23`: انتهای همان سند.
  - اجرا: `pnpm --filter @isra/api-low migration:run && pnpm --filter @isra/api-low dev` (نیاز به MySQL محلی؛ README).
  - **Faraz (ایران‌پیامک):** provider طبق مستندات رسمی بازنویسی شد (`POST /ws/v1/sms/pattern`، هدر `Api-Key`؛ env: `FARAZ_API_KEY/SENDER/PATTERN_CODE/CODE_VAR`)؛ با mock تست شد، روی حساب واقعی هنوز نه.
  - **نقشه → نشان (تصمیم مالک):** `NESHAN_API_KEY` فقط env سرور. endpoint نقشه هنوز در قرارداد نیست و `platform.neshan.org` از این محیط مسدود بود؛ همراه `api-mid` پیاده می‌شود.
  - **تأیید نشده / بدهی:** چرخش کلید JWT (چند kid)؛ بار واقعی k6 و تنظیم argon2 روی سخت‌افزار تولید؛ `/security-review` و `/code-review` طبق CLAUDE.md هنوز اجرا نشده؛ CI با سرویس MySQL هنوز روی GitHub اجرا نشده.
  - **بعدی:** `api-mid` (باید `/internal/v1/public/sessions*`، `/internal/v1/users/{id}/points`، `/internal/v1/events` را طبق README ارائه دهد) سپس `api-high`؛ تعویض `api/index.ts` وب‌ها از mock به fetch واقعی.
- **`services/api-mid` پیاده‌سازی شد (۱۴۰۵/۰۷/۱۱):** همهٔ M-00..M-42 + health روی قرارداد `@isra/api-types`: جلسه و چرخهٔ حیات، عضویت/نقش درون‌جلسه، حضور (+۵ یک‌بار، زیر ۴۰ درخواست موازی تست شد)، صف (حریم خصوصی، قفل ردیف)، ارزیابی وزنی (manager تنها نه)، امتیاز/نشان، Idempotency-Key، Socket.IO، outbox به low، endpointهای internal برای low، رویدادهای ورودی (نام کاربران، تنظیمات high). **۹۸ تست** روی MariaDB واقعی سبز. smoke واقعی low+mid با هم (ورود OTP → grant → ساخت جلسه → عضویت → اینباکس در low → حضور → امتیاز در low) موفق بود. جزئیات و اجرای لوکال: `services/api-mid/README.md`.
  - **باگ واقعی که تست کشف و رفع شد:** خواندن تنظیمات داخل تراکنش اتصال دوم از pool می‌گرفت ⇒ زیر بار pool قحط می‌شد؛ + deadlock روی درج‌های موازی ⇒ `withRetry`. envelope لیست فقط برای endpointهای `list:true` (در low هم اصلاح شد).
  - **بدهی/تأیید نشده:** نشان (Neshan) هنوز نه (مستندات از container مسدود بود)؛ Socket.IO فقط single-instance؛ کد زیرساختی بین low/mid کپی است (`packages/service-kit` نیازمند تأیید مالک)؛ k6 انجام نشده؛ CI روی GitHub اجرا نشده.
  - **بعدی:** `api-high` (نقش‌ها، تنظیمات، audit؛ ناشر `system.role.changed` و `system.settings.changed`) سپس تعویض `api/index.ts` وب‌ها از mock به fetch واقعی و حذف کامل mock (تصمیم مالک).
- **اجرای محلی web-main:** `git checkout claude/exciting-pasteur-ksk14u` ← `pnpm install` ← `pnpm --filter @isra/web-main dev` ← http://localhost:5173 (PWA: `build` سپس `preview`).

## بعدی (Next)
1. `api-mid` سپس `api-high` روی `@isra/api-types`؛ اجرای `/security-review` روی api-low
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
