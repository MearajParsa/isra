import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/app-error';
import { RbacService } from '../rbac.service';
import { UsersService } from '../users.service';
import { type UserAccess, describeAccess, isDeveloper, stepUpMap } from './policy';
import { DataSource } from 'typeorm';

/** نمای دسترسی مؤثر (H-00، H-93، H-94): مجوز، منبع و نیاز به step-up */
@Injectable()
export class AccessQueryService {
  constructor(
    private readonly rbac: RbacService,
    private readonly users: UsersService,
    private readonly ds: DataSource
  ) {}

  async me(a: UserAccess) {
    const policy = await this.rbac.policy();
    return { stepUpExempt: isDeveloper(a), stepUp: stepUpMap(a, policy) };
  }

  async describe(userId: string, a?: UserAccess) {
    const access = a ?? (await this.rbac.access(userId));
    return describeAccess(userId, access, await this.rbac.policy());
  }

  /** H-93: کاربر باید در دایرکتوری باشد؛ خواندن تازه از DB (بدون کش) */
  async describeUser(userId: string) {
    if (!(await this.users.row(this.ds, userId))) throw new AppError('NOT_FOUND', { message: 'کاربر پیدا نشد.' });
    const access = (await this.rbac.accessMany([userId])).get(userId.toLowerCase())!;
    return describeAccess(userId.toLowerCase(), access, await this.rbac.policy());
  }
}
