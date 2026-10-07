/**
 * LRU ساده روی ترتیب درج Map (دسترسی ⇒ انتقال به انتها؛ تجاوز از سقف ⇒ حذف قدیمی‌ترین).
 * سقف بر حسب تعداد ورودی و (اختیاری) مجموع وزن (مثلاً بایت تصویر).
 */
export class Lru<K, V> {
  private readonly m = new Map<K, { v: V; w: number }>();
  private weight = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxWeight = Number.POSITIVE_INFINITY
  ) {}

  get size(): number {
    return this.m.size;
  }

  get(k: K): V | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    this.m.delete(k);
    this.m.set(k, e);
    return e.v;
  }

  /** بدون تغییر ترتیب LRU */
  peek(k: K): V | undefined {
    return this.m.get(k)?.v;
  }

  set(k: K, v: V, w = 1): void {
    if (w > this.maxWeight) return;
    this.delete(k);
    this.m.set(k, { v, w });
    this.weight += w;
    while (this.m.size > this.maxEntries || this.weight > this.maxWeight) {
      const oldest = this.m.keys().next();
      if (oldest.done) break;
      this.delete(oldest.value);
    }
  }

  delete(k: K): boolean {
    const e = this.m.get(k);
    if (!e) return false;
    this.weight -= e.w;
    return this.m.delete(k);
  }

  /** حذف همهٔ کلیدهای منطبق (پیمایش محدود به سقف ورودی‌ها) */
  deleteWhere(pred: (k: K) => boolean): void {
    for (const k of [...this.m.keys()]) if (pred(k)) this.delete(k);
  }

  clear(): void {
    this.m.clear();
    this.weight = 0;
  }
}
