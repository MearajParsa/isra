// تولید آیکون‌های PWA (PNG) بدون وابستگی خارجی. اجرا: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const PRIMARY = [0x1c, 0x0e, 0x44];
const WARM = [0xfd, 0xbf, 0x8a];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixels) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    pixels.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ستارهٔ هشت‌پر (اتحاد دو مربع) + حلقهٔ داخلی؛ مختصات نسبی به اندازه
function inStar(x, y, r) {
  const a = r / Math.SQRT2;
  if (Math.abs(x) <= a && Math.abs(y) <= a) return true;
  const u = (x + y) / Math.SQRT2;
  const v = (x - y) / Math.SQRT2;
  return Math.abs(u) <= a && Math.abs(v) <= a;
}

function render(size, radiusRatio) {
  const r = size * radiusRatio;
  const px = Buffer.alloc(size * size * 3);
  const ss = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const fx = x + (sx + 0.5) / ss - size / 2;
          const fy = y + (sy + 0.5) / ss - size / 2;
          const d = Math.hypot(fx, fy);
          let on = inStar(fx, fy, r);
          if (d < r * 0.38) on = d < r * 0.14;
          acc += on ? 1 : 0;
        }
      const t = acc / (ss * ss);
      for (let c = 0; c < 3; c++)
        px[(y * size + x) * 3 + c] = Math.round(PRIMARY[c] * (1 - t) + WARM[c] * t);
    }
  }
  return png(size, px);
}

writeFileSync('static/icons/icon-192.png', render(192, 0.36));
writeFileSync('static/icons/icon-512.png', render(512, 0.36));
writeFileSync('static/icons/maskable-512.png', render(512, 0.3));
writeFileSync('static/icons/apple-touch-icon.png', render(180, 0.34));
console.log('icons generated');
