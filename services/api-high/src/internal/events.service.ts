import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { internal } from '@isra/api-types';
import { RevocationService } from '../auth/revocation.service';
import { Clock } from '../common/clock';
import { uuidToBuf } from '../common/ids';
import { ENV, type Env } from '../config/env';
import { AuditService } from '../domain/audit.service';
import { RbacService } from '../domain/rbac.service';
import { ClaimsService } from '../domain/claims.service';
import { type Q, displayName } from '../domain/db';
import { UsersAdminService, anonPhone } from '../domain/users-admin.service';

export interface InboundEvent {
  eventId: string;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

const SessionRevoked = z.object({ sessionIds: z.array(z.uuid()).min(1).max(50), expiresAt: z.iso.datetime({ offset: true }) });
const UserRegistered = z.object({ userId: z.uuid(), phone: z.string().regex(/^09\d{9}$/), firstName: z.string().max(40).default(''), lastName: z.string().max(40).default(''), createdAt: z.iso.datetime({ offset: true }).optional() });
const ProfileUpdated = z.object({ userId: z.uuid(), firstName: z.string().max(40).optional(), lastName: z.string().max(40).optional() });

/**
 * مصرف رویدادهای ورودی از low (فهرست کاربران). at-least-once ⇒ dedupe با eventId در همان تراکنش اثر.
 * راه‌انداز: اولین developer — وقتی کاربر `BOOTSTRAP_DEVELOPER_PHONE` در سیستم دیده شد و هنوز هیچ developer نیست.
 */
@Injectable()
export class EventsService implements OnApplicationBootstrap {
  private readonly log = new Logger('Events');

  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly claims: ClaimsService,
    private readonly rbac: RbacService,
    private readonly revocation: RevocationService,
    private readonly usersAdmin: UsersAdminService,
    @Inject(ENV) private readonly env: Env
  ) {}

