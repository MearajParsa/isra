/**
 * مسیر سرتاسری محصول روی پشتهٔ واقعی (بدون mock). جزئیات اجرا: README.md
 */
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:5174';
const ADMIN_PHONE = process.env.E2E_ADMIN_PHONE ?? '09125550001';
const LOW_LOG = process.env.LOW_LOG ?? '/tmp/low.log';
const CHROME = process.env.CHROME_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = () => `0912${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`;
const errors = [];
let failed = 0;
const ok = (cond, msg) => {
  console.log(cond ? 'PASS' : 'FAIL', msg);
  if (!cond) failed++;
};
const text = (p) => p.evaluate(() => document.body.innerText);

/** کد OTP از لاگ api-low (حالت console)؛ تا چند ثانیه منتظر می‌ماند */
async function otpFor(phone, since = 0) {
  const mask = `${phone.slice(0, 4)}***${phone.slice(7)}`;
  for (let i = 0; i < 30; i++) {
    const lines = readFileSync(LOW_LOG, 'utf8').split('\n').filter((l) => l.includes(`OTP برای ${mask}`));
    if (lines.length > since) return { code: lines.at(-1).match(/: (\d{5})"/)?.[1], count: lines.length };
    await sleep(300);
  }
  throw new Error(`OTP برای ${phone} در ${LOW_LOG} پیدا نشد`);
}
const otpCount = (phone) => {
  const mask = `${phone.slice(0, 4)}***${phone.slice(7)}`;
  return readFileSync(LOW_LOG, 'utf8').split('\n').filter((l) => l.includes(`OTP برای ${mask}`)).length;
};

function watch(page, tag) {
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${tag}] console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && /:300\d\//.test(r.url())) errors.push(`[${tag}] http ${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`);
  });
}

async function loginWeb(page, phone, name) {
  await page.goto(`${WEB}/auth/phone`, { waitUntil: 'networkidle' });
  const before = otpCount(phone);
  await page.locator('input[type=tel]').fill(phone);
  await page.getByRole('button', { name: /دریافت کد|ارسال کد|ادامه/ }).first().click();
  await page.waitForURL(/auth\/otp/);
  const { code } = await otpFor(phone, before);
  await page.locator('input').first().click();
  await page.keyboard.type(code, { delay: 40 });
  await page.waitForURL((u) => !u.pathname.startsWith('/auth/otp'), { timeout: 15_000 });
  if (page.url().includes('onboarding')) {
    await page.locator('input[autocomplete="given-name"]').fill(name[0]);
    await page.locator('input[autocomplete="family-name"]').fill(name[1]);
    await page.getByRole('button', { name: /ذخیره/ }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 15_000 });
  }
  await page.waitForLoadState('networkidle');
}

