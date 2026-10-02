import { Injectable } from '@nestjs/common';
import { Clock } from '../common/clock';
import { uuidToBuf } from '../common/ids';
import type { Q } from './db';
import { emit } from './outbox.writer';
import { RbacService } from './rbac.service';

/**
 * پس از هر تغییر نقش/grant/ماتریس: permVer کاربر +۱ و `system.role.changed` با مجوزهای مؤثر (grant ∪ نقش‌ها) برای low ساخته می‌شود.
 * low آن را در JWT (`roles`/`perms`) می‌گذارد؛ mid فقط `perms` را می‌خواند (مثلاً `session.create`). permVer فقط رو‌به‌جلو اعمال می‌شود.
 */
@Injectable()
export class ClaimsService {
  constructor(
    private readonly rbac: RbacService,
    private readonly clock: Clock
  ) {}

  async publish(m: Q, userId: string): Promise<number> {
    await m.query('UPDATE user_directory SET perm_ver = perm_ver + 1, updated_at = ? WHERE user_id = ?', [this.clock.now(), uuidToBuf(userId)]);
    const [{ perm_ver }] = (await m.query('SELECT perm_ver FROM user_directory WHERE user_id = ?', [uuidToBuf(userId)])) as { perm_ver: number }[];
    const a = await this.rbac.access(userId, m);
    await emit(m, this.clock.now(), 'system.role.changed', { userId, systemRoles: a.roles, grants: a.permissions, permVer: perm_ver });
    return perm_ver!;
  }
}
