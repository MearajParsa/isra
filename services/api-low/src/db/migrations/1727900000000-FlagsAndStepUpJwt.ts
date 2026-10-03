import { tableOptions } from '../table-options';
import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v2: step-up اکنون JWT امضاشده است ⇒ جدول step_up_tokens حذف؛ settings_cache برای پرچم‌های سراسری high.
 */
export class FlagsAndStepUpJwt1727900000000 implements MigrationInterface {
  name = 'FlagsAndStepUpJwt1727900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS step_up_tokens');
    await q.query(`CREATE TABLE settings_cache (
      setting_key VARCHAR(32) NOT NULL,
      value JSON NOT NULL,
      version INT NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (setting_key)
    ) ${await tableOptions(q)}`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS settings_cache');
    await q.query(`CREATE TABLE step_up_tokens (
      id BINARY(16) NOT NULL,
      session_id BINARY(16) NOT NULL,
      token_hash BINARY(32) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_stepup_hash (token_hash)
    ) ${await tableOptions(q)}`);
  }
}
