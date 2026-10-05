import type { Grant, PermissionKey, StepUpMode, SystemRoleKey } from '../rules';
import { DEVELOPER } from '../rules';

/**
 * منطق خالص RBAC پویا (بدون DB): دسترسی مؤثر، منبع هر مجوز، قاعدهٔ step-up (docs-v2/27 §4) و بررسی‌های ضد ارتقا.
 * همهٔ ورودی‌ها داده‌اند؛ تست واحد مستقیم.
 */
export type SourceType = 'role' | 'module' | 'grant';
export interface RawSource {
  type: SourceType;
  /** role ⇒ کلید نقش؛ module ⇒ کلید ماژول؛ grant ⇒ کلید مجوز */
  ref: string;
  /** نقشی که این منبع را داده (برای grant: null) */
  role: SystemRoleKey | null;
}

export interface UserAccess {
  roles: SystemRoleKey[];
  /** grantهای مستقیم */
  grants: Grant[];
  /** مجوزهای مؤثر = نقش‌ها (صریح ∪ ماژول) ∪ grant؛ مرتب */
  permissions: PermissionKey[];
  sources: ReadonlyMap<PermissionKey, readonly RawSource[]>;
}

export interface StepUpPolicy {
  /** پیش‌فرض step-up هر مجوز */
  permDefault: ReadonlyMap<PermissionKey, StepUpMode>;
  /** `${role}\0${permission}` ⇒ override */
  roleRules: ReadonlyMap<string, StepUpMode>;
}

export const ruleKey = (role: string, perm: string): string => `${role}\u0000${perm}`;
export const isDeveloper = (a: Pick<UserAccess, 'roles'>): boolean => a.roles.includes(DEVELOPER);

/** سطر نتیجهٔ query تجمیعی: t = r(نقش بدون مجوز) | p(صریح) | m(ماژول) | g(grant) */
export interface AccessRow {
  uid: string;
  t: 'r' | 'p' | 'm' | 'g';
  role: string | null;
  ref: string | null;
  perm: string | null;
}

export function accessFromRows(userIds: readonly string[], rows: readonly AccessRow[]): Map<string, UserAccess> {
  interface Acc {
    roles: Set<string>;
    grants: Set<string>;
    src: Map<string, RawSource[]>;
  }
  const by = new Map<string, Acc>(userIds.map((u) => [u, { roles: new Set(), grants: new Set(), src: new Map() }]));
  const add = (a: Acc, perm: string, s: RawSource) => {
    const list = a.src.get(perm);
    if (!list) a.src.set(perm, [s]);
    else if (!list.some((x) => x.type === s.type && x.ref === s.ref && x.role === s.role)) list.push(s);
  };
  for (const r of rows) {
    const a = by.get(r.uid);
    if (!a) continue;
    if (r.t === 'r') a.roles.add(r.role!);
    else if (r.t === 'p') (a.roles.add(r.role!), add(a, r.perm!, { type: 'role', ref: r.role!, role: r.role }));
    else if (r.t === 'm') (a.roles.add(r.role!), add(a, r.perm!, { type: 'module', ref: r.ref!, role: r.role }));
    else (a.grants.add(r.perm!), add(a, r.perm!, { type: 'grant', ref: r.perm!, role: null }));
  }
  const out = new Map<string, UserAccess>();
  for (const [uid, a] of by) out.set(uid, { roles: [...a.roles].sort(), grants: [...a.grants].sort(), permissions: [...a.src.keys()].sort(), sources: a.src });
  return out;
}

export function sourceMode(policy: StepUpPolicy, s: RawSource, perm: PermissionKey): StepUpMode {
  const dflt = policy.permDefault.get(perm) ?? 'required';
  return s.role ? (policy.roleRules.get(ruleKey(s.role, perm)) ?? dflt) : dflt;
}

/** نتیجهٔ نهایی step-up برای یک مجوز: developer ⇒ none؛ منبعی نیست ⇒ required (محافظه‌کارانه)؛ هر منبعِ required ⇒ required */
export function stepUpFor(a: UserAccess, policy: StepUpPolicy, perm: PermissionKey): StepUpMode {
  if (isDeveloper(a)) return 'none';
  const src = a.sources.get(perm);
  if (!src || src.length === 0) return 'required';
  return src.some((s) => sourceMode(policy, s, perm) === 'required') ? 'required' : 'none';
}

export function stepUpMap(a: UserAccess, policy: StepUpPolicy): Record<PermissionKey, StepUpMode> {
  const out: Record<PermissionKey, StepUpMode> = {};
  for (const p of a.permissions) out[p] = stepUpFor(a, policy, p);
  return out;
}

/**
 * آیا endpoint با `stepUp:true` برای این کاربر واقعاً step-up می‌خواهد؟
 *  - mcp (رمز موقت): مثل قبل همیشه لازم (استثنای H-04 جداست)
 *  - developer: هرگز
 *  - H-04 (تغییر رمز خودم): همیشه لازم، حتی برای developer
 *  - endpoint بدون permission (self-service): لازم
 *  - وگرنه: از سیاست مجوز endpoint
 */
/** اقدام‌هایی که حتی developer هم باید step-up بدهد (تصمیم مالک): تغییر رمز خودِ حساب (H-04) */
export const ALWAYS_STEP_UP = new Set(['H-04']);

export function stepUpRequired(a: UserAccess, policy: StepUpPolicy, def: { id?: string | undefined; permission?: string | undefined }, mcp: boolean): boolean {
  if (mcp) return true;
  if (def.id && ALWAYS_STEP_UP.has(def.id)) return true;
  if (isDeveloper(a)) return false;
  if (!def.permission) return true;
  return stepUpFor(a, policy, def.permission) === 'required';
}

export interface EffectiveAccessDto {
  userId: string;
  roles: string[];
  grants: string[];
  stepUpExempt: boolean;
  permissions: { key: string; stepUp: StepUpMode; sources: { type: SourceType; ref: string; stepUp: StepUpMode }[] }[];
}

export function describeAccess(userId: string, a: UserAccess, policy: StepUpPolicy): EffectiveAccessDto {
  return {
    userId,
    roles: a.roles,
    grants: a.grants,
    stepUpExempt: isDeveloper(a),
    permissions: a.permissions.map((key) => ({
      key,
      stepUp: stepUpFor(a, policy, key),
      sources: (a.sources.get(key) ?? []).map((s) => ({ type: s.type, ref: s.ref, stepUp: sourceMode(policy, s, key) }))
    }))
  };
}

/** مجوزهای مؤثر نقش = صریح ∪ مجوزهای ماژول‌ها */
export function effectiveOfRole(explicit: readonly PermissionKey[], modules: readonly string[], permsByModule: ReadonlyMap<string, readonly PermissionKey[]>): PermissionKey[] {
  const s = new Set<PermissionKey>(explicit);
  for (const m of modules) for (const p of permsByModule.get(m) ?? []) s.add(p);
  return [...s].sort();
}

/** E2: مواردی از `needed` که کاربر ندارد (developer معاف) */
export function missingForActor(actor: Pick<UserAccess, 'roles' | 'permissions'>, needed: Iterable<string>): string[] {
  if (isDeveloper(actor)) return [];
  const held = new Set(actor.permissions);
  return [...new Set(needed)].filter((p) => !held.has(p)).sort();
}

/** کلید مجوز پویا نباید `system.` باشد (E7) */
export const isReservedPermissionKey = (key: string): boolean => key === 'system' || key.startsWith('system.');
