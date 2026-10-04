import { Controller, Inject, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import { low } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { In, Route } from '../common/ep';
import { type IsraRequest, isWebClient } from '../common/request-context';
import { ENV, type Env } from '../config/env';
import { AuthService } from './auth.service';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './cookie';

type Body<T extends z.ZodType> = { body: z.infer<T> };

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env
  ) {}

  private ctx = (req: IsraRequest) => ({ client: req.ctx.client, ip: req.ctx.ip });

  /** وب: refresh فقط در cookie؛ سایرین: در body */
  private finish<T extends { refreshToken?: string | null }>(req: IsraRequest, res: Response, out: T): Omit<T, 'refreshToken'> & { refreshToken?: string } {
    const { refreshToken, ...rest } = out;
    if (isWebClient(req.ctx.client)) {
      if (refreshToken) setRefreshCookie(res, this.env, req.ctx.client, refreshToken);
      return rest;
    }
    return refreshToken ? { ...rest, refreshToken } : rest;
  }

  @Route('L-01')
  requestOtp(@In() { body }: Body<typeof low.OtpRequestBody>, @Req() req: IsraRequest) {
    return this.auth.requestOtp(body.phone, this.ctx(req));
  }

  @Route('L-02')
  async verifyOtp(@In() { body }: Body<typeof low.OtpVerifyBody>, @Req() req: IsraRequest, @Res({ passthrough: true }) res: Response) {
    return this.finish(req, res, await this.auth.verifyOtp(body, this.ctx(req)));
  }

  @Route('L-03')
  async loginPassword(@In() { body }: Body<typeof low.PasswordLoginBody>, @Req() req: IsraRequest, @Res({ passthrough: true }) res: Response) {
    return this.finish(req, res, await this.auth.loginPassword(body, this.ctx(req)));
  }

  @Route('L-04')
  async refresh(@In() { body }: Body<typeof low.RefreshBody>, @Req() req: IsraRequest, @Res({ passthrough: true }) res: Response) {
    const web = isWebClient(req.ctx.client);
    const raw = web ? readRefreshCookie(req, req.ctx.client, this.env.COOKIE_SECURE) : body.refreshToken;
    if (!raw) throw new AppError('AUTH_REFRESH_INVALID');
    try {
      return this.finish(req, res, await this.auth.refresh(raw, req.ctx.client));
    } catch (e) {
      if (web && e instanceof AppError && e.code === 'AUTH_REFRESH_INVALID') clearRefreshCookie(res, this.env, req.ctx.client);
      throw e;
    }
  }

  @Route('L-05')
  async logout(@Req() req: IsraRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.user?.sessionId, readRefreshCookie(req, req.ctx.client, this.env.COOKIE_SECURE));
    clearRefreshCookie(res, this.env, req.ctx.client);
    return {};
  }

  @Route('L-06')
  stepUpRequest(@Req() req: IsraRequest) {
    return this.auth.stepUpRequest(req.user!.userId, this.ctx(req));
  }

  @Route('L-07')
  stepUpVerify(@In() { body }: Body<typeof low.StepUpVerifyBody>, @Req() req: IsraRequest) {
    return this.auth.stepUpVerify(req.user!.userId, req.user!.sessionId, body);
  }
}
