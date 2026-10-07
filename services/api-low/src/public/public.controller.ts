import { Controller } from '@nestjs/common';
import { BadgesService } from '../badges/badges.service';
import { In, Route } from '../common/ep';
import { MidClient } from '../mid/mid.client';
import { FlagsService } from '../system/flags.service';

@Controller()
export class PublicController {
  constructor(
    private readonly mid: MidClient,
    private readonly flags: FlagsService,
    private readonly badges: BadgesService
  ) {}

  @Route('L-30')
  list(@In() { query }: { query: { page: number; pageSize: number; status?: string } }) {
    return this.mid.publicSessions(query);
  }

  @Route('L-31')
  one(@In() { params }: { params: { id: string } }) {
    return this.mid.publicSession(params.id);
  }

  /** L-32: پیکربندی عمومی از settings_cache (پرچم‌ها) و نسخهٔ کاتالوگ نشان‌ها؛ cache عمومی + ETag */
  @Route('L-32')
  async config() {
    const [f, c] = await Promise.all([this.flags.get(), this.badges.catalog()]);
    return { maintenanceMode: f.maintenanceMode, registrationOpen: f.registrationOpen, badgesVersion: c.version };
  }

  /** L-33: نشان‌های فعال (مرتب)؛ cache عمومی + ETag */
  @Route('L-33')
  badgesList(@In() { query }: { query: { page: number; pageSize: number } }) {
    return this.badges.publicList(query.page, query.pageSize);
  }

  /** L-34: تصویر باینری (BinaryResponse ⇒ EnvelopeInterceptor هدرهای دقیق را می‌گذارد) */
  @Route('L-34')
  badgeImage(@In() { params, query }: { params: { id: string }; query: { v?: string } }) {
    return this.badges.image(params.id, query.v);
  }
}
