import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// پنل مدیریت: SPA کاملاً استاتیک (ssr=false) ⇒ روی cPanel فقط فایل‌های build در دامنهٔ admin گذاشته می‌شود؛ بدون سرور Node
export default {
  preprocess: vitePreprocess(),
  kit: { adapter: adapter({ pages: 'build', assets: 'build', fallback: 'index.html', precompress: false, strict: false }) }
};
