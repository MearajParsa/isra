import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type JWK, calculateJwkThumbprint, exportJWK, generateKeyPair } from 'jose';
import { ENV, type Env } from '../config/env';

/** کلید RS256: از env (production) یا موقت در توسعه؛ ارائهٔ JWKS برای mid/high */
@Injectable()
export class KeysService implements OnModuleInit {
  private readonly log = new Logger('Keys');
  private priv!: KeyObject;
  private pub!: KeyObject;
  private jwk!: JWK;
  kid!: string;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async onModuleInit() {
    if (this.env.JWT_PRIVATE_KEY_PEM) {
      this.priv = createPrivateKey(this.env.JWT_PRIVATE_KEY_PEM.replace(/\\n/g, '\n'));
    } else {
      this.log.warn('JWT_PRIVATE_KEY_PEM تنظیم نشده؛ کلید موقت ساخته شد (فقط توسعه/تست — توکن‌ها با ری‌استارت باطل می‌شوند).');
      const { privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
      this.priv = privateKey as unknown as KeyObject;
    }
    this.pub = createPublicKey(this.priv);
    const jwk = await exportJWK(this.pub);
    this.kid = this.env.JWT_KEY_ID ?? (await calculateJwkThumbprint(jwk)).slice(0, 16);
    this.jwk = { ...jwk, kid: this.kid, use: 'sig', alg: 'RS256' };
  }

  get privateKey(): KeyObject {
    return this.priv;
  }
  get publicKey(): KeyObject {
    return this.pub;
  }
  /** JWKS استاندارد (فقط کلید عمومی) */
  jwks(): { keys: JWK[] } {
    return { keys: [this.jwk] };
  }
}
