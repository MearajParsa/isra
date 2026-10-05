import { describe, expect, it } from 'vitest';
import { generatePassword, passwordError } from './password';

describe('password', () => {
  it('طول و ترکیب نویسه‌ها', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(14);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[2-9]/);
      expect(p).toMatch(/[@#%+=?]/);
      expect(p).not.toMatch(/[0O1lIi]/);
    }
  });
  it('طول در بازهٔ مجاز می‌ماند', () => {
    expect(generatePassword(3)).toHaveLength(10);
    expect(generatePassword(500)).toHaveLength(64);
  });
  it('تصادفی‌ساز تزریقی (قطعی)', () => {
    let n = 0;
    const rnd = (m: number) => n++ % m;
    expect(generatePassword(12, rnd)).toBe(generatePassword(12, ((): ((m: number) => number) => { let k = 0; return (m) => k++ % m; })()));
  });
  it('اعتبارسنجی طول', () => {
    expect(passwordError('short')).not.toBeNull();
    expect(passwordError('12345678')).toBeNull();
    expect(passwordError('x'.repeat(129))).not.toBeNull();
  });
});
