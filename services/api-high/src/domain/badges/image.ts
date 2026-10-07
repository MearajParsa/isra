import { createHash } from 'node:crypto';
import { AppError } from '../../common/app-error';

export type BadgeImageType = 'image/png' | 'image/webp' | 'image/jpeg';
export const MAX_IMAGE_BYTES = 200 * 1024;
export const MAX_IMAGE_DIM = 1024;

export interface ValidImage {
  bytes: Buffer;
  type: BadgeImageType;
  width: number;
  height: number;
  hash: string;
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** نوع واقعی از magic bytes (SVG/GIF/… ⇒ null) */
export function sniffType(b: Buffer): BadgeImageType | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(PNG_SIG)) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function pngDims(b: Buffer): [number, number] | null {
  if (b.length < 24 || b.toString('latin1', 12, 16) !== 'IHDR') return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

/** پیمایش segmentهای JPEG تا SOFn (به‌جز DHT/JPG/DAC) */
function jpegDims(b: Buffer): [number, number] | null {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    let marker = b[i + 1]!;
    while (marker === 0xff && i + 2 < b.length) marker = b[++i + 1]!; // padding
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // پایان/شروع داده بدون SOF
    if (i + 4 > b.length) return null;
    const len = b.readUInt16BE(i + 2);
    if (len < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 9 > b.length) return null;
      return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    }
    i += 2 + len;
  }
  return null;
}

function webpDims(b: Buffer): [number, number] | null {
  if (b.length < 30) return null;
  const chunk = b.toString('latin1', 12, 16);
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const b1 = b[21]!;
    const b2 = b[22]!;
    const b3 = b[23]!;
    const b4 = b[24]!;
    return [1 + (b1 | ((b2 & 0x3f) << 8)), 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10))];
  }
  if (chunk === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  return null;
}

export function imageDims(b: Buffer, type: BadgeImageType): [number, number] | null {
  return type === 'image/png' ? pngDims(b) : type === 'image/jpeg' ? jpegDims(b) : webpDims(b);
}

const tooBig = () => new AppError('PAYLOAD_TOO_LARGE', { message: 'حجم تصویر حداکثر ۲۰۰ کیلوبایت است.' });
const badType = (msg: string) => new AppError('UNSUPPORTED_MEDIA_TYPE', { message: msg });

/**
 * اعتبارسنجی تصویر نشان (TS خالص، بدون وابستگی): base64 ⇒ بایت ≤ ۲۰۰KB؛ نوع واقعی با magic bytes باید با نوع اعلامی بخواند
 * (SVG/GIF/جعلی ⇒ UNSUPPORTED_MEDIA_TYPE)؛ ابعاد از هدر (PNG IHDR / JPEG SOF / WebP VP8|VP8L|VP8X) ≤ ۱۰۲۴؛ hash = sha256 hex.
 */
export function validateBadgeImage(declared: BadgeImageType, dataBase64: string): ValidImage {
  // سقف پیش از decode: هر ۴ نویسه ۳ بایت
  if (Math.floor((dataBase64.length * 3) / 4) - (dataBase64.endsWith('==') ? 2 : dataBase64.endsWith('=') ? 1 : 0) > MAX_IMAGE_BYTES) throw tooBig();
  const bytes = Buffer.from(dataBase64, 'base64');
  if (bytes.length === 0) throw badType('تصویر خالی یا نامعتبر است.');
  if (bytes.length > MAX_IMAGE_BYTES) throw tooBig();
  const real = sniffType(bytes);
  if (!real) throw badType('فقط تصویر PNG، WebP یا JPEG پذیرفته می‌شود.');
  if (real !== declared) throw badType('نوع اعلام‌شده با محتوای تصویر نمی‌خواند.');
  const dims = imageDims(bytes, real);
  if (!dims || dims[0] < 1 || dims[1] < 1) throw badType('سرآیند تصویر خراب است.');
  if (dims[0] > MAX_IMAGE_DIM || dims[1] > MAX_IMAGE_DIM) throw new AppError('VALIDATION_FAILED', { details: { fields: { dataBase64: `ابعاد تصویر حداکثر ${MAX_IMAGE_DIM}×${MAX_IMAGE_DIM} پیکسل است.` } } });
  return { bytes, type: real, width: dims[0], height: dims[1], hash: createHash('sha256').update(bytes).digest('hex') };
}
