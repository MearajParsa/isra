// تولید favicon و آیکون‌های PWA از design/logo.svg.
// نیازمند Playwright (نصب سراسری یا PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs):
//   node scripts/gen-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');

const logo = readFileSync(new URL('../../../design/logo.svg', import.meta.url), 'utf8');
const d = logo.match(/\sd="([^"]+)"/)[1];
const W = 221.316;
const H = 178.744;
const PRIMARY = '#1C0E44';
const WARM = '#FDBF8A';

/** svg مربعی با زمینهٔ primary و لوگوی warm؛ widthRatio = سهم عرض لوگو از ضلع */
function iconSvg(size, widthRatio, radius = 0) {
  const w = size * widthRatio;
  const h = (w * H) / W;
  const s = w / W;
  const x = (size - w) / 2;
  const y = (size - h) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${PRIMARY}"/><path transform="translate(${x} ${y}) scale(${s})" fill="${WARM}" d="${d}"/></svg>`;
}

writeFileSync(new URL('../static/favicon.svg', import.meta.url), iconSvg(64, 0.72, 14));

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const page = await browser.newPage();
const targets = [
  ['icon-192.png', 192, 0.66],
  ['icon-512.png', 512, 0.66],
  ['maskable-512.png', 512, 0.5],
  ['apple-touch-icon.png', 180, 0.66]
];
for (const [name, size, ratio] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0">${iconSvg(size, ratio)}</body>`);
  await page.screenshot({ path: new URL(`../static/icons/${name}`, import.meta.url).pathname, omitBackground: false });
}
await browser.close();
console.log('icons generated');
