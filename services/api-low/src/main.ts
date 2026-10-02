import { Logger } from 'nestjs-pino';
import { createApp } from './bootstrap';
import { loadEnv } from './config/env';

async function main() {
  const env = loadEnv();
  const app = await createApp(env);
  await app.listen(env.PORT, '0.0.0.0');
  app.get(Logger).log(`api-low listening on :${env.PORT} (${env.NODE_ENV})`);
}

main().catch((e: unknown) => {
  // fail-fast: پیکربندی/DB نامعتبر ⇒ خروج با کد غیرصفر
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
