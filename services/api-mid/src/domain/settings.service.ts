import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { Clock } from '../common/clock';
import { DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS, type Weights } from './rules';
import { parseJson } from './db';

export interface GlobalSettings {
  weights: Weights;
  thresholds: readonly number[];
  maintenance: boolean;
  version: number;
}

export const SettingsChanged = z.object({
  version: z.number().int().min(1),
  evalWeights: z.object({ voice: z.number().int().min(0).max(100), tone: z.number().int().min(0).max(100), tajweed: z.number().int().min(0).max(100) }).refine((w) => w.voice + w.tone + w.tajweed === 100, 'جمع وزن‌ها باید ۱۰۰ باشد'),
  badgeThresholds: z.array(z.number().int().positive()).length(4),
  flags: z.object({ maintenance_mode: z.boolean(), registration_open: z.boolean() }).optional()
});

const TTL_MS = 5_000;

/** تنظیمات سراسری (از high با رویداد)؛ پیش‌فرض ۴۰/۳۰/۳۰ و ۵۰/۱۵۰/۳۰۰/۵۰۰ تا اولین رویداد */
@Injectable()
export class SettingsService {
  private cached?: { v: GlobalSettings; exp: number };

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock
  ) {}

  async get(): Promise<GlobalSettings> {
    const now = this.clock.now().getTime();
    if (this.cached && this.cached.exp > now) return this.cached.v;
    const rows = (await this.ds.query("SELECT value, version FROM settings_cache WHERE setting_key = 'global'")) as { value: unknown; version: number }[];
    let v: GlobalSettings = { weights: { ...DEFAULT_WEIGHTS }, thresholds: DEFAULT_THRESHOLDS, maintenance: false, version: 0 };
    if (rows[0]) {
      const p = SettingsChanged.safeParse({ version: rows[0].version, ...parseJson<object>(rows[0].value) });
      if (p.success) v = { weights: p.data.evalWeights, thresholds: p.data.badgeThresholds, maintenance: p.data.flags?.maintenance_mode === true, version: p.data.version };
    }
    this.cached = { v, exp: now + TTL_MS };
    return v;
  }

  /** فقط نسخهٔ جدیدتر اعمال می‌شود (رویداد قدیمی/تکراری بی‌اثر) */
  async apply(p: z.infer<typeof SettingsChanged>): Promise<void> {
    await this.ds.query(
      `INSERT INTO settings_cache (setting_key, value, version, updated_at) VALUES ('global', ?, ?, ?)
       ON DUPLICATE KEY UPDATE value = IF(VALUES(version) > version, VALUES(value), value), updated_at = IF(VALUES(version) > version, VALUES(updated_at), updated_at), version = GREATEST(version, VALUES(version))`,
      [JSON.stringify({ evalWeights: p.evalWeights, badgeThresholds: p.badgeThresholds, ...(p.flags ? { flags: p.flags } : {}) }), p.version, this.clock.now()]
    );
    this.cached = undefined;
  }
}
