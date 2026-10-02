import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // decorator metadata برای DI نست (esbuild پیش‌فرض emitDecoratorMetadata ندارد)
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // همهٔ فایل‌ها یک schema تست مشترک دارند ⇒ ترتیبی
    fileParallelism: false,
    setupFiles: ['tests/helpers/setup.ts'],
    coverage: { provider: 'v8', include: ['src/**'], exclude: ['src/main.ts', 'src/db/data-source.cli.ts', 'src/db/migrations/**'] }
  }
});
