import { randomBytes } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pjoin } from 'node:path';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { high, internal, mid } from '@isra/api-types';
import { bufToUuid, uuidToBuf, uuidv7 } from '../src/common/ids';
import { dataSourceOptions } from '../src/db/data-source';
import { TeacherContentV171728700000000 } from '../src/db/migrations/1728700000000-TeacherContentV17';
import { CatalogService } from '../src/domain/catalog.service';
import { legacyCriterionId } from '../src/domain/refs';
import { type TestApp, type User, addSupporter, api, creator, join, mkSession, mkUser, resetDb, sc, startApp, testEnv } from './helpers/app';
/** مقدار تصادفی در زمان اجرا (هیچ secret واقعی یا ثابت در مخزن نیست؛ gitleaks) */
const rnd = (): string => randomBytes(24).toString('base64url');
const S1 = rnd(), S2 = rnd(), S3 = rnd();

const HIGH = 'test-pair-mid-high-0123456789abcdef0';
const mediaDir = mkdtempSync(pjoin(tmpdir(), 'isra-media-'));
let t: TestApp;
let a: ReturnType<typeof api>;
beforeAll(async () => {
  t = await startApp({ MEDIA_DIR: mediaDir, MEDIA_SESSION_QUOTA_MB: '1', MEDIA_URL_SECRET: S3 });
  a = api(t);
});
afterAll(async () => {
  await t.close();
  rmSync(mediaDir, { recursive: true, force: true });
});

const bin = (id: string) => uuidToBuf(id);
const reason = (r: request.Response) => r.body?.error?.details?.reason as string | undefined;
const hdr = { 'X-Internal-Caller': 'high', 'X-Internal-Token': HIGH };
const ad = {
  get: (p: string) => request(t.http).get(`/o/internal/v1${p}`).set(hdr),
  post: (p: string, b: object = {}) => request(t.http).post(`/o/internal/v1${p}`).set(hdr).send(b),
  put: (p: string, b: object = {}) => request(t.http).put(`/o/internal/v1${p}`).set(hdr).send(b),
  patch: (p: string, b: object = {}) => request(t.http).patch(`/o/internal/v1${p}`).set(hdr).send(b),
  del: (p: string) => request(t.http).delete(`/o/internal/v1${p}`).set(hdr)
};
const upload = (path: string, u: User, type: string, body: Buffer) => request(t.http).post(`/o/v1${path}`).set({ ...u.h, 'Content-Type': type }).send(body);

// ───── فایل‌های نمونه ─────
const seg = (m: number, body: Buffer) => Buffer.concat([Buffer.from([0xff, m, (body.length + 2) >> 8, (body.length + 2) & 255]), body]);
const GPS = Buffer.from('GPSLatitude=35.6892;GPSLongitude=51.3890');
const jpeg = (pad = 0) =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    seg(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), GPS])),
    seg(0xc0, Buffer.from([8, 0, 10, 0, 20, 1, 1, 0x11, 0])),
    seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.alloc(pad, 0x11),
    Buffer.from([0xff, 0xd9])
  ]);
const png = () => Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.from([0, 0, 0, 64, 0, 0, 0, 32, 8, 6, 0, 0, 0]), Buffer.alloc(100, 7)]);
const mp3 = (n = 4000) => Buffer.concat([Buffer.from('ID3\x03\0\0\0\0\0\0', 'latin1'), Buffer.from(Array.from({ length: n }, (_, i) => i % 251))]);

/** جلسهٔ started (once ⇒ نوبت #۱) با صاحب، پشتیبان (معلم) و دو عضو */
async function room() {
  const owner = await creator(t);
  const id = await mkSession(t, owner, 'started');
  const teacher = await mkUser(t, 'پشتیبان معلم');
  await join(t, id, owner, teacher, ['teacher']);
  const s1 = await mkUser(t, 'قاری اول');
  const s2 = await mkUser(t, 'شنوندهٔ دوم');
  await join(t, id, owner, s1);
  await join(t, id, owner, s2);
  const occ = (await a.get(`/sessions/${id}/me`, owner)).body.data.occurrence.id as string;
  return { id, owner, teacher, s1, s2, occ };
}

