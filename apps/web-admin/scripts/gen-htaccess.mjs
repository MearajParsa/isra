/**
 * پس از build: `.htaccess` (Apache/LiteSpeed روی cPanel) در پوشهٔ build ساخته می‌شود:
 *  - بازنویسی SPA به index.html
 *  - هدرهای امنیتی + CSP (connect-src از VITE_API_LOW_URL و VITE_API_HIGH_URL زمان build)
 *  - کش: دارایی‌های hash‌دار immutable، HTML/service-worker/manifest بدون کش
 *  - فشرده‌سازی متن
 */
import { readFileSync, writeFileSync } from 'node:fs';

// اگر پنل زیر مسیر (BASE_PATH) سرو شود، از سرور Node (scripts/pack-web-admin.mjs) استفاده کنید؛ این فایل برای ساب‌دامنهٔ فایل‌محور است
const basePath = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');
const low = (process.env.VITE_API_LOW_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
const high = (process.env.VITE_API_HIGH_URL ?? 'http://localhost:3003').replace(/\/+$/, '');
const connect = [...new Set(["'self'", low, high])].join(' ');
const https = low.startsWith('https://') && high.startsWith('https://');

// اسکریپت inline بوت‌استرپ SvelteKit با hash مجاز می‌شود (hash هر build متفاوت است؛ از خروجی index.html خوانده می‌شود)
const html = readFileSync(new URL('../build/index.html', import.meta.url), 'utf8');
const hashes = [...html.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => `'${m[1]}'`);
if (!hashes.length) throw new Error('CSP script hash در build/index.html پیدا نشد (kit.csp mode=hash)');

const csp = ["default-src 'self'", `script-src 'self' ${[...new Set(hashes)].join(' ')}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self' data:", `connect-src ${connect}`, "manifest-src 'self'", "worker-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');

const out = `# تولیدشده توسط scripts/gen-htaccess.mjs — دستی ویرایش نکنید
# خطای سرور/پروکسی: صفحهٔ فارسی خودکفا (بدون وابستگی به app)
ErrorDocument 500 ${basePath}/error-503.html
ErrorDocument 502 ${basePath}/error-503.html
ErrorDocument 503 ${basePath}/error-503.html
ErrorDocument 504 ${basePath}/error-503.html

<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^ ${basePath}/index.html [L]
</IfModule>

<IfModule mod_headers.c>
  Header always set Content-Security-Policy "${csp}"
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "no-referrer"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
  Header always set Cross-Origin-Opener-Policy "same-origin"
  Header always set X-Frame-Options "DENY"
${https ? '  Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains"\n' : ''}  # js/css با نام hash‌دار (Vite): immutable؛ سپس استثنا برای فایل‌های بدون hash (ترتیب مهم: قاعدهٔ بعدی برنده است)
  <FilesMatch "\\.(js|css)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "\\.(woff2|png|svg)$">
    Header set Cache-Control "public, max-age=2592000"
  </FilesMatch>
  <FilesMatch "\\.(html|webmanifest)$|^service-worker\\.js$|^(favicon|icon-|maskable-|apple-touch-icon)">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml application/manifest+json
</IfModule>

# پنل مدیریت نباید ایندکس شود
Header set X-Robots-Tag "noindex, nofollow"
`;
writeFileSync(new URL('../build/.htaccess', import.meta.url), out);
writeFileSync(new URL('../build/robots.txt', import.meta.url), 'User-agent: *\nDisallow: /\n');
console.log('build/.htaccess و build/robots.txt ساخته شد (connect-src:', connect, ')');
