import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { uuidBinary } from '../../common/ids';

/** نسخهٔ محلی تنظیمات سراسری high (پرچم‌ها: maintenance_mode / registration_open) */
@Entity('settings_cache')
export class SettingsCacheEntity {
  @PrimaryColumn({ type: 'varchar', length: 32, name: 'setting_key' }) settingKey!: string;
  @Column({ type: 'json' }) value!: Record<string, unknown>;
  @Column({ type: 'int' }) version!: number;
  @Column({ type: 'datetime', precision: 3 }) updatedAt!: Date;
}

/** کاتالوگ نشان‌ها (رویداد `badge.catalog.changed` از high؛ جایگزینی کامل با version بزرگ‌تر). نسخه در settings_cache کلید `badges` */
@Entity('badge_catalog')
@Index('idx_badge_active_sort', ['active', 'sortOrder', 'threshold'])
export class BadgeCatalogEntity {
  @PrimaryColumn({ type: 'binary', length: 16, transformer: uuidBinary }) id!: string;
  @Column({ type: 'varchar', length: 40, name: 'badge_key' }) key!: string;
  @Column({ type: 'varchar', length: 60 }) title!: string;
  @Column({ type: 'varchar', length: 300 }) description!: string;
  @Column({ type: 'int', unsigned: true }) threshold!: number;
  @Column({ type: 'tinyint' }) active!: number;
  @Column({ type: 'int', unsigned: true }) sortOrder!: number;
  @Column({ type: 'varchar', length: 64, nullable: true }) imageHash!: string | null;
  @Column({ type: 'int', unsigned: true }) version!: number;
}
