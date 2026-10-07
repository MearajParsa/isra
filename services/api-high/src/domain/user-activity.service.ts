import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { high } from '@isra/api-types';
import { MidAdminClient } from '../internal/admin-clients';
import { AuditService } from './audit.service';
import { displayName } from './db';
import { UsersService } from './users.service';

/** عضویت‌ها و امتیاز یک کاربر (H-52، H-97، H-98): کاربر باید در دایرکتوری high باشد (404)؛ داده از mid */
@Injectable()
export class UserActivityService {
  constructor(
    private readonly ds: DataSource,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly mid: MidAdminClient
  ) {}

  async memberships(id: string, query: z.infer<typeof high.UserMembershipsQuery>) {
    await this.users.mustRow(this.ds, id);
    return this.mid.userMemberships(id, { ...query });
  }

  async points(id: string, query: { page: number; pageSize: number }) {
    await this.users.mustRow(this.ds, id);
    return this.mid.userPoints(id, query);
  }

  /** H-98 اصلاح دستی (admin_adjust)؛ Idempotency-Key مشتق‌شده به mid تا retry دوبار کسر/اضافه نکند */
  async adjust(actorId: string, id: string, body: z.infer<typeof high.PointsAdjustBody>, idempotencyKey?: string) {
    const row = await this.users.mustRow(this.ds, id);
    const r = await this.mid.pointsAdjust(id, { actorId, delta: body.delta, reason: body.reason }, idempotencyKey);
    const label = displayName(row.first_name, row.last_name);
    await this.audit.write(this.ds, {
      actor: await this.audit.actorOf(actorId),
      action: 'points.adjust',
      target: { type: 'user', id, label },
      summary: `امتیاز «${label}» ${body.delta > 0 ? 'افزایش' : 'کاهش'} یافت.`,
      meta: { delta: body.delta, applied: r.entry.points, total: r.summary.total, reason: body.reason, entryId: r.entry.id }
    });
    return r;
  }
}
