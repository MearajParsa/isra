import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { IsraRequest } from '../common/request-context';
import { EventsService } from './events.service';
import { InternalGuard } from './internal.guard';
import { InternalCallers, InternalRoute, assertEventAllowed } from './internal-auth';

const InternalEvent = z.object({
  eventId: z.string().min(8).max(64),
  type: z.string().min(3).max(64),
  occurredAt: z.iso.datetime({ offset: true }),
  payload: z.record(z.string(), z.unknown())
});

/** قرارداد internal: فقط شبکهٔ خصوصی + `X-Internal-Token` (خارج از OpenAPI عمومی) */
@Controller('s/internal/v1')
@InternalRoute()
@UseGuards(InternalGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post('events')
  @HttpCode(202)
  async receive(@Body() raw: unknown, @Req() req: IsraRequest) {
    const e = InternalEvent.parse(raw);
    assertEventAllowed(req.internalCaller, e.type);
    await this.events.handle(e);
    return { success: true, data: {} };
  }
}
