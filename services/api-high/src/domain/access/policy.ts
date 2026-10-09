import type { Grant, PermissionKey, StepUpMode, SystemRoleKey, Tier } from '../rules';
import { DEVELOPER, QURAN_STUDENT } from '../rules';

/**
 * منطق خالص RBAC پویا (بدون DB): دسترسی مؤثر، منبع هر مجوز، قاعدهٔ step-up (docs-v2/27 §4) و بررسی‌های ضد ارتقا.
 * همهٔ ورودی‌ها داده‌اند؛ تست واحد مستقیم.
 */
export type SourceType = 'role' | 'module' | 'grant' | 'baseline';
export interface RawSource {
  type: SourceType;
  /** role ⇒ کلید نقش؛ module ⇒ کلید ماژول؛ grant ⇒ کلید مجوز؛ baseline ⇒ quran_student (عضویت ضمنی، ۱.۷.۰) */
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
  /** ۱.۷.۰: سطوح نقش‌های اختصاص‌یافته (بدون low ضمنی) */
  roleTiers: Tier[];
  /** ۱.۷.۰: سطوح کاربر = roleTiers ∪ low (quran_student ضمنی) */
  tiers: Tier[];
  /** وضعیت دایرکتوری کاربر (active|disabled|deleted)؛ null/undefined = در دایرکتوری نیست (docs-v2/30 §۳ امنیت ۶) */
  status?: string | null;
}

export interface StepUpPolicy {
  /** پیش‌فرض step-up هر مجوز */
  permDefault: ReadonlyMap<PermissionKey, StepUpMode>;
  /** `${role}\0${permission}` ⇒ override */
  roleRules: ReadonlyMap<string, StepUpMode>;
}

export const ruleKey = (role: string, perm: string): string => `${role}\u0000${perm}`;
export const isDeveloper = (a: Pick<UserAccess, 'roles'>): boolean => a.roles.includes(DEVELOPER);

/**
 * ۱.۷.۰ (docs-v2/31 §۱): ورود به پنل = دست‌کم یک نقش tier=high **یا** دست‌کم یک مجوز `system.*`
 * (استادی که developer به او مجوز سیستمی داده هم وارد می‌شود).
 */
export const hasPanelAccess = (a: Pick<UserAccess, 'roleTiers' | 'permissions'>): boolean => a.roleTiers.includes('high') || a.permissions.some((p) => p.startsWith('system.'));

const TIER_ORDER: readonly Tier[] = ['high', 'mid', 'low'];
export const sortTiers = (t: Iterable<Tier>): Tier[] => [...new Set(t)].sort((a, b) => TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b));

/** سطر نتیجهٔ query تجمیعی: t = r(نقش بدون مجوز) | p(صریح) | m(ماژول) | g(grant) | s(وضعیت دایرکتوری در ref) | t(سطح نقش در ref) */
export interface AccessRow {
  uid: string;
  t: 'r' | 'p' | 'm' | 'g' | 's' | 't';
  role: string | null;
  ref: string | null;
  perm: string | null;
}

/**
 * @param baseline مجوزهای مؤثر نقش ضمنی quran_student (هر کاربر ثبت‌نام‌کرده)؛ undefined ⇒ بدون baseline
 * (انتشار claim: low/mid baseline را خودشان از `tier.baseline.changed` اعمال می‌کنند و در JWT نمی‌آید).
 */
export function accessFromRows(userIds: readonly string[], rows: readonly AccessRow[], baseline?: readonly PermissionKey[]): Map<string, UserAccess> {
  interface Acc {
    roles: Set<string>;
    grants: Set<string>;
    tiers: Set<Tier>;
    src: Map<string, RawSource[]>;
    status: string | null;
  }
  const by = new Map<string, Acc>(userIds.map((u) => [u, { roles: new Set(), grants: new Set(), tiers: new Set(), src: new Map(), status: null }]));
  const add = (a: Acc, perm: string, s: RawSource) => {
    const list = a.src.get(perm);
    if (!list) a.src.set(perm, [s]);
    else if (!list.some((x) => x.type === s.type && x.ref === s.ref && x.role === s.role)) list.push(s);
  };
  for (const r of rows) {
    const a = by.get(r.uid);
    if (!a) continue;
    if (r.t === 's') a.status = r.ref;
    else if (r.t === 't') (a.roles.add(r.role!), a.tiers.add(r.ref as Tier));
    else if (r.t === 'r') a.roles.add(r.role!);
    else if (r.t === 'p') (a.roles.add(r.role!), add(a, r.perm!, { type: 'role', ref: r.role!, role: r.role }));
    else if (r.t === 'm') (a.roles.add(r.role!), add(a, r.perm!, { type: 'module', ref: r.ref!, role: r.role }));
    else (a.grants.add(r.perm!), add(a, r.perm!, { type: 'grant', ref: r.perm!, role: null }));
  }
  const out = new Map<string, UserAccess>();
  for (const [uid, a] of by) {
    if (baseline) for (const p of baseline) add(a, p, { type: 'baseline', ref: QURAN_STUDENT, role: QURAN_STUDENT });
    const roleTiers = sortTiers(a.tiers);
    out.set(uid, { roles: [...a.roles].sort(), grants: [...a.grants].sort(), permissions: [...a.src.keys()].sort(), sources: a.src, roleTiers, tiers: sortTiers([...roleTiers, 'low']), status: a.status });
  }
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
  tiers: Tier[];
  grants: string[];
  stepUpExempt: boolean;
  permissions: { key: string; stepUp: StepUpMode; sources: { type: SourceType; ref: string; stepUp: StepUpMode }[] }[];
}

export function describeAccess(userId: string, a: UserAccess, policy: StepUpPolicy): EffectiveAccessDto {
  return {
    userId,
    roles: a.roles,
    tiers: a.tiers,
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
