import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { uuidBinary } from '../../common/ids';

const id = { type: 'binary', length: 16, transformer: uuidBinary } as const;
const dt = { type: 'datetime', precision: 3 } as const;
const hash = { type: 'binary', length: 32 } as const;

@Entity('otp_challenges')
@Index('idx_otp_phone_created', ['phone', 'createdAt'])
@Index('idx_otp_expires', ['expiresAt'])
export class OtpChallengeEntity {
  @PrimaryColumn(id) id!: string;
  @Column({ type: 'char', length: 11 }) phone!: string;
  @Column({ type: 'varchar', length: 16 }) purpose!: 'login' | 'step_up';
  @Column({ ...id, name: 'user_id', nullable: true }) userId!: string | null;
  /** HMAC-SHA256(pepper, challengeId:code) — کد خام ذخیره نمی‌شود */
  @Column({ ...hash }) codeHmac!: Buffer;
  @Column({ type: 'tinyint', unsigned: true, default: 0 }) attempts!: number;
  @Column({ ...dt }) expiresAt!: Date;
  @Column({ ...dt, nullable: true }) consumedAt!: Date | null;
  @Column({ type: 'varchar', length: 45 }) ip!: string;
  @Column({ ...dt }) createdAt!: Date;
}

@Entity('auth_sessions')
@Index('idx_sessions_user', ['userId', 'revokedAt'])
export class AuthSessionEntity {
  @PrimaryColumn(id) id!: string;
  @Column({ ...id, name: 'user_id' }) userId!: string;
  @Column({ type: 'varchar', length: 36 }) deviceId!: string;
  @Column({ type: 'varchar', length: 80 }) deviceLabel!: string;
  @Column({ type: 'varchar', length: 16 }) platform!: 'web' | 'android';
  @Column({ type: 'varchar', length: 24, nullable: true }) clientId!: string | null;
  @Column({ type: 'varchar', length: 45 }) ip!: string;
  @Column({ ...dt }) createdAt!: Date;
  @Column({ ...dt }) lastActiveAt!: Date;
  @Column({ ...dt, nullable: true }) revokedAt!: Date | null;
  /** آخرین احراز با OTP (برای معافیت step-up تا ۵ دقیقه) */
  @Column({ ...dt, nullable: true }) otpAt!: Date | null;
  @Column({ type: 'int', default: 1 }) permVer!: number;
}

@Entity('refresh_tokens')
@Index('uq_refresh_hash', ['tokenHash'], { unique: true })
@Index('idx_refresh_session', ['sessionId'])
export class RefreshTokenEntity {
  @PrimaryColumn(id) id!: string;
  @Column({ ...id, name: 'session_id' }) sessionId!: string;
  @Column({ ...hash }) tokenHash!: Buffer;
  @Column({ ...dt }) createdAt!: Date;
  @Column({ ...dt }) expiresAt!: Date;
  /** پر شدن = این توکن جایگزین شده؛ استفادهٔ مجدد = reuse */
  @Column({ ...dt, nullable: true }) rotatedAt!: Date | null;
}

@Entity('step_up_tokens')
@Index('uq_stepup_hash', ['tokenHash'], { unique: true })
export class StepUpTokenEntity {
  @PrimaryColumn(id) id!: string;
  @Column({ ...id, name: 'session_id' }) sessionId!: string;
  @Column({ ...hash }) tokenHash!: Buffer;
  @Column({ ...dt }) expiresAt!: Date;
  @Column({ ...dt }) createdAt!: Date;
}

@Entity('rate_limit_counters')
export class RateLimitCounterEntity {
  @PrimaryColumn({ type: 'varchar', length: 120, name: 'counter_key' }) counterKey!: string;
  @PrimaryColumn({ ...dt, name: 'window_start' }) windowStart!: Date;
  @Column({ type: 'int', unsigned: true }) hits!: number;
}
