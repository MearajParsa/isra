import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { Clock } from '../common/clock';
import { DEFAULT_THRESHOLDS } from './rules';
import { parseJson } from './db';

export interface GlobalSettings {
  /** آستانه‌های قدیمی نشان (فقط fallback پیش از کاتالوگ پویا) */
  thresholds: readonly number[];
  maintenance: boolean;
  version: number;
}

/**
 * `system.settings.changed` از high. ۱.۷.۰: evalWeights (⇒ معیارهای پویا، evaluation.criteria.changed) و badgeThresholds
 * (⇒ کاتالوگ نشان) از تنظیمات حذف شدند؛ برای سازگاری با نسخهٔ قبلی high اختیاری پذیرفته می‌شوند (evalWeights نادیده).
 */
export const SettingsChanged = z.object({
  version: z.number().int().min(1),
  evalWeights: z.unknown().optional(),
  badgeThresholds: z.array(z.number().int().positive()).length(4).optional(),
  flags: z.object({ maintenance_mode: z.boolean(), registration_open: z.boolean() }).optional()
});

const TTL_MS = 5_000;

/** تنظیمات سراسری (از high با رویداد)؛ پیش‌فرض آستانه‌های ۵۰/۱۵۰/۳۰۰/۵۰۰ تا اولین رویداد */
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
    let v: GlobalSettings = { thresholds: DEFAULT_THRESHOLDS, maintenance: false, version: 0 };
    if (rows[0]) {
      const p = SettingsChanged.safeParse({ version: rows[0].version, ...parseJson<object>(rows[0].value) });
      if (p.success) v = { thresholds: p.data.badgeThresholds ?? DEFAULT_THRESHOLDS, maintenance: p.data.flags?.maintenance_mode === true, version: p.data.version };
    }
    this.cached = { v, exp: now + TTL_MS };
    return v;
  }

  /** فقط نسخهٔ جدیدتر اعمال می‌شود (رویداد قدیمی/تکراری بی‌اثر) */
  async apply(p: z.infer<typeof SettingsChanged>): Promise<void> {
    await this.ds.query(
      `INSERT INTO settings_cache (setting_key, value, version, updated_at) VALUES ('global', ?, ?, ?)
       ON DUPLICATE KEY UPDATE value = IF(VALUES(version) > version, VALUES(value), value), updated_at = IF(VALUES(version) > version, VALUES(updated_at), updated_at), version = GREATEST(version, VALUES(version))`,
      [JSON.stringify({ ...(p.badgeThresholds ? { badgeThresholds: p.badgeThresholds } : {}), ...(p.flags ? { flags: p.flags } : {}) }), p.version, this.clock.now()]
    );
    this.cached = undefined;
  }
}
