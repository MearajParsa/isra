#!/usr/bin/env node
/**
 * بستهٔ استقرار web-main (SvelteKit adapter-node) برای cPanel «Setup Node.js App»:
 *   PUBLIC_API_LOW_URL=https://capi.israapp.ir PUBLIC_API_MID_URL=https://oapi.israapp.ir pnpm --filter @isra/web-main build
 *   node scripts/pack-web.mjs          # خروجی: deploy/web-main/
 * بستهٔ build مستقل است (وابستگی‌ها bundle شده‌اند)؛ node_modules لازم نیست. app.js نقطهٔ ورود Passenger است.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const build = join(root, 'apps', 'web-main', 'build');
const out = join(root, 'deploy', 'web-main');
if (!existsSync(join(build, 'index.js'))) {
  console.error('ابتدا web-main را build کنید (pnpm --filter @isra/web-main build).');
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(build, join(out, 'build'), { recursive: true });
writeFileSync(join(out, 'package.json'), JSON.stringify({ name: 'isra-web-main', private: true, type: 'module', scripts: { start: 'node app.js' } }, null, 2) + '\n');
writeFileSync(join(out, 'app.js'), "import './build/index.js';\n");
// صفحهٔ خطای خودکفا برای وقتی که خود اپ Node پایین است (۵۰۲/۵۰۳ هاست): در docroot دامنه + ErrorDocument در .htaccess (docs-v2/25)
if (existsSync(join(build, 'client', 'error-503.html'))) cpSync(join(build, 'client', 'error-503.html'), join(out, 'error-503.html'));
console.log(`آماده: ${out}`);
