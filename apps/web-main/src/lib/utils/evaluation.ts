/** محاسبات ارزیابی پویا (docs-v2/31 §۳)؛ همان فرمول سرور برای پیش‌نمایش */

export interface ScoredCriterion {
  weight: number;
  maxScore: number;
  score: number;
}

/** امتیاز ۰..۱۰۰ = round(Σ(score/max × weight) / Σweight × ۱۰۰) */
export function evaluationScore(items: readonly ScoredCriterion[]): number {
  const sumW = items.reduce((a, c) => a + c.weight, 0);
  if (sumW <= 0) return 0;
  const raw = items.reduce((a, c) => a + (c.maxScore > 0 ? (Math.min(Math.max(c.score, 0), c.maxScore) / c.maxScore) * c.weight : 0), 0);
  return Math.round((raw / sumW) * 100);
}

/** سهم درصدی وزن یک معیار از مجموع (برای برچسب «وزن ٪») */
export function weightShare(weight: number, all: readonly { weight: number }[]): number {
  const sum = all.reduce((a, c) => a + c.weight, 0);
  return sum > 0 ? Math.round((weight / sum) * 100) : 0;
}
