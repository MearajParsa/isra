import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { internal } from '@isra/api-types';
import { Clock } from '../common/clock';
import { bufToUuid, uuidToBuf } from '../common/ids';
import { type Q, parseJson } from './db';
import type { InboxItem } from './outbox.writer';
import { PostCommit } from './post-commit';
import { legacyBadgeId } from './refs';
import { DEFAULT_THRESHOLDS, badgeKey } from './rules';
import { SettingsService } from './settings.service';

type CatalogEvent = z.infer<typeof internal.BadgeCatalogChanged>;

export interface CatalogBadge {
  id: string;
  key: string;
  title: string;
  description: string;
  threshold: number;
  active: boolean;
  sortOrder: number;
  imageHash: string | null;
}
/** version=0 ⇒ هنوز کاتالوگی از high نرسیده؛ ۴ نشان قدیمی با آستانه‌های تنظیمات (fallback، docs-v2/30 §۱.۳) */
export interface Catalog {
  version: number;
  badges: CatalogBadge[];
}

const META_KEY = 'badge_catalog';
const JOB_KEY = 'badge_recompute';
const BATCH = 500;
const TTL_MS = 5_000;

const byOrder = (a: CatalogBadge, b: CatalogBadge) => a.sortOrder - b.sortOrder || a.threshold - b.threshold || a.key.localeCompare(b.key);

/** نشان‌های فعال مرتب (sortOrder سپس threshold) */
export const activeBadges = (c: Catalog): CatalogBadge[] => c.badges.filter((b) => b.active).sort(byOrder);

/**
 * نشان پویا (مصرف‌کنندهٔ کاتالوگ high): قاعده = نشان فعال با threshold ≤ total باید اعطا شده باشد؛ بقیه پس گرفته می‌شوند.
 * - per کاربر (syncUser) در همان تراکنش تغییر امتیاز و فقط وقتی آستانه‌ای عبور شده؛ اعطا/پس‌گیری ⇒ inbox (`system`).
 * - تغییر کاتالوگ ⇒ job پس‌زمینه (keyset ۵۰۰تایی روی user_points، idempotent با version، بدون inbox).
 */
