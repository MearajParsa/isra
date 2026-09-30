# ۱۲ — کارstream بوت‌استرپ مونوریپو (Bootstrap)

وقتی مالک می‌گوید پروژه را **شروع** کن، **AI پیاده‌ساز** (نه مالک) اسکلت مونوریپو را **تعاملی** می‌سازد. این سند کارstream اول برای شروع از صفر است.

## نقش‌ها

| نقش | کار |
|-----|-----|
| مالک | فقط دستور شروع می‌دهد، طرح را تأیید/اصلاح می‌کند، مسیر `docs-v2` را مشخص می‌کند |
| AI پیاده‌ساز | طرح می‌دهد → پس از تأیید اسکلت را می‌سازد؛ کد ویژگی نمی‌نویسد |

مالک اسکلت را دستی نمی‌سازد مگر صریحاً بگوید.

## عبارات محرک (Trigger)

هر یک از این‌ها (یا معادل واضح) کارstream بوت‌استرپ را فعال می‌کند:

- «شروع پروژه» / «پروژه را شروع کن» / «بریم شروع کنیم»
- `bootstrap` / «بوت‌استرپ» / «بوت استرپ»
- «اسکلت» / «اسکلت مونوریپو» / «scaffold»
- «ریپو را بساز» / «مونوریپو را راه بینداز» / «از صفر شروع کن»

اگر مونوریپو از قبل اسکلت کامل دارد: بگو موجود است و بدون تأیید دوباره نساز؛ فقط کمبودها را گزارش کن.

## جریان تعاملی (اجباری)

```
مالک: عبارت محرک
  → AI: طرح پیشنهادی اسکلت + checklist خروجی‌ها + سؤال تأیید
مالک: تأیید / اصلاح
  → AI: فقط اسکلت خالی (بدون feature code، بدون Docker)
  → AI: گزارش فایل‌ها + به‌روزرسانی STATUS (`13`) + «بعدی: کارstreamهای ۱۱ (مثلاً API)»
```

بدون تأیید مالک پوشه/فایل ریشه نساز. بعد از بوت‌استرپ، کارstream بعدی را طبق [`11-context-and-reading.md`](./11-context-and-reading.md) پیشنهاد بده (معمولاً API).

## آنچه AI پس از تأیید می‌سازد

### ریشه (pnpm + Turborepo)

| مورد | توضیح |
|------|--------|
| `package.json` ریشه | workspace با pnpm؛ اسکریپت‌های حداقلی turbo |
| `pnpm-workspace.yaml` | `apps/*`, `services/*`, `packages/*` |
| `turbo.json` | pipeline خالی/حداقلی (build/dev/lint در حد placeholder) |
| `.npmrc` / تنظیمات pnpm لازم | در حد نیاز scaffold |
| `README.md` ریشه | نقشه مونوریپو، applicationIdها، لینک به `docs-v2/`، دستورات حداقلی |
| `.gitignore` | node_modules، build، `.env`، IDE، media محلی حساس، Android/local |
| `.env.example` (stubs) | فقط نام متغیرهای شناخته‌شده از قفل‌ها — **بدون secret واقعی**؛ dump کامل env عمداً نیست (`00`/`11`) |

**بدون Docker** (قفل ۱۸ / ۲۹). فایل `Dockerfile` / `docker-compose` نساز.

### apps/

```
apps/
├── android-low/     # Kotlin + Compose — applicationId ir.isra.low
├── android-mid/     # ir.isra.mid
├── android-high/    # ir.isra.high
├── web-main/        # SvelteKit 2 + Svelte 5 — israapp.ir
└── web-admin/       # SvelteKit 2 + Svelte 5 — admin.israapp.ir
```

هر اپ: اسکلت خالی قابل‌باز شدن (Gradle/SvelteKit init در حد shell). **بدون** اسکرین واقعی، بدون feature، بدون اختراع UI.

### services/

```
services/
├── api-low/     # NestJS خالی — پیشوند هدف /c/v1
├── api-mid/     # NestJS خالی — /o/v1 (+ جای Socket.IO بعداً)
└── api-high/    # NestJS خالی — /s/v1
```

فقط shell خالی Nest (ماژول/کنترلر پیش‌فرض حداقلی یا معادل generate). **بدون** endpoint ویژگی، بدون schema کامل، بدون منطق auth/جلسه.

### packages/ (اختیاری)

فقط اگر در طرح تأییدشده لازم بود — در غیر این صورت پوشه خالی یا نساز:

| پکیج | نقش در بوت‌استرپ |
|------|-------------------|
| `packages/jwt-verify` | placeholder خالی (نام/README) — بدون پیاده‌سازی |
| `packages/api-types` | placeholder خالی — بدون DTO واقعی |

