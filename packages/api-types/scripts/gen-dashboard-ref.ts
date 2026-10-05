/**
 * مرجع API پنل مدیریت (برای ساخت UI توسط ابزارهای دیگر): جدول endpointها + نوع‌های TypeScript فشرده.
 *   pnpm --filter @isra/api-types dashboard-ref   ← docs-v2/28-dashboard-api-reference.md
 * خودکار از registry و OpenAPI تولید می‌شود؛ دستی ویرایش نکنید.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENDPOINTS, versionedPrefix, type EndpointDef } from '../src';
import { buildOpenApi } from '../src/openapi/build';

type J = Record<string, any>;
const high = buildOpenApi('high') as J;
const low = buildOpenApi('low') as J;
const LOW_IDS = new Set(['L-01', 'L-02', 'L-03', 'L-04', 'L-05', 'L-06', 'L-07']);

const ts = (s: J | undefined, comps: J, depth = 0): string => {
  if (!s) return 'unknown';
  if (s.$ref) return String(s.$ref).split('/').pop()!;
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((v: unknown) => JSON.stringify(v)).join(' | ');
  if (s.anyOf || s.oneOf) return (s.anyOf ?? s.oneOf).map((x: J) => ts(x, comps, depth)).join(' | ');
  if (s.allOf) return s.allOf.map((x: J) => ts(x, comps, depth)).join(' & ');
  const t = Array.isArray(s.type) ? s.type : [s.type];
  const nullable = t.includes('null');
  const base = t.filter((x: string) => x !== 'null')[0];
  let out: string;
  if (base === 'string') out = s.format === 'date-time' ? 'string /*ISO datetime*/' : 'string';
  else if (base === 'integer' || base === 'number') out = 'number';
  else if (base === 'boolean') out = 'boolean';
  else if (base === 'array') out = `${ts(s.items, comps, depth)}[]`.replace(/^(.*\|.*)\[\]$/, '($1)[]');
  else if (base === 'object' || s.properties) {
    const props = s.properties ?? {};
    const req = new Set<string>(s.required ?? []);
    const body = Object.entries(props)
      .map(([k, v]: [string, any]) => `${k}${req.has(k) && v.default === undefined ? '' : '?'}: ${ts(v, comps, depth + 1)}`)
      .join('; ');
    const extra = s.additionalProperties && typeof s.additionalProperties === 'object' ? `[key: string]: ${ts(s.additionalProperties, comps, depth + 1)}` : '';
    out = `{ ${[body, extra].filter(Boolean).join('; ')} }`;
  } else out = 'unknown';
  return nullable ? `${out} | null` : out;
};

const doc = (e: EndpointDef): J => (e.service === 'low' ? low : high);
const opOf = (e: EndpointDef): J => doc(e).paths[`${e.unversioned ? '/s' : versionedPrefix(e.service)}${e.path}`][e.method];
const unwrap = (op: J, comps: J): string => {
  const s = op.responses?.['200']?.content?.['application/json']?.schema;
  const d = s?.properties?.data;
  return d ? ts(d, comps) : 'void';
};
const q = (op: J, comps: J): string =>
  (op.parameters ?? [])
    .filter((p: J) => p.in === 'query')
    .map((p: J) => `${p.name}${p.required ? '' : '?'}: ${ts(p.schema, comps)}`)
    .join('; ');

const eps = [...ENDPOINTS.low.filter((e) => LOW_IDS.has(e.id)), ...ENDPOINTS.high.filter((e) => !e.id.startsWith('H-9') || true)].filter((e) => e.service !== 'high' || !e.internalOnly);
const rows: string[] = [];
const details: string[] = [];
const used = new Set<string>();
const collect = (src: string) => src.match(/\b[A-Z][A-Za-z0-9]+\b/g)?.forEach((n) => used.add(n));
for (const e of eps) {
  const op = opOf(e);
  const comps = doc(e).components.schemas as J;
  const prefix = e.unversioned ? SERVICES_PREFIX(e) : versionedPrefix(e.service);
  const path = `${prefix}${e.path}`;
  const body = op.requestBody?.content?.['application/json']?.schema ? ts(op.requestBody.content['application/json'].schema, comps) : '';
  const resp = unwrap(op, comps);
  const query = q(op, comps);
  collect(body + ' ' + resp + ' ' + query);
  const rlim = e.rateLimit ? [e.rateLimit].flat().map((r) => `${r.limit}/${r.windowSec}s`).join(',') : '';
  rows.push(`| ${e.id} | ${e.method.toUpperCase()} | \`${path}\` | ${e.permission ?? '—'} | ${e.stepUp ? 'قابل' : '—'} | ${e.summary} |`);
  details.push(
    [`#### ${e.id} — ${e.method.toUpperCase()} \`${path}\``, `${e.summary}${e.description ? ' — ' + e.description : ''}`, `- مجوز: ${e.permission ?? 'فقط ورود'}؛ step-up: ${e.stepUp ? 'قابل (طبق سیاست)' : 'ندارد'}؛ idempotency: ${e.idempotency ?? '—'}؛ rate-limit: ${rlim || '—'}؛ خطاها: ${(e.errors ?? []).join(', ') || '—'}`,
      query ? `- query: \`{ ${query} }\`` : '', body ? `- body: \`${body}\`` : '', `- data: \`${resp}\``].filter(Boolean).join('\n')
  );
}
function SERVICES_PREFIX(e: EndpointDef): string {
  return e.service === 'high' ? '/s' : e.service === 'mid' ? '/o' : '/c';
}

// schemaهای نام‌دار مورد نیاز (بسته به ارجاع)
const named: string[] = [];
const seen = new Set<string>();
const visit = (n: string, comps: J) => {
  if (seen.has(n) || !comps[n]) return;
  seen.add(n);
  const t = ts(comps[n], comps);
  collect(t);
  named.push(`type ${n} = ${t};`);
  t.match(/\b[A-Z][A-Za-z0-9]+\b/g)?.forEach((m) => visit(m, comps));
};
const allComps = { ...(low.components.schemas as J), ...(high.components.schemas as J) };
for (const n of [...used]) visit(n, allComps);

const md = `# مرجع API پنل مدیریت (تولید خودکار — دستی ویرایش نکنید)

> نسخهٔ قرارداد از \`@isra/api-types\`. بازتولید: \`pnpm --filter @isra/api-types dashboard-ref\`.
> قالب پاسخ همهٔ endpointها: \`{ success: true, data, meta: { requestId, ... } }\`؛ خطا: \`{ success: false, error: { code, message, details? }, meta }\`.
> \`?\` یعنی اختیاری؛ فیلدهای دارای مقدار پیش‌فرض در body اختیاری‌اند. بدنه‌ها strict هستند (فیلد اضافه ⇒ 400).

## فهرست endpointها
| شناسه | متد | مسیر | مجوز | step-up | شرح |
|---|---|---|---|---|---|
${rows.join('\n')}

## جزئیات
${details.join('\n\n')}

## نوع‌ها (TypeScript)
\`\`\`ts
${named.sort().join('\n')}
\`\`\`
`;
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs-v2/28-dashboard-api-reference.md');
writeFileSync(out, md);
console.log('✓', out, `${(md.length / 1024).toFixed(0)}KB`, eps.length, 'endpoints');
