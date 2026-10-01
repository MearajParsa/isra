# مستندات اسراء (Isra) — docs-v2

بستهٔ مستندات AI-agnostic برای پیاده‌سازی پلتفرم جلسات قرآن **اسراء**. این پوشه منبع حقیقت است؛ اسناد قدیمی (`new docs/`) را تغییر ندهید و در تعارض با این بسته، **قفل‌ها** مقدم‌اند.

## برای مالک انسانی (Mearaj)

**شروع از اینجا:** [`OWNER_PLAYBOOK.md`](./OWNER_PLAYBOOK.md) — راهنمای کامل مدیریت پروژه (عبارات دستور به AI، تأییدها، handoff، ترتیب کار). شما فقط مدیریت می‌کنید؛ کدنویسی با AI است.

## مخاطب

- **مالک انسانی:** فقط [`OWNER_PLAYBOOK.md`](./OWNER_PLAYBOOK.md) را دنبال کنید (مدیریت، تأیید، طراحی)
- هر عامل کدنویس AI (بدون وابستگی به Cursor/Claude یا ابزار خاص)
- مالک پروژه فقط مدیریت می‌کند، اسکرین‌شات UI می‌دهد، و کد را AI می‌نویسد

## خواندن تدریجی (اجباری — نه dump کل بسته)

**هرگز کل docs-v2 را یک‌جا نخوان.** جزئیات کامل: [`11-context-and-reading.md`](./11-context-and-reading.md). تداوم بین چند AI / تعویض ابزار: [`13-handoff.md`](./13-handoff.md) — به حافظهٔ chat تکیه نکن؛ `STATUS.md` را بخوان و قبل از پایان جلسه به‌روز کن.

### پاس اول (همیشه — این چهار + STATUS)

| ترتیب | فایل | هدف |
|------:|------|-----|
| 1 | [README.md](./README.md) | همین نقشه |
| 2 | [00-locks.md](./00-locks.md) | تصمیم‌های قفل‌شده |
| 3 | [01-product.md](./01-product.md) | محصول، سطوح، نقش‌ها، غیرهدف‌ها |
| 4 | `STATUS.md` | وضعیت زنده (معمولاً [STATUS.md](./STATUS.md) یا ریشهٔ ریپو) — ببین [`13-handoff.md`](./13-handoff.md) |

### بعد از تأیید کارstream توسط مالک

بر اساس نوع کار (bootstrap / API / mid / android-low / …) فقط فایل‌های جدول در `11-context-and-reading.md` را deep-read کن. اول طرح + breakdown بده و تأیید بگیر؛ بعد عمق برو.

**شروع از صفر:** اگر مالک «شروع پروژه / bootstrap / اسکلت» گفت، کارstream اول [`12-bootstrap.md`](./12-bootstrap.md) است — AI (نه مالک) اسکلت مونوریپو را پس از تأیید می‌سازد؛ بدون feature code و بدون Docker.

### فهرست فایل‌ها (مرجع — برای خواندن انتخابی)

