import { Controller } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CONTRACT_VERSION } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Route } from '../common/ep';
import { KeysService } from '../auth/keys.service';

const startedAt = Date.now();

@Controller()
export class InfraController {
  constructor(
    private readonly keys: KeysService,
    private readonly ds: DataSource
  ) {}

  /** JWKS برای mid/high (cache عمومی ۵ دقیقه + ETag) */
  @Route('L-90')
  jwks() {
    return this.keys.jwks();
  }

  @Route('L-OPS-01')
  live() {
    return { status: 'ok', version: CONTRACT_VERSION, uptimeSec: Math.floor((Date.now() - startedAt) / 1000) };
  }

  @Route('L-OPS-02')
  async ready() {
    try {
      await Promise.race([this.ds.query('SELECT 1'), new Promise((_, rej) => setTimeout(() => rej(new Error('db timeout')), 1500).unref())]);
    } catch {
      throw new AppError('SERVICE_UNAVAILABLE');
    }
    return { status: 'ok', version: CONTRACT_VERSION };
  }
}
