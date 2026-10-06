import { Body, Controller, Delete, Get, HttpCode, Logger, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { internal } from '@isra/api-types';
import type { IsraRequest } from '../common/request-context';
import { AppError } from '../common/app-error';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { BroadcastService } from '../messaging/broadcast.service';
import { AdminService } from './admin.service';
import { InternalGuard } from './internal.guard';
import { InternalCallers, InternalRoute } from './internal-auth';

/** envelope استاندارد برای مسیرهای internal (EnvelopeInterceptor فقط مسیرهای قرارداد public را می‌پوشاند) */
const ok = (req: IsraRequest, data: unknown, page?: { page: number; pageSize: number; total: number }) => ({
  success: true,
  data,
  ...(page ? { meta: { requestId: req.ctx.requestId, ...page } } : { meta: { requestId: req.ctx.requestId } })
});

const RESOLVE_PER_MIN = 600;
/** فیلتر افزودنی گزارش OTP (خارج از LowAdminRangeQuery) */
const OtpPurposeQuery = z.object({ purpose: z.enum(['login', 'step_up']).optional() });

/**
 * مدیریت کاربر/نشست/گزارش برای api-high (`LOW_ADMIN`؛ docs-v2/26). فقط فرستندهٔ `high` (secret جفتی + ACL).
 * ورودی با schemaهای قرارداد `internal.LowAdmin*` اعتبارسنجی می‌شود (خطا ⇒ VALIDATION_FAILED).
 */
@Controller('c/internal/v1')
@InternalRoute()
@UseGuards(InternalGuard)
export class AdminController {
  private readonly log = new Logger('InternalAdmin');

  constructor(
    private readonly admin: AdminService,
    private readonly broadcasts: BroadcastService,
    private readonly limiter: RateLimitService
  ) {}

  /** LOW_INTERNAL.resolveUsers — mid و high؛ فقط POST (شماره در URL/لاگ دسترسی نمی‌آید)؛ سقف durable ۶۰۰/دقیقه per فرستنده؛ لاگ بدون شماره */
  @Post('users/resolve')
  @InternalCallers('mid', 'high')
  @HttpCode(200)
  async resolve(@Body() raw: unknown, @Req() req: IsraRequest) {
    const lim = await this.limiter.hit('durable', `int:resolve:${req.internalCaller}`, RESOLVE_PER_MIN, 60);
    if (!lim.allowed) throw new AppError('RATE_LIMITED', { details: { retryAfterSec: lim.resetSec } });
    const body = internal.LowResolveUsersBody.parse(raw ?? {});
    const out = await this.admin.resolveUsers(body);
    this.log.debug({ caller: req.internalCaller, asked: body.phones.length, found: out.items.length }, 'users resolved');
    return ok(req, out);
  }

  /** LOW_ADMIN.usersBulk (۱.۶.۰) */
  @Post('admin/users/bulk')
  @InternalCallers('high')
  @HttpCode(200)
  async bulk(@Body() raw: unknown, @Req() req: IsraRequest) {
    return ok(req, await this.admin.usersBulk(internal.LowAdminUsersBulkBody.parse(raw ?? {})));
  }

  /** LOW_ADMIN.broadcast (۱.۶.۰): آمار تحویل پیام همگانی */
  @Get('admin/broadcasts/:id')
  @InternalCallers('high')
  async broadcast(@Param('id') id: string, @Req() req: IsraRequest) {
    return ok(req, await this.broadcasts.stats(id));
  }

  @Post('admin/users')
  @InternalCallers('high')
  @HttpCode(201)
  async create(@Body() raw: unknown, @Req() req: IsraRequest) {
    return ok(req, await this.admin.createUser(internal.LowAdminCreateUser.parse(raw ?? {})));
  }

  @Get('admin/users/:id')
  @InternalCallers('high')
  async get(@Param('id') id: string, @Req() req: IsraRequest) {
    return ok(req, await this.admin.getUser(id));
  }

  @Patch('admin/users/:id')
  @InternalCallers('high')
  async patch(@Param('id') id: string, @Body() raw: unknown, @Req() req: IsraRequest) {
    return ok(req, await this.admin.updateUser(id, internal.LowAdminUpdateUser.parse(raw ?? {})));
  }

  @Delete('admin/users/:id')
  @InternalCallers('high')
  async remove(@Param('id') id: string, @Req() req: IsraRequest) {
    return ok(req, await this.admin.deleteUser(id));
  }

  @Post('admin/users/:id/status')
  @InternalCallers('high')
  @HttpCode(200)
  async status(@Param('id') id: string, @Body() raw: unknown, @Req() req: IsraRequest) {
    return ok(req, await this.admin.setStatus(id, internal.LowAdminStatus.parse(raw ?? {}).status));
  }

  @Put('admin/users/:id/password')
  @InternalCallers('high')
  async password(@Param('id') id: string, @Body() raw: unknown, @Req() req: IsraRequest) {
    return ok(req, await this.admin.password(id, internal.LowAdminPassword.parse(raw ?? {})));
  }

  @Post('admin/users/:id/change-password')
  @InternalCallers('high')
  @HttpCode(200)
  async changePassword(@Param('id') id: string, @Body() raw: unknown, @Req() req: IsraRequest) {
    return ok(req, await this.admin.changePassword(id, internal.LowAdminChangePassword.parse(raw ?? {})));
  }

  @Get('admin/users/:id/sessions')
  @InternalCallers('high')
  async sessions(@Param('id') id: string, @Query() raw: unknown, @Req() req: IsraRequest) {
    const r = await this.admin.listSessions(id, internal.LowAdminSessionsQuery.parse(raw ?? {}));
    return ok(req, r.items, { page: r.page, pageSize: r.pageSize, total: r.total });
  }

  @Delete('admin/users/:id/sessions/:sessionId')
  @InternalCallers('high')
  async revokeSession(@Param('id') id: string, @Param('sessionId') sessionId: string, @Req() req: IsraRequest) {
    return ok(req, await this.admin.revokeSession(id, sessionId));
  }

  @Post('admin/users/:id/logout-all')
  @InternalCallers('high')
  @HttpCode(200)
  async logoutAll(@Param('id') id: string, @Body() raw: unknown, @Req() req: IsraRequest) {
    const b = internal.LowAdminLogoutAllBody.parse(raw ?? {});
    return ok(req, await this.admin.logoutAll(id, b.exceptSessionId));
  }

  @Get('admin/reports/otp')
  @InternalCallers('high')
  async reportOtp(@Query() raw: unknown, @Req() req: IsraRequest) {
    const purpose = OtpPurposeQuery.parse(raw ?? {}).purpose;
    return ok(req, await this.admin.reportOtp({ ...internal.LowAdminRangeQuery.parse(raw ?? {}), purpose }));
  }

  @Get('admin/reports/clients')
  @InternalCallers('high')
  async reportClients(@Req() req: IsraRequest) {
    return ok(req, await this.admin.reportClients());
  }

  @Get('admin/reports/users')
  @InternalCallers('high')
  async reportUsers(@Query() raw: unknown, @Req() req: IsraRequest) {
    return ok(req, await this.admin.reportUsers(internal.LowAdminUsersReportQuery.parse(raw ?? {})));
  }
}
