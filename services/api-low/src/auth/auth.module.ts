import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { KeysService } from './keys.service';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { SessionStatusCache } from './session-status.cache';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { FlagsService } from '../system/flags.service';
import { TierBaselineService } from '../system/baseline.service';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { EndpointGuard } from '../common/guards/endpoint.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [FlagsService, TierBaselineService, KeysService, TokenService, PasswordService, SessionStatusCache, SessionService, OtpService, AuthService, RateLimitService, EndpointGuard],
  exports: [FlagsService, TierBaselineService, KeysService, TokenService, PasswordService, SessionStatusCache, SessionService, OtpService, AuthService, RateLimitService, EndpointGuard]
})
export class AuthModule {}
