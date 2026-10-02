# ۲۲ — استانداردهای مهندسی API (امنیت، پرفورمنس، نسخه‌گذاری، تست)

**وضعیت: قفل مشروط (۱۴۰۵/۰۷/۰۹)** — مالک تصمیم‌ها را واگذار کرد. این سند الزامات **پیاده‌سازی `api-low/mid/high`** است؛ قرارداد ماشین‌خوان در `packages/api-types` (zod → OpenAPI 3.1) است و مقدم بر هر توضیح متنی. قفل‌های `00` مقدم‌اند (بدون Redis/Gateway/Docker/broker).

## ۱. اصل «قرارداد اول» (contract-first)
```
schemaهای zod (packages/api-types)  ──►  OpenAPI 3.1 (openapi/*.json)  ──►  Swagger UI / تست‌ها / mock
        │                                                                     
        └──► اعتبارسنجی ورودی در Nest (همان schema)  ◄── کلاینت‌ها فقط `import type`
```
- منبع حقیقت: `packages/api-types/src/{low,mid,high}`؛ هر endpoint یک `defineEndpoint` با auth، مجوز، rate-limit، cache، idempotency و SLO.
- فایل‌های `openapi/*.json` **تولیدی‌اند** (`pnpm --filter @isra/api-types openapi`)؛ دستی ویرایش نشوند. CI با `openapi:check` drift را رد می‌کند و `openapi:breaking` تغییر ناسازگار را نسبت به `master`.
- وب‌اپ‌ها فقط `import type` از پکیج می‌کنند (zod در bundle کلاینت نمی‌آید — پرفورمنس) و mockها با تست `contract.test.ts` به قرارداد وصل‌اند.

### الگوی پیاده‌سازی در Nest (هر سرویس)
| جزء | قاعده |
|-----|-------|
| Validation | `ZodValidationPipe` سراسری با schema همان endpoint (از `ENDPOINTS`)؛ بدنه `strict` ⇒ فیلد ناشناخته `VALIDATION_FAILED`؛ `details.fields` از issueهای zod |
| Envelope | interceptor: `{success:true,data,meta.requestId}` / لیست با `meta.page,pageSize,total` |
| خطا | exception filter ⇒ `ERROR_CATALOG` (status/پیام فارسی)؛ هرگز stack/SQL به کلاینت نمی‌رود؛ خطای ناشناخته ⇒ `INTERNAL_ERROR` + لاگ با requestId |
| Request-Id | middleware: ورودی معتبر `X-Request-Id` را بپذیر وگرنه UUID بساز؛ در پاسخ، لاگ و trace |
| Swagger | `SwaggerModule.setup('docs', app, openapiJson)` با JSON پکیج؛ **تولید: فقط داخلی/پشت auth یا غیرفعال**، توسعه: آزاد |
| Auth guard | `JwtGuard` (RS256، JWKS) + `PermissionGuard` بر اساس `x-isra-permission` هر endpoint؛ **deny-by-default** (endpoint بدون decorator صریح عمومی نیست) |
| Rate limit | از `rateLimit` تعریف endpoint؛ ذخیره‌سازی بدون Redis: OTP/login در جدول MySQL (دقیق، بین instanceها)؛ سایر مسیرها token-bucket درون‌حافظه per instance (تقریبی) |
| Idempotency | `Idempotency-Key` ⇒ جدول `idempotency_keys` (key,userId,hash(body),response,TTL ۲۴h)؛ بدنهٔ متفاوت با همان کلید ⇒ `CONFLICT` |

## ۲. امنیت
### ۲.۱ لایهٔ انتقال و هدرها
| مورد | الزام |
|------|-------|
| TLS | فقط TLS ≥ ۱.۲، HSTS (`max-age=31536000; includeSubDomains`)؛ HTTP ⇒ redirect |
| هدرهای پاسخ API | `Content-Type: application/json; charset=utf-8`، `X-Content-Type-Options: nosniff`، `Cache-Control` طبق قرارداد، `Referrer-Policy: no-referrer`، `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`، حذف `X-Powered-By` |
| CORS | allowlist دقیق origin (`israapp.ir`، `admin.israapp.ir`؛ dev از env)، `credentials:true` فقط برای مسیرهای cookie، headerهای مجاز: `Authorization, Content-Type, X-Isra-Client, X-Isra-Client-Version, X-Step-Up-Token, Idempotency-Key`؛ هرگز `*` با credentials |
| وب‌اپ‌ها | CSP سخت (بدون inline script مگر nonce)، `Permissions-Policy` حداقلی، `frame-ancestors 'none'`؛ SRI برای منابع بیرونی (ترجیحاً هیچ) |

