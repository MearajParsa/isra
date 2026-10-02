/**
 * بازپخش رویداد `user.registered` برای همهٔ کاربران موجود (مثلاً وقتی api-high تازه راه‌اندازی شده).
 * رویدادها در outbox می‌روند و worker به mid/high می‌فرستد؛ consumer با eventId dedupe می‌کند (idempotent).
 * اجرا: pnpm --filter @isra/api-low users:replay
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadEnv } from '../src/config/env';
import { dataSourceOptions } from '../src/db/data-source';
import { bufToUuid, uuidToBuf, uuidv7 } from '../src/common/ids';

async function main() {
  const ds = new DataSource(dataSourceOptions(loadEnv()));
  await ds.initialize();
  const now = new Date();
  const rows = (await ds.query('SELECT u.id, u.phone, u.created_at, p.first_name, p.last_name FROM users u LEFT JOIN profiles p ON p.user_id = u.id')) as { id: Buffer; phone: string; created_at: Date; first_name: string | null; last_name: string | null }[];
  for (const r of rows) {
    await ds.query('INSERT INTO outbox_events (id, type, payload, created_at, attempts, next_attempt_at) VALUES (?, ?, ?, ?, 0, ?)', [
      uuidToBuf(uuidv7(now.getTime())),
      'user.registered',
      JSON.stringify({ userId: bufToUuid(r.id), phone: r.phone, firstName: r.first_name ?? '', lastName: r.last_name ?? '', createdAt: r.created_at.toISOString() }),
      now,
      now
    ]);
  }
  console.log(`${rows.length} رویداد در outbox صف شد.`);
  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
