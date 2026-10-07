import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { high } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { uuidToBuf } from '../common/ids';
import type { AuthedUser } from '../common/request-context';
import { LowAdminClient } from '../internal/admin-clients';
import { AuditService } from './audit.service';
import { displayName } from './db';
import { deviceSession } from './users-admin.service';


/** «حساب من» (H-02..H-07): همیشه روی کاربر توکن؛ شناسهٔ دیگری از کلاینت پذیرفته نمی‌شود. دادهٔ حساب مال low است. */
@Injectable()
export class AccountService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly low: LowAdminClient
  ) {}

  private async me(id: string) {
    const u = await this.low.getUser(id);
    if (u.status !== 'active') throw new AppError('AUTH_FORBIDDEN');
    return { id: u.id, phone: u.phone, firstName: u.firstName, lastName: u.lastName, hasPassword: u.hasPassword, mustChangePassword: u.mustChangePassword } as z.infer<typeof high.MyAccount>;
  }

  get(user: AuthedUser) {
    return this.me(user.userId);
  }

  async updateProfile(user: AuthedUser, body: z.infer<typeof high.UpdateMyProfileBody>) {
    await this.low.updateUser(user.userId, body);
    const acc = await this.me(user.userId);
    await this.ds.query('UPDATE user_directory SET first_name = ?, last_name = ?, updated_at = ? WHERE user_id = ?', [acc.firstName, acc.lastName, this.clock.now(), uuidToBuf(user.userId)]);
    await this.audit.write(this.ds, await this.entry(user, 'account.profile_update', 'پروفایل خود را ویرایش کرد.', { fields: Object.keys(body) }));
    return acc;
  }

  /**
   * تغییر رمز خودم. `verified='stepup'` وقتی step-up معتبر ارائه شده؛ وگرنه (فقط حالت mcp + currentPassword که guard اجازه داده)
   * `verified='current'` و low رمز فعلی را تطبیق می‌دهد. نشست جاری می‌ماند (`keepSessionId`).
   */
  async setPassword(user: AuthedUser, body: z.infer<typeof high.SetMyPasswordBody>): Promise<void> {
    if (user.stepUpVerified) await this.low.changePassword(user.userId, { newPassword: body.newPassword, verified: 'stepup', keepSessionId: user.sessionId });
    else if (user.mcp && body.currentPassword) await this.low.changePassword(user.userId, { newPassword: body.newPassword, verified: 'current', currentPassword: body.currentPassword, keepSessionId: user.sessionId });
    else throw new AppError('AUTH_STEP_UP_REQUIRED');
    await this.audit.write(this.ds, await this.entry(user, 'account.password_change', 'رمز عبور خود را تغییر داد.', { via: user.stepUpVerified ? 'stepup' : 'current' }));
  }

  async sessions(user: AuthedUser, page: number, pageSize: number) {
    const r = await this.low.listSessions(user.userId, { page, pageSize });
    return { ...r, items: r.items.map((s) => deviceSession(s, user.sessionId)) };
  }

  async revoke(user: AuthedUser, sessionId: string): Promise<void> {
    await this.low.revokeSession(user.userId, sessionId);
    await this.audit.write(this.ds, await this.entry(user, 'account.session_revoke', 'یک نشست خود را باطل کرد.', { sessionId }));
  }

  /** خروج از همهٔ نشست‌های دیگر: یک فراخوانی low با `exceptSessionId` (۱.۶.۰؛ docs-v2/30 §۳ کارایی) */
  async revokeOthers(user: AuthedUser): Promise<void> {
    await this.low.logoutAll(user.userId, { exceptSessionId: user.sessionId });
    await this.audit.write(this.ds, await this.entry(user, 'account.session_revoke', 'از همهٔ نشست‌های دیگر خود خارج شد.', { others: true }));
  }

  private async entry(user: AuthedUser, action: string, summary: string, meta: Record<string, unknown>) {
    const actor = await this.audit.actorOf(user.userId);
    return { actor, action, target: { type: 'user' as const, id: user.userId, label: actor.name || displayName() }, summary, meta };
  }
}