### ۲.۲ هویت و نشست
| مورد | الزام |
|------|-------|
| JWT | الگوریتم **pin شده** RS256 (رد `none`/HS*)، اعتبارسنجی `iss`، `aud`، `exp`، `nbf`، clock-skew ≤ ۳۰ث، `kid` از JWKS؛ access ۱۵ دقیقه؛ claimها: `sub, sid, fid, lvl, roles/perms, perm_ver, did` |
| JWKS | mid/high کش ۵ دقیقه + refresh روی `kid` ناشناخته (حداکثر یک‌بار/دقیقه — جلوگیری از DoS)؛ چرخش کلید: انتشار کلید جدید ≥ ۱ access-TTL قبل از امضا |
| Refresh | opaque تصادفی ≥ ۲۵۶ بیت؛ در DB فقط **hash (SHA-256)**؛ rotation هر استفاده؛ reuse ⇒ revoke کل family؛ grace ۱۰ثانیه (چند-tab)؛ وب: cookie `HttpOnly; Secure; SameSite=Lax; Path=/c/v1/auth` |
| CSRF (cookie) | فقط `/auth/refresh` و `/auth/logout`؛ بررسی `Origin` در allowlist + هدر سفارشی `X-Isra-Client` (preflight اجباری) |
| OTP | تصادفی CSPRNG ۵ رقمی؛ ذخیره **HMAC-SHA256 با pepper** (نه متن)؛ TTL ۱۲۰ث؛ ۳ تلاش؛ مقایسه constant-time؛ challenge تک‌مصرف؛ OTP/کد کامل **هرگز** در لاگ/پاسخ |
| رمز عبور | **argon2id** (m=64MiB, t=3, p=1؛ تنظیم بر اساس ≈۱۰۰–۲۵۰ms روی سخت‌افزار تولید)، salt یکتا، pepper اختیاری؛ حداقل ۸ نویسه؛ مقایسه زمان ثابت؛ همزمانی hashing محدود (queue) تا CPU اشباع نشود |
| user enumeration | پاسخ یکسان برای شمارهٔ ثبت‌شده/ثبت‌نشده (OTP) و خطای یکسان `AUTH_INVALID_CREDENTIALS`؛ زمان پاسخ تقریباً یکسان (dummy hash) |
| SMS abuse | محدودیت per phone (۵/ساعت) و per IP (۲۰/ساعت) + سقف روزانهٔ کل + فقط شمارهٔ ایران (`09…`) + هشدار روی جهش حجم؛ ارسال از طریق outbox غیرهمزمان (کندی Faraz روی p95 اثر نگذارد) |
| Step-up | توکن ۵ دقیقه، bind به `sid`؛ برای همهٔ writeهای high و تغییر رمز |

### ۲.۳ احراز دسترسی (OWASP API1/BOLA, API5/BFLA)
- **هر** مسیر `/sessions/:id/*` در mid: عضویت تأییدشده و مجوز را **per شیء** چک می‌کند؛ مجوز فقط سمت سرور (UI فقط راهنما است).
- مجوز = اجتماع نقش‌ها؛ **manager به‌تنهایی `eval.submit` ندارد** (تست واحد اجباری).
- High: قفل آخرین دارندهٔ هر نقش، تغییر `developer` فقط توسط developer، audit برای هر write.
- Mass assignment: schemaهای `strict` + DTO جدا برای ورودی/خروجی؛ هرگز entity مستقیم serialize نشود؛ فیلدهایی مثل `roles`, `status` از بدنه پذیرفته نمی‌شوند.
- ماتریس تست authz (اجباری در e2e): برای هر endpoint × {guest، student، supporter، teacher، manager، system roles} انتظار ۴۰۱/۴۰۳/۲۰۰ مطابق `x-isra-permission`.

