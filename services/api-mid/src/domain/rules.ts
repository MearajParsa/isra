import type { z } from 'zod';
import { mid } from '@isra/api-types';

export type SessionRole = z.infer<typeof mid.SessionRole>;
export type Permission = z.infer<typeof mid.Permission>;
export type SessionState = 'draft' | 'scheduled' | 'started' | 'ended';

export const DEFAULT_WEIGHTS = { voice: 40, tone: 30, tajweed: 30 } as const;
export const DEFAULT_THRESHOLDS = [50, 150, 300, 500] as const;
export const ATTENDANCE_POINTS = 5;

const PERMS: Record<SessionRole, Permission[]> = {
  session_manager: ['session.edit', 'session.transition', 'membership.roles', 'membership.approve', 'queue.manage', 'attendance.view'],
  session_supporter: ['membership.approve', 'queue.manage', 'eval.submit', 'attendance.view'],
  teacher: ['queue.manage', 'eval.submit', 'attendance.view'],
  quran_student: []
};

/** اجتماع مجوزهای نقش‌ها. manager به‌تنهایی eval.submit ندارد (قفل #15) */
export const permissionsFor = (roles: readonly SessionRole[]): Permission[] => [...new Set(roles.flatMap((r) => PERMS[r]))];
export const isStaffRole = (r: SessionRole): boolean => r !== 'quran_student';

export interface Weights {
  voice: number;
  tone: number;
  tajweed: number;
}

/** ۰..۱۰۰: میانگین وزنی سه معیار ۰..۱۰ (×۱۰) */
export function computeScore(i: { voice: number; tone: number; tajweed: number }, w: Weights = DEFAULT_WEIGHTS): number {
  const sum = w.voice + w.tone + w.tajweed;
  if (sum <= 0) return 0;
  return Math.round(((i.voice * w.voice + i.tone * w.tone + i.tajweed * w.tajweed) / sum) * 10);
}
export const evalPoints = (score: number): number => Math.round(score / 10);

const NEXT: Record<SessionState, SessionState | null> = { draft: 'scheduled', scheduled: 'started', started: 'ended', ended: null };
/** فقط یک قدم رو به جلو */
export const canTransition = (from: SessionState, to: SessionState): boolean => NEXT[from] === to;

export const badgeKey = (threshold: number) => `badge_${threshold}`;
