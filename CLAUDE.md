# اسراء (Isra) — قواعد پروژه برای Claude

منبع حقیقت: `docs-v2/` (اسناد قدیمی `new docs/` را ویرایش نکن). ترتیب اولویت: `00-locks.md` > بقیه docs-v2 > `STATUS.md` > design مالک > فرض AI.

## شروع هر جلسه (اجباری، کوچک)
فقط این‌ها را بخوان و بعد متوقف شو: `docs-v2/README.md` → `00-locks.md` → `01-product.md` → `docs-v2/STATUS.md`.
- **هرگز کل docs-v2 را یک‌جا نخوان.** بعد از تأیید کارstream فقط فایل‌های جدول `docs-v2/11-context-and-reading.md` را بخوان (سقف ۳–۵ فایل).
- به حافظهٔ chat تکیه نکن؛ تداوم فقط از `STATUS.md` (`docs-v2/13-handoff.md`).

## روند کار
1. مالک کارstream را می‌گوید → **طرح کوتاه + breakdown شماره‌دار + سؤال تأیید** بده. بدون تأیید deep-read/کد نزن.
2. مشخصات گم‌شده (endpoint، schema DB، env) → پیش‌نویس markdown در `docs-v2/` → قفل مالک → بعد کد. در کد چیزی اختراع نکن.
3. «شروع پروژه / bootstrap / اسکلت» → `docs-v2/12-bootstrap.md`؛ فقط scaffold خالی، بدون feature code و بدون Docker.
4. شروع کلاینت/UI → اول موجودی UI طبق `10-ui-discovery-rules.md`؛ UI فقط با دارایی `design/`.
5. **پایان جلسه:** `docs-v2/STATUS.md` را به‌روز کن (done / in progress / next / قفل‌های تازه / سؤالات باز / مسیرهای کلیدی).

## پشته (قفل‌شده — سؤال نپرس)
- pnpm + Turborepo، بدون Docker محلی
- بک‌اند: ۳ سرویس NestJS + TypeORM + MySQL (سه schema جدا): `api-low` (`/c/v1`)، `api-mid` (`/o/v1` + Socket.IO)، `api-high` (`/s/v1`). بدون API Gateway.
- Auth فقط در low (OTP فراز، JWT RS256 + JWKS، access ۱۵ دقیقه، refresh ۱۴ روز)؛ mid/high محلی verify می‌کنند.
- وب: SvelteKit 2 + Svelte 5 (`web-main`، `web-admin`). اندروید: Kotlin + Compose، سه اپ جدا (`ir.isra.low|mid|high`).
- UI فقط فارسی RTL، فونت YekanBakh، بدون i18n. هفته شنبه–جمعه (Asia/Tehran).
- ارتباط بین‌سرویسی: internal REST + outbox/inbox. EventEmitter فقط in-process.

## ممنوع (بدون unlock مالک)
Redis، GraphQL، API Gateway، MinIO، message broker، Docker اجباری، iOS native، ایمیل، پرداخت، چت، مصحف روی سرور، صوت قرآن فاز ۱، import مستقیم کد بین سرویس‌ها، کلید/secret در کلاینت (Map.ir فقط سرور)، اختراع اسکرین بدون design.

## کیفیت
- TypeScript سخت؛ Kotlin idiomatic؛ اعتبارسنجی ورودی در مرز API؛ خطاها طبق `07-api-conventions.md`.
- لاگ بدون PII (OTP کامل، توکن خام).
- تست حداقل: auth، حضور یک‌باره‌امتیاز، مجوز صف/ارزیابی (supporter+teacher)، عدم ارزیابی manager به‌تنهایی.
- هر کارstream با `pnpm turbo lint typecheck test` سبز تمام شود (پس از bootstrap).
- قبل از merge بخش‌های حساس (auth/JWT/OTP): `/security-review` و `/code-review`.

## Cloud در برابر محلی (`docs-v2/14-cloud-credits-plan.md`)
- فرانت (`web-main`, `web-admin`) در cloud session؛ بک‌اند و Android محلی.
- جلسهٔ cloud فقط در `apps/web-*` و `packages/api-types` کار کند، روی branch جدا و با PR؛ به `services/` و `apps/android-*` دست نزند.
- فرانت روی mock بر پایهٔ قرارداد قفل‌شده ساخته می‌شود؛ بدون design متناظر در ریپو، UI نساز.
- بعد از هر task: `STATUS.md` به‌روز شود.

## زبان و صرفه‌جویی توکن
- توضیحات و docs فارسی؛ شناسه‌های فنی (مسیر، کلید permission، نام کد) انگلیسی.
- پاسخ‌ها کوتاه؛ فایل‌های تغییرنیافته و قفل‌های خوانده‌شده را دوباره نخوان.
- برای هر کارstream جلسهٔ جدید؛ بین کارهای نامرتبط `/clear`.
- Subagent فقط برای کار مستقل و موازی پس از قفل قرارداد.