### ۲.۴ ورودی، خروجی، داده
| مورد | الزام |
|------|-------|
| اعتبارسنجی | همهٔ ورودی (body/query/params/headers) با zod؛ بدنه ≤ ۱۶KB؛ عمق JSON ≤ ۸؛ `pageSize` ≤ سقف؛ رشته‌ها trim و طول‌دار؛ `Content-Type` فقط JSON ⇒ در غیر این صورت `UNSUPPORTED_MEDIA_TYPE` |
| SQL | TypeORM با پارامتر bind؛ **ممنوعیت** تلفیق رشته در query؛ ESLint rule برای `query(` خام؛ کاربر DB با کمترین اختیار (بدون DDL در runtime) |
| XSS | API فقط JSON؛ وب: Svelte escape پیش‌فرض؛ `{@html}` ممنوع مگر sanitize؛ متن کاربر هرگز به‌صورت HTML رندر نشود |
| PII و لاگ | pino ساخت‌یافته؛ **redact**: `authorization, cookie, set-cookie, password, newPassword, code, otp, token, refreshToken, stepUpToken`؛ شماره موبایل ماسک (`0912***4567`)؛ لاگ بدنهٔ درخواست ممنوع |
| Secrets | فقط از env/secret manager؛ نه در ریپو/کلاینت/لاگ؛ کلید خصوصی JWT فقط در api-low؛ چرخش مستند؛ کلید Map.ir فقط سرور |
| وابستگی‌ها | lockfile اجباری (`--frozen-lockfile`)، `pnpm audit --audit-level high` در CI، Dependabot/Renovate، بررسی supply-chain (در حال حاضر فعال در pnpm)، حداقل وابستگی runtime |
| رسانه (آینده) | آواتار: سقف حجم، sniff نوع واقعی، re-encode، نام تصادفی، سرو با `nosniff` از دامنهٔ جدا |
| WebSocket (mid) | handshake با JWT؛ بررسی `Origin`؛ join اتاق فقط عضو تأییدشده؛ حداکثر پیام ۲KB؛ rate-limit per socket؛ ping/timeout؛ سقف اتصال per user |

### ۲.۵ نگاشت OWASP API Top 10 (2023)
| ریسک | کنترل |
|------|-------|
| API1 BOLA | چک عضویت per شیء؛ شناسه‌های غیرقابل‌حدس (UUID)؛ تست authz |
| API2 Broken Auth | RS256 pin، rotation/reuse، OTP hash، rate-limit، argon2id |
| API3 Property-level | schemaهای strict، DTO خروجی صریح، نام‌های دیگران برای غیرکادر حذف (صف) |
| API4 Resource consumption | بدنه/صفحه سقف، rate-limit، timeout، cap بر hashing، SLO |
| API5 BFLA | PermissionGuard + deny-by-default، step-up |
| API6 Business flows | حضور +۵ یک‌بار (یکتایی DB)، OTP/SMS limits، قفل آخرین دارنده |
| API7 SSRF | سرور URL کاربر را fetch نمی‌کند؛ Map.ir/Faraz allowlist |
| API8 Misconfiguration | هدرها، CORS allowlist، Swagger در تولید خاموش، env validation در boot |
| API9 Inventory | OpenAPI تولیدی + `x-isra-since`؛ فقط `/internal/v1` غیرعمومی |
| API10 Unsafe consumption | پاسخ Faraz/Map.ir با schema اعتبارسنجی؛ timeout و circuit-breaker |

## ۳. پرفورمنس و پاسخ‌گویی
### ۳.۱ SLO (سمت سرور، بدون تأخیر شبکه؛ اندازه‌گیری در p95 روی بار نمونه)
| کلاس | هدف p95 | هدف p99 | نمونه |
|------|:------:|:------:|-------|
| poll/read سبک | ≤ ۵۰ms | ≤ ۱۲۰ms | `L-18`, `L-10`, `H-30`, `M-02` |
| list/read معمول | ≤ ۱۵۰ms | ≤ ۳۰۰ms | `L-17`, `M-32`, `H-20` |
| write ساده | ≤ ۲۰۰ms | ≤ ۴۰۰ms | `M-20`, `M-30`, `H-22` |
| auth سنگین (argon2/JWT) | ≤ ۳۵۰ms | ≤ ۶۰۰ms | `L-03`, `L-13` |
| OTP request (صف‌کردن SMS) | ≤ ۲۵۰ms | ≤ ۵۰۰ms | `L-01` |
| عمومی cache‌شده | ≤ ۶۰ms (hit < ۱۰ms) | ≤ ۱۰۰ms | `L-30`, `L-31`, `L-90` |
| Realtime | تحویل رویداد ≤ ۲۰۰ms (p95) | | Socket.IO |
| دسترس‌پذیری | ۹۹٫۹٪ ماهانه | | `/health/ready` |
مقدار دقیق هر endpoint در `x-isra-slo-p95-ms` است و تست قرارداد سقف ≤ ۴۰۰ را اعمال می‌کند.

