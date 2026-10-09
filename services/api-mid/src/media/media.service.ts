import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { type Readable, Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { uuidv7 } from '../common/ids';
import { ENV, type Env } from '../config/env';
import { JpegStripper, MediaFormatError } from './jpeg-strip';
import { signMediaPath, verifyMediaSignature } from './signed-url';
import { SNIFF_BYTES, imageSize, sniffMime } from './sniff';

const TMP = '.tmp';
const KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}){2}$/;
const HEAD_BYTES = 64;

class TooLarge extends Error {}

export interface Received {
  tmpPath: string;
  bytes: number;
  sha256: string;
  mime: string;
  width: number | null;
  height: number | null;
}

export interface StoredFile {
  mime: string;
  bytes: number;
  sha256: string;
  storageKey: string;
}

/** شمارش ورودی + سقف حجم + تطبیق magic bytes با Content-Type اعلام‌شده (بدون بافر کل فایل) */
class InputGuard extends Transform {
  total = 0;
  private head: Buffer = Buffer.alloc(0);
  private checked = false;
  constructor(
    private readonly max: number,
    private readonly declared: string
  ) {
    super();
  }
  override _transform(chunk: Buffer, _e: BufferEncoding, cb: TransformCallback): void {
    this.total += chunk.length;
    if (this.total > this.max) return cb(new TooLarge());
    if (!this.checked) {
      this.head = Buffer.concat([this.head, chunk]);
      if (this.head.length < SNIFF_BYTES) return cb();
      const err = this.check();
      if (err) return cb(err);
      const h = this.head;
      this.head = Buffer.alloc(0);
      return cb(null, h);
    }
    cb(null, chunk);
  }
  override _flush(cb: TransformCallback): void {
    if (!this.checked) {
      const err = this.check();
      if (err) return cb(err);
      if (this.head.length) this.push(this.head);
    }
    cb();
  }
  private check(): Error | null {
    this.checked = true;
    if (!this.head.length) return new MediaFormatError('فایل خالی است.');
    return sniffMime(this.head) === this.declared ? null : new MediaFormatError('نوع واقعی فایل با Content-Type همخوان نیست.');
  }
}

/** sha256 و حجم بایت‌های **ذخیره‌شده** (پس از حذف EXIF) + سرآیند برای ابعاد */
class Hasher extends Transform {
  readonly hash = createHash('sha256');
  bytes = 0;
  head: Buffer = Buffer.alloc(0);
  override _transform(chunk: Buffer, _e: BufferEncoding, cb: TransformCallback): void {
    this.hash.update(chunk);
    this.bytes += chunk.length;
    if (this.head.length < HEAD_BYTES) this.head = Buffer.concat([this.head, chunk.subarray(0, HEAD_BYTES - this.head.length)]);
    cb(null, chunk);
  }
}

/**
 * ذخیره و سرو رسانه روی دیسک همان هاست (قفل #16، docs-v2/31 §۴): `MEDIA_DIR/{sessionId}/{galleryId}/{itemId}` بیرون از پوشهٔ اپ.
 * بارگذاری: stream ⇒ فایل موقت (`MEDIA_DIR/.tmp`) ⇒ rename اتمیک. نبود MEDIA_DIR ⇒ SERVICE_UNAVAILABLE (و هشدار در boot).
 * نشانی امضاشده: HMAC-SHA256 با `MEDIA_URL_SECRET` (توسعه: کلید تصادفی per فرایند).
 */
