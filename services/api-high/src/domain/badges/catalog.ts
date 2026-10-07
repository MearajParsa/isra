import { bufToUuid } from '../../common/ids';
import type { Q } from '../db';
import { emit } from '../outbox.writer';

export const MAX_BADGES = 50;

export interface BadgeRow {
  id: Buffer;
  badge_key: string;
  title: string;
  description: string;
  threshold: number;
  active: number;
  sort_order: number;
  image_type: string | null;
  image_hash: string | null;
  image_bytes: number | null;
  image_w: number | null;
  image_h: number | null;
  created_at: Date;
  updated_at: Date;
}

/** ستون‌های فهرست (بدون باینری تصویر) */
export const BADGE_COLS = 'id, badge_key, title, description, threshold, active, sort_order, image_type, image_hash, image_bytes, image_w, image_h, created_at, updated_at';
export const BADGE_ORDER = 'sort_order ASC, threshold ASC, badge_key ASC';

/**
 * نسخهٔ کاتالوگ +۱ و رویداد `badge.catalog.changed` با کاتالوگ کامل (بدون باینری) — داخل تراکنش فراخواننده.
 * فراخواننده باید ردیف `badge_catalog_meta` را از قبل قفل کرده باشد (`lockCatalog`) تا نسخه‌ها ترتیب‌دار بمانند.
 */
export async function publishCatalog(m: Q, now: Date): Promise<number> {
  await m.query('UPDATE badge_catalog_meta SET version = version + 1 WHERE id = 1');
  const v = (await m.query('SELECT version FROM badge_catalog_meta WHERE id = 1')) as { version: string | number }[];
  const version = Number(v[0]?.version ?? 1);
  const rows = (await m.query(`SELECT ${BADGE_COLS} FROM badges ORDER BY ${BADGE_ORDER}`)) as BadgeRow[];
  await emit(m, now, 'badge.catalog.changed', {
    version,
    badges: rows.map((r) => ({ id: bufToUuid(r.id), key: r.badge_key, title: r.title, description: r.description, threshold: r.threshold, active: !!r.active, sortOrder: r.sort_order, imageHash: r.image_hash }))
  });
  return version;
}

export async function lockCatalog(m: Q): Promise<void> {
  await m.query('SELECT version FROM badge_catalog_meta WHERE id = 1 FOR UPDATE');
}
