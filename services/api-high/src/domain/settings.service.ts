import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { high } from '@isra/api-types';
import { Clock } from '../common/clock';
import { uuidToBuf } from '../common/ids';
import { AuditService } from './audit.service';
import { type Q, conflict, parseJson, withRetry } from './db';
import { emit } from './outbox.writer';

type Update = z.infer<typeof high.UpdateSettingsBody>;

interface Row {
  version: number;
  eval_weights: unknown;
  badge_thresholds: unknown;
  flags: unknown;
  updated_by: string;
  updated_at: Date;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly audit: AuditService
  ) {}

  private async read(q: Q) {
    const rows = (await q.query("SELECT version, eval_weights, badge_thresholds, flags, updated_by, updated_at FROM system_settings WHERE setting_key = 'global'")) as Row[];
    const r = rows[0]!;
    return {
      version: r.version,
      evalWeights: parseJson<{ voice: number; tone: number; tajweed: number }>(r.eval_weights),
      badgeThresholds: parseJson<[number, number, number, number]>(r.badge_thresholds),
      flags: parseJson<{ maintenance_mode: boolean; registration_open: boolean }>(r.flags),
      updatedAt: r.updated_at.toISOString(),
      updatedBy: r.updated_by
    };
  }

  get() {
    return this.read(this.ds);
  }

  /**
   * بروزرسانی با optimistic concurrency: `version` قدیمی ⇒ CONFLICT(VERSION_MISMATCH).
   * D2: وزن جدید فقط روی ارزیابی‌های بعدی (mid وزن لحظهٔ ثبت را ذخیره می‌کند). رویداد برای mid (وزن/آستانه) و low (پرچم‌ها).
   */
  async update(actorId: string, b: Update) {
    return withRetry(() =>
      this.ds.transaction(async (m) => {
        const cur = await this.read(m);
        const actor = await this.audit.actorOf(actorId, m);
        const now = this.clock.now();
        const upd = (await m.query("UPDATE system_settings SET version = version + 1, eval_weights = ?, badge_thresholds = ?, flags = ?, updated_by = ?, updated_at = ? WHERE setting_key = 'global' AND version = ?", [
          JSON.stringify(b.evalWeights),
          JSON.stringify(b.badgeThresholds),
          JSON.stringify(b.flags),
          actor.name,
          now,
          b.version
        ])) as { affectedRows?: number };
        if (!upd.affectedRows) throw conflict('VERSION_MISMATCH', 'تنظیمات در این فاصله توسط کس دیگری تغییر کرده است؛ صفحه را تازه کنید.', { currentVersion: cur.version });
        const next = await this.read(m);
        await emit(m, now, 'system.settings.changed', { version: next.version, evalWeights: next.evalWeights, badgeThresholds: next.badgeThresholds, flags: next.flags });
        await this.audit.write(m, {
          actor,
          action: 'settings.updated',
          target: { type: 'settings', id: 'global', label: 'تنظیمات سراسری' },
          summary: 'تنظیمات سراسری به‌روزرسانی شد.',
          meta: { version: next.version, before: { evalWeights: cur.evalWeights, badgeThresholds: cur.badgeThresholds, flags: cur.flags }, after: { evalWeights: next.evalWeights, badgeThresholds: next.badgeThresholds, flags: next.flags } }
        });
        return next;
      })
    );
  }
}

export { uuidToBuf };
