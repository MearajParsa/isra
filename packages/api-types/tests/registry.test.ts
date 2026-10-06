import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_ENDPOINTS, ENDPOINTS, ERROR_CATALOG, SERVICES, versionedPrefix, type EndpointDef } from '../src';

const docs = resolve(__dirname, '../../../docs-v2');
const read = (f: string) => readFileSync(resolve(docs, f), 'utf8');

describe('یکپارچگی registry', () => {
  it('شناسه‌ها یکتا و با حرف سرویس هماهنگ‌اند', () => {
    const ids = ALL_ENDPOINTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const letter = { low: 'L', mid: 'M', high: 'H' } as const;
    for (const e of ALL_ENDPOINTS) expect(e.id.startsWith(letter[e.service] + '-')).toBe(true);
  });

  it('method+path در هر سرویس یکتا است و path با / شروع می‌شود', () => {
    for (const [svc, list] of Object.entries(ENDPOINTS)) {
      const keys = list.map((e) => `${e.method} ${e.unversioned ? SERVICES[svc as keyof typeof SERVICES].prefix : versionedPrefix(svc as keyof typeof SERVICES)}${e.path}`);
      expect(new Set(keys).size).toBe(keys.length);
      for (const e of list) expect(e.path.startsWith('/')).toBe(true);
    }
  });

  it('کدهای خطای هر endpoint در کاتالوگ هستند', () => {
    for (const e of ALL_ENDPOINTS) for (const c of e.errors ?? []) expect(ERROR_CATALOG).toHaveProperty(c);
  });

  it('path param ها با {param} در مسیر و params schema یکی‌اند', () => {
    for (const e of ALL_ENDPOINTS) {
      const inPath = [...e.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const inSchema = Object.keys(e.params?.shape ?? {}).sort();
      expect(inSchema, e.id).toEqual(inPath);
    }
  });

  it('هر endpoint سمت سرور هدف تأخیر معقول دارد (p95 ≤ ۴۰۰ms؛ عملیات گروهی/خروجی با سقف صریح)', () => {
    // استثنای صریح: افزودن گروهی تا ۲۰۰ عضو (H-73)، تأیید گروهی (H-53)، افزودن/حضور گروهی (M-14/H-76) و خروجی CSV (H-43..H-45)
    const heavy: Record<string, number> = { 'H-73': 1500, 'H-53': 800, 'H-76': 400, 'M-14': 400, 'H-43': 3000, 'H-44': 3000, 'H-45': 3000 };
    for (const e of ALL_ENDPOINTS) {
      expect(e.sloP95Ms, e.id).toBeGreaterThan(0);
      expect(e.sloP95Ms, e.id).toBeLessThanOrEqual(heavy[e.id] ?? 400);
    }
  });
});

describe('ردیابی docs ⇄ قرارداد', () => {
  const ids = new Set(ALL_ENDPOINTS.map((e) => e.id));
  const extract = (text: string, letter: string) => [...text.matchAll(new RegExp(`\\b${letter}-\\d{2}\\b`, 'g'))].map((m) => m[0]);

  it('همهٔ L-xx در docs-v2/15 وجود دارند', () => {
    for (const id of new Set(extract(read('15-api-low-web-main-draft.md'), 'L'))) expect(ids.has(id), id).toBe(true);
  });
  it('همهٔ M-xx در docs-v2/18 وجود دارند', () => {
    for (const id of new Set(extract(read('18-api-mid-web-main-draft.md'), 'M'))) expect(ids.has(id), id).toBe(true);
  });
  it('همهٔ H-xx در docs-v2/20 وجود دارند', () => {
    for (const id of new Set(extract(read('20-api-high-web-admin-draft.md'), 'H'))) expect(ids.has(id), id).toBe(true);
  });
});

describe('سیاست امنیت (قرارداد)', () => {
  const writes = ALL_ENDPOINTS.filter((e) => e.method !== 'get');
  const authed = (e: EndpointDef) => e.auth !== 'none';

  it('همهٔ endpointهای غیر-عمومی احراز هویت دارند؛ عمومی‌ها فقط auth/public/ops/jwks', () => {
    const publicOk = /^(\/auth\/(otp\/request|otp\/verify|login\/password)|\/public\/|\/health\/|\/\.well-known\/)/;
    for (const e of ALL_ENDPOINTS.filter((x) => x.auth === 'none')) expect(publicOk.test(e.path), e.id).toBe(true);
  });

  it('همهٔ write‌های high (به‌جز OPS و خودخدمتی «حساب من») نیازمند step-up و مجوز هستند', () => {
    // خودخدمتی (/system/me/*): ویرایش نام و revoke نشست خودم بدون step-up؛ تغییر رمز خودم step-up دارد (H-04)
    for (const e of ENDPOINTS.high.filter((x) => x.method !== 'get' && !x.path.startsWith('/system/me/'))) {
      expect(e.stepUp, e.id).toBe(true);
      expect(e.permission, e.id).toBeTruthy();
      expect(e.errors, e.id).toContain('AUTH_STEP_UP_REQUIRED');
    }
  });

  it('endpointهای عمومی بدون rate-limit نیستند و OTP/login محدودیت چندلایه دارند', () => {
    for (const e of ALL_ENDPOINTS.filter((x) => x.auth === 'none' && !x.internalOnly)) expect(e.rateLimit, e.id).toBeTruthy();
    const otp = ALL_ENDPOINTS.find((e) => e.id === 'L-01')!;
    expect([otp.rateLimit].flat().map((r) => r!.key).sort()).toEqual(['ip', 'phone']);
    const login = ALL_ENDPOINTS.find((e) => e.id === 'L-03')!;
    expect([login.rateLimit].flat().map((r) => r!.key)).toContain('ip+phone');
  });

  it('بدنهٔ همهٔ write‌ها strict است (فیلد ناشناخته رد می‌شود) و اعتبارسنجی ورودی دارد', () => {
    for (const e of writes.filter((x) => x.body)) {
      const sample = e.body!.safeParse({ __unknown_field__: 1 });
      expect(sample.success, e.id).toBe(false);
    }
  });

  it('پاسخ‌های احراز‌شده cache عمومی ندارند (جلوگیری از نشت داده)', () => {
    for (const e of ALL_ENDPOINTS.filter(authed)) {
      const c = e.cache ?? 'no-store';
      if (c !== 'no-store') expect(c.scope, e.id).toBe('private');
    }
  });

  it('endpointهای mutating نباید GET باشند و write‌های تکرارپذیر idempotency دارند', () => {
    for (const e of ALL_ENDPOINTS.filter((x) => x.method === 'get')) expect(e.body, e.id).toBeUndefined();
    for (const id of ['M-20', 'L-02', 'L-05']) expect(ALL_ENDPOINTS.find((e) => e.id === id)?.idempotency, id).toBeTruthy();
    for (const id of ['M-03', 'M-05', 'M-40']) expect(ALL_ENDPOINTS.find((e) => e.id === id)?.idempotency, id).toBe('key');
  });
});

describe('سیاست پرفورمنس (قرارداد)', () => {
  it('همهٔ لیست‌ها صفحه‌بندی با سقف ≤ ۱۰۰ دارند', () => {
    for (const e of ALL_ENDPOINTS.filter((x) => x.list)) {
      const q = e.query?.shape as Record<string, { parse: (v: unknown) => unknown }> | undefined;
      expect(q?.pageSize, e.id).toBeDefined();
      expect(() => q!.pageSize!.parse(101), e.id).toThrow();
      expect(() => q!.pageSize!.parse(0), e.id).toThrow();
      expect(q!.page, e.id).toBeDefined();
    }
  });

  it('endpointهای عمومی cache‌پذیرند (CDN) و با ETag', () => {
    for (const id of ['L-30', 'L-31', 'L-90']) {
      const c = ALL_ENDPOINTS.find((e) => e.id === id)!.cache;
      expect(c, id).not.toBe('no-store');
      expect((c as { scope: string }).scope).toBe('public');
      expect((c as { etag?: boolean }).etag).toBe(true);
    }
  });

  it('poll سبک (unread-count) سریع و rate-limit بالاتر دارد', () => {
    const e = ALL_ENDPOINTS.find((x) => x.id === 'L-18')!;
    expect(e.sloP95Ms).toBeLessThanOrEqual(50);
  });
});

describe('نسخه‌گذاری', () => {
  it('deprecated ⇒ sunset دست‌کم ۱۸۰ روز بعد از since', () => {
    for (const e of ALL_ENDPOINTS.filter((x) => x.deprecated)) {
      const d = e.deprecated!;
      expect((Date.parse(d.sunset) - Date.parse(d.since)) / 86_400_000, e.id).toBeGreaterThanOrEqual(180);
    }
  });
  it('پیشوندها قفل‌شده‌اند: /c/v1 /o/v1 /s/v1', () => {
    expect(versionedPrefix('low')).toBe('/c/v1');
    expect(versionedPrefix('mid')).toBe('/o/v1');
    expect(versionedPrefix('high')).toBe('/s/v1');
  });
});
