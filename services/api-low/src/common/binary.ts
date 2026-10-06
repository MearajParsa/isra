/** پاسخ باینری (L-34): EnvelopeInterceptor آن را بدون envelope با هدرهای دقیق می‌فرستد */
export class BinaryResponse {
  constructor(
    readonly data: Buffer,
    readonly contentType: 'image/png' | 'image/webp' | 'image/jpeg',
    readonly cacheControl: string,
    /** ETag قوی (بدون کوتیشن) */
    readonly etag: string
  ) {}
}

/** تشخیص نوع تصویر از magic bytes؛ فقط png/webp/jpeg (SVG/HTML و هر چیز دیگر ⇒ null) */
export function sniffImage(b: Buffer): BinaryResponse['contentType'] | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
