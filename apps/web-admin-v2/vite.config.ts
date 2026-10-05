import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  // همیشه با اسلش آغاز و پایان: '/s' ⇒ '/s/' (وگرنه BASE_URL مسیرها را می‌چسباند: '/ssw.js')
  const rawBase = (env.VITE_BASE_PATH || '/').trim();
  const basePath = `/${rawBase.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null, // manual registration via registerSW in src/pwa/register.ts
        manifest: {
          id: basePath,
          name: 'اسراء — پنل مدیریت',
          short_name: 'پنل اسراء',
          description: 'پنل مدیریت سامانه یادگیری قرآن اسراء',
          lang: 'fa',
          dir: 'rtl',
          start_url: basePath,
          scope: basePath,
          display: 'standalone',
          orientation: 'any',
          theme_color: '#251D59',
          background_color: '#F8FAFC',
          icons: [
            {
              src: 'icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          shortcuts: [
            {
              name: 'کاربران',
              url: `${basePath}users`,
              description: 'مدیریت کاربران و دسترسی‌ها',
            },
            {
              name: 'دسترسی‌ها',
              url: `${basePath}access/matrix`,
              description: 'ماتریس نقش‌ها و مجوزها',
            },
            {
              name: 'گزارش‌ها',
              url: `${basePath}reports`,
              description: 'نمودارها و آمار سیستم',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallback: `${basePath}index.html`,
          navigateFallbackDenylist: [/^\/c\/v1\//, /^\/s\/v1\//, /^https?:\/\//],
          runtimeCaching: [
            {
              urlPattern: /\.(?:woff2|woff|ttf|eot)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'font-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
              },
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'image-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), './src'),
      },
    },
    build: {
      sourcemap: 'hidden',
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (
                id.includes('react') ||
                id.includes('react-dom') ||
                id.includes('react-router-dom') ||
                id.includes('@tanstack')
              ) {
                return 'vendor';
              }
              if (id.includes('@radix-ui') || id.includes('lucide-react')) {
                return 'ui';
              }
            }
          },
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
