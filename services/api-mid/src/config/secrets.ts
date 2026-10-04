/**
 * secret ضعیف/نمونه: مقدار نمونهٔ `.env.example`، الگوهای پیش‌فرض یا بی‌آنتروپی.
 * در production چنین مقداری رد می‌شود (fail-fast) تا secret توسعه روی هاست نماند.
 */
const WEAK = /^(?:dev|test|example|change|secret|password|isra[-_]?dev)|dev-(?:internal|otp|pair)|change-?me|(.)\1{7,}/i;

export function isWeakSecret(s: string): boolean {
  return WEAK.test(s) || new Set(s).size < 12;
}
