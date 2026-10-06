import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DataSource, type EntitySubscriberInterface, type QueryRunner, type TransactionCommitEvent, type TransactionRollbackEvent } from 'typeorm';
import type { Q } from './db';

/**
 * اجرای اثر بیرونی (سیگنال Socket.IO، شروع job) فقط **پس از commit** تراکنشی که فراخوان داخلش است.
 * کاربرد: منطقی که داخل تراکنشِ کد دیگری صدا زده می‌شود (مثلاً باز/بستن خودکار نوبت هنگام transition) و
 * نمی‌تواند خودش بعد از commit رویداد بفرستد. rollback ⇒ اثرها دور ریخته می‌شوند.
 * بیرون از تراکنش (DataSource) ⇒ بلافاصله اجرا می‌شود.
 */
@Injectable()
export class PostCommit implements EntitySubscriberInterface, OnModuleInit {
  private readonly log = new Logger('PostCommit');
  private readonly pending = new WeakMap<QueryRunner, (() => void)[]>();

  constructor(private readonly ds: DataSource) {}

  onModuleInit(): void {
    if (!this.ds.subscribers.includes(this)) this.ds.subscribers.push(this);
  }

  after(q: Q, fn: () => void): void {
    const qr = (q as { queryRunner?: QueryRunner }).queryRunner;
    if (!qr || !qr.isTransactionActive) return this.run(fn);
    const list = this.pending.get(qr);
    if (list) list.push(fn);
    else this.pending.set(qr, [fn]);
  }

  afterTransactionCommit(e: TransactionCommitEvent): void {
    if (e.queryRunner.isTransactionActive) return; // savepoint تو در تو؛ منتظر commit بیرونی
    const list = this.pending.get(e.queryRunner);
    if (!list) return;
    this.pending.delete(e.queryRunner);
    for (const fn of list) this.run(fn);
  }

  afterTransactionRollback(e: TransactionRollbackEvent): void {
    if (!e.queryRunner.isTransactionActive) this.pending.delete(e.queryRunner);
  }

  private run(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      this.log.warn({ err: err instanceof Error ? err.message : 'unknown' }, 'post-commit effect failed');
    }
  }
}
