import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { KeysService } from './keys.service';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { SessionStatusCache } from './session-status.cache';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { EndpointGuard } from '../common/guards/endpoint.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [KeysService, TokenService, PasswordService, SessionStatusCache, SessionService, OtpService, AuthService, RateLimitService, EndpointGuard],
  exports: [KeysService, TokenService, PasswordService, SessionStatusCache, SessionService, OtpService, AuthService, RateLimitService, EndpointGuard]
})
export class AuthModule {}
