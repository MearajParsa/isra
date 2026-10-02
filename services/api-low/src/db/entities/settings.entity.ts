import { Column, Entity, PrimaryColumn } from 'typeorm';

/** نسخهٔ محلی تنظیمات سراسری high (پرچم‌ها: maintenance_mode / registration_open) */
@Entity('settings_cache')
export class SettingsCacheEntity {
  @PrimaryColumn({ type: 'varchar', length: 32, name: 'setting_key' }) settingKey!: string;
  @Column({ type: 'json' }) value!: Record<string, unknown>;
  @Column({ type: 'int' }) version!: number;
  @Column({ type: 'datetime', precision: 3 }) updatedAt!: Date;
}
