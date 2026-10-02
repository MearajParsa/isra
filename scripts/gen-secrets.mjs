#!/usr/bin/env node
/**
 * تولید secretهای production (فقط روی خروجی چاپ می‌شود؛ جایی ذخیره نمی‌شود):
 *   node scripts/gen-secrets.mjs > ~/isra-secrets.txt     (فایل را خارج از ریپو و امن نگه دارید)
 * هر مقدار را در env همان سرویس روی هاست (cPanel ← Setup Node.js App ← Environment variables) بگذارید.
 */
import { generateKeyPairSync, randomBytes } from 'node:crypto';

const hex = (n = 32) => randomBytes(n).toString('hex');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });

console.log(`# ===== مشترک بین هر سه سرویس (api-low/api-mid/api-high) — دقیقاً یک مقدار =====
INTERNAL_SHARED_SECRET=${hex(32)}

# ===== فقط api-low =====
OTP_PEPPER=${hex(32)}
PASSWORD_PEPPER=${hex(32)}
# کلید RS256 (یک خط؛ \\n به‌جای خط جدید). فقط در api-low؛ mid/high فقط JWKS عمومی را می‌خوانند.
JWT_PRIVATE_KEY_PEM=${privateKey.trim().replace(/\n/g, '\\n')}
JWT_KEY_ID=k1
`);
console.error('✓ تولید شد. این خروجی را در ریپو commit نکنید و در چت/ایمیل نفرستید.');