### ۳.۲ تکنیک‌ها
| حوزه | الزام |
|------|-------|
| HTTP cache | `Cache-Control` طبق قرارداد؛ عمومی‌ها `public, max-age=30, stale-while-revalidate=120` + **ETag** و ۳۰۴؛ JWKS ۵ دقیقه؛ پاسخ‌های کاربر `no-store` |
| فشرده‌سازی | br/gzip برای بدنهٔ ≥ ۱KB؛ HTTP/2؛ keep-alive |
| پایگاه‌داده | ایندکس طبق `23`؛ بدون N+1 (join/`IN` دسته‌ای)؛ صفحه‌بندی offset برای لیست‌های کوچک و **keyset** (`createdAt,id`) برای audit/inbox بزرگ؛ `SELECT` ستون‌های لازم؛ pool محدود (۱۰–۲۰/سرویس)؛ timeout query ≤ ۲ث؛ بدون transaction طولانی |
| کش درون‌حافظه (بدون Redis) | LRU+TTL کوتاه برای: JWKS، تنظیمات سراسری در mid (به‌روز با outbox/inbox + TTL ۶۰ث)، فهرست عمومی جلسات (۵ث)، خلاصهٔ امتیاز در low (۱۵ث). کلید cache شامل کاربر برای داده‌های خصوصی |
| Realtime | رویداد فقط سیگنال (۲KB)؛ coalesce سمت سرور ۲۵۰ms؛ room per session؛ کلاینت با REST تازه می‌کند؛ بدون polling روی اتصال زنده |
| کار سنگین | argon2 با سقف همزمانی؛ SMS و outbox غیرهمزمان؛ هیچ کار طولانی روی مسیر درخواست |
| پاسخ کوچک | بدون فیلد اضافه؛ لیست‌ها سقف دارند؛ `pageSize` پیش‌فرض ۲۰ |
| کلاینت وب | LCP < ۲٫۵s، Lighthouse ≥ ۹۰ (قفل `04`)؛ فونت preload و `font-display: swap`؛ SW با cache ایستا؛ ثبت‌نکردن zod در bundle |

### ۳.۳ آزمون بار و مشاهده‌پذیری
- **k6** (اجرا محلی بدون Docker): سناریوهای ورود OTP/verify، refresh، لیست عمومی (cache)، حضور هم‌زمان ۵۰۰ نفر در یک جلسه، «نفر بعدی» با ۲۰۰ اتصال Socket، تنظیمات؛ آستانه‌های `http_req_duration{p(95)}` برابر جدول بالا و `http_req_failed < 0.1%`.
- متریک RED per route (`/metrics` فقط شبکهٔ داخلی)، trace با OpenTelemetry (requestId)، هشدار: p95 > SLO ×۱٫۵ برای ۵ دقیقه، نرخ ۵xx > ۱٪، صف outbox > ۱۰۰۰.
- بودجهٔ ظرفیت اولیه (فرض، پس از load-test قفل شود): ۱۰۰۰ کاربر هم‌زمان، ۲۰۰ اتصال Socket per جلسهٔ فعال.

## ۴. خطا، لاگ و عملیات
- قالب خطا و کدها: `ERROR_CATALOG` در پکیج؛ `retriable` راهنمای backoff کلاینت (exponential + jitter، حداکثر ۳ تلاش، فقط برای idempotent یا `retriable`).
- `/health/live` (پروسه) و `/health/ready` (DB + وابستگی)، بدون envelope، فقط شبکهٔ داخلی.
- مهاجرت DB: فقط migration نسخه‌دار TypeORM (`synchronize:false`)، forward-only، الگوی expand→migrate→contract؛ بدون DDL در runtime.
- تنظیمات: env اعتبارسنجی‌شده با zod در boot؛ نبود/نامعتبر ⇒ **fail-fast** (`24-env-draft.md`).
- پشتیبان‌گیری و بازیابی: mysqldump/PITR روزانه، تست بازیابی ماهانه؛ RPO ≤ ۱۵ دقیقه، RTO ≤ ۱ ساعت (هدف).

