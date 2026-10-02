import type { OpenApiDoc } from './build';

type Json = Record<string, any>;

export interface OpenApiDiff {
  /** تغییر ناسازگار ⇒ نیازمند نسخهٔ جدید مسیر */
  breaking: string[];
  /** افزودن سازگار ⇒ minor */
  additions: string[];
  /** سایر تغییرات (مستندات، توصیف) ⇒ patch */
  changes: string[];
}

const deref = (doc: Json, s: Json | undefined): Json | undefined => {
  let cur = s;
  let guard = 0;
  while (cur && typeof cur.$ref === 'string' && guard++ < 20) {
    cur = doc.components?.schemas?.[cur.$ref.replace('#/components/schemas/', '')];
  }
  return cur;
};

/**
 * مقایسهٔ ساختاری دو سند OpenAPI برای تشخیص تغییر ناسازگار.
 * قواعد: حذف endpoint/متد، افزودن پارامتر/فیلد الزامی در درخواست، حذف فیلد یا تغییر type در پاسخ،
 * حذف مقدار enum از درخواست، کاهش maxLength/افزایش minLength درخواست، افزودن step-up به endpoint موجود.
 */
export function diffOpenApi(before: OpenApiDoc, after: OpenApiDoc): OpenApiDiff {
  const r: OpenApiDiff = { breaking: [], additions: [], changes: [] };

  const walk = (a: Json | undefined, b: Json | undefined, at: string, side: 'req' | 'res', depth = 0) => {
    const sa = deref(before, a);
    const sb = deref(after, b);
    if (!sa || !sb || depth > 8) return;
    if (sa.type !== undefined && sb.type !== undefined && JSON.stringify(sa.type) !== JSON.stringify(sb.type)) {
      r.breaking.push(`${at}: type ${JSON.stringify(sa.type)} → ${JSON.stringify(sb.type)}`);
      return;
    }
    if (Array.isArray(sa.enum)) {
      const removed = sa.enum.filter((v: unknown) => !(sb.enum ?? []).includes(v));
      const added = (sb.enum ?? []).filter((v: unknown) => !sa.enum.includes(v));
      if (side === 'req' && removed.length) r.breaking.push(`${at}: مقدار enum حذف شد (${removed.join(', ')})`);
      if (side === 'res' && added.length) r.breaking.push(`${at}: مقدار جدید در enum پاسخ (${added.join(', ')}) — کلاینت‌های قدیمی ممکن است نشکنند ولی باید بررسی شود`);
      if (side === 'req' && added.length) r.additions.push(`${at}: مقدار enum افزوده شد (${added.join(', ')})`);
    }
    if (side === 'req') {
      if (typeof sa.maxLength === 'number' && typeof sb.maxLength === 'number' && sb.maxLength < sa.maxLength) r.breaking.push(`${at}: maxLength ${sa.maxLength} → ${sb.maxLength}`);
      if (typeof sb.minLength === 'number' && sb.minLength > (sa.minLength ?? 0)) r.breaking.push(`${at}: minLength ${sa.minLength ?? 0} → ${sb.minLength}`);
    }
    const pa: Json = sa.properties ?? {};
    const pb: Json = sb.properties ?? {};
    const ra = new Set<string>(sa.required ?? []);
    const rb = new Set<string>(sb.required ?? []);
    for (const k of Object.keys(pa)) {
      if (!(k in pb)) {
        if (side === 'res') r.breaking.push(`${at}.${k}: فیلد پاسخ حذف شد`);
        else r.changes.push(`${at}.${k}: فیلد درخواست حذف شد`);
      } else walk(pa[k], pb[k], `${at}.${k}`, side, depth + 1);
    }
    for (const k of Object.keys(pb)) {
      if (k in pa) continue;
      if (side === 'req' && rb.has(k)) r.breaking.push(`${at}.${k}: فیلد الزامی جدید در درخواست`);
      else r.additions.push(`${at}.${k}: فیلد افزوده شد`);
    }
    if (side === 'req') for (const k of rb) if (k in pa && !ra.has(k)) r.breaking.push(`${at}.${k}: فیلد اختیاری الزامی شد`);
    if (side === 'res') for (const k of ra) if (k in pb && !rb.has(k)) r.breaking.push(`${at}.${k}: فیلد الزامی پاسخ اختیاری شد`);
    if (sa.items && sb.items) walk(sa.items, sb.items, `${at}[]`, side, depth + 1);
    for (const key of ['oneOf', 'anyOf'] as const)
      if (Array.isArray(sa[key]) && Array.isArray(sb[key])) sa[key].forEach((x: Json, i: number) => walk(x, sb[key][i], `${at}|${i}`, side, depth + 1));
  };

  const pathsA: Json = before.paths ?? {};
  const pathsB: Json = after.paths ?? {};
  for (const [p, ops] of Object.entries(pathsA) as [string, Json][]) {
    for (const [m, opA] of Object.entries(ops) as [string, Json][]) {
      const opB = pathsB[p]?.[m];
      const id = `${m.toUpperCase()} ${p}`;
      if (!opB) {
        r.breaking.push(`${id}: endpoint حذف شد`);
        continue;
      }
      if (!opA['x-isra-step-up'] && opB['x-isra-step-up']) r.breaking.push(`${id}: step-up الزامی شد`);
      if ((opA.security ?? []).length === 0 && (opB.security ?? []).length > 0) r.breaking.push(`${id}: endpoint عمومی احراز هویت‌دار شد`);
      if (!opA.deprecated && opB.deprecated) r.changes.push(`${id}: deprecated شد`);
      const keyP = (x: Json) => `${x.in}:${x.name}`;
      const pa = new Map<string, Json>((opA.parameters ?? []).map((x: Json) => [keyP(x), x]));
      const pb = new Map<string, Json>((opB.parameters ?? []).map((x: Json) => [keyP(x), x]));
      for (const [k, v] of pb) {
        if (!pa.has(k)) (v.required ? r.breaking : r.additions).push(`${id}: پارامتر ${k}${v.required ? ' (الزامی)' : ''} افزوده شد`);
        else walk(pa.get(k)!.schema, v.schema, `${id} param ${k}`, 'req');
      }
      for (const k of pa.keys()) if (!pb.has(k)) r.changes.push(`${id}: پارامتر ${k} حذف شد`);
      walk(opA.requestBody?.content?.['application/json']?.schema, opB.requestBody?.content?.['application/json']?.schema, `${id} body`, 'req');
      walk(opA.responses?.['200']?.content?.['application/json']?.schema, opB.responses?.['200']?.content?.['application/json']?.schema, `${id} 200`, 'res');
    }
  }
  for (const [p, ops] of Object.entries(pathsB) as [string, Json][])
    for (const m of Object.keys(ops)) if (!pathsA[p]?.[m]) r.additions.push(`${m.toUpperCase()} ${p}: endpoint جدید`);
  return r;
}
