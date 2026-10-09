import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dataSourceOptions } from '../src/db/data-source';
import { testEnv } from './helpers/app';

let ds: DataSource;
beforeAll(async () => {
  ds = new DataSource(dataSourceOptions(testEnv({ DB_MIGRATIONS_RUN: 'false' })));
  await ds.initialize();
});
afterAll(async () => {
  await ds.runMigrations(); // schema را برای بقیهٔ فایل‌ها سالم بگذار
  await ds.destroy();
});

const tables = async () => ((await ds.query('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name NOT IN ("migrations")')) as { t: string }[]).map((r) => r.t).sort();

describe('migration', () => {
  it('down همهٔ جدول‌ها را برمی‌دارد و up دوباره می‌سازد (قابل تکرار)', async () => {
    await ds.runMigrations();
    expect((await tables()).length).toBe(16);
    expect(Number(((await ds.query("SELECT COUNT(*) AS n FROM settings_cache WHERE setting_key = 'tier_baseline'")) as { n: number }[])[0]!.n)).toBe(1);
    await ds.undoLastMigration(); // v5: فقط ردیف seed baseline
    expect(Number(((await ds.query("SELECT COUNT(*) AS n FROM settings_cache WHERE setting_key = 'tier_baseline'")) as { n: number }[])[0]!.n)).toBe(0);
    await ds.undoLastMigration();
    expect((await tables()).length).toBe(12); // v4 down برگشت‌پذیر
    await ds.undoLastMigration();
    await ds.undoLastMigration();
    await ds.undoLastMigration();
    expect(await tables()).toEqual([]);
    await ds.runMigrations();
    expect(await tables()).toEqual(
      ['auth_sessions', 'badge_catalog', 'dead_letter_events', 'inbox_broadcasts', 'inbox_events', 'inbox_messages', 'otp_challenges', 'otp_cooldowns', 'outbox_events', 'profiles', 'rate_limit_counters', 'refresh_tokens', 'settings_cache', 'user_claims', 'user_credentials', 'users'].sort()
    );
  });

  it('entityها با schema واقعی هم‌خوان‌اند (هر ستون entity در DB هست)', async () => {
    for (const meta of ds.entityMetadatas) {
      const cols = ((await ds.query('SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?', [meta.tableName])) as { c: string }[]).map((r) => r.c);
      for (const col of meta.columns) expect(cols, `${meta.tableName}.${col.databaseName}`).toContain(col.databaseName);
    }
  });

  it('ایندکس‌های حیاتی (یکتایی phone/refresh hash/stepup hash) وجود دارند', async () => {
    const unique = async (table: string, name: string) => {
      const rows = (await ds.query('SELECT non_unique AS nu FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?', [table, name])) as { nu: number | string }[];
      return rows.length > 0 && Number(rows[0]!.nu) === 0;
    };
    expect(await unique('users', 'uq_users_phone')).toBe(true);
    expect(await unique('refresh_tokens', 'uq_refresh_hash')).toBe(true);
    expect(await unique('inbox_messages', 'uq_inbox_source_event')).toBe(true);
    expect(await unique('inbox_messages', 'uq_inbox_broadcast_user')).toBe(true);
  });
});
