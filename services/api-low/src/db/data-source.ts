import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import type { Env } from '../config/env';
import { ENTITIES } from './entities';
import { InitSchema1727700000000 } from './migrations/1727700000000-InitSchema';
import { FlagsAndStepUpJwt1727900000000 } from './migrations/1727900000000-FlagsAndStepUpJwt';
import { AdminExpansion1728400000000 } from './migrations/1728400000000-AdminExpansion';
import { LowV161728600000010 } from './migrations/1728600000010-LowV16';
import { SnakeNamingStrategy } from './naming';
import { SafeTypeOrmLogger } from './typeorm.logger';

export const MIGRATIONS = [InitSchema1727700000000, FlagsAndStepUpJwt1727900000000, AdminExpansion1728400000000, LowV161728600000010];

export function dataSourceOptions(env: Env): DataSourceOptions {
  return {
    type: 'mysql',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    charset: 'utf8mb4',
    timezone: 'Z',
    entities: ENTITIES,
    migrations: MIGRATIONS,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false, // فقط migration نسخه‌دار
    migrationsRun: env.DB_MIGRATIONS_RUN,
    logger: new SafeTypeOrmLogger(), // بدون SQL/پارامتر در لاگ
    logging: ['error', 'warn', 'migration'],
    maxQueryExecutionTime: 500, // رویداد query کند (فقط مدت)
    ssl: env.DB_SSL ? { rejectUnauthorized: true, minVersion: 'TLSv1.2' } : undefined,
    extra: { connectionLimit: env.DB_POOL_MAX, connectTimeout: 5000 }
  };
}
