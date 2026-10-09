import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { mid } from '@isra/api-types';
import { loadEnv } from '../src/config/env';
import { DEFAULT_CRITERIA } from '../src/domain/catalog.service';
import { canSeeComment } from '../src/domain/comments.service';
import { buildSnapshot, patchSnapshot } from '../src/domain/evaluations.service';
import { visibleLevels } from '../src/domain/galleries.service';
import { LEGACY_CRITERIA, legacyCriterionId } from '../src/domain/refs';
import { ALL_SESSION_PERMISSIONS, computeScore, effectivePermissions, evalPoints, parsePermissions, roleOf, sanitizePermissions } from '../src/domain/rules';
import { LEGACY_ROLE_PERMISSIONS } from '../src/db/migrations/1728700000000-TeacherContentV17';
import { JpegStripper } from '../src/media/jpeg-strip';
import { parseRange } from '../src/media/media.service';
import { mediaSignature, signMediaPath, verifyMediaSignature } from '../src/media/signed-url';
import { imageSize, sniffMime } from '../src/media/sniff';
/** مقدار تصادفی در زمان اجرا (هیچ secret واقعی یا ثابت در مخزن نیست؛ gitleaks) */
const rnd = (): string => randomBytes(24).toString('base64url');
const S1 = rnd(), S2 = rnd(), S3 = rnd();

describe('نقش و مجوز مؤثر درون‌جلسه (۱.۷.۰)', () => {
  it('صاحب همه‌کاره؛ عضو و غریبه هیچ', () => {
    expect(effectivePermissions('owner', null, null)).toEqual([...ALL_SESSION_PERMISSIONS]);
    expect(effectivePermissions('member', ['eval.submit'], ['queue.manage'])).toEqual([]);
    expect(effectivePermissions(null, null, null)).toEqual([]);
    expect(ALL_SESSION_PERMISSIONS).toEqual(mid.SESSION_DELEGABLE_PERMISSIONS.map((p) => p.key));
  });
  it('پشتیبان = اجتماع ثابت (استاد) و per جلسه', () => {
    expect(effectivePermissions('supporter', ['queue.manage'], ['eval.submit', 'queue.manage']).sort()).toEqual(['eval.submit', 'queue.manage']);
    expect(effectivePermissions('supporter', null, ['gallery.manage'])).toEqual(['gallery.manage']);
    expect(effectivePermissions('supporter', ['comment.moderate'], null)).toEqual(['comment.moderate']);
  });
  it('ضد ارتقا: کلید خارج از کاتالوگ (مثلاً system.*) دور ریخته می‌شود', () => {
    expect(sanitizePermissions(['system.sessions.manage', 'eval.submit', 'eval.submit', 42])).toEqual(['eval.submit']);
    expect(parsePermissions('["membership.roles","queue.manage"]')).toEqual(['queue.manage']);
    expect(parsePermissions('not json')).toEqual([]);
    expect(effectivePermissions('supporter', ['session.create' as never], null)).toEqual([]);
  });
  it('نقش: owner > supporter > member(approved) > null', () => {
    expect(roleOf(true, true, 'approved')).toBe('owner');
    expect(roleOf(false, true, 'approved')).toBe('supporter');
    expect(roleOf(false, false, 'approved')).toBe('member');
    expect(roleOf(false, false, 'pending')).toBeNull();
  });
  it('نگاشت مهاجرت: معلم ⇒ eval.submit، پشتیبان قبلی ⇒ membership.approve، هم‌مدیر ⇒ همه', () => {
    expect(LEGACY_ROLE_PERMISSIONS.teacher).toContain('eval.submit');
    expect(LEGACY_ROLE_PERMISSIONS.teacher).not.toContain('membership.approve');
    expect(LEGACY_ROLE_PERMISSIONS.session_supporter).toEqual(expect.arrayContaining(['membership.approve', 'eval.submit', 'queue.manage']));
    expect(LEGACY_ROLE_PERMISSIONS.session_manager).toEqual(ALL_SESSION_PERMISSIONS);
  });
});

