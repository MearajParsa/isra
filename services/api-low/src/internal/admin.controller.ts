import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { internal } from '@isra/api-types';
import type { IsraRequest } from '../common/request-context';
import { AdminService } from './admin.service';
import { InternalGuard } from './internal.guard';
import { InternalCallers, InternalRoute } from './internal-auth';

/** envelope استاندارد برای مسیرهای internal (EnvelopeInterceptor فقط مسیرهای قرارداد public را می‌پوشاند) */
const ok = (req: IsraRequest, data: unknown, page?: { page: number; pageSize: number; total: number }) => ({
  success: true,
  data,
  ...(page ? { meta: { requestId: req.ctx.requestId, ...page } } : { meta: { requestId: req.ctx.requestId } })
});

/**
 * مدیریت کاربر/نشست/گزارش برای api-high (`LOW_ADMIN`؛ docs-v2/26). فقط فرستندهٔ `high` (secret جفتی + ACL).
 * ورودی با schemaهای قرارداد `internal.LowAdmin*` اعتبارسنجی می‌شود (خطا ⇒ VALIDATION_FAILED).
 */
@Controller('c/internal/v1')
@InternalRoute()
@UseGuards(InternalGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

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
  async logoutAll(@Param('id') id: string, @Req() req: IsraRequest) {
    return ok(req, await this.admin.logoutAll(id));
  }

  @Get('admin/reports/otp')
  @InternalCallers('high')
  async reportOtp(@Query() raw: unknown, @Req() req: IsraRequest) {
    return ok(req, await this.admin.reportOtp(internal.LowAdminRangeQuery.parse(raw ?? {})));
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
