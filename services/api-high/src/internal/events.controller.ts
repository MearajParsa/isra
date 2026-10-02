import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { EventsService } from './events.service';
import { InternalGuard } from './internal.guard';

const InternalEvent = z.object({
  eventId: z.string().min(8).max(64),
  type: z.string().min(3).max(64),
  occurredAt: z.iso.datetime({ offset: true }),
  payload: z.record(z.string(), z.unknown())
});

/** قرارداد internal: فقط شبکهٔ خصوصی + `X-Internal-Token` (خارج از OpenAPI عمومی) */
@Controller('internal/v1')
@UseGuards(InternalGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post('events')
  @HttpCode(202)
  async receive(@Body() raw: unknown) {
    await this.events.handle(InternalEvent.parse(raw));
    return { success: true, data: {} };
  }
}
