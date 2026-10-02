import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../common/app-error';
import { isUuid } from '../common/ids';
import { PointsService } from '../domain/points.service';
import { SessionsService } from '../domain/sessions.service';
import { EventsService } from './events.service';
import { InternalGuard } from './internal.guard';

const InternalEvent = z.object({
  eventId: z.string().min(8).max(64),
  type: z.string().min(3).max(64),
  occurredAt: z.iso.datetime({ offset: true }),
  payload: z.record(z.string(), z.unknown())
});
const ListQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['scheduled', 'started', 'ended']).optional()
});

/**
 * قرارداد internal (مصرف‌کننده: api-low؛ ارسال‌کننده: low/high). فقط شبکهٔ خصوصی + `X-Internal-Token`.
 * خارج از OpenAPI عمومی (docs-v2/22 API9).
 */
@Controller('internal/v1')
@UseGuards(InternalGuard)
export class InternalController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly points: PointsService,
    private readonly events: EventsService
  ) {}

  @Get('public/sessions')
  async list(@Query() raw: unknown) {
    const q = ListQuery.parse(raw);
    const r = await this.sessions.publicList(q.page, q.pageSize, q.status);
    return { success: true, data: r.items, meta: { page: r.page, pageSize: r.pageSize, total: r.total } };
  }

  @Get('public/sessions/:id')
  async one(@Param('id') id: string) {
    if (!isUuid(id)) throw new AppError('NOT_FOUND');
    return { success: true, data: await this.sessions.publicOne(id) };
  }

  @Get('stats/sessions')
  async stats() {
    return { success: true, data: await this.sessions.stats() };
  }

  @Get('users/:id/points')
  async userPoints(@Param('id') id: string) {
    if (!isUuid(id)) throw new AppError('NOT_FOUND');
    return { success: true, data: await this.points.summary(id) };
  }

  @Post('events')
  @HttpCode(202)
  async receive(@Body() raw: unknown) {
    await this.events.handle(InternalEvent.parse(raw));
    return { success: true, data: {} };
  }
}
