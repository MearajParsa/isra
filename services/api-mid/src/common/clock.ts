/** ساعت قابل تزریق (تست‌پذیری رفتارهای زمانی: TTL، rate-limit، grace) */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
