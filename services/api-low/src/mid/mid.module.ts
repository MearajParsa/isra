import { Global, Module } from '@nestjs/common';
import { MidClient } from './mid.client';

@Global()
@Module({ providers: [MidClient], exports: [MidClient] })
export class MidModule {}
