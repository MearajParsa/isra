#!/usr/bin/env node
/**
 * بستهٔ استقرار مستقل برای یک سرویس (مناسب cPanel «Setup Node.js App» که `npm install` اجرا می‌کند):
 *   node scripts/pack-service.mjs api-low        # خروجی: deploy/api-low/  (و deploy/api-low.zip اگر zip نصب باشد)
 * پیش‌نیاز: pnpm turbo build (و pnpm --filter @isra/api-types bundle) انجام شده باشد.
 * محتوا: dist/ + package.json (وابستگی workspace ⇒ vendor/api-types) + app.js (نقطهٔ ورود Passenger) — بدون node_modules/secret.
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
mkdirSync(vendor, { recursive: true });
cpSync(join(types, 'dist'), join(vendor, 'dist'), { recursive: true });
cpSync(join(types, 'openapi'), join(vendor, 'openapi'), { recursive: true });
const tp = JSON.parse(readFileSync(join(types, 'package.json'), 'utf8'));
writeFileSync(join(vendor, 'package.json'), JSON.stringify({ name: tp.name, version: tp.version, private: true, type: tp.type, main: tp.main, types: tp.types, exports: tp.exports, dependencies: tp.dependencies }, null, 2));

const pkg = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'));
const { '@isra/api-types': _workspace, ...deps } = { ...tp.dependencies, ...pkg.dependencies }; // zod و بقیه از npm نصب می‌شوند
writeFileSync(
  join(out, 'package.json'),
  JSON.stringify({ name: pkg.name, version: pkg.version, private: true, main: 'app.js', engines: { node: '>=20.3' }, scripts: { start: 'node app.js' }, dependencies: deps }, null, 2)
);
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
