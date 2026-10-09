import { describe, expect, it } from 'vitest';
import { evaluationScore, weightShare } from './evaluation';

describe('evaluationScore (معیارهای پویا)', () => {
  it('فرمول سرور: Σ(score/max×weight)/Σweight×۱۰۰', () => {
    expect(evaluationScore([{ weight: 40, maxScore: 10, score: 10 }, { weight: 30, maxScore: 10, score: 0 }, { weight: 30, maxScore: 10, score: 0 }])).toBe(40);
    expect(evaluationScore([{ weight: 1, maxScore: 20, score: 10 }, { weight: 1, maxScore: 5, score: 5 }])).toBe(75);
  });
  it('بدون معیار ⇒ ۰؛ نمرهٔ بیرون از بازه محدود می‌شود', () => {
    expect(evaluationScore([])).toBe(0);
    expect(evaluationScore([{ weight: 10, maxScore: 10, score: 99 }])).toBe(100);
  });
  it('weightShare', () => {
    expect(weightShare(40, [{ weight: 40 }, { weight: 30 }, { weight: 30 }])).toBe(40);
    expect(weightShare(1, [{ weight: 1 }, { weight: 2 }])).toBe(33);
    expect(weightShare(1, [])).toBe(0);
  });
});
