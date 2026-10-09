/**
 * مقایسهٔ OpenAPI کنونی با یک ref گیت (پیش‌فرض origin/master) برای جلوگیری از تغییر ناسازگار تصادفی.
 *   pnpm --filter @isra/api-types openapi:breaking [-- <git-ref>]
 * خروجی ۱ اگر تغییر ناسازگار بدون افزایش major در package.json باشد.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApi } from '../src/openapi/build';
import { diffOpenApi } from '../src/openapi/diff';
import { API_VERSION, CONTRACT_VERSION, type ServiceKey } from '../src/core/version';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ref = process.argv.slice(2).find((a) => !a.startsWith('-')) ?? 'origin/master';
const services: ServiceKey[] = ['low', 'mid', 'high'];

function show(path: string): string | null {
  try {
    return execFileSync('git', ['show', `${ref}:packages/api-types/${path}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

const prevPkg = show('package.json');
const prevMajor = prevPkg ? Number((JSON.parse(prevPkg).version as string).split('.')[0]) : null;
const curMajor = Number(CONTRACT_VERSION.split('.')[0]);
const majorBumped = prevMajor !== null && curMajor > prevMajor;
const pkgVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version as string;
if (pkgVersion !== CONTRACT_VERSION) {
  console.error(`✗ نسخهٔ package.json (${pkgVersion}) با CONTRACT_VERSION (${CONTRACT_VERSION}) یکی نیست.`);
  process.exit(1);
}

let breaking = 0;
for (const s of services) {
  const prev = show(`openapi/${s}.${API_VERSION}.openapi.json`);
  if (!prev) {
    console.log(`• ${s}: در ${ref} سندی نیست (اولین انتشار)`);
    continue;
  }
  const d = diffOpenApi(JSON.parse(prev), buildOpenApi(s));
  console.log(`• ${s}: ${d.breaking.length} ناسازگار، ${d.additions.length} افزوده، ${d.changes.length} سایر`);
  d.breaking.forEach((b) => console.log(`   ✗ ${b}`));
  d.additions.slice(0, 20).forEach((b) => console.log(`   + ${b}`));
  breaking += d.breaking.length;
}
// تأیید صریح مالک برای تغییر ناسازگارِ هماهنگ (همهٔ کلاینت‌ها در همین monorepo و هم‌زمان مستقر می‌شوند).
// فقط وقتی معتبر است که نسخهٔ قرارداد نسبت به ref عوض شده باشد؛ پس با نسخهٔ قبلی تکرار نمی‌شود.
const acks = JSON.parse(readFileSync(resolve(root, 'breaking-acks.json'), 'utf8')) as Record<string, { approvedBy: string; date: string; reason: string }>;
const prevVersion = prevPkg ? (JSON.parse(prevPkg).version as string) : null;
const ack = prevVersion !== CONTRACT_VERSION ? acks[CONTRACT_VERSION] : undefined;
if (breaking && !majorBumped && ack) {
  console.log(`\n⚠ ${breaking} تغییر ناسازگار با تأیید ${ack.approvedBy} (${ack.date}): ${ack.reason}`);
  process.exit(0);
}
if (breaking && !majorBumped) {
  console.error(`\n✗ ${breaking} تغییر ناسازگار بدون افزایش major. یا سازگار کنید یا نسخهٔ مسیر جدید (v2) و major جدید بسازید (docs-v2/22 §۵).`);
  process.exit(1);
}
console.log('\n✓ بدون تغییر ناسازگار نسبت به ' + ref);
