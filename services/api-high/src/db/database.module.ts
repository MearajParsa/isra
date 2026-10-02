import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENV, type Env } from '../config/env';
import { dataSourceOptions } from './data-source';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => dataSourceOptions(env)
    })
  ],
  exports: [TypeOrmModule]
})
export class DatabaseModule {}