  async onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    await this.bootstrapDeveloper().catch((e) => this.log.error({ err: e instanceof Error ? e.message : 'unknown' }, 'bootstrap failed'));
  }

  async handle(e: InboundEvent): Promise<void> {
    const now = this.clock.now();
    await this.ds.transaction(async (m) => {
      const ins = (await m.query('INSERT IGNORE INTO inbox_events (event_id, type, received_at) VALUES (?, ?, ?)', [e.eventId, e.type, now])) as { affectedRows?: number };
      if (!ins.affectedRows) return;

      if (e.type === 'user.registered') {
        const p = UserRegistered.parse(e.payload);
        await m.query(
          `INSERT INTO user_directory (user_id, phone, first_name, last_name, status, perm_ver, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 1, ?, ?)
           ON DUPLICATE KEY UPDATE
             phone = IF(status = 'deleted', phone, VALUES(phone)),
             first_name = IF(status = 'deleted', first_name, IF(VALUES(first_name) <> '', VALUES(first_name), first_name)),
             last_name = IF(status = 'deleted', last_name, IF(VALUES(last_name) <> '', VALUES(last_name), last_name)),
             updated_at = VALUES(updated_at)`,
          [uuidToBuf(p.userId), p.phone, p.firstName, p.lastName, p.createdAt ? new Date(p.createdAt) : now, now]
        );
        await this.bootstrapDeveloper(m, p.phone);
      } else if (e.type === 'user.profile.updated') {
        const p = ProfileUpdated.parse(e.payload);
        await m.query('UPDATE user_directory SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), updated_at = ? WHERE user_id = ? AND status <> \'deleted\'', [p.firstName ?? null, p.lastName ?? null, now, uuidToBuf(p.userId)]);
      } else if (e.type === 'user.phone.changed') {
        const p = internal.UserPhoneChanged.parse(e.payload);
        // کاربر حذف‌شده شمارهٔ ناشناس دارد؛ رویداد دیررسیدِ تغییر شماره آن را برنمی‌گرداند
        await m.query("UPDATE user_directory SET phone = ?, updated_at = ? WHERE user_id = ? AND status <> 'deleted'", [p.phone, now, uuidToBuf(p.userId)]);
      } else if (e.type === 'user.status.changed') {
        const p = internal.UserStatusChanged.parse(e.payload);
        if (p.status === 'deleted') await this.usersAdmin.applyDeleted(m, p.userId, p.anonymizedPhone ?? anonPhone(p.userId), now);
        else await m.query("UPDATE user_directory SET status = ?, updated_at = ? WHERE user_id = ? AND status <> 'deleted'", [p.status, now, uuidToBuf(p.userId)]);
      } else if (e.type === 'session.revoked') {
        const p = SessionRevoked.parse(e.payload);
        await this.revocation.add(m, p.sessionIds, new Date(p.expiresAt));
      } else {
        this.log.debug({ type: e.type }, 'نوع رویداد ناشناخته؛ نادیده');
      }
    });
    if (e.type === 'user.status.changed' || e.type === 'user.registered') this.rbac.invalidate(); // حذف کاربر نقش/grant را برمی‌دارد
  }

  /**
   * `BOOTSTRAP_DEVELOPER_PHONE` یک یا چند شماره (با کاما). idempotent و با قفل ردیف نقش‌ها:
   *  - هر دو مسیر (راه‌اندازی و ثبت‌نام) فقط وقتی هیچ developer فعالی نیست (۱.۶.۰)؛
   *  - راه‌اندازی: همهٔ شماره‌های حاضر در دایرکتوری؛ ثبت‌نام: فقط همان شماره اگر در فهرست env باشد.
   */
  async bootstrapDeveloper(q: Q = this.ds, onlyPhone?: string): Promise<boolean> {
    const phones = (this.env.BOOTSTRAP_DEVELOPER_PHONE ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    if (!phones.length) return false;
    const run = async (m: Q) => {
      // docs-v2/30 §۳ امنیت ۷: فقط وقتی هیچ developer «فعال» نیست (شمارهٔ env دیگر راه دائمی ارتقا نیست)
      const has = (await m.query("SELECT r.user_id FROM user_system_roles r JOIN user_directory d ON d.user_id = r.user_id WHERE r.role_key = 'developer' AND d.status = 'active' FOR UPDATE")) as unknown[];
      if (has.length) return false;
      const targets = onlyPhone ? phones.filter((p) => p === onlyPhone) : phones;
      let granted = false;
      for (const phone of targets) {
        const u = (await m.query('SELECT user_id, first_name, last_name FROM user_directory WHERE phone = ?', [phone])) as { user_id: Buffer; first_name: string; last_name: string }[];
        if (!u[0]) continue;
        const already = (await m.query("SELECT 1 AS x FROM user_system_roles WHERE user_id = ? AND role_key = 'developer'", [u[0].user_id])) as unknown[];
        if (already.length) continue;
        const now = this.clock.now();
        await m.query("INSERT INTO user_system_roles (user_id, role_key, granted_by, granted_at) VALUES (?, 'developer', NULL, ?)", [u[0].user_id, now]);
        const uid = u[0].user_id.toString('hex');
        const id = `${uid.slice(0, 8)}-${uid.slice(8, 12)}-${uid.slice(12, 16)}-${uid.slice(16, 20)}-${uid.slice(20)}`;
        await this.claims.publish(m, id);
        await this.audit.write(m, { actor: null, action: 'system.bootstrap', target: { type: 'user', id, label: displayName(u[0].first_name, u[0].last_name) }, summary: 'توسعه‌دهندهٔ سیستم از طریق پیکربندی تعیین شد.', meta: { via: 'BOOTSTRAP_DEVELOPER_PHONE' } });
        granted = true;
      }
      return granted;
    };
    if (q !== this.ds) return run(q);
    const granted = await this.ds.transaction((m) => run(m));
    if (granted) this.rbac.invalidate();
    return granted;
  }
}
