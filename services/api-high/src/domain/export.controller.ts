import { Controller, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import type { high } from '@isra/api-types';
import { In, Route } from '../common/ep';
import type { IsraRequest } from '../common/request-context';
import { ExportService } from './export.service';

const actor = (r: IsraRequest) => ({ id: r.user!.userId, perms: r.user!.perms });

/**
 * خروجی CSV (H-43..H-45): پاسخ stream‌شده (raw). این کنترلر **پیش از** AdminController/HighController ثبت می‌شود تا
 * `/system/users/export` با `/system/users/{id}` (H-21) گرفته نشود.
 */
@Controller()
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  @Route('H-43')
  users(@Req() r: IsraRequest, @Res() res: Response, @In() { query }: { query: z.infer<typeof high.UsersQuery> }) {
    return this.exports.users_(actor(r), query, res);
  }
  @Route('H-44')
  session(@Req() r: IsraRequest, @Res() res: Response, @In() { params, query }: { params: { id: string }; query: z.infer<typeof high.SessionExportQuery> }) {
    return this.exports.session(actor(r), params.id, query, res);
  }
  @Route('H-45')
  audit(@Req() r: IsraRequest, @Res() res: Response, @In() { query }: { query: z.infer<typeof high.AuditQuery> }) {
    return this.exports.audit_(actor(r), query, res);
  }
}
