import { Global, Module } from '@nestjs/common';
import { BadgesService } from '../badges/badges.service';
import { MidClient } from './mid.client';

@Global()
@Module({ providers: [MidClient, BadgesService], exports: [MidClient, BadgesService] })
export class MidModule {}
