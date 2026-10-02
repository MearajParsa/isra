# تست سرتاسری (E2E) روی پشتهٔ واقعی

مسیر کامل محصول با مرورگر واقعی و سرویس‌های واقعی (MySQL، api-low/mid/high، web-main، web-admin) — **بدون mock**.

## پیش‌نیاز
1. سه سرویس + دو وب بالا باشند (لوکال: README هر سرویس؛ `SMS_PROVIDER=console`).
2. در `services/api-high/.env.local` مقدار `BOOTSTRAP_DEVELOPER_PHONE` برابر `E2E_ADMIN_PHONE` باشد و این شماره هنوز developer نشده یا قبلاً همان developer باشد.
3. لاگ api-low در فایلی ذخیره شود تا کد OTP (که در حالت console چاپ می‌شود) خوانده شود: `pnpm --filter @isra/api-low dev > /tmp/low.log 2>&1`.
4. مرورگر: Chromium (یا `npx playwright-core install chromium`)؛ مسیر دلخواه با `CHROME_PATH`.

## اجرا
```bash
pnpm install
E2E_ADMIN_PHONE=09125550001 LOW_LOG=/tmp/low.log WEB_URL=http://localhost:5173 ADMIN_URL=http://localhost:5174 pnpm --filter @isra/e2e journey
```
هر اجرا سه کاربر تازه (مدیر جلسه، معلم، قرآن‌آموز) با شمارهٔ تصادفی می‌سازد و این مسیر را می‌رود: ورود ادمین با OTP ← grant `session.create` با step-up ← ساخت و انتشار جلسه با انتخابگر جلالی ← درخواست/تأیید عضویت و نقش ← شروع جلسه ← حضور (+۵) ← صف ← نفر بعدی (realtime) ← ارزیابی ← نمایش نتیجه و امتیاز + صفحه‌های عمومی/حقوقی و PWA. خروجی غیر صفر = شکست.
> rate-limit OTP (۵ بار در ساعت per شماره) برای شمارهٔ ادمین اعمال می‌شود؛ برای اجرای مکرر در توسعه `DELETE FROM rate_limit_counters, otp_challenges` در `schema_low`.
