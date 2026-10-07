import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { uuidBinary } from '../../common/ids';

const id = { type: 'binary', length: 16, transformer: uuidBinary } as const;
const dt = { type: 'datetime', precision: 3 } as const;

@Entity('inbox_messages')
@Index('idx_inbox_user_created', ['userId', 'createdAt', 'id'])
@Index('idx_inbox_user_read_created', ['userId', 'readAt', 'createdAt', 'id'])
@Index('uq_inbox_broadcast_user', ['broadcastId', 'userId'], { unique: true })
@Index('uq_inbox_source_event', ['sourceEventId'], { unique: true })
export class InboxMessageEntity {
  @PrimaryColumn(id) id!: string;
  @Column({ ...id, name: 'user_id' }) userId!: string;
  @Column({ type: 'varchar', length: 16 }) kind!: string;
  @Column({ type: 'varchar', length: 120 }) title!: string;
  @Column({ type: 'varchar', length: 500 }) body!: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) ref!: string | null;
  @Column({ ...dt }) createdAt!: Date;
  @Column({ ...dt, nullable: true }) readAt!: Date | null;
  /** `${eventId}` یا `${eventId}:${index}` (رویداد دسته‌ای) */
  @Column({ type: 'varchar', length: 80, nullable: true }) sourceEventId!: string | null;
  @Column({ ...id, name: 'broadcast_id', nullable: true }) broadcastId!: string | null;
}

@Entity('outbox_events')
@Index('idx_outbox_pending', ['publishedAt', 'nextAttemptAt'])
export class OutboxEventEntity {
  @PrimaryColumn(id) id!: string;
  @Column({ type: 'varchar', length: 64 }) type!: string;
  @Column({ type: 'json' }) payload!: Record<string, unknown>;
  /** مقصدهای باقی‌مانده (`mid,high`)؛ NULL = هنوز مسیریابی نشده */
  @Column({ type: 'varchar', length: 32, nullable: true }) pendingTargets!: string | null;
  @Column({ ...dt }) createdAt!: Date;
  @Column({ ...dt, nullable: true }) publishedAt!: Date | null;
  @Column({ type: 'int', default: 0 }) attempts!: number;
  @Column({ ...dt }) nextAttemptAt!: Date;
}

/** dedupe رویدادهای ورودی (at-least-once + idempotent) */
@Entity('inbox_events')
@Index('idx_inbox_events_received', ['receivedAt'])
export class InboxEventEntity {
  @PrimaryColumn({ type: 'varchar', length: 64, name: 'event_id' }) eventId!: string;
  @Column({ type: 'varchar', length: 64 }) type!: string;
  @Column({ ...dt }) receivedAt!: Date;
}

/** پیام همگانی (high ⇒ low)؛ تحویل دسته‌ای با cursor پایدار روی users.id */
@Entity('inbox_broadcasts')
@Index('idx_broadcast_status', ['status', 'createdAt'])
export class InboxBroadcastEntity {
  @PrimaryColumn(id) id!: string;
  @Column({ type: 'json' }) segment!: Record<string, unknown>;
  @Column({ type: 'varchar', length: 120 }) title!: string;
  @Column({ type: 'varchar', length: 500 }) body!: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) ref!: string | null;
  @Column({ ...id, name: 'created_by' }) createdBy!: string;
  @Column({ type: 'varchar', length: 10, default: 'queued' }) status!: 'queued' | 'sending' | 'done' | 'failed';
  @Column({ ...id, name: 'cursor_id', nullable: true }) cursorId!: string | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) targeted!: number | null;
  @Column({ type: 'int', unsigned: true, default: 0 }) delivered!: number;
  @Column({ ...dt }) createdAt!: Date;
  @Column({ ...dt }) updatedAt!: Date;
  @Column({ ...dt, nullable: true }) finishedAt!: Date | null;
}

/** رویداد ورودی ناسالم (payload ناسازگار با قرارداد) — پذیرفته (202) و برای بررسی دستی نگه داشته می‌شود */
@Entity('dead_letter_events')
@Index('idx_dead_letter_received', ['receivedAt'])
@Index('idx_dead_letter_type', ['type', 'receivedAt'])
export class DeadLetterEventEntity {
  @PrimaryColumn(id) id!: string;
  @Column({ type: 'varchar', length: 64 }) eventId!: string;
  @Column({ type: 'varchar', length: 64 }) type!: string;
  @Column({ type: 'varchar', length: 8 }) caller!: string;
  @Column({ type: 'json' }) payload!: Record<string, unknown>;
  @Column({ type: 'varchar', length: 1000 }) error!: string;
  @Column({ ...dt }) receivedAt!: Date;
}
