import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import { internal } from '@isra/api-types';
import { Clock } from '../common/clock';
import { parseJson, type Q } from './db';
import { LEGACY_CRITERIA, legacyCriterionId } from './refs';

export type CriteriaEvent = z.infer<typeof internal.EvaluationCriteriaChanged>;
export type BaselineEvent = z.infer<typeof internal.TierBaselineChanged>;
export type Criterion = CriteriaEvent['criteria'][number];

const CRITERIA_KEY = 'eval_criteria';
const BASELINE_KEY = 'tier_baseline';
const TTL_MS = 5_000;

/** کاتالوگ پیش‌فرض تا نخستین رویداد high: همان سه معیار قدیمی (seed قفل‌شده: صوت ۴۰، لحن ۳۰، تجوید ۳۰؛ سقف ۱۰) */
export const DEFAULT_CRITERIA: Criterion[] = LEGACY_CRITERIA.map((c) => ({ id: legacyCriterionId(c.key), key: c.key, title: c.title, description: '', weight: c.weight, maxScore: c.maxScore, active: true, sortOrder: c.sortOrder }));

/**
 * baseline پیش‌فرض نقش‌های ضمنی (docs-v2/31 §۱) تا نخستین `tier.baseline.changed`:
 * guest = session.browse + gallery.view؛ quran_student = همهٔ ماژول learning.
 */
export const DEFAULT_BASELINE: Pick<BaselineEvent, 'guest' | 'quran_student'> = {
  guest: ['session.browse', 'gallery.view'],
  quran_student: ['session.browse', 'session.join', 'comment.post', 'gallery.view', 'points.view']
};

export interface CriteriaCatalog {
  version: number;
  criteria: Criterion[];
}
export interface Baseline {
  version: number;
  guest: ReadonlySet<string>;
  quranStudent: ReadonlySet<string>;
}

/**
 * کش محلی کاتالوگ‌های high (inbox): معیارهای ارزیابی (`evaluation.criteria.changed`) و baseline نقش‌های ضمنی
 * (`tier.baseline.changed`). جایگزینی کامل فقط با version بزرگ‌تر (ترتیب تحویل تضمین نیست). ذخیره در settings_cache.
 */
@Injectable()
export class CatalogService {
  private crit?: { v: CriteriaCatalog; exp: number };
  private base?: { v: Baseline; exp: number };

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock
  ) {}

  private async read(key: string): Promise<{ value: unknown; version: number } | null> {
    const r = (await this.ds.query('SELECT value, version FROM settings_cache WHERE setting_key = ?', [key])) as { value: unknown; version: number }[];
    return r[0] ? { value: parseJson<unknown>(r[0].value), version: Number(r[0].version) } : null;
  }

  async criteria(): Promise<CriteriaCatalog> {
    const now = this.clock.now().getTime();
    if (this.crit && this.crit.exp > now) return this.crit.v;
    const r = await this.read(CRITERIA_KEY);
    const p = r ? internal.EvaluationCriteriaChanged.safeParse({ version: r.version, criteria: r.value }) : null;
    const v: CriteriaCatalog = p?.success ? { version: p.data.version, criteria: p.data.criteria } : { version: 1, criteria: DEFAULT_CRITERIA };
    this.crit = { v, exp: now + TTL_MS };
    return v;
  }

  /** معیارهای فعال مرتب (sortOrder، سپس key) */
  async activeCriteria(): Promise<{ version: number; items: Criterion[] }> {
    const c = await this.criteria();
    const items = c.criteria.filter((x) => x.active).sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
    return { version: c.version, items: items.length ? items : DEFAULT_CRITERIA };
  }

  async baseline(): Promise<Baseline> {
    const now = this.clock.now().getTime();
    if (this.base && this.base.exp > now) return this.base.v;
    const r = await this.read(BASELINE_KEY);
    const p = r ? internal.TierBaselineChanged.safeParse({ version: r.version, ...(r.value as object) }) : null;
    const src = p?.success ? p.data : { version: 0, ...DEFAULT_BASELINE };
    const v: Baseline = { version: src.version, guest: new Set(src.guest), quranStudent: new Set(src.quran_student) };
    this.base = { v, exp: now + TTL_MS };
    return v;
  }

  /** مجوز سیستمی مؤثر: کاربر واردشده = quran_student ∪ claim JWT؛ بی‌توکن = guest */
  async hasSystemPermission(perm: string, user: { perms: readonly string[] } | null): Promise<boolean> {
    const b = await this.baseline();
    if (!user) return b.guest.has(perm);
    return user.perms.includes(perm) || b.quranStudent.has(perm);
  }

  private async upsert(m: Q, key: string, value: unknown, version: number): Promise<void> {
    await m.query(
      `INSERT INTO settings_cache (setting_key, value, version, updated_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE value = IF(VALUES(version) > version, VALUES(value), value), updated_at = IF(VALUES(version) > version, VALUES(updated_at), updated_at), version = GREATEST(version, VALUES(version))`,
      [key, JSON.stringify(value), version, this.clock.now()]
    );
  }

  async applyCriteria(m: Q, e: CriteriaEvent): Promise<void> {
    await this.upsert(m, CRITERIA_KEY, e.criteria, e.version);
    this.crit = undefined;
  }

  async applyBaseline(m: Q, e: BaselineEvent): Promise<void> {
    await this.upsert(m, BASELINE_KEY, { guest: e.guest, quran_student: e.quran_student }, e.version);
    this.base = undefined;
  }
}
