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
- کد PWA هنوز در اسکلت وب‌ها اضافه نشده (کار فرانت)

## بعدی (Next)
1. کارstream API: پیش‌نویس قرارداد auth + اسکرین‌های وب (`07`,`05`,`06`) → قفل مالک
2. مالک: طراحی‌ها (PNG/SVG + XD) و فونت YekanBakh را در `design/` بگذارد و commit/push کند
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
