/** LRU با TTL (حافظهٔ پروسه). زمان از بیرون تزریق می‌شود تا تست‌پذیر باشد (Clock سرویس). */
export class TtlLru<V> {
  private readonly m = new Map<string, { v: V; exp: number }>();

  constructor(
    private readonly max: number,
    private readonly ttlMs: number,
    private readonly now: () => number
  ) {}

  get(k: string): V | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.exp <= this.now()) {
      this.m.delete(k);
      return undefined;
    }
    // تازه‌ترین استفاده در انتهای Map
    this.m.delete(k);
    this.m.set(k, e);
    return e.v;
  }

  set(k: string, v: V): void {
    this.m.delete(k);
    this.m.set(k, { v, exp: this.now() + this.ttlMs });
    while (this.m.size > this.max) {
      const oldest = this.m.keys().next();
      if (oldest.done) break;
      this.m.delete(oldest.value);
    }
  }

  delete(k: string): void {
    this.m.delete(k);
  }

  clear(): void {
    this.m.clear();
  }

  get size(): number {
    return this.m.size;
  }
}
