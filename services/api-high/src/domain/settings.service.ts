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
    const rows = (await q.query("SELECT version, flags, updated_by, updated_at FROM system_settings WHERE setting_key = 'global'")) as Row[];
    const r = rows[0]!;
    return {
      version: r.version,
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
   * ۱.۷.۰: فقط پرچم‌ها (وزن‌ها ⇒ معیارهای ارزیابی H-100..H-103؛ آستانه‌ها ⇒ نشان‌ها H-32..H-37). رویداد برای low و mid.
   */
  async update(actorId: string, b: Update) {
    return withRetry(() =>
      this.ds.transaction(async (m) => {
        const cur = await this.read(m);
        const actor = await this.audit.actorOf(actorId, m);
        const now = this.clock.now();
        const upd = (await m.query("UPDATE system_settings SET version = version + 1, flags = ?, updated_by = ?, updated_at = ? WHERE setting_key = 'global' AND version = ?", [
          JSON.stringify(b.flags),
          actor.name,
          now,
          b.version
        ])) as { affectedRows?: number };
        if (!upd.affectedRows) throw conflict('VERSION_MISMATCH', 'تنظیمات در این فاصله توسط کس دیگری تغییر کرده است؛ صفحه را تازه کنید.', { currentVersion: cur.version });
        const next = await this.read(m);
        await emit(m, now, 'system.settings.changed', { version: next.version, flags: next.flags });
        await this.audit.write(m, {
          actor,
          action: 'settings.updated',
          target: { type: 'settings', id: 'global', label: 'تنظیمات سراسری' },
          summary: 'تنظیمات سراسری به‌روزرسانی شد.',
          meta: { version: next.version, before: { flags: cur.flags }, after: { flags: next.flags } }
        });
        return next;
      })
    );
  }
}

export { uuidToBuf };
