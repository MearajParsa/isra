import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { CapturingSmsProvider } from './capturing.provider';
import { ConsoleSmsProvider } from './console.provider';
import { FarazSmsProvider } from './faraz.provider';
import { SmsProvider } from './sms.provider';

@Global()
@Module({
  providers: [
    FarazSmsProvider,
    ConsoleSmsProvider,
    CapturingSmsProvider,
    {
      provide: SmsProvider,
      inject: [ENV, FarazSmsProvider, ConsoleSmsProvider, CapturingSmsProvider],
      useFactory: (env: Env, faraz: FarazSmsProvider, dev: ConsoleSmsProvider, cap: CapturingSmsProvider) => (env.SMS_PROVIDER === 'faraz' ? faraz : env.SMS_PROVIDER === 'capture' ? cap : dev)
    }
  ],
  exports: [SmsProvider]
})
export class SmsModule {}
