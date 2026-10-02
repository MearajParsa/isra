import { Logger } from 'nestjs-pino';
import { createApp, startApp } from './bootstrap';
import { loadEnv } from './config/env';

async function main() {
  const env = loadEnv();
  const app = await createApp(env);
  await startApp(app, env);
  app.get(Logger).log(`api-mid listening on :${env.PORT} (${env.NODE_ENV})`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
