import { describe, expect, it } from 'vitest';
import { canTransition, computeScore, evalPoints, permissionsFor, validateEvaluation, validateSessionInput } from './midRules';

describe('مجوزهای نقش‌های جلسه (قفل #14/#15)', () => {
  it('manager به‌تنهایی eval.submit ندارد', () => {
    expect(permissionsFor(['session_manager'])).not.toContain('eval.submit');
  });
  it('manager + teacher یا supporter ارزیابی دارد', () => {
    expect(permissionsFor(['session_manager', 'teacher'])).toContain('eval.submit');
    expect(permissionsFor(['session_manager', 'session_supporter'])).toContain('eval.submit');
  });
  it('supporter و teacher ارزیابی و مدیریت صف دارند', () => {
    for (const r of ['session_supporter', 'teacher'] as const) {
      const p = permissionsFor([r]);
      expect(p).toContain('eval.submit');
      expect(p).toContain('queue.manage');
    }
  });
  it('تأیید عضویت: manager و supporter، نه teacher', () => {
    expect(permissionsFor(['session_manager'])).toContain('membership.approve');
    expect(permissionsFor(['session_supporter'])).toContain('membership.approve');
    expect(permissionsFor(['teacher'])).not.toContain('membership.approve');
  });
  it('student هیچ مجوز کادر ندارد؛ تنظیمات فقط manager', () => {
    expect(permissionsFor(['quran_student'])).toEqual([]);
    expect(permissionsFor(['teacher'])).not.toContain('session.edit');
    expect(permissionsFor(['session_manager'])).toContain('session.edit');
  });
});

describe('چرخهٔ حیات جلسه (قفل #17)', () => {
  it('فقط یک قدم رو به جلو', () => {
    expect(canTransition('draft', 'scheduled')).toBe(true);
    expect(canTransition('scheduled', 'started')).toBe(true);
    expect(canTransition('started', 'ended')).toBe(true);
  });
  it.each([
    ['draft', 'started'],
    ['draft', 'ended'],
    ['scheduled', 'ended'],
    ['scheduled', 'draft'],
    ['started', 'scheduled'],
    ['ended', 'started'],
    ['ended', 'draft']
  ] as const)('%s → %s مجاز نیست', (a, b) => {
    expect(canTransition(a, b)).toBe(false);
  });
});

describe('ارزیابی', () => {
  it('وزن پیش‌فرض ۴۰/۳۰/۳۰', () => {
    expect(computeScore({ voice: 10, tone: 10, tajweed: 10 })).toBe(100);
    expect(computeScore({ voice: 10, tone: 0, tajweed: 0 })).toBe(40);
    expect(computeScore({ voice: 0, tone: 10, tajweed: 0 })).toBe(30);
    expect(computeScore({ voice: 8, tone: 7, tajweed: 9 })).toBe(80);
    expect(evalPoints(80)).toBe(8);
  });
  it('وزن سفارشی از high', () => {
    expect(computeScore({ voice: 10, tone: 0, tajweed: 0 }, { voice: 50, tone: 25, tajweed: 25 })).toBe(50);
  });
  it('اعتبارسنجی', () => {
    expect(validateEvaluation({ queueItemId: 'q', voice: 5, tone: 5, tajweed: 5 })).toEqual({});
    expect(Object.keys(validateEvaluation({ queueItemId: 'q', voice: 11, tone: -1, tajweed: 2.5 })).sort()).toEqual(['tajweed', 'tone', 'voice']);
  });
});

describe('اعتبارسنجی ورودی جلسه', () => {
  const ok = {
    title: 'جلسهٔ آزمایشی',
    description: 'توضیحات کافی برای این جلسه.',
    location: { label: 'آنلاین' },
    schedule: { type: 'recurring', weekdays: [0, 3], timeOfDay: '18:00', durationMin: 60 }
  } as const;
  it('معتبر', () => {
    expect(validateSessionInput(ok as never)).toEqual({});
  });
  it('خطاها', () => {
    const e = validateSessionInput({ ...ok, title: 'ab', description: 'کوتاه', location: { label: '' }, schedule: { type: 'recurring', weekdays: [], timeOfDay: '25:00', durationMin: 5 } } as never);
    expect(Object.keys(e).sort()).toEqual(['description', 'durationMin', 'location', 'timeOfDay', 'title', 'weekdays']);
  });
  it('once: پایان باید بعد از شروع باشد', () => {
    const e = validateSessionInput({ ...ok, schedule: { type: 'once', startsAt: '2026-10-10T10:00:00Z', endsAt: '2026-10-10T09:00:00Z' } } as never);
    expect(e.endsAt).toBeTruthy();
  });
});
