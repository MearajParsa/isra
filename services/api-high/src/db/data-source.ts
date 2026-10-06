import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import type { Env } from '../config/env';
import { InitSchema1728000000000 } from './migrations/1728000000000-InitSchema';
import { RevokedSessions1728200000001 } from './migrations/1728200000001-RevokedSessions';
import { AdminExpansion1728300000001 } from './migrations/1728300000001-AdminExpansion';
import { DynamicRbac1728500000000 } from './migrations/1728500000000-DynamicRbac';
import { OpsExpansion1728600000000 } from './migrations/1728600000000-OpsExpansion';
import { SnakeNamingStrategy } from './naming';
import { SafeTypeOrmLogger } from './typeorm.logger';

export const MIGRATIONS = [InitSchema1728000000000, RevokedSessions1728200000001, AdminExpansion1728300000001, DynamicRbac1728500000000, OpsExpansion1728600000000];

/** دسترسی به DB با SQL پارامتری (ds.query)؛ entity نداریم تا schema فقط در migration نسخه‌دار تعریف شود */
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
    entities: [],
    migrations: MIGRATIONS,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    migrationsRun: env.DB_MIGRATIONS_RUN,
    logger: new SafeTypeOrmLogger(),
    logging: ['error', 'warn', 'migration'],
    maxQueryExecutionTime: 500,
    ssl: env.DB_SSL ? { rejectUnauthorized: true, minVersion: 'TLSv1.2' } : undefined,
    extra: { connectionLimit: env.DB_POOL_MAX, connectTimeout: 5000 }
  };
}
