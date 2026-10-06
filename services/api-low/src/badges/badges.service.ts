import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { z } from 'zod';
import { internal } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { BinaryResponse, sniffImage } from '../common/binary';
import { Clock } from '../common/clock';
import { sha256 } from '../common/crypto';
import { bufToUuid, isUuid, uuidToBuf } from '../common/ids';
import { Lru } from '../common/lru';
import { ENV, type Env } from '../config/env';
import { internalHeaders } from '../internal/internal-auth';

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

interface Catalog {
  version: number;
  /** همهٔ نشان‌ها (فعال و غیرفعال) به ترتیب sortOrder، threshold */
  all: CatalogBadge[];
  byId: Map<string, CatalogBadge>;
}

interface Img {
  data: Buffer;
  type: BinaryResponse['contentType'];
  /** sha256 بایت‌ها */
  digest: string;
}

type CatalogEvent = z.infer<typeof internal.BadgeCatalogChanged>;

const CATALOG_TTL_MS = 10_000;
const IMAGE_MAX_BYTES = 300 * 1024;
const IMAGE_CACHE_ENTRIES = 100;
const IMAGE_CACHE_BYTES = 16 * 1024 * 1024;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT = 'public, max-age=300';

/**
 * کاتالوگ نشان‌ها در low (منبع: رویداد `badge.catalog.changed` از high) برای L-21 (نگاشت)، L-32 (badgesVersion)، L-33 و L-34.
 * تصویر از `HIGH_INTERNAL.badgeImage` گرفته و در حافظه (LRU کلیدخورده با hash) کش می‌شود؛ magic bytes دوباره بررسی می‌شود.
 */
