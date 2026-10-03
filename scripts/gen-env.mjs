#!/usr/bin/env node
/**
 * ساخت فایل‌های env production برای سه سرویس از روی یک فایل JSON محلی (خارج از ریپو؛ حاوی رمز/کلید):
 *   node scripts/gen-env.mjs <data.json> [outDir=deploy/env]
 * خروجی: <outDir>/api-low.env ، api-mid.env ، api-high.env  (+ secretهای تصادفی مشترک یک‌بار تولید می‌شوند).
 * `deploy/` در .gitignore است؛ خروجی را commit/ارسال نکنید. هر خط `KEY=VALUE` را در cPanel ← Setup Node.js App ← Environment variables وارد کنید.
 * ساختار data.json: site_url, admin_url, BOOTSTRAP_DEVELOPER_PHONE[], jwt{access_expires_in,refresh_expires_in}, database{system|client|operation:{domain,db,user,password}},
 * farazsms{SMS_API_KEY,SMS_SENDER_LINE,SMS_OTP_PATTERN,SMS_API_BASE_URL,FARAZ_CODE_VAR?}. (کلیدهای JWT قدیمی/HS نادیده گرفته می‌شوند: سامانه RS256 است.)
 */
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [src, outArg] = process.argv.slice(2);
if (!src) {
  console.error('استفاده: node scripts/gen-env.mjs <data.json> [outDir]');
  process.exit(1);
}
const d = JSON.parse(readFileSync(src, 'utf8'));
const out = resolve(outArg ?? 'deploy/env');
const must = (v, name) => {
  if (v === undefined || v === null || v === '') throw new Error(`مقدار لازم در data.json نیست: ${name}`);
  return v;
};
const origin = (u) => new URL(u).origin;
const dur = (s, name) => {
  const m = /^(\d+)\s*([smhd])$/.exec(String(must(s, name)));
  if (!m) throw new Error(`قالب مدت نامعتبر (${name}): مثل 20m یا 30d`);
  return Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[m[2]];
};

const site = origin(must(d.site_url, 'site_url'));
const admin = origin(must(d.admin_url, 'admin_url'));
const host = (u) => new URL(u).hostname;
const root = host(site); // israapp.ir
const hosts = {
  low: `https://${must(d.database?.client?.domain, 'database.client.domain')}`,
  mid: `https://${must(d.database?.operation?.domain, 'database.operation.domain')}`,
  high: `https://${must(d.database?.system?.domain, 'database.system.domain')}`
};
const dbs = { low: d.database.client, mid: d.database.operation, high: d.database.system };

const hex = (n = 32) => randomBytes(n).toString('hex');
const shared = hex(32);
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });

const accessTtl = d.jwt?.access_expires_in ? dur(d.jwt.access_expires_in, 'jwt.access_expires_in') : 900;
const refreshTtl = d.jwt?.refresh_expires_in ? dur(d.jwt.refresh_expires_in, 'jwt.refresh_expires_in') : 1_209_600;
if (accessTtl < 60 || accessTtl > 3600) throw new Error('ACCESS_TTL_SEC باید بین 60 و 3600 ثانیه باشد.');

const common = (k) => [
  'NODE_ENV=production',
  'TRUST_PROXY=1',
  'DB_HOST=localhost',
  'DB_PORT=3306',
  `DB_NAME=${must(dbs[k].db, `${k}.db`)}`,
  `DB_USER=${must(dbs[k].user, `${k}.user`)}`,
  `DB_PASSWORD=${must(dbs[k].password, `${k}.password`)}`,
  'DB_MIGRATIONS_RUN=true',
  `CORS_ORIGINS=${site},${admin}`,
  'SWAGGER_ENABLED=false',
  `INTERNAL_SHARED_SECRET=${shared}`
];

const files = {
  'api-low': [
    '# api-low — Application URL: ' + hosts.low.replace('https://', '') + '/c',
    ...common('low'),
    `PUBLIC_BASE_URL=${hosts.low}`,
    `COOKIE_DOMAIN=.${root}`,
    `JWT_PRIVATE_KEY_PEM=${privateKey.trim().replace(/\n/g, '\\n')}`,
    'JWT_KEY_ID=k1',
    `ACCESS_TTL_SEC=${accessTtl}`,
    `REFRESH_TTL_SEC=${refreshTtl}`,
    `OTP_PEPPER=${hex(32)}`,
    `PASSWORD_PEPPER=${hex(32)}`,
    `SMS_PROVIDER=${d.farazsms?.SMS_PROVIDER ?? 'faraz'}`,
    `FARAZ_API_KEY=${must(d.farazsms?.SMS_API_KEY, 'farazsms.SMS_API_KEY')}`,
    `FARAZ_SENDER=${must(d.farazsms?.SMS_SENDER_LINE, 'farazsms.SMS_SENDER_LINE')}`,
    `FARAZ_PATTERN_CODE=${must(d.farazsms?.SMS_OTP_PATTERN, 'farazsms.SMS_OTP_PATTERN')}`,
    `FARAZ_BASE_URL=${d.farazsms?.SMS_API_BASE_URL ?? 'https://api.iranpayamak.com'}`,
    `FARAZ_CODE_VAR=${d.farazsms?.FARAZ_CODE_VAR ?? 'code'}`,
    `INTERNAL_URL_MID=${hosts.mid}/o`,
    `INTERNAL_URL_HIGH=${hosts.high}/s`
  ],
  'api-mid': [
    '# api-mid — Application URL: ' + hosts.mid.replace('https://', '') + '/o',
    ...common('mid'),
    `LOW_JWKS_URL=${hosts.low}/c/.well-known/jwks.json`,
    'JWT_ISSUER=isra-low',
    'JWT_AUDIENCE=isra',
    `INTERNAL_URL_LOW=${hosts.low}/c`
  ],
  'api-high': [
    '# api-high — Application URL: ' + hosts.high.replace('https://', '') + '/s',
    ...common('high'),
    `LOW_JWKS_URL=${hosts.low}/c/.well-known/jwks.json`,
    'JWT_ISSUER=isra-low',
    'JWT_AUDIENCE=isra',
    `INTERNAL_URL_LOW=${hosts.low}/c`,
    `INTERNAL_URL_MID=${hosts.mid}/o`,
    ...(d.BOOTSTRAP_DEVELOPER_PHONE?.length ? [`BOOTSTRAP_DEVELOPER_PHONE=${[].concat(d.BOOTSTRAP_DEVELOPER_PHONE).join(',')}`] : [])
  ]
};

mkdirSync(out, { recursive: true });
for (const [name, lines] of Object.entries(files)) writeFileSync(join(out, `${name}.env`), lines.join('\n') + '\n', { mode: 0o600 });
console.log(`✓ ${Object.keys(files).length} فایل در ${out} ساخته شد (commit نکنید).`);
console.log('\nبیلد وب (آدرس‌ها عمومی‌اند، secret نیستند):');
console.log(`  PUBLIC_API_LOW_URL=${hosts.low} PUBLIC_API_MID_URL=${hosts.mid} pnpm --filter @isra/web-main build && node scripts/pack-web.mjs  (ORIGIN=${site} روی هاست)`);
console.log(`  VITE_API_LOW_URL=${hosts.low} VITE_API_HIGH_URL=${hosts.high} pnpm --filter @isra/web-admin build  → آپلود در ${admin}`);