async function stepUp(page, phone) {
  const before = otpCount(phone);
  await page.waitForSelector('input[autocomplete="one-time-code"]');
  const { code } = await otpFor(phone, before);
  await page.locator('input[autocomplete="one-time-code"]').click();
  await page.keyboard.type(code, { delay: 40 });
}

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const mk = async (tag, w = 1280) => {
  const ctx = await browser.newContext({ locale: 'fa-IR', viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  watch(p, tag);
  return p;
};

try {
  const [phoneB, phoneC, phoneT] = [rnd(), rnd(), rnd()];
  const G = await mk('G');

  console.log('— صفحه‌های عمومی و حقوقی');
  await G.goto(WEB, { waitUntil: 'networkidle' });
  ok((await G.title()).includes('اسراء'), 'صفحهٔ اول مهمان');
  for (const [path, h] of [['/sessions', 'جلسات'], ['/about', 'دربارهٔ'], ['/privacy', 'حریم خصوصی'], ['/terms', 'شرایط']]) {
    await G.goto(WEB + path, { waitUntil: 'networkidle' });
    ok((await G.locator('h1').first().innerText()).includes(h), `GET ${path}`);
  }
  const manifest = await (await fetch(`${WEB}/manifest.webmanifest`)).json();
  ok(manifest.start_url === '/' && manifest.icons.length >= 3 && manifest.display === 'standalone', 'manifest PWA معتبر');
  ok((await (await fetch(`${WEB}/robots.txt`)).text()).includes('Sitemap'), 'robots.txt');

  console.log('— ادمین: ورود با OTP');
  const A = await mk('A');
  await A.goto(ADMIN, { waitUntil: 'networkidle' });
  const beforeA = otpCount(ADMIN_PHONE);
  await A.locator('input[type=tel]').fill(ADMIN_PHONE);
  await A.getByRole('button', { name: 'دریافت کد تأیید' }).click();
  const { code: adminCode } = await otpFor(ADMIN_PHONE, beforeA);
  await A.locator('input').first().click();
  await A.keyboard.type(adminCode, { delay: 40 });
  await A.waitForURL((u) => !u.pathname.includes('login'), { timeout: 15_000 });
  ok(true, 'ادمین وارد شد');

  console.log('— کاربران وب‌اصلی');
  const B = await mk('B');
  const C = await mk('C');
  const T = await mk('T');
  await loginWeb(B, phoneB, ['مریم', 'مدیری']);
  await loginWeb(C, phoneC, ['زهرا', 'قاری']);
  await loginWeb(T, phoneT, ['استاد', 'معلمی']);
  await sleep(4000); // رویداد user.registered به high برسد

  console.log('— ادمین: grant ساخت جلسه با step-up');
  await A.goto(ADMIN + '/users', { waitUntil: 'networkidle' });
  await A.locator('input[type=search], input[type=text]').first().fill(phoneB);
  await sleep(1500);
  await A.locator('a', { hasText: 'مریم مدیری' }).first().click();
  await A.waitForURL(/\/users\/.+/);
  await sleep(1500);
  await A.locator('input[type=checkbox]').last().check();
  await A.getByRole('button', { name: 'ذخیرهٔ مجوز' }).click();
  await stepUp(A, ADMIN_PHONE);
  await sleep(2500);
  await A.goto(ADMIN + '/audit', { waitUntil: 'networkidle' });
  await sleep(1000);
  ok((await text(A)).includes('مجوزهای مستقیم'), 'گزارش (audit) تغییر مجوز را ثبت کرد');

  console.log('— مدیر جلسه: ساخت با انتخابگر جلالی و انتشار');
  await sleep(4000);
  await B.goto(WEB + '/manage/new', { waitUntil: 'networkidle' });
  await B.getByLabel('عنوان جلسه').fill('جلسهٔ قرآن شبانهٔ جمعه');
  await B.locator('textarea').fill('تلاوت و تمرین دسته‌جمعی؛ همهٔ علاقه‌مندان خوش آمدند.');
  await B.getByLabel('مکان').fill('مسجد امام رضا (ع)، تهران');
  await B.getByRole('radio', { name: 'یک‌باره' }).click();
  const start = B.getByRole('group', { name: 'شروع' });
  await start.locator('select').nth(1).selectOption('10');
  await start.locator('select').nth(0).selectOption('15');
  ok((await B.locator('.preview').innerText()).includes('۱۵ دی'), 'انتخابگر جلالی: پیش‌نمایش ۱۵ دی');
  await B.getByRole('button', { name: 'ساخت پیش‌نویس' }).click();
  await B.waitForURL(/\/manage\/[0-9a-f-]{36}$/);
  const sid = B.url().split('/').pop();
  await B.waitForLoadState('networkidle');
  await sleep(500);
  await B.getByRole('button', { name: 'انتشار جلسه' }).first().click();
  await sleep(300);
  await B.getByRole('button', { name: 'انتشار جلسه' }).last().click();
  await sleep(1500);
  ok((await text(B)).includes('منتشرشده'), 'جلسه منتشر شد');

  console.log('— عضویت و نقش‌ها');
  for (const [p, n] of [[C, 'قرآن‌آموز'], [T, 'معلم']]) {
    await p.goto(`${WEB}/sessions/${sid}`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'درخواست عضویت' }).click();
    await sleep(1500);
    ok((await text(p)).includes('در انتظار'), `${n}: درخواست عضویت ثبت شد`);
  }
  await B.goto(`${WEB}/manage/${sid}`, { waitUntil: 'networkidle' });
  await B.getByRole('tab', { name: /اعضا/ }).click();
  await sleep(1000);
  for (let i = 0; i < 2; i++) {
    await B.getByRole('button', { name: 'تأیید', exact: true }).first().click();
    await sleep(1200);
  }
  await B.getByRole('group', { name: /نقش‌های استاد معلمی/ }).getByLabel('معلم').check();
  await sleep(1200);
  await B.getByRole('tab', { name: 'نمای کلی' }).click();
  await B.getByRole('button', { name: 'شروع جلسه' }).first().click();
  await sleep(300);
  await B.getByRole('button', { name: 'شروع جلسه' }).last().click();
  await sleep(1500);
  ok((await text(B)).includes('در حال برگزاری'), 'جلسه شروع شد');

  console.log('— اتاق زنده (Socket.IO)');
  await T.goto(`${WEB}/sessions/${sid}/live`, { waitUntil: 'networkidle' });
  await C.goto(`${WEB}/sessions/${sid}/live`, { waitUntil: 'networkidle' });
  await sleep(1500);
  await C.getByRole('button', { name: 'ثبت حضور' }).click();
  await sleep(1500);
  await C.getByRole('button', { name: 'پیوستن به صف' }).click();
  await sleep(1800);
  ok((await text(T)).includes('زهرا'), 'ورود به صف بدون reload در صفحهٔ معلم دیده شد');
  await T.getByRole('button', { name: 'نفر بعدی' }).click();
  await sleep(1800);
  ok((await text(C)).includes('نوبت شماست'), 'نوبت بدون reload به قرآن‌آموز رسید');
  await T.getByRole('button', { name: 'ارزیابی', exact: true }).first().click();
  await sleep(600);
  await T.getByRole('button', { name: 'ثبت ارزیابی' }).click();
  await sleep(1800);
  await C.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  const ct = await text(C);
  ok(ct.includes('نتیجهٔ ارزیابی') && ct.includes('+۵ امتیاز'), 'نتیجهٔ ارزیابی و امتیاز برای قرآن‌آموز');
  await C.goto(`${WEB}/points`, { waitUntil: 'networkidle' });
  await sleep(800);
  ok((await text(C)).includes('۱۰'), 'امتیاز کل (۵ حضور + ۵ ارزیابی) = ۱۰');
  await C.goto(`${WEB}/inbox`, { waitUntil: 'networkidle' });
  await sleep(800);
  const it = await text(C);
  ok(it.includes('عضویت') && it.includes('نوبت') && it.includes('ارزیابی'), 'اینباکس: عضویت، نوبت، ارزیابی (outbox بین سرویس‌ها)');
} catch (e) {
  console.error('FAIL (exception):', e.message.split('\n')[0]);
  failed++;
} finally {
  await browser.close();
}

const real = errors.filter((e) => !/ERR_ABORTED/.test(e));
console.log(real.length ? `\nخطاهای مرورگر/شبکه (${real.length}):\n${real.join('\n')}` : '\nبدون خطای کنسول/شبکه');
if (real.length) failed++;
process.exit(failed ? 1 : 0);
