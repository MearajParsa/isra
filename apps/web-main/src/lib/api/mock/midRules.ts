/** قواعد خالص mid (بدون وابستگی مرورگر) — قابل تست */
import type {
  EvaluationInput,
  EvaluationWeights,
  Permission,
  SessionInput,
  SessionRole,
  SessionState
} from '../mid-types';

export const DEFAULT_WEIGHTS: EvaluationWeights = { voice: 40, tone: 30, tajweed: 30 };

const PERMS: Record<SessionRole, Permission[]> = {
  session_manager: [
    'session.edit',
    'session.transition',
    'membership.roles',
    'membership.approve',
    'queue.manage',
    'attendance.view'
  ],
  session_supporter: ['membership.approve', 'queue.manage', 'eval.submit', 'attendance.view'],
  teacher: ['queue.manage', 'eval.submit', 'attendance.view'],
  quran_student: []
};

/** اجتماع مجوزهای نقش‌ها. manager به‌تنهایی eval.submit ندارد (قفل #15). */
export function permissionsFor(roles: SessionRole[]): Permission[] {
  return [...new Set(roles.flatMap((r) => PERMS[r]))];
}

export const isStaffRole = (r: SessionRole) => r !== 'quran_student';

/** ۰..۱۰۰ از سه معیار ۰..۱۰ با وزن‌ها */
export function computeScore(
  i: Pick<EvaluationInput, 'voice' | 'tone' | 'tajweed'>,
  w: EvaluationWeights = DEFAULT_WEIGHTS
): number {
  const sum = w.voice + w.tone + w.tajweed;
  return Math.round(((i.voice * w.voice + i.tone * w.tone + i.tajweed * w.tajweed) / sum) * 10);
}

export const evalPoints = (score: number) => Math.round(score / 10);

const NEXT: Record<SessionState, SessionState | null> = {
  draft: 'scheduled',
  scheduled: 'started',
  started: 'ended',
  ended: null
};
/** فقط یک قدم رو به جلو */
export const canTransition = (from: SessionState, to: SessionState) => NEXT[from] === to;

export function validateEvaluation(i: EvaluationInput): Record<string, string> {
  const e: Record<string, string> = {};
  for (const k of ['voice', 'tone', 'tajweed'] as const) {
    const v = i[k];
    if (!Number.isInteger(v) || v < 0 || v > 10) e[k] = 'عددی صحیح بین ۰ تا ۱۰ باشد.';
  }
  if (i.note && i.note.length > 300) e.note = 'یادداشت حداکثر ۳۰۰ نویسه باشد.';
  return e;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateSessionInput(i: SessionInput): Record<string, string> {
  const e: Record<string, string> = {};
  const title = i.title.trim();
  const desc = i.description.trim();
  const loc = i.location.label.trim();
  if (title.length < 3 || title.length > 80) e.title = 'عنوان بین ۳ تا ۸۰ نویسه باشد.';
  if (desc.length < 10 || desc.length > 500) e.description = 'توضیحات بین ۱۰ تا ۵۰۰ نویسه باشد.';
  if (loc.length < 2 || loc.length > 120) e.location = 'مکان بین ۲ تا ۱۲۰ نویسه باشد.';

  const s = i.schedule;
  const validDays = (d: number[]) => d.length > 0 && d.every((x) => Number.isInteger(x) && x >= 0 && x <= 6);
  if (s.type === 'once') {
    const a = Date.parse(s.startsAt);
    const b = Date.parse(s.endsAt);
    if (Number.isNaN(a)) e.startsAt = 'زمان شروع را وارد کنید.';
    if (Number.isNaN(b)) e.endsAt = 'زمان پایان را وارد کنید.';
    else if (!Number.isNaN(a) && b <= a) e.endsAt = 'پایان باید بعد از شروع باشد.';
  } else {
    if (!validDays(s.weekdays)) e.weekdays = 'دست‌کم یک روز هفته انتخاب کنید.';
    if (!HHMM.test(s.timeOfDay)) e.timeOfDay = 'ساعت شروع را وارد کنید.';
    if (!Number.isInteger(s.durationMin) || s.durationMin < 15 || s.durationMin > 360)
      e.durationMin = 'مدت بین ۱۵ تا ۳۶۰ دقیقه باشد.';
    if (s.type === 'range') {
      const a = Date.parse(s.rangeFrom);
      const b = Date.parse(s.rangeTo);
      if (Number.isNaN(a)) e.rangeFrom = 'شروع بازه را وارد کنید.';
      if (Number.isNaN(b)) e.rangeTo = 'پایان بازه را وارد کنید.';
      else if (!Number.isNaN(a) && b < a) e.rangeTo = 'پایان بازه قبل از شروع است.';
    }
  }
  return e;
}
