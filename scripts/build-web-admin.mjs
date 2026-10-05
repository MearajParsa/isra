#!/usr/bin/env node
/**
 * build + pack وب‌ادمین با یک دستور (مستقل از shell: PowerShell/cmd/bash؛ env را خودش می‌گذارد):
 *   node scripts/build-web-admin.mjs                                  # پیش‌فرض: --base /s ، capi/sapi.israapp.ir
 *   node scripts/build-web-admin.mjs --app v2                         # پنل جدید React (apps/web-admin-v2)
 *   node scripts/build-web-admin.mjs --base "" --low https://capi.example --high https://sapi.example
 * خروجی: deploy/web-admin/ (اپ Node؛ docs-v2/25 بخش هـ)
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
};
// --app v2 ⇒ پنل React/Vite (apps/web-admin-v2)؛ پیش‌فرض: SvelteKit (apps/web-admin)
const v2 = flag('app', 'v1') === 'v2';
const env = {
  ...process.env,
  BASE_PATH: flag('base', '/s'),
  ...(v2 ? { PACK_KIND: 'vite', VITE_BASE_PATH: flag('base', '/s') } : {}),
  VITE_API_LOW_URL: flag('low', 'https://capi.israapp.ir'),
  VITE_API_HIGH_URL: flag('high', 'https://sapi.israapp.ir')
};
console.log(`BASE_PATH='${env.BASE_PATH}'  low=${env.VITE_API_LOW_URL}  high=${env.VITE_API_HIGH_URL}`);

const run = (cmd, cmdArgs, shell) => {
  const r = spawnSync(cmd, cmdArgs, { cwd: root, env, stdio: 'inherit', shell });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run('pnpm', ['--filter', v2 ? '@isra/web-admin-v2' : '@isra/web-admin', 'build'], true); // shell: pnpm.cmd روی ویندوز
run(process.execPath, ['scripts/pack-web-admin.mjs'], false);
