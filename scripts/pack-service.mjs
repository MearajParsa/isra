#!/usr/bin/env node
/**
 * بستهٔ استقرار مستقل برای یک سرویس (مناسب cPanel «Setup Node.js App» که `npm install` اجرا می‌کند):
 *   node scripts/pack-service.mjs api-low        # خروجی: deploy/api-low/  (و deploy/api-low.zip اگر zip نصب باشد)
 * پیش‌نیاز: pnpm turbo build (و pnpm --filter @isra/api-types bundle) انجام شده باشد.
 * محتوا: dist/ + package.json (وابستگی‌ها با نسخهٔ دقیق از pnpm-lock.yaml؛ api-types در vendor/node_modules) + package-lock.json + .npmrc
 *         + app.js (نقطهٔ ورود Passenger) — بدون node_modules/secret.
 * بازتولیدپذیری: هاست production باید با `npm ci --omit=dev` (یا «Run NPM Install» در cPanel که package-lock.json را رعایت می‌کند) نصب کند.
 * نیاز به شبکه (registry) هنگام pack برای تولید package-lock.json.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const svc = process.argv[2];
if (!['api-low', 'api-mid', 'api-high'].includes(svc ?? '')) {
  console.error('استفاده: node scripts/pack-service.mjs <api-low|api-mid|api-high>');
  process.exit(1);
}
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const src = join(root, 'services', svc);
const types = join(root, 'packages', 'api-types');
const out = join(root, 'deploy', svc);
if (!existsSync(join(src, 'dist', 'main.js'))) throw new Error(`${svc}/dist/main.js نیست؛ اول: pnpm turbo build`);
if (!existsSync(join(types, 'dist', 'index.cjs'))) throw new Error('packages/api-types/dist نیست؛ اول: pnpm --filter @isra/api-types bundle');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(src, 'dist'), join(out, 'dist'), { recursive: true });

// api-types: فقط آنچه در runtime لازم است؛ داخل vendor/node_modules تا با NODE_PATH (app.js) resolve شود.
// نه `file:` dependency: روی cPanel/CloudLinux «Run NPM Install» مسیر نسبی `file:` را نسبت به nodevenv حل می‌کند و می‌شکند
// (و symlink آن هم). این‌طور به npm/node_modules هاست وابسته نیست.
const vendor = join(out, 'vendor', 'node_modules', '@isra', 'api-types');
// نسخهٔ دقیق (بدون ^ و ~) از pnpm-lock.yaml برای importer مشخص؛ بدون وابستگی به کتابخانهٔ yaml
const lockText = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8').split(/\r?\n/);
function lockedDeps(importer, declared) {
  const start = lockText.indexOf(`  ${importer}:`);
  if (start < 0) throw new Error(`importer ${importer} در pnpm-lock.yaml نیست`);
  const resolved = {};
  let section = '';
  let name = '';
  for (let i = start + 1; i < lockText.length; i++) {
    const l = lockText[i];
    if (/^  \S/.test(l)) break; // importer بعدی
    let m;
    if ((m = /^    (dependencies|devDependencies|optionalDependencies):/.exec(l))) section = m[1];
    else if ((m = /^      ['"]?([^'":]+)['"]?:\s*$/.exec(l))) name = m[1];
    else if ((m = /^        version: (\S+)/.exec(l)) && section === 'dependencies') resolved[name] = m[1].replace(/\(.*$/, '');
  }
  const exact = {};
  for (const [dep, range] of Object.entries(declared ?? {})) {
    if (range.startsWith('workspace:')) continue;
    const v = resolved[dep];
    if (!v || !/^\d+\.\d+\.\d+/.test(v)) throw new Error(`نسخهٔ قفل‌شدهٔ ${dep} برای ${importer} پیدا نشد (${v ?? 'خالی'})`);
    exact[dep] = v;
  }
  return exact;
}

mkdirSync(vendor, { recursive: true });
cpSync(join(types, 'dist'), join(vendor, 'dist'), { recursive: true });
cpSync(join(types, 'openapi'), join(vendor, 'openapi'), { recursive: true });
const tp = JSON.parse(readFileSync(join(types, 'package.json'), 'utf8'));
writeFileSync(join(vendor, 'package.json'), JSON.stringify({ name: tp.name, version: tp.version, private: true, type: tp.type, main: tp.main, types: tp.types, exports: tp.exports, dependencies: lockedDeps('packages/api-types', tp.dependencies) }, null, 2));

const pkg = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'));
// workspace (@isra/api-types) در vendor/node_modules است؛ بقیه با نسخهٔ دقیق از قفل pnpm
const deps = { ...lockedDeps('packages/api-types', tp.dependencies), ...lockedDeps(`services/${svc}`, pkg.dependencies) };
writeFileSync(
  join(out, 'package.json'),
  JSON.stringify({ name: pkg.name, version: pkg.version, private: true, main: 'app.js', engines: { node: '>=20.3' }, scripts: { start: 'node app.js' }, dependencies: deps }, null, 2)
);
// .npmrc: بدون audit/fund و با save-exact. --ignore-scripts عمداً سراسری نیست (cPanel/CloudLinux)؛
// بررسی: هیچ وابستگی مستقیم install script ندارد (@node-rs/argon2 باینری prebuilt می‌گیرد).
writeFileSync(join(out, '.npmrc'), 'audit=false\nfund=false\nsave-exact=true\n');
// package-lock.json: فقط فایل قفل (بدون نصب و بدون اجرای اسکریپت)
execSync('npm install --package-lock-only --ignore-scripts', { cwd: out, stdio: 'inherit' });
if (!existsSync(join(out, 'package-lock.json'))) throw new Error('package-lock.json ساخته نشد');
// نقطهٔ ورود Passenger: env را cPanel می‌دهد؛ main.js خودش listen می‌کند (Passenger listen را به socket هدایت می‌کند)
writeFileSync(
  join(out, 'app.js'),
  [
    "const path = require('node:path');",
    "// ماژول @isra/api-types از vendor/node_modules (بدون وابستگی به node_modules هاست)",
    "process.env.NODE_PATH = [path.join(__dirname, 'vendor', 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);",
    "require('node:module').Module._initPaths();",
    "require('./dist/main.js');",
    ''
  ].join('\n')
);
writeFileSync(join(out, 'DEPLOY.txt'), `${svc}\n1) محتوای این پوشه را در Application root آپلود کنید\n2) cPanel ← Setup Node.js App ← Startup file: app.js ← Run NPM Install\n3) Environment variables را طبق docs-v2/25-deploy-cpanel.md وارد کنید و Restart\n`);
try {
  execSync(`cd ${join(root, 'deploy')} && rm -f ${svc}.zip && zip -qr ${svc}.zip ${svc}`);
  console.log(`✓ deploy/${svc}.zip`);
} catch {
  console.log(`✓ deploy/${svc}/ (zip نصب نیست؛ پوشه را دستی فشرده کنید)`);
}