describe('ارزیابی با معیارهای پویا', () => {
  const active = DEFAULT_CRITERIA;
  const ids = active.map((c) => c.id);
  it('seed پیش‌فرض: صوت ۴۰ / لحن ۳۰ / تجوید ۳۰ با شناسهٔ قطعی', () => {
    expect(active.map((c) => [c.key, c.weight, c.maxScore])).toEqual([
      ['voice', 40, 10],
      ['tone', 30, 10],
      ['tajweed', 30, 10]
    ]);
    expect(active.map((c) => c.id)).toEqual(['00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000002', '00000000-0000-7000-8000-000000000003']);
    expect(legacyCriterionId('voice')).toBe(active[0]!.id);
    expect(LEGACY_CRITERIA).toHaveLength(3);
  });
  it('امتیاز = round(Σ(score/max×w)/Σw×100)', () => {
    const snap = buildSnapshot(active, [
      { criterionId: ids[0]!, score: 8 },
      { criterionId: ids[1]!, score: 6 },
      { criterionId: ids[2]!, score: 7 }
    ]);
    expect(computeScore(snap)).toBe(4 * 8 + 3 * 6 + 3 * 7);
    expect(evalPoints(computeScore(snap))).toBe(7);
    expect(computeScore([{ weight: 1, maxScore: 5, score: 5 }, { weight: 3, maxScore: 20, score: 0 }])).toBe(25);
  });
  it('کم/زیاد/ناشناخته/بیش از سقف ⇒ VALIDATION_FAILED با fields.scores', () => {
    const err = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        return (e as { code: string; details: { fields: Record<string, string> } }).code + ':' + Object.keys((e as { details: { fields: object } }).details.fields).join();
      }
      return 'ok';
    };
    expect(err(() => buildSnapshot(active, [{ criterionId: ids[0]!, score: 8 }]))).toBe('VALIDATION_FAILED:scores');
    expect(err(() => buildSnapshot(active, [...ids.map((id) => ({ criterionId: id, score: 1 })), { criterionId: 'x', score: 1 }]))).toBe('VALIDATION_FAILED:scores');
    expect(err(() => buildSnapshot(active, ids.map((id) => ({ criterionId: id, score: 11 }))))).toBe('VALIDATION_FAILED:scores');
    expect(err(() => buildSnapshot(active.slice(0, 2), ids.map((id) => ({ criterionId: id, score: 1 }))))).toBe('VALIDATION_FAILED:scores');
  });
  it('snapshot: تغییر بعدی معیار روی ارزیابی ثبت‌شده اثر ندارد؛ patch فقط معیارهای snapshot', () => {
    const snap = buildSnapshot(active, ids.map((id) => ({ criterionId: id, score: 10 })));
    const changed = active.map((c) => ({ ...c, weight: 1, maxScore: 100 }));
    void changed;
    const p = patchSnapshot(snap, [{ criterionId: ids[0]!, score: 0 }]);
    expect(p[0]!.weight).toBe(40);
    expect(computeScore(p)).toBe(60);
    expect(() => patchSnapshot(snap, [{ criterionId: 'other', score: 1 }])).toThrow();
    expect(() => patchSnapshot(snap, [{ criterionId: ids[1]!, score: 11 }])).toThrow();
  });
});

describe('گالری و کامنت — قاعدهٔ دیدن', () => {
  it('سطح نمایش', () => {
    expect(visibleLevels('owner', false)).toEqual(['public', 'members', 'staff']);
    expect(visibleLevels('supporter', false)).toEqual(['public', 'members', 'staff']);
    expect(visibleLevels('admin', false)).toHaveLength(3);
    expect(visibleLevels('member', false)).toEqual(['public', 'members']);
    expect(visibleLevels(null, true)).toEqual(['public']);
    expect(visibleLevels(null, false)).toEqual([]);
  });
  it('کامنت: public ⇒ همه؛ reciter_only ⇒ تلاوت فقط نویسنده/خواننده/کادر؛ پنهان فقط کادر', () => {
    const rec = { hidden: false, queueItemId: 'q', authorId: 'a', reciterId: 'r' };
    const gen = { hidden: false, queueItemId: null, authorId: 'a', reciterId: null };
    const v = (userId: string, role: 'owner' | 'supporter' | 'member' | null) => ({ userId, role });
    expect(canSeeComment(rec, v('x', null), 'public')).toBe(true);
    expect(canSeeComment(rec, v('x', 'member'), 'reciter_only')).toBe(false);
    expect(canSeeComment(rec, v('a', 'member'), 'reciter_only')).toBe(true);
    expect(canSeeComment(rec, v('r', 'member'), 'reciter_only')).toBe(true);
    expect(canSeeComment(rec, v('s', 'supporter'), 'reciter_only')).toBe(true);
    expect(canSeeComment(gen, v('x', 'member'), 'reciter_only')).toBe(true);
    expect(canSeeComment(gen, v('x', null), 'reciter_only')).toBe(false);
    expect(canSeeComment({ ...gen, hidden: true }, v('a', 'member'), 'public')).toBe(false);
    expect(canSeeComment({ ...gen, hidden: true }, v('o', 'owner'), 'public')).toBe(true);
  });
});