@Injectable()
export class MediaService implements OnModuleInit {
  private readonly log = new Logger('Media');
  readonly dir: string | null;
  readonly quotaBytes: number;
  private readonly secret: Buffer;
  private readonly ephemeralSecret: boolean;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly clock: Clock
  ) {
    this.dir = env.MEDIA_DIR ? resolve(env.MEDIA_DIR) : null;
    this.quotaBytes = env.MEDIA_SESSION_QUOTA_MB * 1024 * 1024;
    this.ephemeralSecret = !env.MEDIA_URL_SECRET;
    // production بدون کلید در loadEnv رد می‌شود (fail-fast)؛ توسعه/تست ⇒ کلید تصادفی per فرایند
    this.secret = env.MEDIA_URL_SECRET ? Buffer.from(env.MEDIA_URL_SECRET, 'utf8') : randomBytes(32);
  }

  onModuleInit(): void {
    if (!this.dir) {
      if (this.env.NODE_ENV === 'production') this.log.warn('MEDIA_DIR تنظیم نشده است: بارگذاری و سرو فایل گالری 503 برمی‌گرداند.');
    } else {
      const rel = relative(process.cwd(), this.dir);
      if (!rel || (!rel.startsWith('..') && !rel.startsWith(sep))) this.log.warn('MEDIA_DIR داخل پوشهٔ اپ است؛ با استقرار/پاک‌سازی اپ از بین می‌رود (قفل #16).');
    }
    if (this.ephemeralSecret && this.env.NODE_ENV !== 'test') this.log.warn('MEDIA_URL_SECRET تنظیم نشده؛ کلید تصادفی موقت (فقط توسعه) — نشانی‌های امضاشده با restart باطل می‌شوند.');
  }

  get available(): boolean {
    return this.dir !== null;
  }

  requireDir(): string {
    if (!this.dir) throw new AppError('SERVICE_UNAVAILABLE', { message: 'ذخیره‌سازی رسانه پیکربندی نشده است.', details: { reason: 'MEDIA_DIR' } });
    return this.dir;
  }

  // ───── نشانی امضاشده ─────
  sign(path: string, userId: string): string {
    return signMediaPath(this.secret, path, userId, Math.floor(this.clock.now().getTime() / 1000));
  }

  verify(method: string, path: string, q: { exp?: unknown; u?: unknown; sig?: unknown }): string | null {
    return verifyMediaSignature(this.secret, method, path, q, Math.floor(this.clock.now().getTime() / 1000));
  }

  // ───── ذخیره ─────
  private pathOf(storageKey: string): string {
    if (!KEY_RE.test(storageKey)) throw new AppError('NOT_FOUND');
    // دفاع لایهٔ دوم: مسیر نهایی باید درون MEDIA_DIR بماند (path traversal)
    const root = resolve(this.requireDir());
    const full = resolve(root, ...storageKey.split('/'));
    if (!full.startsWith(root + sep)) throw new AppError('NOT_FOUND');
    return full;
  }

  /**
   * دریافت stream به فایل موقت: سقف حجم ورودی، magic bytes == Content-Type، JPEG بدون APP1/APP13، sha256 بایت‌های ذخیره‌شده.
   * خطا ⇒ حذف فایل موقت و AppError (PAYLOAD_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE / VALIDATION_FAILED).
   */
  async receive(src: Readable, declaredMime: string, maxBytes: number): Promise<Received> {
    const dir = join(this.requireDir(), TMP);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const tmpPath = join(dir, `${uuidv7()}.part`);
    const guard = new InputGuard(maxBytes, declaredMime);
    const strip = declaredMime === 'image/jpeg' ? new JpegStripper() : null;
    const hasher = new Hasher();
    try {
      const out = createWriteStream(tmpPath, { flags: 'wx', mode: 0o600 });
      const done = strip ? pipeline(guard, strip, hasher, out) : pipeline(guard, hasher, out);
      // src (درخواست HTTP) داخل pipeline نیست تا خطای فایل socket را نابود نکند و پاسخ خطا برسد؛ قطع کلاینت ⇒ خطای صریح
      const onClose = () => {
        if (!src.readableEnded) guard.destroy(Object.assign(new Error('aborted'), { code: 'ECONNRESET' }));
      };
      src.once('close', onClose);
      src.once('error', onClose);
      src.pipe(guard);
      try {
        await done;
      } finally {
        src.off('close', onClose);
        src.off('error', onClose);
        src.unpipe(guard);
      }
    } catch (e) {
      await unlink(tmpPath).catch(() => undefined);
      if (e instanceof TooLarge) throw new AppError('PAYLOAD_TOO_LARGE');
      if (e instanceof MediaFormatError) throw new AppError('UNSUPPORTED_MEDIA_TYPE', { message: e.message });
      if ((e as NodeJS.ErrnoException)?.code === 'ERR_STREAM_PREMATURE_CLOSE' || (e as NodeJS.ErrnoException)?.code === 'ECONNRESET') throw new AppError('VALIDATION_FAILED', { message: 'بارگذاری ناقص ماند.' });
      this.log.error({ err: e instanceof Error ? e.message : 'unknown' }, 'media receive failed');
      throw new AppError('SERVICE_UNAVAILABLE');
    }
    if (hasher.bytes <= 0) {
      await unlink(tmpPath).catch(() => undefined);
      throw new AppError('VALIDATION_FAILED', { message: 'فایل خالی است.' });
    }
    const dims = strip ? (strip.width && strip.height ? { width: strip.width, height: strip.height } : null) : imageSize(declaredMime, hasher.head);
    return { tmpPath, bytes: hasher.bytes, sha256: hasher.hash.digest('hex'), mime: declaredMime, width: dims?.width ?? null, height: dims?.height ?? null };
  }

  /** rename اتمیک فایل موقت به مسیر نهایی (همان فایل‌سیستم) */
  async commit(tmpPath: string, storageKey: string): Promise<void> {
    const final = this.pathOf(storageKey);
    await mkdir(dirname(final), { recursive: true, mode: 0o700 });
    await rename(tmpPath, final);
  }

  async discard(path: string): Promise<void> {
    await unlink(path).catch(() => undefined);
  }

  /** حذف فایل نهایی (پاک‌سازی حذف نرم)؛ نبود ⇒ بی‌اثر */
  async remove(storageKey: string): Promise<void> {
    if (!this.dir) return;
    await unlink(this.pathOf(storageKey)).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT') throw e;
    });
  }

  /** فایل‌های موقت رهاشده (crash میانهٔ بارگذاری) */
  async cleanupTemp(olderThanMs: number): Promise<number> {
    if (!this.dir) return 0;
    const dir = join(this.dir, TMP);
    let n = 0;
    const names = await readdir(dir).catch(() => [] as string[]);
    const limit = this.clock.now().getTime() - olderThanMs;
    for (const name of names) {
      if (!name.endsWith('.part')) continue;
      const p = join(dir, name);
      const st = await stat(p).catch(() => null);
      if (st && st.mtimeMs < limit) {
        await unlink(p).catch(() => undefined);
        n++;
      }
    }
    return n;
  }

  /**
   * سرو فایل: ETag = sha256 (If-None-Match ⇒ 304)، Range تکی ⇒ 206 (نامعتبر ⇒ 416)، nosniff، inline، no-referrer.
   */
  async serve(req: Request, res: Response, f: StoredFile, cacheControl: string): Promise<void> {
    const path = this.pathOf(f.storageKey);
    const st = await stat(path).catch(() => null);
    if (!st || !st.isFile()) throw new AppError('NOT_FOUND', { message: 'فایل پیدا نشد.' });
    const size = st.size;
    const etag = `"${f.sha256}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const inm = req.header('if-none-match');
    if (inm && inm.split(',').some((t) => t.trim().replace(/^W\//, '') === etag || t.trim() === '*')) {
      res.status(304).end();
      return;
    }
    const range = parseRange(req.header('range'), size);
    if (range === 'invalid') {
      res.setHeader('Content-Range', `bytes */${size}`);
      res.status(416).end();
      return;
    }
    res.setHeader('Content-Type', f.mime);
    let start = 0;
    let end = size - 1;
    if (range) {
      [start, end] = range;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    } else res.status(200);
    res.setHeader('Content-Length', String(size === 0 ? 0 : end - start + 1));
    if (size === 0) {
      res.end();
      return;
    }
    try {
      await pipeline(createReadStream(path, { start, end }), res);
    } catch (e) {
      // قطع اتصال کلاینت (رایج در صوت/seek) خطا نیست
      if ((e as NodeJS.ErrnoException)?.code !== 'ERR_STREAM_PREMATURE_CLOSE') this.log.warn({ err: e instanceof Error ? e.message : 'unknown' }, 'media serve failed');
      if (!res.writableEnded) res.destroy();
    }
  }
}

/** `bytes=a-b` | `bytes=a-` | `bytes=-n` (تکی). نبود/چندبازه ⇒ null (کل فایل)؛ خارج از محدوده ⇒ invalid */
export function parseRange(h: string | undefined, size: number): [number, number] | null | 'invalid' {
  if (!h) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim());
  if (!m) return null;
  const [, a, b] = m;
  if (a === '' && b === '') return null;
  let start: number;
  let end: number;
  if (a === '') {
    const n = Number(b);
    if (n <= 0) return 'invalid';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(a);
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return 'invalid';
  return [start, end];
}
