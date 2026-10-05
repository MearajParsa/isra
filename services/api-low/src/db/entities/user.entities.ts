import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { uuidBinary } from '../../common/ids';

const id = { type: 'binary', length: 16, transformer: uuidBinary } as const;
const dt = { type: 'datetime', precision: 3 } as const;

@Entity('users')
export class UserEntity {
  @PrimaryColumn(id) id!: string;
  @Index('uq_users_phone', { unique: true })
  @Column({ type: 'char', length: 11 })
  phone!: string;
  @Column({ type: 'varchar', length: 16, default: 'active' }) status!: 'active' | 'disabled' | 'deleted';
  @Column({ type: 'tinyint', width: 1, default: 0 }) mustChangePassword!: boolean;
  @Column({ ...dt }) createdAt!: Date;
  @Column({ ...dt }) updatedAt!: Date;
}

@Entity('user_credentials')
export class UserCredentialEntity {
  @PrimaryColumn({ ...id, name: 'user_id' }) userId!: string;
  @Column({ type: 'varchar', length: 255 }) passwordHash!: string;
  @Column({ ...dt }) updatedAt!: Date;
}

@Entity('profiles')
export class ProfileEntity {
  @PrimaryColumn({ ...id, name: 'user_id' }) userId!: string;
  @Column({ type: 'varchar', length: 40, default: '' }) firstName!: string;
  @Column({ type: 'varchar', length: 40, default: '' }) lastName!: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) avatarPath!: string | null;
  @Column({ ...dt }) updatedAt!: Date;
}

/** claimهای همگام‌شده از high (نقش سیستم و grant) */
@Entity('user_claims')
export class UserClaimsEntity {
  @PrimaryColumn({ ...id, name: 'user_id' }) userId!: string;
  @Column({ type: 'json' }) systemRoles!: string[];
  @Column({ type: 'json' }) grants!: string[];
  @Column({ type: 'int', default: 1 }) permVer!: number;
  @Column({ ...dt }) updatedAt!: Date;
}