## ۵. نسخه‌گذاری API (Versioning)
| سطح | قاعده |
|-----|-------|
| مسیر | `/c/v1`، `/o/v1`، `/s/v1`. **فقط** تغییر ناسازگار ⇒ `v2` کنار `v1` (دو نسخه هم‌زمان) |
| قرارداد (`CONTRACT_VERSION`، semver) | **patch**: مستندات/توصیف؛ **minor**: افزودن endpoint یا فیلد اختیاری؛ **major**: تغییر ناسازگار (فقط با مسیر جدید) |
| ناسازگار یعنی | حذف endpoint/فیلد پاسخ، تغییر type/معنا، فیلد/پارامتر الزامی جدید در درخواست، سخت‌تر شدن اعتبارسنجی (کوتاه‌تر شدن `maxLength`)، حذف مقدار enum درخواست، الزامی‌شدن step-up/احراز — **ابزار**: `diffOpenApi` + `openapi:breaking` در CI |
| کلاینت | هدر `X-Isra-Client` و `X-Isra-Client-Version` (لاگ و تحلیل)؛ کلاینت به فیلد ناشناخته در پاسخ **تحمل** دارد؛ مقدار enum ناشناخته را به حالت امن تعبیر می‌کند |
| Deprecation | endpoint منسوخ: `deprecated:true` در قرارداد + هدرهای `Deprecation` و `Sunset`؛ حداقل **۱۸۰ روز** تا حذف؛ اعلام در CHANGELOG و اینباکس سیستم؛ تست قرارداد این حداقل را اعمال می‌کند |
| انتشار | `packages/api-types` با tag `api-types@x.y.z`؛ CHANGELOG اجباری؛ تغییر قرارداد = PR واحد با به‌روزرسانی OpenAPI، mock، docs و تست‌ها |
| رویدادهای Socket | نام رویداد پایدار؛ افزودن فیلد payload سازگار؛ تغییر ناسازگار ⇒ نام جدید (`queue.updated.v2`) |

## ۶. استراتژی تست
| لایه | ابزار | الزام |
|------|-------|-------|
| قرارداد | vitest (`packages/api-types/tests`) | یکتایی ID، سیاست امنیت/پرفورمنس، اعتبار OpenAPI 3.1، drift، ردیابی docs⇄کد، diff تغییر ناسازگار |
| مطابقت mock | `contract.test.ts` در هر وب‌اپ | هر پاسخ mock با schema سرور می‌خواند |
| واحد (سرویس) | vitest/jest | قواعد دامنه: ماتریس نقش، +۵ یک‌بار، چرخهٔ حیات رو‌به‌جلو، وزن ارزیابی، قفل آخرین دارنده؛ **پوشش ۱۰۰٪ برای قواعد auth/permission، ≥ ۸۰٪ کل منطق** |
| یکپارچه | Nest + MySQL محلی (schema جدا per تست) | migrationها، یکتایی DB، idempotency، outbox/inbox |
| e2e | supertest | ماتریس authz کامل (§۲.۳)، جریان OTP→refresh→logout، reuse-detection، rate-limit |
| امنیت | تست‌های منفی + `pnpm audit` + secret-scan | ورودی مخرب (SQLi/XSS/oversize/unknown fields)، JWT دست‌کاری‌شده (`alg:none`, kid ناشناخته)، CSRF cookie |
| بار | k6 | آستانه‌های §۳.۳ |
| UI | vitest + Playwright (فقط smoke محلی) | جریان‌های اصلی؛ a11y: focus/label/کنتراست |
**دروازهٔ CI:** `lint → typecheck → test → build → openapi:check → openapi:breaking → audit` همه سبز؛ merge بدون آن ممنوع. بخش‌های حساس (auth/JWT/OTP): `/security-review` و `/code-review` پیش از merge (`CLAUDE.md`).

## ۷. مستندسازی
- Swagger: `packages/api-types/openapi/index.html` (محلی) و `/docs` هر سرویس (فقط توسعه/داخلی).
- ADR: تصمیم‌های معماری در `docs-v2/` با تاریخ و دلیل؛ تغییر قفل ⇒ فقط با تأیید مالک.
- هر endpoint جدید: ردیف docs (`15/18/20`) ↔ `defineEndpoint` ↔ تست ↔ mock — تست ردیابی عدم تطابق را می‌گیرد.
