import { Transform, type TransformCallback } from 'node:stream';

export class MediaFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaFormatError';
  }
}

/** بخش‌های حاوی متادیتای حساس (EXIF/XMP مکان دوربین در APP1؛ IPTC/Photoshop در APP13) */
const DROP = new Set([0xe1, 0xed]);
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/**
 * حذف APP1 (EXIF/XMP) و APP13 از JPEG به‌صورت stream (docs-v2/31 §۴، حریم موقعیت) — بدون بافر کل فایل:
 * فقط سرآیندهای پیش از SOS (هر بخش حداکثر ۶۴KB) بافر می‌شوند؛ پس از SOS داده عیناً عبور می‌کند.
 * ابعاد تصویر از بخش SOF خوانده می‌شود. ساختار نامعتبر/ناقص ⇒ MediaFormatError.
 */
export class JpegStripper extends Transform {
  width: number | null = null;
  height: number | null = null;
  stripped = 0;
  private buf: Buffer = Buffer.alloc(0);
  private state: 'soi' | 'marker' | 'scan' = 'soi';

  override _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback): void {
    if (this.state === 'scan') return cb(null, chunk);
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    try {
      this.pump();
    } catch (e) {
      return cb(e as Error);
    }
    cb();
  }

  override _flush(cb: TransformCallback): void {
    if (this.state !== 'scan') return cb(new MediaFormatError('JPEG ناقص است.'));
    cb();
  }

  private pump(): void {
    for (;;) {
      if (this.state === 'scan') {
        if (this.buf.length) this.push(this.buf);
        this.buf = Buffer.alloc(0);
        return;
      }
      if (this.state === 'soi') {
        if (this.buf.length < 2) return;
        if (this.buf[0] !== 0xff || this.buf[1] !== 0xd8) throw new MediaFormatError('سرآیند JPEG نامعتبر است.');
        this.push(this.buf.subarray(0, 2));
        this.buf = this.buf.subarray(2);
        this.state = 'marker';
        continue;
      }
      if (this.buf.length < 2) return;
      if (this.buf[0] !== 0xff) throw new MediaFormatError('ساختار JPEG نامعتبر است.');
      const marker = this.buf[1]!;
      if (marker === 0xff) {
        // بایت پرکننده
        this.buf = this.buf.subarray(1);
        continue;
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        this.push(this.buf.subarray(0, 2));
        this.buf = this.buf.subarray(2);
        continue;
      }
      if (marker === 0xd8 || marker === 0xd9) throw new MediaFormatError('ساختار JPEG نامعتبر است.');
      if (this.buf.length < 4) return;
      const len = this.buf.readUInt16BE(2);
      if (len < 2) throw new MediaFormatError('طول بخش JPEG نامعتبر است.');
      if (this.buf.length < 2 + len) return;
      const seg = this.buf.subarray(0, 2 + len);
      this.buf = this.buf.subarray(2 + len);
      if (SOF.has(marker) && len >= 7) {
        this.height = seg.readUInt16BE(5) || null;
        this.width = seg.readUInt16BE(7) || null;
      }
      if (DROP.has(marker)) {
        this.stripped++;
        continue;
      }
      this.push(seg);
      if (marker === 0xda) this.state = 'scan';
    }
  }
}