describe('نشانی امضاشدهٔ رسانه', () => {
  const key = randomBytes(32);
  const path = '/o/v1/sessions/s/galleries/g/items/i/content';
  const u = '0190a8e2-1111-7000-8000-000000000001';
  const now = 1_800_000_000;
  const q = (url: string) => Object.fromEntries(new URL(`http://x${url}`).searchParams);
  it('صحیح ⇒ userId؛ امضا روی GET|path|exp|u', () => {
    const url = signMediaPath(key, path, u, now);
    expect(url.startsWith(`${path}?exp=${now + 600}&u=`)).toBe(true);
    expect(verifyMediaSignature(key, 'GET', path, q(url), now + 10)).toBe(u);
    expect(q(url).sig).toBe(mediaSignature(key, 'GET', path, now + 600, u));
  });
  it('منقضی، مسیر/کاربر/کلید دیگر، دستکاری exp، exp خیلی آینده ⇒ رد', () => {
    const p = q(signMediaPath(key, path, u, now));
    expect(verifyMediaSignature(key, 'GET', path, p, now + 601)).toBeNull();
    expect(verifyMediaSignature(key, 'GET', `${path}x`, p, now)).toBeNull();
    expect(verifyMediaSignature(key, 'GET', path, { ...p, u: '0190a8e2-1111-7000-8000-000000000002' }, now)).toBeNull();
    expect(verifyMediaSignature(randomBytes(32), 'GET', path, p, now)).toBeNull();
    expect(verifyMediaSignature(key, 'GET', path, { ...p, exp: String(Number(p.exp) + 1) }, now)).toBeNull();
    expect(verifyMediaSignature(key, 'DELETE', path, p, now)).toBeNull();
    const far = q(signMediaPath(key, path, u, now, 86_400));
    expect(verifyMediaSignature(key, 'GET', path, far, now)).toBeNull();
    expect(verifyMediaSignature(key, 'GET', path, { exp: p.exp, u }, now)).toBeNull();
  });
});