سرویس‌ها باید مستقل بمانند؛ god-library نساز.

### design/

ساختار خالی مطابق [`08-design-handoff.md`](./08-design-handoff.md):

```
design/
├── README.md          # توضیح کوتاه + ارجاع به 08 و 10
├── fonts/             # خالی تا مالک YekanBakh بگذارد (یا .gitkeep)
├── low/
├── mid/
├── high/
├── components/
└── tokens/            # اختیاری
```

بدون اسکرین‌شات جعلی.

### media/

یادداشت یا placeholder (مثلاً `media/.gitkeep` + یک خط در README ریشه): فایل‌های media روی **همان host** سرویس — **نه MinIO**. محتوای media را commit نکن مگر مالک بگوید.

### docs-v2

کپی یا لینک/`junction`/`symlink` طبق آنچه **مالک مشخص می‌کند**. مسیر هدف شناخته‌شده: `docs-v2/` در ریشه (= `D:\project\mobile\cursor\Isra\docs-v2`). اسناد قدیمی `new docs/` را دست نزن.

## شناسه‌های فنی در اسکلت

| مورد | مقدار قفل |
|------|-----------|
| Android applicationId | `ir.isra.low`, `ir.isra.mid`, `ir.isra.high` |
| دامنه وب | `israapp.ir`, `admin.israapp.ir` |
| API host (یادداشت) | `api.israapp.ir` با `/c/v1` `/o/v1` `/s/v1` |
| ابزار | pnpm + Turborepo |
| timezone (یادداشت README) | `Asia/Tehran` |

این شناسه‌ها در README ریشه و تنظیمات اپ (applicationId / نام پکیج) منعکس شوند.

## ممنوع در بوت‌استرپ

| ممنوع | |
|-------|--|
| کد ویژگی (auth، جلسه، صف، UI واقعی، …) | |
| Docker / docker-compose | |
| Redis، Gateway، MinIO، GraphQL، broker | |
| dump کامل OpenAPI / schema / env در کد | |
| اختراع اسکرین یا پر کردن `design/` با UI جعلی | |
| تغییر `new docs/` | |
| باز کردن قفل‌های `00-locks` | |

پس از اسکلت: **متوقف شو** و کارstream بعدی را پیشنهاد بده؛ خودسر به API/UI عمیق نرو مگر مالک بگوید.

## بعد از بوت‌استرپ — کارstreamهای بعدی

ترتیب پیشنهادی (مالک انتخاب می‌کند؛ جزئیات خواندن: `11`):

1. **API / بک‌اند** — پیش‌نویس endpoint/schema با قفل مالک (`07`, `02`, `05`, `06`)
2. Auth (زیرمجموعه API / `05`)
3. دامنه mid / low / high به‌تفکیک
4. کلاینت‌ها + کشف UI (`10`) سپس design (`08`)

بوت‌استرپ **اولین** کارstream وقتی از صفر شروع می‌شود؛ پاس اول docs: README → `00` → `01` → `STATUS.md` (`13`)، سپس این سند را برای اجرای اسکلت deep-read کن.

پس از ساخت اسکلت (یا اگر نیمه‌کاره ماند): `STATUS.md` را با Done/Next به‌روز کن تا AI بعدی بدون chat ادامه دهد — [`13-handoff.md`](./13-handoff.md).

## چک‌لیست تحویل به مالک

- [ ] طرح تأیید شده بود
- [ ] ریشه: pnpm + turbo + README + `.gitignore` + env example stubs
- [ ] `apps/` ×۵ و `services/` ×۳ shell خالی
- [ ] `packages/` فقط در حد تأیید (یا خالی)
- [ ] `design/` ساختار خالی per 08؛ `media/` note/placeholder
- [ ] `docs-v2` طبق دستور مالک
- [ ] applicationIdها درست
- [ ] بدون feature code؛ بدون Docker
- [ ] پیشنهاد کارstream بعدی ثبت شد
- [ ] `STATUS.md` به‌روز شد (Done اسکلت + Next کارstream) per `13`

## ارجاعات

- قفل مونوریپو / Docker / applicationId: [`00-locks.md`](./00-locks.md) (#18, #21, #29, #34)
- چیدمان: [`02-architecture.md`](./02-architecture.md)
- design خالی: [`08-design-handoff.md`](./08-design-handoff.md)
- قواعد AI: [`09-ai-working-rules.md`](./09-ai-working-rules.md)
- خواندن و کارstream: [`11-context-and-reading.md`](./11-context-and-reading.md)
- تداوم / STATUS پس از اسکلت: [`13-handoff.md`](./13-handoff.md)
