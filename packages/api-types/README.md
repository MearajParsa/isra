# @isra/api-types

قرارداد API اسراء — **منبع حقیقت** برای `api-low` (`/c/v1`)، `api-mid` (`/o/v1`) و `api-high` (`/s/v1`).

```
src/core      خطاها، envelope، هدرها، primitives، defineEndpoint، health
src/domain    مدل‌های مشترک (جلسه، امتیاز)
src/low|mid|high   schemaهای zod + فهرست endpointها (id، auth، مجوز، rate-limit، cache، SLO)
src/openapi   مولد OpenAPI 3.1 و تشخیص تغییر ناسازگار
openapi/      خروجی تولیدی (Swagger) — دستی ویرایش نشود
tests/        تست‌های قرارداد (امنیت، پرفورمنس، اعتبار OpenAPI، drift، ردیابی docs)
```

## استفاده
```ts
// سرویس (Nest): اعتبارسنجی با همان schema
import { ENDPOINTS, low, ERROR_CATALOG } from '@isra/api-types';
low.OtpRequestBody.parse(body);

// کلاینت (فقط نوع؛ zod وارد bundle نمی‌شود)
import type { low } from '@isra/api-types';
type Me = import('zod').infer<typeof low.Me>;
```

## دستورها
| دستور | کار |
|-------|-----|
| `pnpm --filter @isra/api-types openapi` | بازتولید `openapi/*.json` و `index.html` (Swagger UI) |
| `pnpm --filter @isra/api-types openapi:check` | CI: فایل‌ها به‌روزند؟ |
| `pnpm --filter @isra/api-types openapi:breaking [-- <ref>]` | CI: تغییر ناسازگار نسبت به یک ref گیت |
| `pnpm --filter @isra/api-types test` | تست‌های قرارداد |

Swagger UI محلی: `npx http-server packages/api-types/openapi` و باز کردن `index.html`.

## افزودن/تغییر endpoint
1. schema و `defineEndpoint` را در `src/<service>` بنویسید (auth، مجوز، rate-limit، cache، SLO).
2. `pnpm --filter @isra/api-types openapi` و تست‌ها را اجرا کنید.
3. docs (`docs-v2/15|18|20`)، mock وب‌ها و `CHANGELOG.md` را به‌روز کنید؛ `CONTRACT_VERSION` را طبق semver ببرید بالا.
4. تغییر ناسازگار ⇒ مسیر نسخهٔ جدید (v2)؛ `docs-v2/22` §۵.
