import type { MigrationInterface, QueryRunner } from 'typeorm';

/** لینک مسیریابی اختیاری جلسه (قرارداد 1.3.0؛ فقط https، توسط سازندهٔ جلسه). */
export class SessionRouteUrl1728100000000 implements MigrationInterface {
  name = 'SessionRouteUrl1728100000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE sessions ADD COLUMN location_route_url VARCHAR(500) NULL AFTER location_label');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE sessions DROP COLUMN location_route_url');
  }
}