| فایل | هدف |
|------|-----|
| [OWNER_PLAYBOOK.md](./OWNER_PLAYBOOK.md) | راهنمای مالک انسانی — مدیریت، عبارات دستور، تأیید، handoff |
| [00-locks.md](./00-locks.md) | تصمیم‌های قفل‌شده |
| [01-product.md](./01-product.md) | محصول، سطوح، نقش‌ها، غیرهدف‌ها |
| [02-architecture.md](./02-architecture.md) | مونوریپو، سرویس‌ها، کلاینت‌ها، داده، ارتباط |
| [03-features.md](./03-features.md) | فهرست ویژگی‌ها بر اساس دامنه |
| [04-platforms.md](./04-platforms.md) | Android ×3، Web ×2، iOS PWA |
| [05-auth-security.md](./05-auth-security.md) | OTP، JWT، session، step-up، مجوزها |
| [06-domains/](./06-domains/) | مسئولیت‌های low / mid / high |
| [07-api-conventions.md](./07-api-conventions.md) | قرارداد REST (پیشوندهای `/c/v1` `/o/v1` `/s/v1`) — بدون dump endpoint |
| [08-design-handoff.md](./08-design-handoff.md) | مصرف `design/`؛ ممنوعیت اختراع UI |
| [09-ai-working-rules.md](./09-ai-working-rules.md) | قواعد کار AI؛ انضباط توکن؛ پیش‌نویس مشخصات گم‌شده |
| [10-ui-discovery-rules.md](./10-ui-discovery-rules.md) | کشف موجودی UI توسط AI پیاده‌ساز (نه کاتالوگ ازپیش‌پر) |
| [11-context-and-reading.md](./11-context-and-reading.md) | خواندن تدریجی، سقف فایل، working memory، کارstream |
| [12-bootstrap.md](./12-bootstrap.md) | کارstream بوت‌استرپ: AI اسکلت مونوریپو را تعاملی می‌سازد |
| [13-handoff.md](./13-handoff.md) | تداوم چند-AI؛ STATUS.md؛ تحویل جلسه؛ عدم تکیه به chat |
| [14-cloud-credits-plan.md](./14-cloud-credits-plan.md) | برنامهٔ اجرای فرانت در cloud با اعتبار هدیه؛ بقیه محلی (نه قفل) |
| [15](./15-api-low-web-main-draft.md) · [18](./18-api-mid-web-main-draft.md) · [20](./20-api-high-web-admin-draft.md) | قراردادهای API (low/mid/high) — قفل مشروط؛ ماشین‌خوان در `packages/api-types` |
| [16](./16-ui-inventory-web-main-low-draft.md) · [19](./19-ui-inventory-web-main-mid-draft.md) · [21](./21-ui-inventory-web-admin-draft.md) | موجودی UI (web-main low/mid، web-admin) |
| [22-api-engineering-standards.md](./22-api-engineering-standards.md) | امنیت، پرفورمنس (SLO)، نسخه‌گذاری، تست، CI |
| [23-db-schema-draft.md](./23-db-schema-draft.md) · [24-env-draft.md](./24-env-draft.md) | schema DB با ایندکس‌ها، پیکربندی env |
| [STATUS.md](./STATUS.md) | وضعیت زندهٔ کارstream (ایجاد/به‌روز توسط AI — ببین 13) |
| [THEME_TOKENS.md](./THEME_TOKENS.md) | توکن‌های تم (رنگ، تایپ، فاصله) |

## چه چیزی قفل است؟

خلاصه: ۳ اپ Android جدا (`ir.isra.low|mid|high`)، ۲ وب‌اپ (`israapp.ir` / `admin.israapp.ir`)، ۳ میکروسرویس NestJS، بدون API Gateway، Auth در low (همه کلاینت‌ها فقط برای `/c/v1/auth/*` به low)، JWT RS256+JWKS، Faraz SMS، Socket.IO روی mid، pnpm+Turborepo، بدون Docker محلی فعلی، بوت‌استرپ اسکلت توسط AI (نه مالک)، هفته شنبه–جمعه (Asia/Tehran)، UI فقط فارسی RTL، بدون iOS native / ایمیل / GraphQL / Redis / پرداخت / چت / مصحف روی سرور / MinIO.

جزئیات کامل در `00-locks.md`.

## موجودی UI

docs-v2 **کاتالوگ پر اسکرین ندارد**. وقتی مالک شروع یک کلاینت را می‌خواهد، AI پیاده‌ساز طبق `10-ui-discovery-rules.md` موجودی کامل را on-demand تولید می‌کند؛ سپس مالک در `design/` طراحی می‌کند.

## مسیرها

| محل | مسیر |
|-----|------|
| روی این باکس (نوشتهٔ فعلی) | `/workspace/docs-v2/` |
| در مونوریپو نهایی | `docs-v2/` (معادل `D:\project\mobile\cursor\Isra\docs-v2`) |
| دارایی‌های طراحی | `design/` در ریشهٔ مونوریپو (فونت: `design/fonts` = YekanBakh) |

## شناسه‌های فنی

مسیرها، کلیدهای permission، نام کد، نام پوشه، و کلیدهای API به **انگلیسی** می‌مانند. متن توضیحی به **فارسی** است.

## ساخته نمی‌شود در این بسته

- dump کامل OpenAPI / لیست endpointهای تمام‌عیار از پیش (فقط conventions؛ تولید dump بخشی از کارstream API با مالک است — ببین `00-locks` و `11`)
- کاتالوگ ازپیش‌پر اسکرین در docs (کشف on-demand توسط AI پیاده‌ساز)
- اختراع اسکرین بدون دارایی در `design/`
- تغییر اسناد قدیمی
- خواندن یک‌جای تمام فایل‌های docs-v2 توسط AI
- انتظار اینکه مالک اسکلت مونوریپو را دستی بسازد وقتی گفته «شروع پروژه» — بوت‌استرپ کار AI است (`12`)
- تکیه به حافظهٔ chat بین ابزارها؛ بستن جلسه بدون به‌روزرسانی `STATUS.md` — ببین `13`
