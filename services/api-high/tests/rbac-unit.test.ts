import { describe, expect, it } from 'vitest';
import { TtlLru } from '../src/domain/access/lru';
import { type RawSource, type StepUpPolicy, type UserAccess, accessFromRows, describeAccess, effectiveOfRole, isReservedPermissionKey, missingForActor, ruleKey, stepUpFor, stepUpRequired } from '../src/domain/access/policy';

const policy = (defaults: Record<string, 'required' | 'none'>, rules: Record<string, 'required' | 'none'> = {}): StepUpPolicy => ({
  permDefault: new Map(Object.entries(defaults)),
  roleRules: new Map(Object.entries(rules).map(([k, v]) => [k.replace('|', '\u0000'), v]))
});
const access = (roles: string[], src: Record<string, RawSource[]>, grants: string[] = []): UserAccess => ({ roles, grants, permissions: Object.keys(src).sort(), sources: new Map(Object.entries(src)) });
const role = (r: string): RawSource => ({ type: 'role', ref: r, role: r });

describe('TtlLru', () => {
  it('TTL و حذف قدیمی‌ترین', () => {
    let t = 0;
    const c = new TtlLru<number>(2, 100, () => t);
    c.set('a', 1);
    c.set('b', 2);
    expect(c.get('a')).toBe(1); // a تازه می‌شود
    c.set('c', 3); // b حذف
    expect(c.get('b')).toBeUndefined();
    expect(c.get('c')).toBe(3);
    t = 101;
    expect(c.get('a')).toBeUndefined();
    expect(c.size).toBeLessThanOrEqual(2);
    c.clear();
    expect(c.size).toBe(0);
  });
});

describe('accessFromRows', () => {
  it('اجتماع صریح/ماژول/grant با منبع؛ بدون تکرار', () => {
    const m = accessFromRows(['u'], [
      { uid: 'u', t: 'r', role: 'ed', ref: null, perm: null },
      { uid: 'u', t: 'p', role: 'ed', ref: 'ed', perm: 'a.b' },
      { uid: 'u', t: 'm', role: 'ed', ref: 'mod', perm: 'a.b' },
      { uid: 'u', t: 'm', role: 'ed', ref: 'mod', perm: 'a.b' },
      { uid: 'u', t: 'g', role: null, ref: null, perm: 'c.d' }
    ]);
    const a = m.get('u')!;
    expect(a.roles).toEqual(['ed']);
    expect(a.grants).toEqual(['c.d']);
    expect(a.permissions).toEqual(['a.b', 'c.d']);
    expect(a.sources.get('a.b')).toHaveLength(2);
  });
  it('کاربر بدون سطر ⇒ دسترسی خالی', () => expect(accessFromRows(['x'], []).get('x')).toMatchObject({ roles: [], permissions: [] }));
});

describe('step-up', () => {
  const p = policy({ 'x.y': 'required', 'x.z': 'none' }, { 'r1|x.y': 'none' });
  it('developer هرگز؛ بدون permission لازم؛ mcp لازم', () => {
    const dev = access(['developer'], { 'x.y': [role('developer')] });
    expect(stepUpRequired(dev, p, { permission: 'x.y' }, false)).toBe(false);
    expect(stepUpRequired(dev, p, {}, false)).toBe(false);
    expect(stepUpRequired(dev, p, {}, true)).toBe(true);
    const u = access(['r1'], { 'x.y': [role('r1')] });
    expect(stepUpRequired(u, p, {}, false)).toBe(true);
  });
  it('override نقش > پیش‌فرض؛ چند منبع: هر required ⇒ required؛ بدون منبع ⇒ required', () => {
    expect(stepUpFor(access(['r1'], { 'x.y': [role('r1')] }), p, 'x.y')).toBe('none');
    expect(stepUpFor(access(['r1', 'r2'], { 'x.y': [role('r1'), role('r2')] }), p, 'x.y')).toBe('required');
    expect(stepUpFor(access([], { 'x.y': [{ type: 'grant', ref: 'x.y', role: null }] }), p, 'x.y')).toBe('required');
    expect(stepUpFor(access(['r1'], {}), p, 'x.y')).toBe('required');
    expect(stepUpFor(access(['r1'], { 'x.z': [role('r1')] }), p, 'x.z')).toBe('none');
    expect(ruleKey('a', 'b')).toBe('a\u0000b');
  });
  it('describeAccess: developer ⇒ همه none و stepUpExempt', () => {
    const d = describeAccess('id', access(['developer'], { 'x.y': [role('developer')] }), p);
    expect(d.stepUpExempt).toBe(true);
    expect(d.permissions[0]).toMatchObject({ key: 'x.y', stepUp: 'none', sources: [{ type: 'role', ref: 'developer', stepUp: 'required' }] });
  });
});

describe('ضد ارتقا و کلیدها', () => {
  it('missingForActor: developer معاف؛ بقیه کمبودها مرتب', () => {
    expect(missingForActor(access(['developer'], {}), ['a.b'])).toEqual([]);
    expect(missingForActor(access(['r'], { 'a.b': [role('r')] }), ['c.d', 'a.b', 'c.d'])).toEqual(['c.d']);
  });
  it('effectiveOfRole و کلید رزرو', () => {
    expect(effectiveOfRole(['z.a'], ['m'], new Map([['m', ['a.b', 'z.a']]]))).toEqual(['a.b', 'z.a']);
    expect(isReservedPermissionKey('system.x.y')).toBe(true);
    expect(isReservedPermissionKey('systemic.x')).toBe(false);
    expect(isReservedPermissionKey('billing.read')).toBe(false);
  });
});
