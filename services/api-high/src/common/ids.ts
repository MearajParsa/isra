import { randomBytes } from 'node:crypto';
import type { ValueTransformer } from 'typeorm';

/** UUID نسخهٔ ۷ (زمان‌مرتب ⇒ locality ایندکس InnoDB) */
export function uuidv7(now = Date.now()): string {
  const b = randomBytes(16);
  b.writeUIntBE(now, 0, 6); // ۴۸ بیت میلی‌ثانیه
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const uuidToBuf = (id: string): Buffer => Buffer.from(id.replace(/-/g, ''), 'hex');
export const bufToUuid = (b: Buffer): string => {
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/** BINARY(16) در DB، رشتهٔ UUID در کد (docs-v2/23) */
export const uuidBinary: ValueTransformer = {
  to: (v?: string | null) => (typeof v === 'string' ? uuidToBuf(v) : v),
  from: (b?: Buffer | null) => (b ? bufToUuid(b) : b)
};