@Injectable()
export class BadgesService {
  private readonly log = new Logger('Badges');
  private cached?: { v: Catalog; exp: number };
  private readonly images = new Lru<string, Img>(IMAGE_CACHE_ENTRIES, IMAGE_CACHE_BYTES);
  private readonly inflight = new Map<string, Promise<Img>>();

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env
  ) {}

  async catalog(): Promise<Catalog> {
    const now = this.clock.now().getTime();
    if (this.cached && this.cached.exp > now) return this.cached.v;
    const [rows, ver] = await Promise.all([
      this.ds.query('SELECT id, badge_key, title, description, threshold, active, sort_order, image_hash FROM badge_catalog ORDER BY sort_order, threshold, id') as Promise<
        { id: Buffer; badge_key: string; title: string; description: string; threshold: number; active: number | string; sort_order: number; image_hash: string | null }[]
      >,
      this.ds.query("SELECT version FROM settings_cache WHERE setting_key = 'badges'") as Promise<{ version: number }[]>
    ]);
    const all = rows.map((r) => ({
      id: bufToUuid(r.id),
      key: r.badge_key,
      title: r.title,
      description: r.description,
      threshold: Number(r.threshold),
      active: Number(r.active) > 0,
      sortOrder: Number(r.sort_order),
      imageHash: r.image_hash
    }));
    const v: Catalog = { version: Number(ver[0]?.version ?? 0), all, byId: new Map(all.map((b) => [b.id, b])) };
    this.cached = { v, exp: now + CATALOG_TTL_MS };
    return v;
  }

  invalidate() {
    this.cached = undefined;
  }

  /** جایگزینی کامل کاتالوگ فقط اگر version بزرگ‌تر باشد (رویداد قدیمی/تکراری بی‌اثر). داخل تراکنش مصرف رویداد. */
  async applyCatalog(m: EntityManager, p: CatalogEvent, now: Date): Promise<boolean> {
    await m.query("INSERT IGNORE INTO settings_cache (setting_key, value, version, updated_at) VALUES ('badges', '{}', 0, ?)", [now]);
    const cur = (await m.query("SELECT version FROM settings_cache WHERE setting_key = 'badges' FOR UPDATE")) as { version: number }[];
    if (Number(cur[0]?.version ?? 0) >= p.version) return false;
    await m.query('DELETE FROM badge_catalog');
    if (p.badges.length) {
      const args: unknown[] = [];
      for (const b of p.badges) args.push(uuidToBuf(b.id), b.key, b.title, b.description, b.threshold, b.active ? 1 : 0, b.sortOrder, b.imageHash, p.version);
      await m.query(`INSERT INTO badge_catalog (id, badge_key, title, description, threshold, active, sort_order, image_hash, version) VALUES ${p.badges.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`, args);
    }
    await m.query("UPDATE settings_cache SET version = ?, updated_at = ? WHERE setting_key = 'badges'", [p.version, now]);
    return true;
  }

  /** L-33: فقط نشان‌های فعال، مرتب (sortOrder سپس آستانه) */
  async publicList(page: number, pageSize: number) {
    const c = await this.catalog();
    const active = c.all.filter((b) => b.active);
    return {
      items: active.slice((page - 1) * pageSize, page * pageSize).map((b) => ({ id: b.id, key: b.key, title: b.title, description: b.description, threshold: b.threshold, image: b.imageHash ? { hash: b.imageHash } : null })),
      page,
      pageSize,
      total: active.length
    };
  }

  /**
   * L-34: تصویر نشان. نشان ناشناخته/بدون تصویر ⇒ 404. `v` برابر hash فعلی ⇒ کش immutable یک‌ساله؛ وگرنه کوتاه‌مدت.
   * بایت‌ها پیش از ارسال دوباره با magic bytes سنجیده می‌شوند (فقط png/webp/jpeg؛ SVG هرگز) و Content-Type از همین تشخیص است.
   */
  async image(id: string, v: string | undefined): Promise<BinaryResponse> {
    if (!isUuid(id)) throw new AppError('NOT_FOUND');
    const badge = (await this.catalog()).byId.get(id.toLowerCase());
    if (!badge?.imageHash) throw new AppError('NOT_FOUND');
    const hash = badge.imageHash;
    const img = await this.loadImage(badge.id, hash);
    const matches = img.digest.startsWith(hash);
    return new BinaryResponse(img.data, img.type, v === hash && matches ? IMMUTABLE : SHORT, matches ? hash : img.digest);
  }

  private async loadImage(id: string, hash: string): Promise<Img> {
    const hit = this.images.get(hash);
    if (hit) return hit;
    let p = this.inflight.get(hash);
    if (!p) {
      p = this.fetchImage(id, hash).finally(() => this.inflight.delete(hash));
      this.inflight.set(hash, p);
    }
    return p;
  }

  private async fetchImage(id: string, hash: string): Promise<Img> {
    if (!this.env.INTERNAL_URL_HIGH) throw new AppError('SERVICE_UNAVAILABLE');
    let res: Response;
    try {
      res = await fetch(`${this.env.INTERNAL_URL_HIGH}/internal/v1/badges/${encodeURIComponent(id)}/image`, {
        headers: { ...internalHeaders(this.env, 'high'), Accept: 'image/png, image/webp, image/jpeg' },
        signal: AbortSignal.timeout(this.env.INTERNAL_TIMEOUT_MS)
      });
    } catch (e) {
      this.log.warn({ err: e instanceof Error ? e.message : 'unknown' }, 'high unavailable (badge image)');
      throw new AppError('SERVICE_UNAVAILABLE');
    }
    if (res.status === 404) throw new AppError('NOT_FOUND');
    if (!res.ok) {
      this.log.warn({ http: res.status }, 'badge image fetch failed');
      throw new AppError('SERVICE_UNAVAILABLE');
    }
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > IMAGE_MAX_BYTES) throw new AppError('SERVICE_UNAVAILABLE');
    const data = Buffer.from(await res.arrayBuffer());
    const type = data.length <= IMAGE_MAX_BYTES ? sniffImage(data) : null;
    if (!type) {
      this.log.warn({ bytes: data.length }, 'badge image rejected (size/magic bytes)');
      throw new AppError('NOT_FOUND');
    }
    // فقط بایت‌هایی که با hash کاتالوگ می‌خوانند زیر همان hash کش می‌شوند (تصویر تازه‌تر/کهنه‌تر از کاتالوگ ⇒ کش نمی‌شود)
    const digest = sha256(data).toString('hex');
    const img = { data, type, digest };
    if (digest.startsWith(hash)) this.images.set(hash, img, data.length);
    return img;
  }
}
