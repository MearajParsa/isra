/** مطابقت mock با قرارداد قفل‌شدهٔ high و auth (@isra/api-types). */
import { beforeAll, describe, expect, it } from 'vitest';
import { high, low } from '@isra/api-types';
import { markReady } from './control';
import { adminMockApi as a } from './adminMock';

const dev = { deviceId: '6f3c2a10-0000-4000-8000-0000000000aa', deviceLabel: 'Test' };

/** هر schema از @isra/api-types (zod) — فقط safeParse لازم است */
type Schema = { safeParse(v: unknown): { success: boolean; error?: { issues: unknown[] } } };

function conforms(schema: Schema, value: unknown, label: string) {
  const r = schema.safeParse(value);
  expect(r.success, `${label}: ${r.success ? '' : JSON.stringify(r.error?.issues.slice(0, 3))}`).toBe(true);
}

let t = '';
beforeAll(async () => {
  markReady();
  const res = await a.auth.loginPassword({ phone: '09121234567', password: 'isra1234', ...dev });
  conforms(low.AuthResult, res, 'AuthResult');
  t = res.accessToken;
});

describe('mock high ⇄ قرارداد', () => {
  it('هویت و نمای کلی', async () => {
    conforms(high.SystemMe, await a.system.me(t), 'H-00');
    conforms(high.Overview, await a.system.overview(t), 'H-01');
  });
  it('نقش‌ها و مجوزها', async () => {
    for (const r of await a.system.roles(t)) conforms(high.SystemRole, r, 'H-10');
    for (const p of await a.system.permissions(t)) conforms(high.PermissionInfo, p, 'H-11');
  });
  it('کاربران', async () => {
    const page = await a.system.users(t, { pageSize: 50 });
    for (const u of page.items) conforms(high.SystemUser, u, 'H-20');
    conforms(high.SystemUser, await a.system.user(t, page.items[0]!.id), 'H-21');
  });
  it('تنظیمات و audit', async () => {
    const s = await a.system.settings(t);
    conforms(high.SystemSettings, s, 'H-30');
    conforms(high.UpdateSettingsBody, { version: s.version, evalWeights: s.evalWeights, badgeThresholds: s.badgeThresholds, flags: s.flags }, 'ورودی H-31');
    for (const e of (await a.system.audit(t, { pageSize: 50 })).items) conforms(high.AuditEntry, e, `H-40 ${e.id}`);
  });
});
