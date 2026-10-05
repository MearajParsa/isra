import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// پنل مدیریت: SPA کاملاً استاتیک (ssr=false). خروجی build را یا فایل‌محور (ساب‌دامنه) یا با سرور کوچک Node (scripts/pack-web-admin.mjs) سرو کنید.
// BASE_PATH (زمان build): مثلاً `/s` اگر پنل زیر israapp.ir/s قرار می‌گیرد؛ خالی = ریشهٔ دامنه.
export default {
  preprocess: vitePreprocess(),
  kit: {
    // hash برای اسکریپت bootstrap درون‌خطی (SPA fallback)؛ بدون 'unsafe-inline' در script-src
    paths: { base: process.env.BASE_PATH ?? '' },
    csp: { mode: 'hash', directives: { 'script-src': ['self'] } },
    adapter: adapter({ pages: 'build', assets: 'build', fallback: 'index.html', precompress: false, strict: false })
  }
};
