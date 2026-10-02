import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  target: 'es2022',
  treeshake: true,
  external: ['zod'],
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' })
});
