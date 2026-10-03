#!/usr/bin/env node
/**
 * بستهٔ استقرار web-main (SvelteKit adapter-node) برای cPanel «Setup Node.js App»:
 *   PUBLIC_API_LOW_URL=https://api.israapp.ir PUBLIC_API_MID_URL=https://api.israapp.ir pnpm --filter @isra/web-main build
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
console.log(`آماده: ${out}`);
