/** همگام‌سازی فیلترها با query string: مقادیر پیش‌فرض در URL نمی‌آیند و مقدار نامعتبر به پیش‌فرض برمی‌گردد */

export interface FieldSpec {
  def: string;
  /** اگر داده شود فقط همین مقادیر مجاز است */
  allowed?: readonly string[];
  /** اعتبارسنجی دلخواه (مثلاً تاریخ) */
  valid?: (v: string) => boolean;
  /** با تغییر این فیلد صفحه به ۱ برگردد (پیش‌فرض true؛ برای خود page false) */
  resetsPage?: boolean;
}
export type QuerySpec<K extends string = string> = Record<K, FieldSpec>;
export type QueryValues<S extends QuerySpec> = { [K in keyof S]: string };

export function defaults<S extends QuerySpec>(spec: S): QueryValues<S> {
  const out = {} as Record<string, string>;
  for (const k of Object.keys(spec)) out[k] = spec[k]!.def;
  return out as QueryValues<S>;
}

export function parseQuery<S extends QuerySpec>(spec: S, sp: URLSearchParams): QueryValues<S> {
  const out = {} as Record<string, string>;
  for (const k of Object.keys(spec)) {
    const f = spec[k]!;
    const raw = sp.get(k);
    let v = raw === null ? f.def : raw;
    if (f.allowed && !f.allowed.includes(v)) v = f.def;
    if (f.valid && v !== f.def && !f.valid(v)) v = f.def;
    out[k] = v;
  }
  return out as QueryValues<S>;
}

/** `?a=1&b=2` (یا رشتهٔ خالی)؛ ترتیب کلیدها مطابق spec برای پایداری URL */
export function serializeQuery<S extends QuerySpec>(spec: S, values: QueryValues<S>): string {
  const sp = new URLSearchParams();
  for (const k of Object.keys(spec)) {
    const v = values[k as keyof S];
    if (v !== spec[k]!.def && v !== '') sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** اعمال تغییر؛ تغییر هر فیلد غیر از page صفحه را ۱ می‌کند */
export function applyPatch<S extends QuerySpec>(spec: S, current: QueryValues<S>, patch: Partial<QueryValues<S>>): QueryValues<S> {
  const next = { ...current, ...patch } as Record<string, string>;
  const changed = Object.keys(patch).filter((k) => patch[k as keyof S] !== current[k as keyof S]);
  if ('page' in spec && !('page' in patch) && changed.some((k) => spec[k]!.resetsPage !== false)) next.page = spec.page!.def;
  return next as QueryValues<S>;
}

/** شمارهٔ صفحهٔ معتبر (≥۱) */
export const pageNumber = (v: string): number => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
};
export const isPageString = (v: string) => /^[1-9]\d{0,4}$/.test(v);
