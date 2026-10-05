/** تولید رمز موقت قوی (بدون نویسهٔ مبهم) و اعتبارسنجی طول مطابق قرارداد (۸ تا ۱۲۸) */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const SYMBOL = '@#%+=?';
const ALL = LOWER + UPPER + DIGIT;

export type RandomInt = (maxExclusive: number) => number;

/** عدد تصادفی بدون سوگیری با crypto.getRandomValues (rejection sampling) */
export const cryptoRandomInt: RandomInt = (max) => {
  if (max <= 0 || max > 0xffff) throw new RangeError('max');
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0]! >= limit);
  return buf[0]! % max;
};

/** حداقل یک حرف کوچک، بزرگ، رقم و نماد؛ ترتیب با Fisher–Yates مخلوط می‌شود */
export function generatePassword(length = 14, rnd: RandomInt = cryptoRandomInt): string {
  const len = Math.min(Math.max(length, 10), 64);
  const pick = (set: string) => set[rnd(set.length)]!;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)];
  while (chars.length < len) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

export function passwordError(p: string): string | null {
  if (p.length < PASSWORD_MIN) return `رمز عبور دست‌کم ${'۸'} نویسه باشد.`;
  if (p.length > PASSWORD_MAX) return `رمز عبور حداکثر ${'۱۲۸'} نویسه باشد.`;
  return null;
}