describe('رسانه: magic bytes، EXIF، Range', () => {
  it('sniff', () => {
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('image/jpeg');
    expect(sniffMime(Buffer.from('89504e470d0a1a0a0000000d', 'hex'))).toBe('image/png');
    expect(sniffMime(Buffer.from('RIFF\0\0\0\0WEBP'))).toBe('image/webp');
    expect(sniffMime(Buffer.from('OggS\0\0\0\0\0\0\0\0'))).toBe('audio/ogg');
    expect(sniffMime(Buffer.from('ID3\x03\0\0\0\0\0\0\0\0', 'latin1'))).toBe('audio/mpeg');
    expect(sniffMime(Buffer.from([0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0]))).toBe('audio/mpeg');
    expect(sniffMime(Buffer.from([0xff, 0xf1, 0x50, 0x80, 0, 0, 0, 0]))).toBe('audio/aac');
    expect(sniffMime(Buffer.from('\0\0\0\x20ftypM4A ', 'latin1'))).toBe('audio/mp4');
    expect(sniffMime(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]))).toBe('audio/webm');
    expect(sniffMime(Buffer.from('<html><script>'))).toBeNull();
    const png = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.from([0, 0, 1, 0, 0, 0, 0, 200])]);
    expect(imageSize('image/png', png)).toEqual({ width: 256, height: 200 });
  });

  it('JPEG: APP1 (EXIF) حذف، APP0/SOF/داده حفظ، ابعاد خوانده — حتی با تکه‌های یک‌بایتی', async () => {
    const seg = (m: number, body: Buffer) => Buffer.concat([Buffer.from([0xff, m]), Buffer.from([(body.length + 2) >> 8, (body.length + 2) & 255]), body]);
    const app0 = seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'));
    const exif = seg(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from('GPS-LAT-35.6892;LON-51.3890')]));
    const sof = seg(0xc0, Buffer.from([8, 0x01, 0x2c, 0x02, 0x58, 1, 1, 0x11, 0]));
    const sos = seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0]));
    const data = Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9]);
    const input = Buffer.concat([Buffer.from([0xff, 0xd8]), app0, exif, sof, sos, data]);
    const s = new JpegStripper();
    const out: Buffer[] = [];
    s.on('data', (c: Buffer) => out.push(c));
    await new Promise<void>((resolve, reject) => {
      s.on('end', resolve).on('error', reject);
      Readable.from([...input].map((b) => Buffer.from([b]))).pipe(s);
    });
    const res = Buffer.concat(out);
    expect(res.includes(Buffer.from('GPS-LAT'))).toBe(false);
    expect(res.includes(Buffer.from('Exif'))).toBe(false);
    expect(res).toEqual(Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, sos, data]));
    expect([s.width, s.height]).toEqual([600, 300]);
    expect(s.stripped).toBe(1);
  });

  it('JPEG ناقص/جعلی ⇒ خطا', async () => {
    const run = (b: Buffer) =>
      new Promise<void>((resolve, reject) => {
        const s = new JpegStripper();
        s.on('data', () => undefined).on('end', resolve).on('error', reject);
        Readable.from([b]).pipe(s);
      });
    await expect(run(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).rejects.toThrow();
    await expect(run(Buffer.from([0x00, 0x01, 0x02]))).rejects.toThrow();
  });

  it('Range', () => {
    expect(parseRange(undefined, 100)).toBeNull();
    expect(parseRange('bytes=0-9', 100)).toEqual([0, 9]);
    expect(parseRange('bytes=90-', 100)).toEqual([90, 99]);
    expect(parseRange('bytes=-10', 100)).toEqual([90, 99]);
    expect(parseRange('bytes=50-1000', 100)).toEqual([50, 99]);
    expect(parseRange('bytes=100-', 100)).toBe('invalid');
    expect(parseRange('bytes=5-1', 100)).toBe('invalid');
    expect(parseRange('bytes=0-1,5-6', 100)).toBeNull();
    expect(parseRange('items=0-1', 100)).toBeNull();
  });
});

describe('env رسانه', () => {
  const base = {
    NODE_ENV: 'production',
    DB_HOST: 'localhost',
    DB_USER: 'u',
    DB_PASSWORD: 'p',
    LOW_JWKS_URL: 'https://api.israapp.ir/c/.well-known/jwks.json',
    INTERNAL_URL_LOW: 'https://api.israapp.ir/c',
    CORS_ORIGINS: 'https://israapp.ir',
    INTERNAL_SECRET_LOW: S1,
    INTERNAL_SECRET_HIGH: S2,
    MEDIA_URL_SECRET: S3
  };
  it('production بدون MEDIA_URL_SECRET ⇒ fail-fast؛ MEDIA_DIR اختیاری ولی مطلق', () => {
    expect(loadEnv(base).MEDIA_SESSION_QUOTA_MB).toBe(2048);
    expect(() => loadEnv({ ...base, MEDIA_URL_SECRET: '' })).toThrow(/MEDIA_URL_SECRET/);
    expect(() => loadEnv({ ...base, MEDIA_URL_SECRET: 'short' })).toThrow(/MEDIA_URL_SECRET/);
    expect(() => loadEnv({ ...base, MEDIA_URL_SECRET: base.INTERNAL_SECRET_LOW })).toThrow(/MEDIA_URL_SECRET/);
    expect(() => loadEnv({ ...base, MEDIA_DIR: 'relative/dir' })).toThrow(/MEDIA_DIR/);
    expect(loadEnv({ ...base, MEDIA_DIR: '/home/isra/isra-media', MEDIA_SESSION_QUOTA_MB: '10' })).toMatchObject({ MEDIA_DIR: '/home/isra/isra-media', MEDIA_SESSION_QUOTA_MB: 10 });
    expect(loadEnv({ ...base, MEDIA_DIR: '' }).MEDIA_DIR).toBeUndefined();
  });
});