describe('صاحب/پشتیبان: مجوز مؤثر و ضد ارتقا', () => {
  it('پشتیبان ثابت استاد در همهٔ جلسه‌های او؛ اجتماع با per جلسه؛ فقط مجوزهای داده‌شده', async () => {
    const owner = await creator(t);
    const s1 = await mkSession(t, owner, 'started');
    const s2 = await mkSession(t, owner, 'scheduled');
    const sup = await mkUser(t, 'پشتیبان ثابت');
    const plain = await mkUser(t, 'کاربر عادی');
    // supporter.manage_own لازم (baseline quran_student ندارد)
    expect((await a.post('/me/supporters', owner, { user: { userId: sup.id }, permissions: ['queue.manage'] })).status).toBe(403);
    const teacherTok = await t.low.sign({ sub: owner.id, perms: ['session.create', 'supporter.manage_own'] });
    const teacher: User = { ...owner, h: { ...owner.h, Authorization: `Bearer ${teacherTok}` } };
    const add = await a.post('/me/supporters', teacher, { user: { userId: sup.id }, permissions: ['queue.manage'] });
    expect(add.status).toBe(200);
    mid.TeacherSupporter.parse(add.body.data);
    expect(reason(await a.post('/me/supporters', teacher, { user: { userId: sup.id }, permissions: ['queue.manage'] }))).toBe('ALREADY_SUPPORTER');
    expect(reason(await a.post('/me/supporters', teacher, { user: { userId: owner.id }, permissions: ['queue.manage'] }))).toBe('SELF_PROTECTED');
    expect((await a.post('/me/supporters', teacher, { user: { userId: plain.id }, permissions: ['system.sessions.manage'] })).status).toBe(400);
    expect((await a.post('/me/supporters', teacher, { user: { userId: randomUUID() }, permissions: ['queue.manage'] })).status).toBe(404);
    // در هر دو جلسه (حتی draft/scheduled) پشتیبان است
    for (const s of [s1, s2]) {
      const me = (await a.get(`/sessions/${s}/me`, sup)).body.data;
      expect(me).toMatchObject({ role: 'supporter', permissions: ['queue.manage'] });
    }
    expect((await a.get('/me', sup)).body.data.hasStaffRole).toBe(true);
    // per جلسه ⇒ اجتماع
    await addSupporter(t, s1, owner, sup, ['eval.submit']);
    const eff = (await a.get(`/sessions/${s1}/supporters`, owner)).body.data.find((x: any) => x.userId === sup.id);
    expect(mid.SessionSupporter.parse(eff)).toMatchObject({ permissions: ['queue.manage', 'eval.submit'], sources: { teacher: ['queue.manage'], session: ['eval.submit'] } });
    // پشتیبان نه پشتیبان تعیین می‌کند نه ویرایش جلسه
    expect((await a.post(`/sessions/${s1}/supporters`, sup, { user: { userId: plain.id }, permissions: ['queue.manage'] })).status).toBe(403);
    expect((await a.post(`/sessions/${s1}/transition`, sup, { to: 'ended' })).status).toBe(403);
    expect((await a.get(`/sessions/${s1}/members`, sup)).status).toBe(403);
    expect((await a.get(`/sessions/${s1}/supporters`, plain)).status).toBe(403);
    // تغییر/حذف
    expect((await a.patch(`/me/supporters/${sup.id}`, teacher, { permissions: ['membership.approve'] })).body.data.permissions).toEqual(['membership.approve']);
    expect((await a.patch(`/sessions/${s1}/supporters/${sup.id}`, owner, { permissions: ['gallery.manage'] })).body.data.permissions.sort()).toEqual(['gallery.manage', 'membership.approve']);
    expect((await a.del(`/me/supporters/${sup.id}`, teacher)).status).toBe(200);
    expect((await a.get(`/sessions/${s2}/me`, sup)).body.data).toMatchObject({ role: null, permissions: [] });
    expect((await a.get(`/sessions/${s1}/me`, sup)).body.data.permissions).toEqual(['gallery.manage']);
  });

  it('M-68 کاتالوگ و M-45 معیارها', async () => {
    const u = await mkUser(t, 'بیننده');
    const c = await a.get('/session-permissions', u);
    expect(c.body.data.permissions.map((p: { key: string }) => p.key)).toEqual(mid.SESSION_DELEGABLE_PERMISSIONS.map((p) => p.key));
    const cr = mid.ActiveCriteria.parse((await a.get('/evaluation-criteria', u)).body.data);
    expect(cr.items.map((x) => x.id)).toEqual([legacyCriterionId('voice'), legacyCriterionId('tone'), legacyCriterionId('tajweed')]);
  });
});

