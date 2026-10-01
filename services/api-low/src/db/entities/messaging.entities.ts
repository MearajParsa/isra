import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { uuidBinary } from '../../common/ids';

const id = { type: 'binary', length: 16, transformer: uuidBinary } as const;
const dt = { type: 'datetime', precision: 3 } as const;

@Entity('inbox_messages')
@Index('idx_inbox_user_created', ['userId', 'createdAt', 'id'])
@Index('idx_inbox_user_read', ['userId', 'readAt'])
@Index('uq_inbox_source_event', ['sourceEventId'], { unique: true })
export class InboxMessageEntity {
  @PrimaryColumn(id) id!: string;
  @Column({ ...id, name: 'user_id' }) userId!: string;
  @Column({ type: 'varchar', length: 16 }) kind!: 'membership' | 'turn' | 'evaluation' | 'system';
  @Column({ type: 'varchar', length: 120 }) title!: string;
  @Column({ type: 'varchar', length: 500 }) body!: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) ref!: string | null;
  @Column({ ...dt }) createdAt!: Date;
  @Column({ ...dt, nullable: true }) readAt!: Date | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) sourceEventId!: string | null;
}

@Entity('outbox_events')
@Index('idx_outbox_pending', ['publishedAt', 'nextAttemptAt'])
export class OutboxEventEntity {
  @PrimaryColumn(id) id!: string;
  @Column({ type: 'varchar', length: 64 }) type!: string;
  @Column({ type: 'json' }) payload!: Record<string, unknown>;
  @Column({ ...dt }) createdAt!: Date;
  @Column({ ...dt, nullable: true }) publishedAt!: Date | null;
  @Column({ type: 'int', default: 0 }) attempts!: number;
  @Column({ ...dt }) nextAttemptAt!: Date;
}

/** dedupe رویدادهای ورودی (at-least-once + idempotent) */
@Entity('inbox_events')
export class InboxEventEntity {
  @PrimaryColumn({ type: 'varchar', length: 64, name: 'event_id' }) eventId!: string;
  @Column({ type: 'varchar', length: 64 }) type!: string;
  @Column({ ...dt }) receivedAt!: Date;
}