@Injectable()
export class BadgesService {
  private readonly log = new Logger('Badges');
  private cached?: { v: Catalog | null; exp: number };
  private inflight?: Promise<number>;

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly post: PostCommit
  ) {}

  invalidate(): void {
    this.cached = undefined;
  }

  /** کاتالوگ مؤثر؛ بیرون از تراکنش بخوانید و به نوشتن‌ها پاس دهید (اتصال دوم pool داخل تراکنش نگیرید) */
  async catalog(): Promise<Catalog> {
    const now = this.clock.now().getTime();
    if (!this.cached || this.cached.exp <= now) this.cached = { v: await this.load(this.ds), exp: now + TTL_MS };
    if (this.cached.v) return this.cached.v;
    const { thresholds } = await this.settings.get();
    return {
      version: 0,
      badges: DEFAULT_THRESHOLDS.map((d, i) => {
        const key = badgeKey(d);
        const t = thresholds[i] ?? d;
        return { id: legacyBadgeId(key), key, title: `نشان ${t} امتیاز`, description: `رسیدن به ${t} امتیاز`, threshold: t, active: true, sortOrder: i, imageHash: null };
      })
    };
  }

  private async load(q: Q): Promise<Catalog | null> {
    const meta = (await q.query('SELECT version FROM settings_cache WHERE setting_key = ?', [META_KEY])) as { version: number }[];
    if (!meta[0]) return null;
    const rows = (await q.query('SELECT id, badge_key, title, description, threshold, active, sort_order, image_hash FROM badges_catalog')) as {
      id: Buffer;
      badge_key: string;
      title: string;
      description: string;
      threshold: number;
      active: number;
      sort_order: number;
      image_hash: string | null;
    }[];
    return {
      version: Number(meta[0].version),
      badges: rows
        .map((r) => ({ id: bufToUuid(r.id), key: r.badge_key, title: r.title, description: r.description, threshold: Number(r.threshold), active: !!r.active, sortOrder: Number(r.sort_order), imageHash: r.image_hash }))
        .sort(byOrder)
    };
  }

  /** PointsSummary.badges: همهٔ نشان‌های فعال با awardedAt|null */
  async view(q: Q, userId: string, cat: Catalog) {
    const rows = (await q.query('SELECT badge_id, awarded_at FROM badge_awards WHERE user_id = ?', [uuidToBuf(userId)])) as { badge_id: Buffer; awarded_at: Date }[];
    const got = new Map(rows.map((r) => [bufToUuid(r.badge_id), r.awarded_at]));
    return activeBadges(cat).map((b) => ({
      id: b.id,
      key: b.key,
      title: b.title,
      description: b.description,
      threshold: b.threshold,
      image: b.imageHash ? { hash: b.imageHash } : null,
      awardedAt: got.get(b.id)?.toISOString() ?? null
    }));
  }

  /**
   * هماهنگ‌سازی نشان‌های یک کاربر پس از تغییر total (داخل همان تراکنش؛ ردیف user_points قفل است).
   * اگر هیچ آستانهٔ فعالی بین قدیم و جدید عبور نشده ⇒ بدون کوئری. پیام‌های inbox را برمی‌گرداند (فراخوان دسته‌ای می‌فرستد).
   */
  async syncUser(m: Q, userId: string, oldTotal: number, newTotal: number, cat: Catalog): Promise<InboxItem[]> {
    const act = activeBadges(cat);
    const lo = Math.min(oldTotal, newTotal);
    const hi = Math.max(oldTotal, newTotal);
    if (!act.some((b) => b.threshold > lo && b.threshold <= hi)) return [];
    const uid = uuidToBuf(userId);
    const existing = new Set(((await m.query('SELECT badge_id FROM badge_awards WHERE user_id = ?', [uid])) as { badge_id: Buffer }[]).map((r) => bufToUuid(r.badge_id)));
    const desired = act.filter((b) => b.threshold <= newTotal);
    const desiredIds = new Set(desired.map((b) => b.id));
    const add = desired.filter((b) => !existing.has(b.id));
    const remove = [...existing].filter((id) => !desiredIds.has(id));
    const now = this.clock.now();
    if (add.length) await m.query(`INSERT IGNORE INTO badge_awards (user_id, badge_id, awarded_at) VALUES ${add.map(() => '(?, ?, ?)').join(', ')}`, add.flatMap((b) => [uid, uuidToBuf(b.id), now]));
    if (remove.length) await m.query(`DELETE FROM badge_awards WHERE user_id = ? AND badge_id IN (${remove.map(() => '?').join(', ')})`, [uid, ...remove.map(uuidToBuf)]);
    const title = new Map(cat.badges.map((b) => [b.id, b.title]));
    return [
      ...add.map((b): InboxItem => ({ userId, kind: 'system', title: 'نشان جدید', body: `نشان «${b.title}» را گرفتی.`, ref: `badge:${b.id}` })),
      ...remove.map((id): InboxItem => ({ userId, kind: 'system', title: 'نشان از دست رفت', body: `نشان «${title.get(id) ?? 'قبلی'}» از دست رفت.`, ref: `badge:${id}` }))
    ];
  }

  /**
   * رویداد `badge.catalog.changed` (high ⇒ mid) داخل تراکنش inbox رویداد: فقط اگر version بزرگ‌تر ⇒ جایگزینی کامل،
   * نگاشت نشان‌های قدیمی هم‌کلید به شناسهٔ تازه (حفظ awarded_at)، و زمان‌بندی job بازمحاسبه (پس از commit).
   * @returns true اگر اعمال شد
   */
  async applyCatalog(m: Q, p: CatalogEvent): Promise<boolean> {
    const cur = (await m.query('SELECT version FROM settings_cache WHERE setting_key = ? FOR UPDATE', [META_KEY])) as { version: number }[];
    if (cur[0] && Number(cur[0].version) >= p.version) return false;
    const now = this.clock.now();
    await m.query('DELETE FROM badges_catalog');
    if (p.badges.length)
      await m.query(
        `INSERT INTO badges_catalog (id, badge_key, title, description, threshold, active, sort_order, image_hash, version) VALUES ${p.badges.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
        p.badges.flatMap((b) => [uuidToBuf(b.id), b.key, b.title, b.description, b.threshold, b.active ? 1 : 0, b.sortOrder, b.imageHash, p.version])
      );
    const upsert = 'INSERT INTO settings_cache (setting_key, value, version, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), version = VALUES(version), updated_at = VALUES(updated_at)';
    await m.query(upsert, [META_KEY, JSON.stringify({ count: p.badges.length }), p.version, now]);
    for (const b of p.badges) {
      const legacy = legacyBadgeId(b.key);
      if (legacy !== b.id) await m.query('UPDATE IGNORE badge_awards SET badge_id = ? WHERE badge_id = ?', [uuidToBuf(b.id), uuidToBuf(legacy)]);
    }
    await m.query(upsert, [JOB_KEY, JSON.stringify({ cursor: null, done: false }), p.version, now]);
    this.invalidate();
    this.post.after(m, () => {
      this.invalidate();
      void this.runRecompute().catch((e: unknown) => this.log.error({ err: e instanceof Error ? e.message : 'unknown' }, 'badge recompute failed'));
    });
    return true;
  }

  /**
   * job بازمحاسبهٔ همهٔ کاربران پس از تغییر کاتالوگ (keyset روی user_points.user_id، دسته‌های ۵۰۰تایی، هر دسته یک تراکنش).
   * idempotent و قابل ادامه (cursor در settings_cache با همان version)؛ بدون inbox. اجرای هم‌زمان ⇒ همان promise.
   * @returns تعداد کاربران پردازش‌شده
   */
  runRecompute(): Promise<number> {
    this.inflight ??= this.recompute().finally(() => (this.inflight = undefined));
    return this.inflight;
  }

  private async recompute(): Promise<number> {
    let processed = 0;
    for (;;) {
      const st = (await this.ds.query('SELECT value, version FROM settings_cache WHERE setting_key = ?', [JOB_KEY])) as { value: unknown; version: number }[];
      if (!st[0]) return processed;
      const state = parseJson<{ cursor: string | null; done: boolean }>(st[0].value);
      if (state.done) return processed;
      const version = Number(st[0].version);
      this.invalidate();
      const cat = await this.catalog();
      if (cat.version !== version) return processed; // کاتالوگ تازه‌تر در راه است؛ اجرای بعدی ادامه می‌دهد
      const act = activeBadges(cat);
      const n = await this.ds.transaction(async (m) => {
        const users = (await m.query(`SELECT user_id, total FROM user_points ${state.cursor ? 'WHERE user_id > ?' : ''} ORDER BY user_id LIMIT ? FOR UPDATE`, state.cursor ? [Buffer.from(state.cursor, 'hex'), BATCH] : [BATCH])) as { user_id: Buffer; total: number }[];
        if (users.length) {
          const ids = users.map((u) => u.user_id);
          const have = (await m.query(`SELECT user_id, badge_id FROM badge_awards WHERE user_id IN (${ids.map(() => '?').join(', ')})`, ids)) as { user_id: Buffer; badge_id: Buffer }[];
          const haveSet = new Set(have.map((h) => `${h.user_id.toString('hex')}|${h.badge_id.toString('hex')}`));
          const want = new Set<string>();
          const add: unknown[] = [];
          const now = this.clock.now();
          for (const u of users)
            for (const b of act)
              if (b.threshold <= Number(u.total)) {
                const k = `${u.user_id.toString('hex')}|${uuidToBuf(b.id).toString('hex')}`;
                want.add(k);
                if (!haveSet.has(k)) add.push(u.user_id, uuidToBuf(b.id), now);
              }
          const del = have.filter((h) => !want.has(`${h.user_id.toString('hex')}|${h.badge_id.toString('hex')}`));
          if (del.length) await m.query(`DELETE FROM badge_awards WHERE (user_id, badge_id) IN (${del.map(() => '(?, ?)').join(', ')})`, del.flatMap((d) => [d.user_id, d.badge_id]));
          if (add.length) await m.query(`INSERT IGNORE INTO badge_awards (user_id, badge_id, awarded_at) VALUES ${Array.from({ length: add.length / 3 }, () => '(?, ?, ?)').join(', ')}`, add);
        }
        const next = { cursor: users.length ? users[users.length - 1]!.user_id.toString('hex') : state.cursor, done: users.length < BATCH };
        await m.query('UPDATE settings_cache SET value = ?, updated_at = ? WHERE setting_key = ? AND version = ?', [JSON.stringify(next), this.clock.now(), JOB_KEY, version]);
        return users.length;
      });
      processed += n;
    }
  }

  /** MID_ADMIN.badgeHolders: تعداد دارندگان per نشان کاتالوگ (صفرها هم) */
  async holders() {
    const cat = await this.catalog();
    const rows = (await this.ds.query('SELECT badge_id, COUNT(*) AS n FROM badge_awards GROUP BY badge_id')) as { badge_id: Buffer; n: string | number }[];
    const m = new Map(rows.map((r) => [bufToUuid(r.badge_id), Number(r.n)]));
    return { items: cat.badges.map((b) => ({ badgeId: b.id, holders: m.get(b.id) ?? 0 })) };
  }
}