describe('گالری', () => {
  it('ساخت/سطح نمایش/بارگذاری: EXIF حذف، magic bytes، نوع گالری، حجم، Range، ETag، URL امضاشده، مهمان', async () => {
    const r = await room();
    const out = await mkUser(t, 'غریبه');
    const mk = (title: string, kind: string, visibility: string) => a.post(`/sessions/${r.id}/occurrences/${r.occ}/galleries`, r.owner, { title, kind, visibility });
    expect((await a.post(`/sessions/${r.id}/occurrences/${r.occ}/galleries`, r.teacher, { title: 'بی‌مجوز', kind: 'image' })).status).toBe(403);
    const gPub = (await mk('عمومی', 'image', 'public')).body.data.id as string;
    const gMem = (await mk('اعضا', 'image', 'members')).body.data.id as string;
    const gStaff = (await mk('کادر', 'audio', 'staff')).body.data.id as string;
    const list = async (u: User) => ((await a.get(`/sessions/${r.id}/occurrences/${r.occ}/galleries`, u)).body.data as { id: string }[]).map((g) => g.id).sort();
    expect(await list(r.owner)).toEqual([gPub, gMem, gStaff].sort());
    expect(await list(r.teacher)).toEqual([gPub, gMem, gStaff].sort());
    expect(await list(r.s1)).toEqual([gPub, gMem].sort());
    expect(await list(out)).toEqual([gPub]);
    expect((await a.get(`/sessions/${r.id}/galleries/${gStaff}/items`, r.s1)).status).toBe(404);

    // بارگذاری
    const base = `/sessions/${r.id}/galleries/${gPub}/items`;
    expect((await upload(`${base}?title=x`, r.s1, 'image/jpeg', jpeg())).status).toBe(403);
    expect((await upload(base, r.owner, 'text/html', Buffer.from('<script>'))).status).toBe(415);
    expect((await upload(base, r.owner, 'image/png', jpeg())).status).toBe(415); // magic bytes ≠ Content-Type
    expect(reason(await upload(base, r.owner, 'audio/mpeg', mp3()))).toBe('GALLERY_KIND_MISMATCH');
    expect((await upload(base, r.owner, 'image/jpeg', Buffer.alloc(5 * 1024 * 1024 + 1))).status).toBe(413);
    const up = await upload(`${base}?title=${encodeURIComponent('عکس جلسه')}`, r.owner, 'image/jpeg', jpeg(500));
    expect(up.status).toBe(200);
    const item = mid.GalleryItem.parse(up.body.data);
    expect(item).toMatchObject({ mime: 'image/jpeg', title: 'عکس جلسه', width: 20, height: 10 });
    const stored = readFileSync(pjoin(mediaDir, r.id, gPub, item.id));
    expect(stored.includes(GPS)).toBe(false);
    expect(stored.length).toBe(item.bytes);
    expect(readdirSync(pjoin(mediaDir, '.tmp')).filter((f) => f.endsWith('.part'))).toEqual([]);
    const p = await upload(base, r.owner, 'image/png', png());
    expect(p.body.data).toMatchObject({ width: 64, height: 32 });

    // محتوا با Bearer: ETag/304، nosniff، inline، private
    const path = `/o/v1/sessions/${r.id}/galleries/${gPub}/items/${item.id}/content`;
    const c = await request(t.http).get(path).set(r.s1.h).buffer(true).parse((res, cb) => {
      const parts: Buffer[] = [];
      res.on('data', (d: Buffer) => parts.push(d));
      res.on('end', () => cb(null, Buffer.concat(parts)));
    });
    expect(c.status).toBe(200);
    expect(c.headers).toMatchObject({ etag: `"${item.sha256}"`, 'x-content-type-options': 'nosniff', 'content-disposition': 'inline', 'cache-control': 'private, max-age=3600', 'content-type': 'image/jpeg', 'referrer-policy': 'no-referrer' });
    expect((c.body as Buffer).equals(stored)).toBe(true);
    expect((await request(t.http).get(path).set({ ...r.s1.h, 'If-None-Match': `"${item.sha256}"` })).status).toBe(304);
    expect((await request(t.http).get(path)).status).toBe(401);

    // URL امضاشده: بدون هدر Authorization؛ دستکاری ⇒ 401؛ کاربر امضا دوباره بررسی می‌شود
    const signed = (await a.get(`/sessions/${r.id}/galleries/${gPub}/items`, r.s1)).body.data.find((x: { id: string }) => x.id === item.id).url as string;
    expect(signed.startsWith(`${path}?exp=`)).toBe(true);
    expect((await request(t.http).get(signed)).status).toBe(200);
    expect((await request(t.http).get(signed.replace(/sig=.{4}/, 'sig=AAAA'))).status).toBe(401);
    expect((await request(t.http).get(signed.replace(`/items/${item.id}/`, `/items/${p.body.data.id}/`))).status).toBe(401);
    t.clock.advance(601_000);
    expect((await request(t.http).get(signed)).status).toBe(401);
    t.clock.advance(-601_000);
    // عضو اخراج‌شده با URL امضاشدهٔ گالری members ⇒ 404 (دسترسی دوباره بررسی می‌شود)
    const mUp = await upload(`/sessions/${r.id}/galleries/${gMem}/items`, r.owner, 'image/jpeg', jpeg());
    const mUrl = (await a.get(`/sessions/${r.id}/galleries/${gMem}/items`, r.s2)).body.data[0].url as string;
    expect((await request(t.http).get(mUrl)).status).toBe(200);
    const s2m = (await a.get(`/sessions/${r.id}/members?pageSize=50`, r.owner)).body.data.find((x: any) => x.userId === r.s2.id).id;
    await a.del(`/sessions/${r.id}/members/${s2m}`, r.owner);
    expect((await request(t.http).get(mUrl)).status).toBe(404);
    void mUp;

    // صوت + Range
    const au = await upload(`/sessions/${r.id}/galleries/${gStaff}/items`, r.teacher, 'audio/mpeg', mp3()).set({ Authorization: r.owner.h.Authorization! });
    expect(au.status).toBe(200);
    const apath = `/o/v1/sessions/${r.id}/galleries/${gStaff}/items/${au.body.data.id}/content`;
    const rg = await request(t.http).get(apath).set({ ...r.owner.h, Range: 'bytes=10-19' });
    expect(rg.status).toBe(206);
    expect(rg.headers['content-range']).toBe(`bytes 10-19/${au.body.data.bytes}`);
    expect(rg.headers['content-length']).toBe('10');
    expect((await request(t.http).get(apath).set({ ...r.owner.h, Range: 'bytes=999999-' })).status).toBe(416);
    expect((await request(t.http).get(apath).set(r.s1.h)).status).toBe(404); // staff

    // مهمان (M-78/M-79): فقط public
    const pub = await request(t.http).get(`/o/v1/public/sessions/${r.id}/galleries`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.map((g: any) => g.id)).toEqual([gPub]);
    mid.PublicGallery.parse(pub.body.data[0]);
    expect(pub.body.data[0].items).toHaveLength(2);
    const gc = await request(t.http).get(`/o/v1/public/galleries/${gPub}/items/${item.id}/content`);
    expect(gc.status).toBe(200);
    expect(gc.headers['cache-control']).toBe('public, max-age=86400');
    expect((await request(t.http).get(`/o/v1/public/galleries/${gMem}/items/${mUp.body.data.id}/content`)).status).toBe(404);
    // baseline مهمان بدون gallery.view ⇒ 403
    const cat = t.app.get(CatalogService);
    await cat.applyBaseline(t.ds, { version: 100, guest: ['session.browse'], quran_student: ['session.browse', 'comment.post', 'gallery.view'] });
    expect((await request(t.http).get(`/o/v1/public/sessions/${r.id}/galleries`)).status).toBe(403);
    await t.ds.query("DELETE FROM settings_cache WHERE setting_key = 'tier_baseline'");
    (cat as unknown as { base?: unknown }).base = undefined;

    // حذف نرم + پاک‌سازی فایل
    expect((await a.del(`/sessions/${r.id}/galleries/${gPub}/items/${item.id}`, r.owner)).status).toBe(200);
    await new Promise((res) => setTimeout(res, 100));
    expect(readdirSync(pjoin(mediaDir, r.id, gPub))).not.toContain(item.id);
    expect((await request(t.http).get(path).set(r.owner.h)).status).toBe(404);
    expect((await a.del(`/sessions/${r.id}/galleries/${gPub}`, r.owner)).status).toBe(200);
    expect(await list(r.owner)).toEqual([gMem, gStaff].sort());
  });

  it('سهمیهٔ جلسه (MEDIA_SESSION_QUOTA_MB) ⇒ QUOTA_EXCEEDED', async () => {
    const r = await room();
    const g = (await a.post(`/sessions/${r.id}/occurrences/${r.occ}/galleries`, r.owner, { title: 'صوت‌ها', kind: 'audio' })).body.data.id as string;
    const big = mp3(700 * 1024);
    expect((await upload(`/sessions/${r.id}/galleries/${g}/items`, r.owner, 'audio/mpeg', big)).status).toBe(200);
    const over = await upload(`/sessions/${r.id}/galleries/${g}/items`, r.owner, 'audio/mpeg', big);
    expect(over.status).toBe(409);
    expect(reason(over)).toBe('QUOTA_EXCEEDED');
  });

  it('MID_ADMIN گالری: فهرست همهٔ سطوح، ساخت، بارگذاری خام با actorId، محتوا با Range، حذف', async () => {
    const r = await room();
    const actor = randomUUID();
    const g = await ad.post(`/admin/sessions/${r.id}/galleries`, { actorId: actor, occurrenceId: r.occ, title: 'گالری ادمین', kind: 'image', visibility: 'staff' });
    expect(g.status).toBe(200);
    internal.MidAdminGallery.parse(g.body.data);
    const gid = g.body.data.id as string;
    expect((await ad.patch(`/admin/sessions/${r.id}/galleries/${gid}`, { actorId: actor, visibility: 'public' })).body.data.visibility).toBe('public');
    const up = await request(t.http).post(`/o/internal/v1/admin/sessions/${r.id}/galleries/${gid}/items?actorId=${actor}&title=x`).set({ ...hdr, 'Content-Type': 'image/jpeg' }).send(jpeg());
    expect(up.status).toBe(200);
    const it = internal.MidAdminGalleryItem.parse(up.body.data);
    expect(it.url).toBe('');
    expect((await ad.get(`/admin/sessions/${r.id}/galleries`)).body.data).toHaveLength(1);
    expect((await ad.get(`/admin/sessions/${r.id}/galleries/${gid}/items`)).body.meta.total).toBe(1);
    const c = await request(t.http).get(`/o/internal/v1/admin/sessions/${r.id}/galleries/${gid}/items/${it.id}/content`).set({ ...hdr, Range: 'bytes=0-1' });
    expect(c.status).toBe(206);
    expect((await ad.del(`/admin/sessions/${r.id}/galleries/${gid}/items/${it.id}?actorId=${actor}`)).status).toBe(200);
    expect((await ad.del(`/admin/sessions/${r.id}/galleries/${gid}?actorId=${actor}`)).status).toBe(200);
    expect((await ad.del(`/admin/sessions/${r.id}/galleries/${gid}`)).status).toBe(400);
  });
});

