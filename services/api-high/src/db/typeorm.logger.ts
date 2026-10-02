import { Logger as NestLogger } from '@nestjs/common';
import type { Logger } from 'typeorm';

/**
 * لاگر امن TypeORM: query و پارامترها هرگز لاگ نمی‌شوند (شمارهٔ موبایل، hash توکن/OTP = PII/secret).
 * فقط رویداد (کند/خطا/migration) بدون متن SQL.
 */
export class SafeTypeOrmLogger implements Logger {
  private readonly nest = new NestLogger('DB');
  logQuery() {}
  logQueryError(error: string | Error) {
    this.nest.error(`query failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`);
  }
  logQuerySlow(time: number) {
    this.nest.warn(`slow query ${Math.round(time)}ms`);
  }
  logSchemaBuild() {}
  logMigration(message: string) {
    this.nest.log(message);
  }
  // واسط Logger تایپ‌اورم
  log(level: 'log' | 'info' | 'warn', message: unknown) {
    if (level === 'warn') this.nest.warn(String(message).slice(0, 200));
  }
}
