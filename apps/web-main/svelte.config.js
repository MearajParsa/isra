import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// آدرس API در زمان build برای CSP (connect-src) خوانده می‌شود؛ production را با PUBLIC_API_*_URL بسازید
const apis = [process.env.PUBLIC_API_LOW_URL ?? 'http://localhost:3001', process.env.PUBLIC_API_MID_URL ?? 'http://localhost:3002'].map((u) => u.replace(/\/+$/, ''));
const sockets = apis.map((u) => u.replace(/^http/, 'ws'));

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: 'build' }),
    csp: {
      // nonce برای صفحات SSR و hash برای prerender؛ بدون 'unsafe-inline' برای اسکریپت
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        'script-src': ['self'],
        'style-src': ['self', 'unsafe-inline'],
        'img-src': ['self', 'data:'],
        'font-src': ['self', 'data:'],
        'connect-src': ['self', ...new Set([...apis, ...sockets])],
        'manifest-src': ['self'],
        'worker-src': ['self'],
        'object-src': ['none'],
        'base-uri': ['self'],
        'form-action': ['self'],
        'frame-ancestors': ['none']
      }
    }
  }
};
