import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import { describe, expect, it } from 'vitest';
import { ENDPOINTS, buildOpenApi, diffOpenApi, versionedPrefix, type ServiceKey } from '../src';

const services: ServiceKey[] = ['low', 'mid', 'high'];
const file = (s: ServiceKey) => resolve(__dirname, `../openapi/${s}.v1.openapi.json`);

describe.each(services)('OpenAPI %s', (s) => {
  const doc = buildOpenApi(s);

  it('سند معتبر OpenAPI 3.1 است و $refها حل می‌شوند', async () => {
    const parsed = await SwaggerParser.validate(structuredClone(doc) as never);
    expect((parsed as { openapi: string }).openapi).toBe('3.1.0');
  });

  it('هر endpoint registry دقیقاً یک operation دارد', () => {
    const ops = Object.values(doc.paths as Record<string, Record<string, unknown>>).flatMap((p) => Object.keys(p));
    expect(ops.length).toBe(ENDPOINTS[s].length);
    for (const e of ENDPOINTS[s]) {
      const full = (e.unversioned ? doc.servers && `/${{ low: 'c', mid: 'o', high: 's' }[s]}` : versionedPrefix(s)) + e.path;
      expect(doc.paths[full]?.[e.method], e.id).toBeDefined();
    }
  });

  it('operationId یکتا؛ هر operation x-isra-id و SLO دارد', () => {
    const ids: string[] = [];
    for (const p of Object.values(doc.paths as Record<string, Record<string, any>>))
      for (const op of Object.values(p)) {
        ids.push(op.operationId);
        expect(op['x-isra-id']).toBeTruthy();
        expect(op['x-isra-slo-p95-ms']).toBeGreaterThan(0);
        expect(op.responses['200']).toBeDefined();
        expect(op.responses['500']).toBeDefined();
      }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('امنیت: طرح‌ها تعریف شده و endpointهای محافظت‌شده security دارند', () => {
    expect(Object.keys(doc.components.securitySchemes).sort()).toEqual(['bearerAuth', 'refreshCookie', 'stepUp']);
    for (const p of Object.values(doc.paths as Record<string, Record<string, any>>))
      for (const op of Object.values(p)) {
        if (op['x-isra-step-up']) {
          expect(op.security).toEqual([{ bearerAuth: [], stepUp: [] }]);
          expect(op.parameters.some((x: { name: string }) => x.name === 'X-Step-Up-Token')).toBe(true);
          expect(op.responses['403']).toBeDefined();
        }
        if (op['x-isra-rate-limit']) expect(op.responses['429'].headers['Retry-After']).toBeDefined();
      }
  });

  it('همهٔ پاسخ‌های خطا به ErrorEnvelope اشاره می‌کنند', () => {
    for (const p of Object.values(doc.paths as Record<string, Record<string, any>>))
      for (const op of Object.values(p))
        for (const [code, r] of Object.entries(op.responses as Record<string, any>))
          if (Number(code) >= 400) expect(r.content['application/json'].schema.$ref).toBe('#/components/schemas/ErrorEnvelope');
  });

  it('فایل commit‌شده با تولید جاری یکی است (drift نداریم)', () => {
    expect(existsSync(file(s)), `${file(s)} موجود نیست؛ pnpm --filter @isra/api-types openapi`).toBe(true);
    expect(readFileSync(file(s), 'utf8')).toBe(JSON.stringify(doc, null, 2) + '\n');
  });

  it('درخواست‌های عمومی PII/توکن در example ندارند', () => {
    const text = JSON.stringify(doc);
    expect(text).not.toMatch(/Bearer ey[A-Za-z0-9_-]{10,}/);
    expect(text).not.toMatch(/BEGIN (RSA )?PRIVATE KEY/);
  });
});

describe('mid: realtime', () => {
  it('رویدادهای Socket.IO مستند شده‌اند', () => {
    const doc = buildOpenApi('mid');
    const events = doc['x-isra-realtime'].serverToClient.map((e: { event: string }) => e.event).sort();
    expect(events).toEqual(['attendance.updated', 'eval.updated', 'queue.turned', 'queue.updated', 'session.state']);
    expect(doc.components.schemas.LiveEvent).toBeDefined();
  });
});

describe('تشخیص تغییر ناسازگار (diffOpenApi)', () => {
  const base = () => structuredClone(buildOpenApi('high'));

  it('بدون تغییر ⇒ تهی', () => {
    const r = diffOpenApi(base(), base());
    expect(r.breaking).toEqual([]);
    expect(r.additions).toEqual([]);
  });
  it('حذف endpoint ⇒ breaking', () => {
    const b = base();
    delete b.paths['/s/v1/system/audit'];
    expect(diffOpenApi(base(), b).breaking.join('\n')).toContain('endpoint حذف شد');
  });
  it('فیلد الزامی جدید در درخواست ⇒ breaking؛ فیلد اختیاری جدید ⇒ addition', () => {
    const b = base();
    const body = b.components.schemas.SetUserRolesBody;
    body.properties.reason = { type: 'string' };
    expect(diffOpenApi(base(), b).additions.join('\n')).toContain('reason');
    body.required.push('reason');
    expect(diffOpenApi(base(), b).breaking.join('\n')).toContain('reason');
  });
  it('حذف فیلد پاسخ و تغییر type ⇒ breaking', () => {
    const b = base();
    delete b.components.schemas.SystemUser.properties.phone;
    const d1 = diffOpenApi(base(), b);
    expect(d1.breaking.join('\n')).toContain('phone');
    const c = base();
    c.components.schemas.SystemUser.properties.name.type = 'integer';
    expect(diffOpenApi(base(), c).breaking.join('\n')).toContain('type');
  });
  it('step-up الزامی‌شدن ⇒ breaking', () => {
    const b = base();
    const a = base();
    delete a.paths['/s/v1/system/settings'].put['x-isra-step-up'];
    expect(diffOpenApi(a, b).breaking.join('\n')).toContain('step-up');
  });
  it('endpoint جدید ⇒ addition', () => {
    const a = base();
    delete a.paths['/s/v1/system/audit'];
    expect(diffOpenApi(a, base()).additions.join('\n')).toContain('endpoint جدید');
  });
});
