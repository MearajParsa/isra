import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock';

/** کلید ردیف baseline در `settings_cache` (docs-v2/31 §۱). نبود ردیف ⇒ baseline خالی (fail-closed)؛ seed در migration LowV17 */
export const BASELINE_KEY = 'tier_baseline';

export interface TierBaseline {
  version: number;
  guest: ReadonlySet<string>;
  quranStudent: ReadonlySet<string>;
}

const TTL_MS = 5_000;
const EMPTY: TierBaseline = { version: 0, guest: new Set(), quranStudent: new Set() };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** مجوزهای نقش‌های ضمنی `guest` (بی‌توکن) و `quran_student` (هر کاربر ثبت‌نام‌کرده) از high؛ کش کوتاه in-process */
@Injectable()
export class TierBaselineService {
  private cached?: { v: TierBaseline; exp: number };

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock
  ) {}

  async get(): Promise<TierBaseline> {
    const now = this.clock.now().getTime();
    if (this.cached && this.cached.exp > now) return this.cached.v;
    const rows = (await this.ds.query('SELECT value, version FROM settings_cache WHERE setting_key = ?', [BASELINE_KEY])) as { value: unknown; version: number }[];
    let v = EMPTY;
    if (rows[0]) {
      const raw = (typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value) as { guest?: unknown; quran_student?: unknown } | null;
      v = { version: Number(rows[0].version), guest: new Set(strings(raw?.guest)), quranStudent: new Set(strings(raw?.quran_student)) };
    }
    this.cached = { v, exp: now + TTL_MS };
    return v;
  }

  invalidate() {
    this.cached = undefined;
  }
}
