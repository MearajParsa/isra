#!/usr/bin/env node
/**
 * بستهٔ استقرار web-admin به‌صورت اپ Node (cPanel «Setup Node.js App»؛ مثلاً Application URL = israapp.ir/s):
 * ساده‌ترین راه (build + pack با یک دستور، مستقل از نوع shell): node scripts/build-web-admin.mjs [--base /s] [--low URL] [--high URL]
 * دستی: BASE_PATH/VITE_API_LOW_URL/VITE_API_HIGH_URL را هم هنگام build و هم هنگام این اسکریپت بدهید؛ خروجی: deploy/web-admin/
 * پنل SPA استاتیک است؛ app.js یک سرور بدون وابستگی (فقط ماژول‌های Node) برای سرو build با fallback به index.html،
 * هدرهای امنیتی و CSP (hash اسکریپت از خود build) است. npm install لازم نیست. env هاست لازم نیست.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const build = join(root, 'apps', 'web-admin', 'build');
const out = join(root, 'deploy', 'web-admin');
if (!existsSync(join(build, 'index.html'))) {
  console.error('ابتدا web-admin را build کنید (pnpm --filter @isra/web-admin build).');
  process.exit(1);
}
const base = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');
if (base && !/^\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*$/.test(base)) throw new Error(`BASE_PATH نامعتبر: ${base}`);
const clean = (u) => (process.env[u] ?? '').replace(/\/+$/, '');
const low = clean('VITE_API_LOW_URL');
const high = clean('VITE_API_HIGH_URL');
if (!low || !high) {
  console.error('VITE_API_LOW_URL و VITE_API_HIGH_URL الزامی‌اند (همان مقدارهای زمان build). ساده‌تر: node scripts/build-web-admin.mjs');
  process.exit(1);
}

// ناسازگاری build با تنظیمات pack را همین‌جا بگیر (وگرنه پنل روی هاست «بالا نمی‌آید»: دارایی‌ها از مسیر اشتباه یا API از localhost)
const html = readFileSync(join(build, 'index.html'), 'utf8');
if (base && !html.includes(`import("${base}/_app/`)) {
  console.error(`✗ build با BASE_PATH=${base} ساخته نشده است (دارایی‌ها از ${base}/_app/ بارگذاری نمی‌شوند). دوباره build کنید: node scripts/build-web-admin.mjs`);
  process.exit(1);
}
if (!base && !html.includes('import("/_app/')) {
  console.error('✗ build با BASE_PATH ساخته شده ولی pack بدون BASE_PATH اجرا شد. هر دو را یکسان بدهید: node scripts/build-web-admin.mjs');
  process.exit(1);
}
const jsAll = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const f = join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (f.endsWith('.js')) jsAll.push(readFileSync(f, 'utf8'));
  }
})(join(build, '_app'));
const bundle = jsAll.join('\n');
for (const u of [low, high]) {
  if (!bundle.includes(u)) {
    console.error(`✗ آدرس API «${u}» داخل build نیست؛ build با VITE_API_*_URL دیگری ساخته شده. دوباره build کنید: node scripts/build-web-admin.mjs`);
    process.exit(1);
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(build, join(out, 'build'), { recursive: true });
rmSync(join(out, 'build', '.htaccess'), { force: true }); // مخصوص هاست فایل‌محور؛ اینجا سرور Node همهٔ هدرها را می‌دهد
writeFileSync(join(out, 'config.json'), JSON.stringify({ base, connect: [...new Set([low, high])] }, null, 2) + '\n');
writeFileSync(join(out, 'package.json'), JSON.stringify({ name: 'isra-web-admin', private: true, type: 'commonjs', main: 'app.js', engines: { node: '>=20' }, scripts: { start: 'node app.js' } }, null, 2) + '\n');
writeFileSync(
  join(out, 'app.js'),
  `'use strict';
// سرور استاتیک web-admin (بدون وابستگی). مسیر پایه از config.json؛ همهٔ مسیرهای بدون فایل ⇒ index.html (SPA).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const ROOT = path.join(__dirname, 'build');
const BASE = cfg.base || '';
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'));
const hashes = [...INDEX.toString('utf8').matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => "'" + m[1] + "'");
const CSP = [
  "default-src 'self'",
  "script-src 'self' " + [...new Set(hashes)].join(' '),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  'connect-src ' + ["'self'", ...cfg.connect].join(' '),
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json' };

function baseHeaders(extra) {
  return Object.assign(
    {
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains'
    },
    extra
  );
}

function send(res, status, headers, body, head) {
  res.writeHead(status, baseHeaders(headers));
  res.end(head ? undefined : body);
}

function cacheFor(rel) {
  if (rel.startsWith('/_app/immutable/')) return 'public, max-age=31536000, immutable';
  if (/\\.(woff2|png|svg)$/.test(rel)) return 'public, max-age=2592000';
  return 'no-cache';
}

const server = http.createServer((req, res) => {
  const head = req.method === 'HEAD';
  if (req.method !== 'GET' && !head) return send(res, 405, { Allow: 'GET, HEAD' }, 'Method Not Allowed');
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    return send(res, 400, {}, 'Bad Request', head);
  }
  if (pathname.includes('\\0')) return send(res, 400, {}, 'Bad Request', head);

  if (BASE && pathname === BASE + '/') {
    res.writeHead(301, baseHeaders({ Location: BASE }));
    return res.end();
  }
  if (BASE && pathname !== BASE && !pathname.startsWith(BASE + '/')) return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not Found', head);
  const rel = (BASE ? pathname.slice(BASE.length) : pathname) || '/';

  // جلوگیری از path traversal: مسیر نهایی باید داخل ROOT بماند
  const file = path.normalize(path.join(ROOT, rel));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, {}, 'Forbidden', head);

  let target = null;
  try {
    const st = fs.statSync(file);
    if (st.isFile()) target = file;
  } catch {
    /* بدون فایل */
  }

  if (target) {
    const ext = path.extname(target).toLowerCase();
    const body = fs.readFileSync(target);
    const etag = '"' + crypto.createHash('sha256').update(body).digest('base64url').slice(0, 27) + '"';
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, baseHeaders({ ETag: etag, 'Cache-Control': cacheFor(rel) }));
      return res.end();
    }
    return send(res, 200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': cacheFor(rel), ETag: etag }, body, head);
  }

  // مسیر دارایی (دارای پسوند) که وجود ندارد ⇒ 404 واقعی؛ مسیر صفحه ⇒ SPA
  if (path.extname(rel)) return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }, 'Not Found', head);
  return send(res, 200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' }, INDEX, head);
});

server.listen(process.env.PORT || 3000);
`
);
writeFileSync(join(out, 'DEPLOY.txt'), `web-admin (Node)\n1) محتوای این پوشه را در Application root اپ آپلود کنید\n2) cPanel ← Setup Node.js App ← Startup file: app.js ← Restart (npm install لازم نیست)\n3) آدرس: ${base ? 'https://<domain>' + base : 'ریشهٔ دامنهٔ اپ'}\n`);
console.log(`آماده: ${out} (base='${base || '/'}'; API: ${low} ، ${high})`);
