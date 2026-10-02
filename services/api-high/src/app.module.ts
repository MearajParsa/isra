import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { JwtVerifier } from './auth/jwt-verifier';
import { Clock } from './common/clock';
import { AllExceptionsFilter } from './common/exception.filter';
import { EnvelopeInterceptor } from './common/envelope.interceptor';
import { EndpointGuard } from './common/guards/endpoint.guard';
import { RateLimitService } from './common/rate-limit/rate-limit.service';
import { ConfigModule } from './config/config.module';
import type { Env } from './config/env';
import { DatabaseModule } from './db/database.module';
import { AuditService } from './domain/audit.service';
import { ClaimsService } from './domain/claims.service';
import { HighController } from './domain/high.controller';
import { OverviewService } from './domain/overview.service';
import { RbacService } from './domain/rbac.service';
import { RolesService } from './domain/roles.service';
import { SettingsService } from './domain/settings.service';
import { UsersService } from './domain/users.service';
import { InfraController } from './infra/infra.controller';
import { EventsController } from './internal/events.controller';
import { EventsService } from './internal/events.service';
import { InternalGuard } from './internal/internal.guard';
import { MaintenanceService } from './outbox/maintenance.service';
import { OutboxService } from './outbox/outbox.service';

const PROVIDERS = [JwtVerifier, RateLimitService, RbacService, AuditService, ClaimsService, UsersService, RolesService, SettingsService, OverviewService, EventsService, InternalGuard, OutboxService, MaintenanceService, EndpointGuard];

@Global()
@Module({ providers: PROVIDERS, exports: PROVIDERS })
class CoreModule {}

@Module({})
export class AppModule {
  static forRoot(env: Env, clock?: Clock): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env, clock),
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            genReqId: (req) => (req as { ctx?: { requestId: string } }).ctx?.requestId ?? 'n/a',
            autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/s/health') },
            redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-step-up-token"]', 'req.headers["x-internal-token"]'], censor: '[redacted]' },
            serializers: {
              req: (r: { id: string; method: string; url: string; headers: Record<string, unknown> }) => ({ id: r.id, method: r.method, url: (r.url ?? '').split('?')[0], client: r.headers['x-isra-client'] }),
              res: (r: { statusCode: number }) => ({ statusCode: r.statusCode })
            }
          }
        }),
        DatabaseModule,
        CoreModule
      ],
      controllers: [HighController, InfraController, EventsController],
      providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
        { provide: APP_GUARD, useExisting: EndpointGuard }
      ]
    };
  }
}
