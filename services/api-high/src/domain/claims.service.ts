import { Injectable } from '@nestjs/common';
import { Clock } from '../common/clock';
import { bufToUuid, uuidToBuf } from '../common/ids';
import type { Q } from './db';
import { emitMany } from './outbox.writer';
import { queryAccess } from './rbac.service';

const CHUNK = 100;

/**
 * انتشار claim (بدون DI؛ migration هم استفاده می‌کند): permVer +۱ و `system.role.changed` با مجوزهای مؤثر.
 * دسته‌ای (هر دسته ۴ query) و بدون تکرار کاربر؛ همه در تراکنش فراخواننده.
 */
export async function publishClaims(m: Q, userIds: Iterable<string>, now: () => Date): Promise<Map<string, number>> {
  const ids = [...new Set([...userIds].map((u) => u.toLowerCase()))].sort(); // ترتیب ثابت ⇒ بدون deadlock بین تراکنش‌های هم‌زمان
  const out = new Map<string, number>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const bufs = chunk.map(uuidToBuf);
    const ph = bufs.map(() => '?').join(',');
    await m.query(`UPDATE user_directory SET perm_ver = perm_ver + 1, updated_at = ? WHERE user_id IN (${ph})`, [now(), ...bufs]);
    const vers = (await m.query(`SELECT user_id, perm_ver FROM user_directory WHERE user_id IN (${ph})`, bufs)) as { user_id: Buffer; perm_ver: number }[];
    const known = vers.map((v) => ({ id: bufToUuid(v.user_id), ver: v.perm_ver }));
    const access = await queryAccess(
      m,
      known.map((k) => k.id)
    );
    await emitMany(
      m,
      now(),
      known.map((k) => {
        const a = access.get(k.id)!;
        return { type: 'system.role.changed', payload: { userId: k.id, systemRoles: a.roles, grants: a.permissions, permVer: k.ver } };
      })
    );
    for (const k of known) out.set(k.id, k.ver);
  }
  return out;
}

/**
 * پس از هر تغییر مجوز مؤثر: permVer کاربر +۱ و `system.role.changed` با مجوزهای مؤثر (grant ∪ نقش‌ها ∪ ماژول‌ها) برای low ساخته می‌شود.
 * low آن را در JWT (`roles`/`perms`) می‌گذارد. permVer فقط رو‌به‌جلو اعمال می‌شود.
 */
@Injectable()
export class ClaimsService {
  constructor(private readonly clock: Clock) {}

  async publish(m: Q, userId: string): Promise<number> {
    const r = await this.publishMany(m, [userId]);
    return r.get(userId.toLowerCase()) ?? 0;
  }

  /** userId ⇒ permVer جدید (کاربرِ ناموجود در دایرکتوری نادیده گرفته می‌شود) */
  publishMany(m: Q, userIds: Iterable<string>): Promise<Map<string, number>> {
    return publishClaims(m, userIds, () => this.clock.now());
  }
}
