/** نوع واقعی فایل از magic bytes (docs-v2/31 §۴) — حداقل ۱۲ بایت اول */
export const SNIFF_BYTES = 12;

export type SniffedMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'audio/mpeg' | 'audio/mp4' | 'audio/ogg' | 'audio/webm' | 'audio/aac';

const eq = (b: Buffer, off: number, s: string) => b.length >= off + s.length && b.toString('latin1', off, off + s.length) === s;

export function sniffMime(b: Buffer): SniffedMime | null {
  if (b.length < 4) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (eq(b, 0, 'RIFF') && eq(b, 8, 'WEBP')) return 'image/webp';
  if (eq(b, 0, 'OggS')) return 'audio/ogg';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'audio/webm';
  if (eq(b, 4, 'ftyp')) return 'audio/mp4';
  if (eq(b, 0, 'ID3')) return 'audio/mpeg';
  if (eq(b, 0, 'ADIF')) return 'audio/aac';
  if (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0) {
    const layer = (b[1]! >> 1) & 0x03;
    // ADTS (AAC): sync 12 بیتی + layer=00؛ MPEG audio: layer ≠ 00
    if (layer === 0 && (b[1]! & 0xf0) === 0xf0) return 'audio/aac';
    if (layer !== 0) return 'audio/mpeg';
  }
  return null;
}

/** ابعاد تصویر PNG/WebP از سرآیند (JPEG از JpegStripper) */
export function imageSize(mime: string, head: Buffer): { width: number; height: number } | null {
  if (mime === 'image/png' && head.length >= 24 && eq(head, 12, 'IHDR')) return nz(head.readUInt32BE(16), head.readUInt32BE(20));
  if (mime === 'image/webp' && head.length >= 30) {
    if (eq(head, 12, 'VP8X')) return nz(1 + head.readUIntLE(24, 3), 1 + head.readUIntLE(27, 3));
    if (eq(head, 12, 'VP8 ') && head[23] === 0x9d && head[24] === 0x01 && head[25] === 0x2a) return nz(head.readUInt16LE(26) & 0x3fff, head.readUInt16LE(28) & 0x3fff);
    if (eq(head, 12, 'VP8L') && head[20] === 0x2f) {
      const bits = head.readUInt32LE(21);
      return nz((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
    }
  }
  return null;
}
const nz = (w: number, h: number) => (w > 0 && h > 0 && w < 1_000_000 && h < 1_000_000 ? { width: w, height: h } : null);
