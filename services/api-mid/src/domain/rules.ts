import type { z } from 'zod';
import { mid } from '@isra/api-types';

export type SessionRole = z.infer<typeof mid.SessionRole>;
export type Permission = z.infer<typeof mid.Permission>;
export type SessionState = 'draft' | 'scheduled' | 'started' | 'ended';

export const DEFAULT_THRESHOLDS = [50, 150, 300, 500] as const;
export const ATTENDANCE_POINTS = 5;

/**
 * ۱.۷.۰ (docs-v2/31 §۲): کاتالوگ مجوزهای قابل‌واگذاری (منبع حقیقت مشترک: `mid.SESSION_DELEGABLE_PERMISSIONS`).
 * صاحب جلسه همه را دارد؛ پشتیبان فقط اجتماع مجوزهای ثابت (استاد) و per جلسه؛ عضو هیچ‌کدام.
 */
export const ALL_SESSION_PERMISSIONS: readonly Permission[] = mid.SESSION_DELEGABLE_PERMISSIONS.map((p) => p.key);
const DELEGABLE = new Set<string>(ALL_SESSION_PERMISSIONS);

/** ضد ارتقا: فقط کلیدهای کاتالوگ (یکتا و به ترتیب کاتالوگ)؛ هر کلید ناشناخته (حتی از DB قدیمی) دور ریخته می‌شود */
export const sanitizePermissions = (v: Iterable<unknown>): Permission[] => {
  const s = new Set<string>();
  for (const x of v) if (typeof x === 'string' && DELEGABLE.has(x)) s.add(x);
  return ALL_SESSION_PERMISSIONS.filter((p) => s.has(p));
};

/** JSON ذخیره‌شده (رشته یا آرایه) ⇒ مجوزهای معتبر */
export const parsePermissions = (raw: unknown): Permission[] => {
  if (raw === null || raw === undefined) return [];
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? sanitizePermissions(v) : [];
};

/**
 * مجوز مؤثر درون‌جلسه (۱.۷.۰): owner ⇒ همه؛ supporter ⇒ اجتماع ثابت ∪ per جلسه (فقط کلیدهای کاتالوگ)؛ member/null ⇒ [].
 */
export function effectivePermissions(role: SessionRole | null, teacher: readonly Permission[] | null, session: readonly Permission[] | null): Permission[] {
  if (role === 'owner') return [...ALL_SESSION_PERMISSIONS];
  if (role !== 'supporter') return [];
  return sanitizePermissions([...(teacher ?? []), ...(session ?? [])]);
}

/** نقش درون جلسه: owner > supporter (هر ردیف پشتیبان) > member (عضو تأییدشده) > null */
export function roleOf(isOwner: boolean, isSupporter: boolean, memberStatus: 'pending' | 'approved' | 'rejected' | null | undefined): SessionRole | null {
  if (isOwner) return 'owner';
  if (isSupporter) return 'supporter';
  return memberStatus === 'approved' ? 'member' : null;
}

export const isStaff = (role: SessionRole | null): boolean => role === 'owner' || role === 'supporter';

// ───── ارزیابی با معیارهای پویا (docs-v2/31 §۳) ─────
export interface CriterionSnapshot {
  criterionId: string;
  key: string;
  title: string;
  weight: number;
  maxScore: number;
  score: number;
}

/** ۰..۱۰۰ = round(Σ(score/max × weight) / Σweight × ۱۰۰) */
export function computeScore(items: readonly Pick<CriterionSnapshot, 'weight' | 'maxScore' | 'score'>[]): number {
  let sw = 0;
  let acc = 0;
  for (const c of items) {
    if (c.weight <= 0 || c.maxScore <= 0) continue;
    sw += c.weight;
    acc += (Math.min(Math.max(c.score, 0), c.maxScore) / c.maxScore) * c.weight;
  }
  if (sw <= 0) return 0;
  return Math.round((acc / sw) * 100);
}
export const evalPoints = (score: number): number => Math.round(score / 10);

const NEXT: Record<SessionState, SessionState | null> = { draft: 'scheduled', scheduled: 'started', started: 'ended', ended: null };
/** فقط یک قدم رو به جلو */
export const canTransition = (from: SessionState, to: SessionState): boolean => NEXT[from] === to;

export const badgeKey = (threshold: number) => `badge_${threshold}`;
