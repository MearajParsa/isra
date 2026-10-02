import { type DynamicModule, Global, Module } from '@nestjs/common';
import { Clock, SystemClock } from '../common/clock';
import { ENV, type Env, loadEnv } from './env';

@Global()
@Module({})
export class ConfigModule {
  /** env اعتبارسنجی‌شده (تست‌ها env صریح می‌دهند) */
  static forRoot(env: Env = loadEnv(), clock: Clock = new SystemClock()): DynamicModule {
    return {
      module: ConfigModule,
      providers: [
        { provide: ENV, useValue: env },
        { provide: Clock, useValue: clock }
      ],
      exports: [ENV, Clock]
    };
  }
}
