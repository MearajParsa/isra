import { untrack } from 'svelte';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { applyPatch, parseQuery, serializeQuery, type QuerySpec, type QueryValues } from './urlQuery';

/**
 * فیلترهای صفحه که با query string همگام‌اند (قابل اشتراک‌گذاری، سازگار با back/forward).
 * باید هنگام ساخت کامپوننت صفحه ساخته شود (effect داخلی دارد).
 */
export class UrlState<S extends QuerySpec> {
  values = $state() as QueryValues<S>;
  readonly spec: S;

  constructor(spec: S) {
    this.spec = spec;
    this.values = parseQuery(spec, page.url.searchParams);
    $effect(() => {
      const parsed = parseQuery(spec, page.url.searchParams);
      untrack(() => {
        if (serializeQuery(spec, parsed) !== serializeQuery(spec, this.values)) this.values = parsed;
      });
    });
  }

  set(patch: Partial<QueryValues<S>>): void {
    const next = applyPatch(this.spec, this.values, patch);
    if (serializeQuery(this.spec, next) === serializeQuery(this.spec, this.values)) return;
    this.values = next;
    void goto(page.url.pathname + serializeQuery(this.spec, next), { replaceState: true, keepFocus: true, noScroll: true });
  }

  /** همهٔ فیلترها (به‌جز صفحه) پاک شود */
  reset(keep: (keyof S)[] = []): void {
    const patch: Record<string, string> = {};
    for (const k of Object.keys(this.spec)) if (!keep.includes(k as keyof S)) patch[k] = this.spec[k]!.def;
    this.set(patch as Partial<QueryValues<S>>);
  }

  /** تعداد فیلترهای فعال (به‌جز sort/page) */
  activeCount(ignore: (keyof S)[] = []): number {
    return Object.keys(this.spec).filter((k) => k !== 'page' && k !== 'sort' && !ignore.includes(k as keyof S) && this.values[k as keyof S] !== this.spec[k]!.def).length;
  }
}