describe('کامنت', () => {
  it('حین تلاوت فقط روی آیتم current (at_sec سرور)؛ reciter_only؛ پنهان؛ غیرفعال؛ نوبت بسته', async () => {
    const r = await room();
    for (const s of [r.s1, r.s2]) {
      await a.post(`/sessions/${r.id}/attendance`, s);
      await a.post(`/sessions/${r.id}/queue`, s);
    }
    const q = (await a.post(`/sessions/${r.id}/queue/next`, r.teacher)).body.data;
    const cur = q.current.id as string;
    const waiting = q.waiting[0].id as string;
    const url = `/sessions/${r.id}/occurrences/${r.occ}/comments`;
    expect(reason(await a.post(url, r.s2, { body: 'منتظر', queueItemId: waiting }))).toBe('NOT_RECITING');
    t.clock.advance(42_000);
    const c1 = await a.post(url, r.s2, { body: 'ماشاءالله', queueItemId: cur });
    expect(c1.status).toBe(200);
    expect(mid.Comment.parse(c1.body.data)).toMatchObject({ atSec: 42, reciter: { id: r.s1.id }, mine: true, hidden: false });
    const gen = (await a.post(url, r.s2, { body: 'کامنت عمومی نوبت' })).body.data;
    expect(gen.queueItemId).toBeNull();
    const out = await mkUser(t, 'غیرعضو');
    expect((await a.post(url, out, { body: 'سلام' })).status).toBe(403);
    // public: همه می‌بینند
    const ids = async (u: User, qs = '') => ((await a.get(`${url}${qs}`, u)).body.data as { id: string }[]).map((x) => x.id).sort();
    expect(await ids(out)).toEqual([c1.body.data.id, gen.id].sort());
    expect(await ids(r.s1, `?queueItemId=${cur}`)).toEqual([c1.body.data.id]);
    expect(await ids(r.s1, '?scope=general')).toEqual([gen.id]);
    // reciter_only
    await t.ds.query("UPDATE sessions SET comment_visibility = 'reciter_only' WHERE id = ?", [bin(r.id)]);
    const third = await mkUser(t, 'عضو سوم');
    await join(t, r.id, r.owner, third);
    expect(await ids(third)).toEqual([gen.id]); // تلاوت دیگران دیده نمی‌شود، عمومی نوبت بله
    expect(await ids(r.s1)).toEqual([c1.body.data.id, gen.id].sort()); // خواننده
    expect(await ids(r.s2)).toEqual([c1.body.data.id, gen.id].sort()); // نویسنده
    expect(await ids(r.teacher)).toEqual([c1.body.data.id, gen.id].sort()); // کادر
    expect(await ids(out)).toEqual([]);
    // پنهان: فقط کادر
    expect((await a.patch(`/sessions/${r.id}/comments/${gen.id}`, r.s1, { hidden: true })).status).toBe(403);
    expect((await a.patch(`/sessions/${r.id}/comments/${gen.id}`, r.owner, { hidden: true })).body.data.hidden).toBe(true);
    expect(await ids(third)).toEqual([]);
    expect(await ids(r.owner)).toContain(gen.id);
    // حذف: نویسنده یا moderator
    expect((await a.del(`/sessions/${r.id}/comments/${c1.body.data.id}`, third)).status).toBe(404);
    expect((await a.del(`/sessions/${r.id}/comments/${c1.body.data.id}`, r.s1)).status).toBe(403);
    expect((await a.del(`/sessions/${r.id}/comments/${c1.body.data.id}`, r.s2)).status).toBe(200);
    expect((await a.del(`/sessions/${r.id}/comments/${c1.body.data.id}`, r.s2)).status).toBe(200);
    // غیرفعال
    await t.ds.query('UPDATE sessions SET comments_enabled = 0 WHERE id = ?', [bin(r.id)]);
    expect(reason(await a.post(url, r.s2, { body: 'بسته' }))).toBe('COMMENTS_DISABLED');
    await t.ds.query('UPDATE sessions SET comments_enabled = 1 WHERE id = ?', [bin(r.id)]);
    // نوبت بسته ⇒ فقط کادر
    await a.post(`/sessions/${r.id}/occurrences/${r.occ}/close`, r.owner);
    expect(reason(await a.post(url, r.s2, { body: 'دیر' }))).toBe('OCCURRENCE_CLOSED');
    expect((await a.post(url, r.teacher, { body: 'جمع‌بندی استاد' })).status).toBe(200);
    // MID_ADMIN
    const al = await ad.get(`/admin/sessions/${r.id}/comments?hidden=true`);
    expect(al.body.data.map((x: any) => x.id)).toEqual([gen.id]);
    expect(al.body.data[0].mine).toBe(false);
    expect((await ad.patch(`/admin/sessions/${r.id}/comments/${gen.id}`, { actorId: randomUUID(), hidden: false })).body.data.hidden).toBe(false);
    expect((await ad.del(`/admin/sessions/${r.id}/comments/${gen.id}?actorId=${randomUUID()}`)).status).toBe(200);
    expect((await ad.get(`/admin/sessions/${r.id}/comments`)).body.meta.total).toBe(1);
  });
});

