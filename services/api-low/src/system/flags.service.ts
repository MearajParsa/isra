import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock';

export interface Flags {
  maintenanceMode: boolean;
  registrationOpen: boolean;
}

const TTL_MS = 5_000;

/** پرچم‌های سراسری از high (رویداد `system.settings.changed`)؛ پیش‌فرض: ثبت‌نام باز، نگهداری خاموش */
@Injectable()
export class FlagsService {
  private cached?: { v: Flags; exp: number };

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock
  ) {}

  async get(): Promise<Flags> {
    const now = this.clock.now().getTime();
    if (this.cached && this.cached.exp > now) return this.cached.v;
    const rows = (await this.ds.query("SELECT value FROM settings_cache WHERE setting_key = 'global'")) as { value: unknown }[];
    const raw = rows[0] ? (typeof rows[0].value === 'string' ? (JSON.parse(rows[0].value) as { flags?: Record<string, unknown> }) : (rows[0].value as { flags?: Record<string, unknown> })) : {};
    const f = raw.flags ?? {};
    const v: Flags = { maintenanceMode: f.maintenance_mode === true, registrationOpen: f.registration_open !== false };
    this.cached = { v, exp: now + TTL_MS };
    return v;
  }

  invalidate() {
    this.cached = undefined;
  }
}
