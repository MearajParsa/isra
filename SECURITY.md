# سیاست امنیتی (Security Policy)

## گزارش آسیب‌پذیری
اگر مشکل امنیتی در اسراء (Isra) یافتید، لطفاً **به‌صورت خصوصی** گزارش دهید:
GitHub ← تب **Security** این مخزن ← **Report a vulnerability** (GitHub Private Vulnerability Reporting).

- لطفاً issue یا pull request عمومی برای آسیب‌پذیری باز نکنید.
- در گزارش بنویسید: سرویس/مسیر آسیب‌دیده، مراحل بازتولید، اثر احتمالی. هیچ داده یا secret واقعیِ کاربران را ضمیمه نکنید.
- گزارش را در اسرع وقت بررسی می‌کنیم و تا رفع مشکل، افشای عمومی انجام نشود.

## محدودهٔ پوشش
- سرویس‌های `api-low`، `api-mid`، `api-high` (احراز هویت، JWT/JWKS، OTP، مجوزها، API داخلی بین‌سرویسی)
- وب‌اپ‌ها `web-main` و `web-admin`، اپ‌های اندروید، اسکریپت‌ها و workflowهای CI/CD در این مخزن

خارج از محدوده: حملهٔ DoS حجمی، مهندسی اجتماعی، یافته‌های اسکنر خودکار بدون اثبات اثر، سرویس‌های شخص ثالث (مثلاً فراز).

---

# Security Policy (English)

## Reporting a vulnerability
Please report vulnerabilities **privately** via GitHub Private Vulnerability Reporting (repository **Security** tab → **Report a vulnerability**). Do not open public issues or pull requests for security problems, and do not include real user data or secrets in reports.

## Scope
The `api-low` / `api-mid` / `api-high` services (auth, JWT/JWKS, OTP, authorization, internal service APIs), the `web-main` and `web-admin` web apps, the Android apps, and the scripts and CI/CD workflows in this repository. Out of scope: volumetric DoS, social engineering, unproven automated-scanner output, and third-party services.
