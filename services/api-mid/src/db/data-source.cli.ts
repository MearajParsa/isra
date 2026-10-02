import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadEnv } from '../config/env';
import { dataSourceOptions } from './data-source';

/** برای CLI مهاجرت: `pnpm migration:run` / `migration:revert` */
export default new DataSource(dataSourceOptions(loadEnv()));
