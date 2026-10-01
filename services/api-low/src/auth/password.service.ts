import { Inject, Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import { hmac256 } from '../common/crypto';
import { ENV, type Env } from '../config/env';

/** argon2id + pepper اختیاری؛ همزمانی محدود تا CPU اشباع نشود (API4) */
@Injectable()
export class PasswordService {
  private active = 0;
  private readonly waiters: (() => void)[] = [];
  private dummy?: Promise<string>;

  constructor(@Inject(ENV) private readonly env: Env) {}

  private prep(password: string): string {
    return this.env.PASSWORD_PEPPER ? hmac256(this.env.PASSWORD_PEPPER, password).toString('hex') : password;
  }

  private async limited<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.env.HASH_CONCURRENCY) await new Promise<void>((r) => this.waiters.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }

  hash(password: string): Promise<string> {
    return this.limited(() =>
      hash(this.prep(password), { algorithm: Algorithm.Argon2id, memoryCost: this.env.ARGON2_MEMORY_KIB, timeCost: this.env.ARGON2_TIME, parallelism: this.env.ARGON2_PARALLELISM })
    );
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return this.limited(() => verify(passwordHash, this.prep(password))).catch(() => false);
  }

  /** مصرف زمان یکسان وقتی کاربر/رمز وجود ندارد (ضد user-enumeration زمانی) */
  async burn(password: string): Promise<void> {
    this.dummy ??= this.hash('dummy-password-for-timing');
    await this.verify(await this.dummy, password);
  }
}
