import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { JwtVerifier } from './auth/jwt-verifier';
import { Clock } from './common/clock';
import { AllExceptionsFilter } from './common/exception.filter';
import { EnvelopeInterceptor } from './common/envelope.interceptor';
import { EndpointGuard } from './common/guards/endpoint.guard';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { RateLimitService } from './common/rate-limit/rate-limit.service';
import { ConfigModule } from './config/config.module';
import type { Env } from './config/env';
import { DatabaseModule } from './db/database.module';
import { MembersAccess } from './domain/access.service';
import { AttendanceService } from './domain/attendance.service';
import { EvaluationsService } from './domain/evaluations.service';
import { MembersService } from './domain/members.service';
import { MidController } from './domain/mid.controller';
import { PointsService } from './domain/points.service';
import { QueueService } from './domain/queue.service';
import { SessionsService } from './domain/sessions.service';
import { SettingsService } from './domain/settings.service';
import { InfraController } from './infra/infra.controller';
import { EventsService } from './internal/events.service';
import { InternalController } from './internal/internal.controller';
import { InternalGuard } from './internal/internal.guard';
import { LiveService } from './live/live.service';
import { MaintenanceService } from './outbox/maintenance.service';
import { OutboxService } from './outbox/outbox.service';

const PROVIDERS = [JwtVerifier, RateLimitService, MembersAccess, SettingsService, PointsService, LiveService, SessionsService, MembersService, AttendanceService, QueueService, EvaluationsService, EventsService, InternalGuard, OutboxService, MaintenanceService, EndpointGuard];

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
            autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/o/health') },
            redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-internal-token"]'], censor: '[redacted]' },
            serializers: {
              req: (r: { id: string; method: string; url: string; headers: Record<string, unknown> }) => ({ id: r.id, method: r.method, url: (r.url ?? '').split('?')[0], client: r.headers['x-isra-client'] }),
              res: (r: { statusCode: number }) => ({ statusCode: r.statusCode })
            }
          }
        }),
        DatabaseModule,
        CoreModule
      ],
      controllers: [MidController, InfraController, InternalController],
      providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        // ترتیب مهم: Envelope بیرونی، Idempotency داخلی (پاسخ ذخیره‌شده هم envelope می‌شود)
        { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
        { provide: APP_GUARD, useExisting: EndpointGuard }
      ]
    };
  }
}
