import type { MigrationInterface, QueryRunner } from 'typeorm';
import { tableOptions } from '../table-options';

/** نشست‌های revoke‌شده در low (رویداد session.revoked) تا انقضای access؛ منبع حقیقت revocation فقط low است. */
export class RevokedSessions1728200000000 implements MigrationInterface {
  name = 'RevokedSessions1728200000000';
  async up(q: QueryRunner): Promise<void> {
    const T = await tableOptions(q);
    await q.query(`CREATE TABLE revoked_sessions (
        session_id BINARY(16) NOT NULL,
        expires_at DATETIME(3) NOT NULL,
        PRIMARY KEY (session_id),
        KEY idx_revoked_exp (expires_at)
      ) ${T}`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE revoked_sessions');
  }
}
