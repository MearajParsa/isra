import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import type { Env } from '../config/env';
import { InitSchema1727800000000 } from './migrations/1727800000000-InitSchema';
import { SnakeNamingStrategy } from './naming';
import { SafeTypeOrmLogger } from './typeorm.logger';

export const MIGRATIONS = [InitSchema1727800000000];

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
    extra: { connectionLimit: env.DB_POOL_MAX, connectTimeout: 5000 }
  };
}
