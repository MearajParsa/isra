import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AppError } from '../common/app-error';
import { BadgesService } from '../domain/badges/badges.service';
import { InternalGuard } from './internal.guard';
import { InternalCallers, InternalRoute } from './internal-auth';

/** HIGH_INTERNAL.badgeImage (`/s/internal/v1/badges/:id/image`): بایت خام + Content-Type دقیق؛ فقط low (L-34 کش می‌کند) */
@Controller('s/internal/v1')
@InternalRoute()
@UseGuards(InternalGuard)
export class BadgeImageController {
  constructor(private readonly badges: BadgesService) {}

  @Get('badges/:id/image')
  @InternalCallers('low')
  async image(@Param('id') id: string, @Res() res: Response) {
    const img = await this.badges.image(id);
    if (!img) throw new AppError('NOT_FOUND', { message: 'تصویر نشان پیدا نشد.' });
    res.status(200);
    res.setHeader('Content-Type', img.type);
    res.setHeader('Content-Length', String(img.bytes.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('ETag', `"${img.hash}"`);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.end(img.bytes);
  }
}
