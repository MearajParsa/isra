# STATUS — اسراء (Isra)

آخرین به‌روزرسانی: پس از بوت‌استرپ — توسط: Claude

## انجام‌شده (Done)
- بستهٔ docs-v2 برقرار است (قفل‌ها، محصول، معماری، قواعد AI، bootstrap، handoff)
- راهنمای مالک: `OWNER_PLAYBOOK.md` (فارسی) + لینک برجسته در README
- سند تداوم چند-AI: `13-handoff.md` + قفل #35
- **بوت‌استرپ مونوریپو انجام شد:** ریشه (pnpm+turbo)، `apps/` ×۵، `services/` ×۳ (NestJS خالی)، `packages/` placeholder، `design/`، `media/`. `pnpm turbo lint typecheck test build` سبز (۲۰/۲۰). Android فقط فایل‌های دستی (Gradle wrapper/SDK نصب نشده؛ build نشده).

## در حال انجام (In progress)
- —
- کارstream فعال: هیچ (منتظر دستور مالک — پیشنهاد: API/auth draft)
- آخرین گام کامل‌شده: افزودن قواعد handoff و همگام‌سازی docs-v2
- شاخه/مسیر کد: مونوریپو اسکلت شده (master)

## بعدی (Next)
1. کارstream API: پیش‌نویس قرارداد auth (`07`,`05`,`06`) → قفل مالک
2. مالک ریپوی GitHub private می‌سازد و push می‌کند (پیش‌نیاز cloud — `14-cloud-credits-plan.md`)
3. کارstream API: فقط پیش‌نویس قرارداد auth + اسکرین‌های وب → قفل مالک
4. موجودی UI برای web-main/web-admin → مالک design را commit می‌کند
5. فرانت (web-main/web-admin) در cloud با اعتبار هدیه — **قبل از ۱۴ آبان ۱۴۰۵**؛ بک‌اند/Android محلی

توجه: `14-cloud-credits-plan.md` برنامهٔ اجرایی است نه قفل. git محلی هست (commit اولیه)، remote هنوز نیست.

## قفل‌های تازه / پیش‌نویس در انتظار تأیید
- قفل #35 (تداوم چند-AI) در `00-locks.md` ثبت شد
- نکات فنی: Nest CLI 12 روی Node 22.13 crash می‌کند → build با `tsc`، dev با `tsx watch`؛ TS ~5.8 ریشه/۳ سرویس (نسخهٔ نصب‌شده ممکن ۷ باشد — سرویس‌ها `typescript ^7`)، وب‌ها `typescript ~6` (الزام svelte-check)؛ `esbuild` در `allowBuilds` است؛ `AGENTS.md` را turbo ساخت.

## سؤالات باز
- Android: نصب SDK/Gradle wrapper و اولین build توسط مالک/جلسهٔ محلی بعدی

## مسیرهای کلیدی
| مورد | مسیر |
|------|------|
| docs-v2 (باکس) | `/workspace/docs-v2/` |
| docs-v2 (مونوریپو) | `D:\project\mobile\cursor\Isra\docs-v2` |
| STATUS | `docs-v2/STATUS.md` (همین فایل؛ یا ریشهٔ ریپو اگر مالک جابه‌جا کرد) |
| handoff | `docs-v2/13-handoff.md` |
| ماژول/فایل فعال | — |
| پیش‌نویس API/schema | — |