describe('MEDIA_DIR نبود ⇒ 503', () => {
  it('بارگذاری بدون MEDIA_DIR ⇒ SERVICE_UNAVAILABLE', async () => {
    const t2 = await startApp();
    try {
      const a2 = api(t2);
      const owner = await creator(t2);
      const id = await mkSession(t2, owner, 'started');
      const occ = (await a2.get(`/sessions/${id}/me`, owner)).body.data.occurrence.id;
      const g = (await a2.post(`/sessions/${id}/occurrences/${occ}/galleries`, owner, { title: 'بی‌دیسک', kind: 'image' })).body.data.id;
      const r = await request(t2.http).post(`/o/v1/sessions/${id}/galleries/${g}/items`).set({ ...owner.h, 'Content-Type': 'image/jpeg' }).send(jpeg());
      expect(r.status).toBe(503);
    } finally {
      await t2.close();
    }
  });
});

describe('مهاجرت دادهٔ ۱.۷.۰', () => {
  it('مدیر ⇒ owner، هم‌مدیر ⇒ پشتیبان همه‌مجوز، معلم ⇒ پشتیبان eval.submit، کادر غیرقرآن‌آموز عضو نیست؛ ارزیابی قدیمی ⇒ snapshot', async () => {
    await resetDb(t.ds);
    const ds = new DataSource(dataSourceOptions(testEnv({ DB_MIGRATIONS_RUN: 'false', LOW_JWKS_URL: t.low.jwksUrl })));
    await ds.initialize();
    const qr = ds.createQueryRunner();
    const mig = new TeacherContentV171728700000000();
    try {
      await mig.down(qr);
      const sched = JSON.stringify({ type: 'once', startsAt: '2030-01-04T18:00:00+03:30', endsAt: '2030-01-04T20:00:00+03:30' });
      const [creatorId, mgr2, teacher, sup, stu, teacherStu] = Array.from({ length: 6 }, () => uuidv7());
      const sid = uuidv7();
      const sid2 = uuidv7(); // جلسه‌ای که سازنده دیگر مدیر نیست
      for (const s of [sid, sid2]) await ds.query("INSERT INTO sessions (id, title, description, status, schedule_type, schedule, location_label, created_by, version, created_at, updated_at) VALUES (?, 'قدیمی', 'جلسهٔ دادهٔ قدیمی', 'started', 'once', ?, 'مسجد', ?, 1, NOW(3), NOW(3))", [bin(s), sched, bin(creatorId)]);
      const mem = async (s: string, u: string, roles: string[], at = '2026-01-01 00:00:00') => {
        const id = uuidv7();
        await ds.query("INSERT INTO session_members (id, session_id, user_id, status, requested_at, decided_at) VALUES (?, ?, ?, 'approved', ?, ?)", [bin(id), bin(s), bin(u), at, at]);
        for (const r of roles) await ds.query('INSERT INTO session_member_roles (member_id, role) VALUES (?, ?)', [bin(id), r]);
      };
      await mem(sid, creatorId, ['session_manager']);
      await mem(sid, mgr2, ['session_manager']);
      await mem(sid, teacher, ['teacher']);
      await mem(sid, sup, ['session_supporter']);
      await mem(sid, stu, ['quran_student']);
      await mem(sid, teacherStu, ['teacher', 'quran_student']);
      await mem(sid2, mgr2, ['session_manager', 'teacher'], '2026-02-01 00:00:00');
      await mem(sid2, creatorId, ['quran_student']);
      const occ = uuidv7();
      await ds.query("INSERT INTO session_occurrences (id, session_id, seq, status, opened_at) VALUES (?, ?, 1, 'live', NOW(3))", [bin(occ), bin(sid)]);
      const qi = uuidv7();
      await ds.query("INSERT INTO queue_items (id, session_id, occurrence_id, user_id, status, position, joined_at) VALUES (?, ?, ?, ?, 'current', NULL, NOW(3))", [bin(qi), bin(sid), bin(occ), bin(stu)]);
      const ev = uuidv7();
      await ds.query(
        "INSERT INTO evaluations (id, session_id, occurrence_id, queue_item_id, user_id, evaluator_id, voice, tone, tajweed, weights, score, points, note, created_at) VALUES (?, ?, ?, ?, ?, ?, 8, 6, 7, ?, 71, 7, '', NOW(3))",
        [bin(ev), bin(sid), bin(occ), bin(qi), bin(stu), bin(teacher), JSON.stringify({ voice: 40, tone: 30, tajweed: 30 })]
      );
      const ev2 = uuidv7();
      await ds.query(
        "INSERT INTO evaluations (id, session_id, occurrence_id, queue_item_id, user_id, evaluator_id, voice, tone, tajweed, weights, score, points, note, created_at) VALUES (?, ?, ?, ?, ?, ?, 9, 1, 1, ?, 90, 9, '', NOW(3))",
        [bin(ev2), bin(sid), bin(occ), bin(uuidv7()), bin(stu), bin(teacher), JSON.stringify({ voice: 100, tone: 0, tajweed: 0 })]
      );

      await mig.up(qr);
      await mig.up(qr); // اجرای دوباره امن

      const owner = async (s: string) => bufToUuid(((await ds.query('SELECT owner_id FROM sessions WHERE id = ?', [bin(s)])) as { owner_id: Buffer }[])[0]!.owner_id);
      expect(await owner(sid)).toBe(creatorId);
      expect(await owner(sid2)).toBe(mgr2);
      const sups = async (s: string) =>
        Object.fromEntries(((await ds.query('SELECT user_id, permissions FROM session_supporters WHERE session_id = ?', [bin(s)])) as { user_id: Buffer; permissions: unknown }[]).map((r) => [bufToUuid(r.user_id), (typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions) as string[]]));
      const s1 = await sups(sid);
      expect(Object.keys(s1).sort()).toEqual([mgr2, teacher, sup, teacherStu].sort());
      expect(s1[mgr2]).toHaveLength(9);
      expect(s1[teacher]).toEqual(['attendance.manage', 'queue.manage', 'eval.submit', 'occurrence.manage']);
      expect(s1[teacher]).not.toContain('membership.approve');
      expect(s1[sup]).toEqual(expect.arrayContaining(['membership.approve', 'eval.submit']));
      expect(await sups(sid2)).toEqual({});
      const members = async (s: string) => ((await ds.query('SELECT user_id FROM session_members WHERE session_id = ?', [bin(s)])) as { user_id: Buffer }[]).map((r) => bufToUuid(r.user_id)).sort();
      expect(await members(sid)).toEqual([stu, teacherStu].sort());
      expect(await members(sid2)).toEqual([creatorId]);
      const evs = (await ds.query('SELECT id, criteria, score FROM evaluations ORDER BY id')) as { id: Buffer; criteria: unknown; score: number }[];
      const snap = (x: unknown) => (typeof x === 'string' ? JSON.parse(x) : x) as { criterionId: string; key: string; weight: number; score: number }[];
      const e1 = snap(evs.find((e) => bufToUuid(e.id) === ev)!.criteria);
      expect(e1.map((c) => [c.criterionId, c.key, c.weight, c.score])).toEqual([
        [legacyCriterionId('voice'), 'voice', 40, 8],
        [legacyCriterionId('tone'), 'tone', 30, 6],
        [legacyCriterionId('tajweed'), 'tajweed', 30, 7]
      ]);
      expect(snap(evs.find((e) => bufToUuid(e.id) === ev2)!.criteria).map((c) => c.key)).toEqual(['voice']); // وزن صفر حذف
      const started = ((await ds.query('SELECT started_at FROM queue_items WHERE id = ?', [bin(qi)])) as { started_at: Date | null }[])[0]!.started_at;
      expect(started).toBeTruthy();
      // برنامه روی دادهٔ مهاجرت‌شده
      const ownerUser = { id: creatorId, name: 'x', token: '', h: { Authorization: `Bearer ${await t.low.sign({ sub: creatorId })}` } };
      const me = (await a.get(`/sessions/${sid}/me`, ownerUser)).body.data;
      expect(me).toMatchObject({ role: 'owner', membership: null });
      const old = mid.Evaluation.parse((await a.get(`/sessions/${sid}/evaluations`, ownerUser)).body.data.find((e: any) => e.id === ev));
      expect(old.score).toBe(71);
      const tUser = { id: teacher, name: 'x', token: '', h: { Authorization: `Bearer ${await t.low.sign({ sub: teacher })}` } };
      expect((await a.get(`/sessions/${sid}/me`, tUser)).body.data).toMatchObject({ role: 'supporter' });
      expect(high.AdminSession.parse((await ad.get(`/admin/sessions/${sid}`)).body.data).counts).toMatchObject({ members: 2, supporters: 4 });
      void sc;
    } finally {
      await qr.release();
      await ds.destroy();
      await resetDb(t.ds);
    }
  });
});
